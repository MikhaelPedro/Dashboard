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
import createSeriesData from '../helper/createSeriesData';
import { makeInner } from '../../util/model';
import SeriesModel from '../../model/Series';
export const TRANSFORM_PROPS = {
    x: 1,
    y: 1,
    scaleX: 1,
    scaleY: 1,
    originX: 1,
    originY: 1,
    rotation: 1
};
// Also compat with ec4, where
// `visual('color') visual('borderColor')` is supported.
export const STYLE_VISUAL_TYPE = {
    color: 'fill',
    borderColor: 'stroke'
};
export const NON_STYLE_VISUAL_PROPS = {
    symbol: 1,
    symbolSize: 1,
    symbolKeepAspect: 1,
    legendIcon: 1,
    visualMeta: 1,
    liftZ: 1,
    decal: 1
};
;
;
export const customInnerStore = makeInner();
export default class CustomSeriesModel extends SeriesModel {
    constructor() {
        super(...arguments);
        this.type = CustomSeriesModel.type;
    }
    optionUpdated() {
        this.currentZLevel = this.get('zlevel', true);
        this.currentZ = this.get('z', true);
    }
    getInitialData(option, ecModel) {
        return createSeriesData(null, this);
    }
    getDataParams(dataIndex, dataType, el) {
        const params = super.getDataParams(dataIndex, dataType);
        el && (params.info = customInnerStore(el).info);
        return params;
    }
}
CustomSeriesModel.type = 'series.custom';
CustomSeriesModel.dependencies = ['grid', 'polar', 'geo', 'singleAxis', 'calendar'];
CustomSeriesModel.defaultOption = {
    coordinateSystem: 'cartesian2d',
    zlevel: 0,
    z: 2,
    legendHoverLink: true,
    // Custom series will not clip by default.
    // Some case will use custom series to draw label
    // For example https://echarts.apache.org/examples/en/editor.html?c=custom-gantt-flight
    clip: false
    // Cartesian coordinate system
    // xAxisIndex: 0,
    // yAxisIndex: 0,
    // Polar coordinate system
    // polarIndex: 0,
    // Geo coordinate system
    // geoIndex: 0,
};
