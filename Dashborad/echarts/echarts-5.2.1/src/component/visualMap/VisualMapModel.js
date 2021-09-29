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
import env from 'zrender/src/core/env';
import visualDefault from '../../visual/visualDefault';
import VisualMapping from '../../visual/VisualMapping';
import * as visualSolution from '../../visual/visualSolution';
import * as modelUtil from '../../util/model';
import * as numberUtil from '../../util/number';
import ComponentModel from '../../model/Component';
const mapVisual = VisualMapping.mapVisual;
const eachVisual = VisualMapping.eachVisual;
const isArray = zrUtil.isArray;
const each = zrUtil.each;
const asc = numberUtil.asc;
const linearMap = numberUtil.linearMap;
class VisualMapModel extends ComponentModel {
    constructor() {
        super(...arguments);
        this.type = VisualMapModel.type;
        this.stateList = ['inRange', 'outOfRange'];
        this.replacableOptionKeys = [
            'inRange', 'outOfRange', 'target', 'controller', 'color'
        ];
        this.layoutMode = {
            type: 'box', ignoreSize: true
        };
        /**
         * [lowerBound, upperBound]
         */
        this.dataBound = [-Infinity, Infinity];
        this.targetVisuals = {};
        this.controllerVisuals = {};
    }
    init(option, parentModel, ecModel) {
        this.mergeDefaultAndTheme(option, ecModel);
    }
    /**
     * @protected
     */
    optionUpdated(newOption, isInit) {
        const thisOption = this.option;
        // FIXME
        // necessary?
        // Disable realtime view update if canvas is not supported.
        if (!env.canvasSupported) {
            thisOption.realtime = false;
        }
        !isInit && visualSolution.replaceVisualOption(thisOption, newOption, this.replacableOptionKeys);
        this.textStyleModel = this.getModel('textStyle');
        this.resetItemSize();
        this.completeVisualOption();
    }
    /**
     * @protected
     */
    resetVisual(supplementVisualOption) {
        const stateList = this.stateList;
        supplementVisualOption = zrUtil.bind(supplementVisualOption, this);
        this.controllerVisuals = visualSolution.createVisualMappings(this.option.controller, stateList, supplementVisualOption);
        this.targetVisuals = visualSolution.createVisualMappings(this.option.target, stateList, supplementVisualOption);
    }
    /**
     * @public
     */
    getItemSymbol() {
        return null;
    }
    /**
     * @protected
     * @return {Array.<number>} An array of series indices.
     */
    getTargetSeriesIndices() {
        const optionSeriesIndex = this.option.seriesIndex;
        let seriesIndices = [];
        if (optionSeriesIndex == null || optionSeriesIndex === 'all') {
            this.ecModel.eachSeries(function (seriesModel, index) {
                seriesIndices.push(index);
            });
        }
        else {
            seriesIndices = modelUtil.normalizeToArray(optionSeriesIndex);
        }
        return seriesIndices;
    }
    /**
     * @public
     */
    eachTargetSeries(callback, context) {
        zrUtil.each(this.getTargetSeriesIndices(), function (seriesIndex) {
            const seriesModel = this.ecModel.getSeriesByIndex(seriesIndex);
            if (seriesModel) {
                callback.call(context, seriesModel);
            }
        }, this);
    }
    /**
     * @pubilc
     */
    isTargetSeries(seriesModel) {
        let is = false;
        this.eachTargetSeries(function (model) {
            model === seriesModel && (is = true);
        });
        return is;
    }
    /**
     * @example
     * this.formatValueText(someVal); // format single numeric value to text.
     * this.formatValueText(someVal, true); // format single category value to text.
     * this.formatValueText([min, max]); // format numeric min-max to text.
     * this.formatValueText([this.dataBound[0], max]); // using data lower bound.
     * this.formatValueText([min, this.dataBound[1]]); // using data upper bound.
     *
     * @param value Real value, or this.dataBound[0 or 1].
     * @param isCategory Only available when value is number.
     * @param edgeSymbols Open-close symbol when value is interval.
     * @protected
     */
    formatValueText(value, isCategory, edgeSymbols) {
        const option = this.option;
        const precision = option.precision;
        const dataBound = this.dataBound;
        const formatter = option.formatter;
        let isMinMax;
        edgeSymbols = edgeSymbols || ['<', '>'];
        if (zrUtil.isArray(value)) {
            value = value.slice();
            isMinMax = true;
        }
        const textValue = isCategory
            ? value // Value is string when isCategory
            : (isMinMax
                ? [toFixed(value[0]), toFixed(value[1])]
                : toFixed(value));
        if (zrUtil.isString(formatter)) {
            return formatter
                .replace('{value}', isMinMax ? textValue[0] : textValue)
                .replace('{value2}', isMinMax ? textValue[1] : textValue);
        }
        else if (zrUtil.isFunction(formatter)) {
            return isMinMax
                ? formatter(value[0], value[1])
                : formatter(value);
        }
        if (isMinMax) {
            if (value[0] === dataBound[0]) {
                return edgeSymbols[0] + ' ' + textValue[1];
            }
            else if (value[1] === dataBound[1]) {
                return edgeSymbols[1] + ' ' + textValue[0];
            }
            else {
                return textValue[0] + ' - ' + textValue[1];
            }
        }
        else { // Format single value (includes category case).
            return textValue;
        }
        function toFixed(val) {
            return val === dataBound[0]
                ? 'min'
                : val === dataBound[1]
                    ? 'max'
                    : (+val).toFixed(Math.min(precision, 20));
        }
    }
    /**
     * @protected
     */
    resetExtent() {
        const thisOption = this.option;
        // Can not calculate data extent by data here.
        // Because series and data may be modified in processing stage.
        // So we do not support the feature "auto min/max".
        const extent = asc([thisOption.min, thisOption.max]);
        this._dataExtent = extent;
    }
    /**
     * PENDING:
     * delete this method if no outer usage.
     *
     * Return  Concrete dimention. If return null/undefined, no dimension used.
     */
    // getDataDimension(data: SeriesData) {
    //     const optDim = this.option.dimension;
    //     if (optDim != null) {
    //         return data.getDimension(optDim);
    //     }
    //     const dimNames = data.dimensions;
    //     for (let i = dimNames.length - 1; i >= 0; i--) {
    //         const dimName = dimNames[i];
    //         const dimInfo = data.getDimensionInfo(dimName);
    //         if (!dimInfo.isCalculationCoord) {
    //             return dimName;
    //         }
    //     }
    // }
    getDataDimensionIndex(data) {
        const optDim = this.option.dimension;
        if (optDim != null) {
            return data.getDimensionIndex(optDim);
        }
        const dimNames = data.dimensions;
        for (let i = dimNames.length - 1; i >= 0; i--) {
            const dimName = dimNames[i];
            const dimInfo = data.getDimensionInfo(dimName);
            if (!dimInfo.isCalculationCoord) {
                return dimInfo.storeDimIndex;
            }
        }
    }
    getExtent() {
        return this._dataExtent.slice();
    }
    completeVisualOption() {
        const ecModel = this.ecModel;
        const thisOption = this.option;
        const base = {
            inRange: thisOption.inRange,
            outOfRange: thisOption.outOfRange
        };
        const target = thisOption.target || (thisOption.target = {});
        const controller = thisOption.controller || (thisOption.controller = {});
        zrUtil.merge(target, base); // Do not override
        zrUtil.merge(controller, base); // Do not override
        const isCategory = this.isCategory();
        completeSingle.call(this, target);
        completeSingle.call(this, controller);
        completeInactive.call(this, target, 'inRange', 'outOfRange');
        // completeInactive.call(this, target, 'outOfRange', 'inRange');
        completeController.call(this, controller);
        function completeSingle(base) {
            // Compatible with ec2 dataRange.color.
            // The mapping order of dataRange.color is: [high value, ..., low value]
            // whereas inRange.color and outOfRange.color is [low value, ..., high value]
            // Notice: ec2 has no inverse.
            if (isArray(thisOption.color)
                // If there has been inRange: {symbol: ...}, adding color is a mistake.
                // So adding color only when no inRange defined.
                && !base.inRange) {
                base.inRange = { color: thisOption.color.slice().reverse() };
            }
            // Compatible with previous logic, always give a defautl color, otherwise
            // simple config with no inRange and outOfRange will not work.
            // Originally we use visualMap.color as the default color, but setOption at
            // the second time the default color will be erased. So we change to use
            // constant DEFAULT_COLOR.
            // If user do not want the default color, set inRange: {color: null}.
            base.inRange = base.inRange || { color: ecModel.get('gradientColor') };
        }
        function completeInactive(base, stateExist, stateAbsent) {
            const optExist = base[stateExist];
            let optAbsent = base[stateAbsent];
            if (optExist && !optAbsent) {
                optAbsent = base[stateAbsent] = {};
                each(optExist, function (visualData, visualType) {
                    if (!VisualMapping.isValidType(visualType)) {
                        return;
                    }
                    const defa = visualDefault.get(visualType, 'inactive', isCategory);
                    if (defa != null) {
                        optAbsent[visualType] = defa;
                        // Compatibable with ec2:
                        // Only inactive color to rgba(0,0,0,0) can not
                        // make label transparent, so use opacity also.
                        if (visualType === 'color'
                            && !optAbsent.hasOwnProperty('opacity')
                            && !optAbsent.hasOwnProperty('colorAlpha')) {
                            optAbsent.opacity = [0, 0];
                        }
                    }
                });
            }
        }
        function completeController(controller) {
            const symbolExists = (controller.inRange || {}).symbol
                || (controller.outOfRange || {}).symbol;
            const symbolSizeExists = (controller.inRange || {}).symbolSize
                || (controller.outOfRange || {}).symbolSize;
            const inactiveColor = this.get('inactiveColor');
            const itemSymbol = this.getItemSymbol();
            const defaultSymbol = itemSymbol || 'roundRect';
            each(this.stateList, function (state) {
                const itemSize = this.itemSize;
                let visuals = controller[state];
                // Set inactive color for controller if no other color
                // attr (like colorAlpha) specified.
                if (!visuals) {
                    visuals = controller[state] = {
                        color: isCategory ? inactiveColor : [inactiveColor]
                    };
                }
                // Consistent symbol and symbolSize if not specified.
                if (visuals.symbol == null) {
                    visuals.symbol = symbolExists
                        && zrUtil.clone(symbolExists)
                        || (isCategory ? defaultSymbol : [defaultSymbol]);
                }
                if (visuals.symbolSize == null) {
                    visuals.symbolSize = symbolSizeExists
                        && zrUtil.clone(symbolSizeExists)
                        || (isCategory ? itemSize[0] : [itemSize[0], itemSize[0]]);
                }
                // Filter none
                visuals.symbol = mapVisual(visuals.symbol, function (symbol) {
                    return symbol === 'none' ? defaultSymbol : symbol;
                });
                // Normalize symbolSize
                const symbolSize = visuals.symbolSize;
                if (symbolSize != null) {
                    let max = -Infinity;
                    // symbolSize can be object when categories defined.
                    eachVisual(symbolSize, function (value) {
                        value > max && (max = value);
                    });
                    visuals.symbolSize = mapVisual(symbolSize, function (value) {
                        return linearMap(value, [0, max], [0, itemSize[0]], true);
                    });
                }
            }, this);
        }
    }
    resetItemSize() {
        this.itemSize = [
            parseFloat(this.get('itemWidth')),
            parseFloat(this.get('itemHeight'))
        ];
    }
    isCategory() {
        return !!this.option.categories;
    }
    /**
     * @public
     * @abstract
     */
    setSelected(selected) { }
    getSelected() {
        return null;
    }
    /**
     * @public
     * @abstract
     */
    getValueState(value) {
        return null;
    }
    /**
     * FIXME
     * Do not publish to thirt-part-dev temporarily
     * util the interface is stable. (Should it return
     * a function but not visual meta?)
     *
     * @pubilc
     * @abstract
     * @param getColorVisual
     *        params: value, valueState
     *        return: color
     * @return {Object} visualMeta
     *        should includes {stops, outerColors}
     *        outerColor means [colorBeyondMinValue, colorBeyondMaxValue]
     */
    getVisualMeta(getColorVisual) {
        return null;
    }
}
VisualMapModel.type = 'visualMap';
VisualMapModel.dependencies = ['series'];
VisualMapModel.defaultOption = {
    show: true,
    zlevel: 0,
    z: 4,
    seriesIndex: 'all',
    min: 0,
    max: 200,
    left: 0,
    right: null,
    top: null,
    bottom: 0,
    itemWidth: null,
    itemHeight: null,
    inverse: false,
    orient: 'vertical',
    backgroundColor: 'rgba(0,0,0,0)',
    borderColor: '#ccc',
    contentColor: '#5793f3',
    inactiveColor: '#aaa',
    borderWidth: 0,
    padding: 5,
    // 接受数组分别设定上右下左边距，同css
    textGap: 10,
    precision: 0,
    textStyle: {
        color: '#333' // 值域文字颜色
    }
};
export default VisualMapModel;
