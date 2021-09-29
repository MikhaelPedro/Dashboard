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
import createSeriesDataSimply from './createSeriesDataSimply';
import * as zrUtil from 'zrender/src/core/util';
import { getDimensionTypeByAxis } from '../../data/helper/dimensionHelper';
import { makeSeriesEncodeForAxisCoordSys } from '../../data/helper/sourceHelper';
class WhiskerBoxCommonMixin {
    /**
     * @override
     */
    getInitialData(option, ecModel) {
        // When both types of xAxis and yAxis are 'value', layout is
        // needed to be specified by user. Otherwise, layout can be
        // judged by which axis is category.
        let ordinalMeta;
        const xAxisModel = ecModel.getComponent('xAxis', this.get('xAxisIndex'));
        const yAxisModel = ecModel.getComponent('yAxis', this.get('yAxisIndex'));
        const xAxisType = xAxisModel.get('type');
        const yAxisType = yAxisModel.get('type');
        let addOrdinal;
        // FIXME
        // Consider time axis.
        if (xAxisType === 'category') {
            option.layout = 'horizontal';
            ordinalMeta = xAxisModel.getOrdinalMeta();
            addOrdinal = true;
        }
        else if (yAxisType === 'category') {
            option.layout = 'vertical';
            ordinalMeta = yAxisModel.getOrdinalMeta();
            addOrdinal = true;
        }
        else {
            option.layout = option.layout || 'horizontal';
        }
        const coordDims = ['x', 'y'];
        const baseAxisDimIndex = option.layout === 'horizontal' ? 0 : 1;
        const baseAxisDim = this._baseAxisDim = coordDims[baseAxisDimIndex];
        const otherAxisDim = coordDims[1 - baseAxisDimIndex];
        const axisModels = [xAxisModel, yAxisModel];
        const baseAxisType = axisModels[baseAxisDimIndex].get('type');
        const otherAxisType = axisModels[1 - baseAxisDimIndex].get('type');
        const data = option.data;
        // Clone a new data for next setOption({}) usage.
        // Avoid modifying current data will affect further update.
        if (data && addOrdinal) {
            const newOptionData = [];
            zrUtil.each(data, function (item, index) {
                let newItem;
                if (zrUtil.isArray(item)) {
                    newItem = item.slice();
                    // Modify current using data.
                    item.unshift(index);
                }
                else if (zrUtil.isArray(item.value)) {
                    newItem = zrUtil.extend({}, item);
                    newItem.value = newItem.value.slice();
                    // Modify current using data.
                    item.value.unshift(index);
                }
                else {
                    newItem = item;
                }
                newOptionData.push(newItem);
            });
            option.data = newOptionData;
        }
        const defaultValueDimensions = this.defaultValueDimensions;
        const coordDimensions = [{
                name: baseAxisDim,
                type: getDimensionTypeByAxis(baseAxisType),
                ordinalMeta: ordinalMeta,
                otherDims: {
                    tooltip: false,
                    itemName: 0
                },
                dimsDef: ['base']
            }, {
                name: otherAxisDim,
                type: getDimensionTypeByAxis(otherAxisType),
                dimsDef: defaultValueDimensions.slice()
            }];
        return createSeriesDataSimply(this, {
            coordDimensions: coordDimensions,
            dimensionsCount: defaultValueDimensions.length + 1,
            encodeDefaulter: zrUtil.curry(makeSeriesEncodeForAxisCoordSys, coordDimensions, this)
        });
    }
    /**
     * If horizontal, base axis is x, otherwise y.
     * @override
     */
    getBaseAxis() {
        const dim = this._baseAxisDim;
        return this.ecModel.getComponent(dim + 'Axis', this.get(dim + 'AxisIndex')).axis;
    }
}
;
export { WhiskerBoxCommonMixin };
