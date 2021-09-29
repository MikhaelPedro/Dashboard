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
import Model from '../../model/Model';
import { isNameSpecified } from '../../util/model';
import ComponentModel from '../../model/Component';
const getDefaultSelectorOptions = function (ecModel, type) {
    if (type === 'all') {
        return {
            type: 'all',
            title: ecModel.getLocaleModel().get(['legend', 'selector', 'all'])
        };
    }
    else if (type === 'inverse') {
        return {
            type: 'inverse',
            title: ecModel.getLocaleModel().get(['legend', 'selector', 'inverse'])
        };
    }
};
class LegendModel extends ComponentModel {
    constructor() {
        super(...arguments);
        this.type = LegendModel.type;
        this.layoutMode = {
            type: 'box',
            // legend.width/height are maxWidth/maxHeight actually,
            // whereas realy width/height is calculated by its content.
            // (Setting {left: 10, right: 10} does not make sense).
            // So consider the case:
            // `setOption({legend: {left: 10});`
            // then `setOption({legend: {right: 10});`
            // The previous `left` should be cleared by setting `ignoreSize`.
            ignoreSize: true
        };
    }
    init(option, parentModel, ecModel) {
        this.mergeDefaultAndTheme(option, ecModel);
        option.selected = option.selected || {};
        this._updateSelector(option);
    }
    mergeOption(option, ecModel) {
        super.mergeOption(option, ecModel);
        this._updateSelector(option);
    }
    _updateSelector(option) {
        let selector = option.selector;
        const { ecModel } = this;
        if (selector === true) {
            selector = option.selector = ['all', 'inverse'];
        }
        if (zrUtil.isArray(selector)) {
            zrUtil.each(selector, function (item, index) {
                zrUtil.isString(item) && (item = { type: item });
                selector[index] = zrUtil.merge(item, getDefaultSelectorOptions(ecModel, item.type));
            });
        }
    }
    optionUpdated() {
        this._updateData(this.ecModel);
        const legendData = this._data;
        // If selectedMode is single, try to select one
        if (legendData[0] && this.get('selectedMode') === 'single') {
            let hasSelected = false;
            // If has any selected in option.selected
            for (let i = 0; i < legendData.length; i++) {
                const name = legendData[i].get('name');
                if (this.isSelected(name)) {
                    // Force to unselect others
                    this.select(name);
                    hasSelected = true;
                    break;
                }
            }
            // Try select the first if selectedMode is single
            !hasSelected && this.select(legendData[0].get('name'));
        }
    }
    _updateData(ecModel) {
        let potentialData = [];
        let availableNames = [];
        ecModel.eachRawSeries(function (seriesModel) {
            const seriesName = seriesModel.name;
            availableNames.push(seriesName);
            let isPotential;
            if (seriesModel.legendVisualProvider) {
                const provider = seriesModel.legendVisualProvider;
                const names = provider.getAllNames();
                if (!ecModel.isSeriesFiltered(seriesModel)) {
                    availableNames = availableNames.concat(names);
                }
                if (names.length) {
                    potentialData = potentialData.concat(names);
                }
                else {
                    isPotential = true;
                }
            }
            else {
                isPotential = true;
            }
            if (isPotential && isNameSpecified(seriesModel)) {
                potentialData.push(seriesModel.name);
            }
        });
        /**
         * @type {Array.<string>}
         * @private
         */
        this._availableNames = availableNames;
        // If legend.data not specified in option, use availableNames as data,
        // which is convinient for user preparing option.
        const rawData = this.get('data') || potentialData;
        const legendData = zrUtil.map(rawData, function (dataItem) {
            // Can be string or number
            if (typeof dataItem === 'string' || typeof dataItem === 'number') {
                dataItem = {
                    name: dataItem
                };
            }
            return new Model(dataItem, this, this.ecModel);
        }, this);
        /**
         * @type {Array.<module:echarts/model/Model>}
         * @private
         */
        this._data = legendData;
    }
    getData() {
        return this._data;
    }
    select(name) {
        const selected = this.option.selected;
        const selectedMode = this.get('selectedMode');
        if (selectedMode === 'single') {
            const data = this._data;
            zrUtil.each(data, function (dataItem) {
                selected[dataItem.get('name')] = false;
            });
        }
        selected[name] = true;
    }
    unSelect(name) {
        if (this.get('selectedMode') !== 'single') {
            this.option.selected[name] = false;
        }
    }
    toggleSelected(name) {
        const selected = this.option.selected;
        // Default is true
        if (!selected.hasOwnProperty(name)) {
            selected[name] = true;
        }
        this[selected[name] ? 'unSelect' : 'select'](name);
    }
    allSelect() {
        const data = this._data;
        const selected = this.option.selected;
        zrUtil.each(data, function (dataItem) {
            selected[dataItem.get('name', true)] = true;
        });
    }
    inverseSelect() {
        const data = this._data;
        const selected = this.option.selected;
        zrUtil.each(data, function (dataItem) {
            const name = dataItem.get('name', true);
            // Initially, default value is true
            if (!selected.hasOwnProperty(name)) {
                selected[name] = true;
            }
            selected[name] = !selected[name];
        });
    }
    isSelected(name) {
        const selected = this.option.selected;
        return !(selected.hasOwnProperty(name) && !selected[name])
            && zrUtil.indexOf(this._availableNames, name) >= 0;
    }
    getOrient() {
        return this.get('orient') === 'vertical'
            ? { index: 1, name: 'vertical' }
            : { index: 0, name: 'horizontal' };
    }
}
LegendModel.type = 'legend.plain';
LegendModel.dependencies = ['series'];
LegendModel.defaultOption = {
    zlevel: 0,
    z: 4,
    show: true,
    orient: 'horizontal',
    left: 'center',
    // right: 'center',
    top: 0,
    // bottom: null,
    align: 'auto',
    backgroundColor: 'rgba(0,0,0,0)',
    borderColor: '#ccc',
    borderRadius: 0,
    borderWidth: 0,
    padding: 5,
    itemGap: 10,
    itemWidth: 25,
    itemHeight: 14,
    symbolRotate: 'inherit',
    symbolKeepAspect: true,
    inactiveColor: '#ccc',
    inactiveBorderColor: '#ccc',
    inactiveBorderWidth: 'auto',
    itemStyle: {
        color: 'inherit',
        opacity: 'inherit',
        borderColor: 'inherit',
        borderWidth: 'auto',
        borderCap: 'inherit',
        borderJoin: 'inherit',
        borderDashOffset: 'inherit',
        borderMiterLimit: 'inherit'
    },
    lineStyle: {
        width: 'auto',
        color: 'inherit',
        inactiveColor: '#ccc',
        inactiveWidth: 2,
        opacity: 'inherit',
        type: 'inherit',
        cap: 'inherit',
        join: 'inherit',
        dashOffset: 'inherit',
        miterLimit: 'inherit'
    },
    textStyle: {
        color: '#333'
    },
    selectedMode: true,
    selector: false,
    selectorLabel: {
        show: true,
        borderRadius: 10,
        padding: [3, 5, 3, 5],
        fontSize: 12,
        fontFamily: 'sans-serif',
        color: '#666',
        borderWidth: 1,
        borderColor: '#666'
    },
    emphasis: {
        selectorLabel: {
            show: true,
            color: '#eee',
            backgroundColor: '#666'
        }
    },
    selectorPosition: 'auto',
    selectorItemGap: 7,
    selectorButtonGap: 10,
    tooltip: {
        show: false
    }
};
export default LegendModel;
