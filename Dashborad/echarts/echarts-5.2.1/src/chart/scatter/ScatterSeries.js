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
import SeriesModel from '../../model/Series';
class ScatterSeriesModel extends SeriesModel {
    constructor() {
        super(...arguments);
        this.type = ScatterSeriesModel.type;
        this.hasSymbolVisual = true;
    }
    getInitialData(option, ecModel) {
        return createSeriesData(null, this, {
            useEncodeDefaulter: true
        });
    }
    getProgressive() {
        const progressive = this.option.progressive;
        if (progressive == null) {
            // PENDING
            return this.option.large ? 5e3 : this.get('progressive');
        }
        return progressive;
    }
    getProgressiveThreshold() {
        const progressiveThreshold = this.option.progressiveThreshold;
        if (progressiveThreshold == null) {
            // PENDING
            return this.option.large ? 1e4 : this.get('progressiveThreshold');
        }
        return progressiveThreshold;
    }
    brushSelector(dataIndex, data, selectors) {
        return selectors.point(data.getItemLayout(dataIndex));
    }
}
ScatterSeriesModel.type = 'series.scatter';
ScatterSeriesModel.dependencies = ['grid', 'polar', 'geo', 'singleAxis', 'calendar'];
ScatterSeriesModel.defaultOption = {
    coordinateSystem: 'cartesian2d',
    zlevel: 0,
    z: 2,
    legendHoverLink: true,
    symbolSize: 10,
    // symbolRotate: null,  // 图形旋转控制
    large: false,
    // Available when large is true
    largeThreshold: 2000,
    // cursor: null,
    itemStyle: {
        opacity: 0.8
        // color: 各异
    },
    emphasis: {
        scale: true
    },
    // If clip the overflow graphics
    // Works on cartesian / polar series
    clip: true,
    select: {
        itemStyle: {
            borderColor: '#212121'
        }
    },
    universalTransition: {
        divideShape: 'clone'
    }
    // progressive: null
};
export default ScatterSeriesModel;
