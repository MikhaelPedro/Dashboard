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
import BaseBarSeriesModel from './BaseBarSeries';
import { inheritDefaultOption } from '../../util/component';
class PictorialBarSeriesModel extends BaseBarSeriesModel {
    constructor() {
        super(...arguments);
        this.type = PictorialBarSeriesModel.type;
        this.hasSymbolVisual = true;
        this.defaultSymbol = 'roundRect';
    }
    getInitialData(option) {
        // Disable stack.
        option.stack = null;
        return super.getInitialData.apply(this, arguments);
    }
}
PictorialBarSeriesModel.type = 'series.pictorialBar';
PictorialBarSeriesModel.dependencies = ['grid'];
PictorialBarSeriesModel.defaultOption = inheritDefaultOption(BaseBarSeriesModel.defaultOption, {
    symbol: 'circle',
    symbolSize: null,
    symbolRotate: null,
    symbolPosition: null,
    symbolOffset: null,
    symbolMargin: null,
    symbolRepeat: false,
    symbolRepeatDirection: 'end',
    symbolClip: false,
    symbolBoundingData: null,
    symbolPatternSize: 400,
    barGap: '-100%',
    // z can be set in data item, which is z2 actually.
    // Disable progressive
    progressive: 0,
    emphasis: {
        // By default pictorialBar do not hover scale. Hover scale is not suitable
        // for the case that both has foreground and background.
        scale: false
    },
    select: {
        itemStyle: {
            borderColor: '#212121'
        }
    }
});
export default PictorialBarSeriesModel;
