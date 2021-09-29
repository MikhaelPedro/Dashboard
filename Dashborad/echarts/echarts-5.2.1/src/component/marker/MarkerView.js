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
import ComponentView from '../../view/Component';
import { createHashMap, each } from 'zrender/src/core/util';
import MarkerModel from './MarkerModel';
import { makeInner } from '../../util/model';
import { enterBlur } from '../../util/states';
const inner = makeInner();
class MarkerView extends ComponentView {
    constructor() {
        super(...arguments);
        this.type = MarkerView.type;
    }
    init() {
        this.markerGroupMap = createHashMap();
    }
    render(markerModel, ecModel, api) {
        const markerGroupMap = this.markerGroupMap;
        markerGroupMap.each(function (item) {
            inner(item).keep = false;
        });
        ecModel.eachSeries(seriesModel => {
            const markerModel = MarkerModel.getMarkerModelFromSeries(seriesModel, this.type);
            markerModel && this.renderSeries(seriesModel, markerModel, ecModel, api);
        });
        markerGroupMap.each(item => {
            !inner(item).keep && this.group.remove(item.group);
        });
    }
    markKeep(drawGroup) {
        inner(drawGroup).keep = true;
    }
    blurSeries(seriesModelList) {
        each(seriesModelList, seriesModel => {
            const markerModel = MarkerModel.getMarkerModelFromSeries(seriesModel, this.type);
            if (markerModel) {
                const data = markerModel.getData();
                data.eachItemGraphicEl(function (el) {
                    if (el) {
                        enterBlur(el);
                    }
                });
            }
        });
    }
}
MarkerView.type = 'marker';
export default MarkerView;
