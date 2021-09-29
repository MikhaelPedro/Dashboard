/*
* Licensed to the Apache Software Foundation (ASF) under one
* or more contributor license agreements.  See the NOTICE file
* distributed with this work for additional information
* regarding copyright ownership.  The ASF licenses this file
* to you under the Apache License, Version 2.0 (the
* "License"); you may not use this file except in compliance
* with the License.  You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/
import * as zrUtil from 'zrender/src/core/util';
import VisualMapModel from './VisualMapModel';
import VisualMapping from '../../visual/VisualMapping';
import visualDefault from '../../visual/visualDefault';
import { reformIntervals } from '../../util/number';
import { inheritDefaultOption } from '../../util/component';
class PiecewiseModel extends VisualMapModel {
    constructor() {
        super(...arguments);
        this.type = PiecewiseModel.type;
        /**
         * The order is always [low, ..., high].
         * [{text: string, interval: Array.<number>}, ...]
         */
        this._pieceList = [];
    }
    optionUpdated(newOption, isInit) {
        super.optionUpdated.apply(this, arguments);
        this.resetExtent();
        const mode = this._mode = this._determineMode();
        this._pieceList = [];
        resetMethods[this._mode].call(this, this._pieceList);
        this._resetSelected(newOption, isInit);
        const categories = this.option.categories;
        this.resetVisual(function (mappingOption, state) {
            if (mode === 'categories') {
                mappingOption.mappingMethod = 'category';
                mappingOption.categories = zrUtil.clone(categories);
            }
            else {
                mappingOption.dataExtent = this.getExtent();
                mappingOption.mappingMethod = 'piecewise';
                mappingOption.pieceList = zrUtil.map(this._pieceList, function (piece) {
                    piece = zrUtil.clone(piece);
                    if (state !== 'inRange') {
                        // FIXME
                        // outOfRange do not support special visual in pieces.
                        piece.visual = null;
                    }
                    return piece;
                });
            }
        });
    }
    /**
     * @protected
     * @override
     */
    completeVisualOption() {
        // Consider this case:
        // visualMap: {
        //      pieces: [{symbol: 'circle', lt: 0}, {symbol: 'rect', gte: 0}]
        // }
        // where no inRange/outOfRange set but only pieces. So we should make
        // default inRange/outOfRange for this case, otherwise visuals that only
        // appear in `pieces` will not be taken into account in visual encoding.
        const option = this.option;
        const visualTypesInPieces = {};
        const visualTypes = VisualMapping.listVisualTypes();
        const isCategory = this.isCategory();
        zrUtil.each(option.pieces, function (piece) {
            zrUtil.each(visualTypes, function (visualType) {
                if (piece.hasOwnProperty(visualType)) {
                    visualTypesInPieces[visualType] = 1;
                }
            });
        });
        zrUtil.each(visualTypesInPieces, function (v, visualType) {
            let exists = false;
            zrUtil.each(this.stateList, function (state) {
                exists = exists || has(option, state, visualType)
                    || has(option.target, state, visualType);
            }, this);
            !exists && zrUtil.each(this.stateList, function (state) {
                (option[state] || (option[state] = {}))[visualType] = visualDefault.get(visualType, state === 'inRange' ? 'active' : 'inactive', isCategory);
            });
        }, this);
        function has(obj, state, visualType) {
            return obj && obj[state] && obj[state].hasOwnProperty(visualType);
        }
        super.completeVisualOption.apply(this, arguments);
    }
    _resetSelected(newOption, isInit) {
        const thisOption = this.option;
        const pieceList = this._pieceList;
        // Selected do not merge but all override.
        const selected = (isInit ? thisOption : newOption).selected || {};
        thisOption.selected = selected;
        // Consider 'not specified' means true.
        zrUtil.each(pieceList, function (piece, index) {
            const key = this.getSelectedMapKey(piece);
            if (!selected.hasOwnProperty(key)) {
                selected[key] = true;
            }
        }, this);
        if (thisOption.selectedMode === 'single') {
            // Ensure there is only one selected.
            let hasSel = false;
            zrUtil.each(pieceList, function (piece, index) {
                const key = this.getSelectedMapKey(piece);
                if (selected[key]) {
                    hasSel
                        ? (selected[key] = false)
                        : (hasSel = true);
                }
            }, this);
        }
        // thisOption.selectedMode === 'multiple', default: all selected.
    }
    /**
     * @public
     */
    getItemSymbol() {
        return this.get('itemSymbol');
    }
    /**
     * @public
     */
    getSelectedMapKey(piece) {
        return this._mode === 'categories'
            ? piece.value + '' : piece.index + '';
    }
    /**
     * @public
     */
    getPieceList() {
        return this._pieceList;
    }
    /**
     * @return {string}
     */
    _determineMode() {
        const option = this.option;
        return option.pieces && option.pieces.length > 0
            ? 'pieces'
            : this.option.categories
                ? 'categories'
                : 'splitNumber';
    }
    /**
     * @override
     */
    setSelected(selected) {
        this.option.selected = zrUtil.clone(selected);
    }
    /**
     * @override
     */
    getValueState(value) {
        const index = VisualMapping.findPieceIndex(value, this._pieceList);
        return index != null
            ? (this.option.selected[this.getSelectedMapKey(this._pieceList[index])]
                ? 'inRange' : 'outOfRange')
            : 'outOfRange';
    }
    /**
     * @public
     * @param pieceIndex piece index in visualMapModel.getPieceList()
     */
    findTargetDataIndices(pieceIndex) {
        const result = [];
        const pieceList = this._pieceList;
        this.eachTargetSeries(function (seriesModel) {
            const dataIndices = [];
            const data = seriesModel.getData();
            data.each(this.getDataDimensionIndex(data), function (value, dataIndex) {
                // Should always base on model pieceList, because it is order sensitive.
                const pIdx = VisualMapping.findPieceIndex(value, pieceList);
                pIdx === pieceIndex && dataIndices.push(dataIndex);
            }, this);
            result.push({ seriesId: seriesModel.id, dataIndex: dataIndices });
        }, this);
        return result;
    }
    /**
     * @private
     * @param piece piece.value or piece.interval is required.
     * @return  Can be Infinity or -Infinity
     */
    getRepresentValue(piece) {
        let representValue;
        if (this.isCategory()) {
            representValue = piece.value;
        }
        else {
            if (piece.value != null) {
                representValue = piece.value;
            }
            else {
                const pieceInterval = piece.interval || [];
                representValue = (pieceInterval[0] === -Infinity && pieceInterval[1] === Infinity)
                    ? 0
                    : (pieceInterval[0] + pieceInterval[1]) / 2;
            }
        }
        return representValue;
    }
    getVisualMeta(getColorVisual) {
        // Do not support category. (category axis is ordinal, numerical)
        if (this.isCategory()) {
            return;
        }
        const stops = [];
        const outerColors = ['', ''];
        const visualMapModel = this;
        function setStop(interval, valueState) {
            const representValue = visualMapModel.getRepresentValue({
                interval: interval
            }); // Not category
            if (!valueState) {
                valueState = visualMapModel.getValueState(representValue);
            }
            const color = getColorVisual(representValue, valueState);
            if (interval[0] === -Infinity) {
                outerColors[0] = color;
            }
            else if (interval[1] === Infinity) {
                outerColors[1] = color;
            }
            else {
                stops.push({ value: interval[0], color: color }, { value: interval[1], color: color });
            }
        }
        // Suplement
        const pieceList = this._pieceList.slice();
        if (!pieceList.length) {
            pieceList.push({ interval: [-Infinity, Infinity] });
        }
        else {
            let edge = pieceList[0].interval[0];
            edge !== -Infinity && pieceList.unshift({ interval: [-Infinity, edge] });
            edge = pieceList[pieceList.length - 1].interval[1];
            edge !== Infinity && pieceList.push({ interval: [edge, Infinity] });
        }
        let curr = -Infinity;
        zrUtil.each(pieceList, function (piece) {
            const interval = piece.interval;
            if (interval) {
                // Fulfill gap.
                interval[0] > curr && setStop([curr, interval[0]], 'outOfRange');
                setStop(interval.slice());
                curr = interval[1];
            }
        }, this);
        return { stops: stops, outerColors: outerColors };
    }
}
PiecewiseModel.type = 'visualMap.piecewise';
PiecewiseModel.defaultOption = inheritDefaultOption(VisualMapModel.defaultOption, {
    selected: null,
    minOpen: false,
    maxOpen: false,
    align: 'auto',
    itemWidth: 20,
    itemHeight: 14,
    itemSymbol: 'roundRect',
    pieces: null,
    categories: null,
    splitNumber: 5,
    selectedMode: 'multiple',
    itemGap: 10,
    hoverLink: true // Enable hover highlight.
});
;
/**
 * Key is this._mode
 * @type {Object}
 * @this {module:echarts/component/viusalMap/PiecewiseMode}
 */
const resetMethods = {
    splitNumber(outPieceList) {
        const thisOption = this.option;
        let precision = Math.min(thisOption.precision, 20);
        const dataExtent = this.getExtent();
        let splitNumber = thisOption.splitNumber;
        splitNumber = Math.max(parseInt(splitNumber, 10), 1);
        thisOption.splitNumber = splitNumber;
        let splitStep = (dataExtent[1] - dataExtent[0]) / splitNumber;
        // Precision auto-adaption
        while (+splitStep.toFixed(precision) !== splitStep && precision < 5) {
            precision++;
        }
        thisOption.precision = precision;
        splitStep = +splitStep.toFixed(precision);
        if (thisOption.minOpen) {
            outPieceList.push({
                interval: [-Infinity, dataExtent[0]],
                close: [0, 0]
            });
        }
        for (let index = 0, curr = dataExtent[0]; index < splitNumber; curr += splitStep, index++) {
            const max = index === splitNumber - 1 ? dataExtent[1] : (curr + splitStep);
            outPieceList.push({
                interval: [curr, max],
                close: [1, 1]
            });
        }
        if (thisOption.maxOpen) {
            outPieceList.push({
                interval: [dataExtent[1], Infinity],
                close: [0, 0]
            });
        }
        reformIntervals(outPieceList);
        zrUtil.each(outPieceList, function (piece, index) {
            piece.index = index;
            piece.text = this.formatValueText(piece.interval);
        }, this);
    },
    categories(outPieceList) {
        const thisOption = this.option;
        zrUtil.each(thisOption.categories, function (cate) {
            // FIXME category模式也使用pieceList，但在visualMapping中不是使用pieceList。
            // 是否改一致。
            outPieceList.push({
                text: this.formatValueText(cate, true),
                value: cate
            });
        }, this);
        // See "Order Rule".
        normalizeReverse(thisOption, outPieceList);
    },
    pieces(outPieceList) {
        const thisOption = this.option;
        zrUtil.each(thisOption.pieces, function (pieceListItem, index) {
            if (!zrUtil.isObject(pieceListItem)) {
                pieceListItem = { value: pieceListItem };
            }
            const item = { text: '', index: index };
            if (pieceListItem.label != null) {
                item.text = pieceListItem.label;
            }
            if (pieceListItem.hasOwnProperty('value')) {
                const value = item.value = pieceListItem.value;
                item.interval = [value, value];
                item.close = [1, 1];
            }
            else {
                // `min` `max` is legacy option.
                // `lt` `gt` `lte` `gte` is recommanded.
                const interval = item.interval = [];
                const close = item.close = [0, 0];
                const closeList = [1, 0, 1];
                const infinityList = [-Infinity, Infinity];
                const useMinMax = [];
                for (let lg = 0; lg < 2; lg++) {
                    const names = [['gte', 'gt', 'min'], ['lte', 'lt', 'max']][lg];
                    for (let i = 0; i < 3 && interval[lg] == null; i++) {
                        interval[lg] = pieceListItem[names[i]];
                        close[lg] = closeList[i];
                        useMinMax[lg] = i === 2;
                    }
                    interval[lg] == null && (interval[lg] = infinityList[lg]);
                }
                useMinMax[0] && interval[1] === Infinity && (close[0] = 0);
                useMinMax[1] && interval[0] === -Infinity && (close[1] = 0);
                if (__DEV__) {
                    if (interval[0] > interval[1]) {
                        console.warn('Piece ' + index + 'is illegal: ' + interval
                            + ' lower bound should not greater then uppper bound.');
                    }
                }
                if (interval[0] === interval[1] && close[0] && close[1]) {
                    // Consider: [{min: 5, max: 5, visual: {...}}, {min: 0, max: 5}],
                    // we use value to lift the priority when min === max
                    item.value = interval[0];
                }
            }
            item.visual = VisualMapping.retrieveVisuals(pieceListItem);
            outPieceList.push(item);
        }, this);
        // See "Order Rule".
        normalizeReverse(thisOption, outPieceList);
        // Only pieces
        reformIntervals(outPieceList);
        zrUtil.each(outPieceList, function (piece) {
            const close = piece.close;
            const edgeSymbols = [['<', '≤'][close[1]], ['>', '≥'][close[0]]];
            piece.text = piece.text || this.formatValueText(piece.value != null ? piece.value : piece.interval, false, edgeSymbols);
        }, this);
    }
};
function normalizeReverse(thisOption, pieceList) {
    const inverse = thisOption.inverse;
    if (thisOption.orient === 'vertical' ? !inverse : inverse) {
        pieceList.reverse();
    }
}
export default PiecewiseModel;
