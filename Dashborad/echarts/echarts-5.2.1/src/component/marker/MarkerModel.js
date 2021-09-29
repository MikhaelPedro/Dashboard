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
import { DataFormatMixin } from '../../model/mixin/dataFormat';
import ComponentModel from '../../model/Component';
import { makeInner, defaultEmphasis } from '../../util/model';
import { createTooltipMarkup } from '../tooltip/tooltipMarkup';
function fillLabel(opt) {
    defaultEmphasis(opt, 'label', ['show']);
}
// { [componentType]: MarkerModel }
const inner = makeInner();
class MarkerModel extends ComponentModel {
    constructor() {
        super(...arguments);
        this.type = MarkerModel.type;
        /**
         * If marker model is created by self from series
         */
        this.createdBySelf = false;
    }
    /**
     * @overrite
     */
    init(option, parentModel, ecModel) {
        if (__DEV__) {
            if (this.type === 'marker') {
                throw new Error('Marker component is abstract component. Use markLine, markPoint, markArea instead.');
            }
        }
        this.mergeDefaultAndTheme(option, ecModel);
        this._mergeOption(option, ecModel, false, true);
    }
    isAnimationEnabled() {
        if (env.node) {
            return false;
        }
        const hostSeries = this.__hostSeries;
        return this.getShallow('animation') && hostSeries && hostSeries.isAnimationEnabled();
    }
    /**
     * @overrite
     */
    mergeOption(newOpt, ecModel) {
        this._mergeOption(newOpt, ecModel, false, false);
    }
    _mergeOption(newOpt, ecModel, createdBySelf, isInit) {
        const componentType = this.mainType;
        if (!createdBySelf) {
            ecModel.eachSeries(function (seriesModel) {
                // mainType can be markPoint, markLine, markArea
                const markerOpt = seriesModel.get(this.mainType, true);
                let markerModel = inner(seriesModel)[componentType];
                if (!markerOpt || !markerOpt.data) {
                    inner(seriesModel)[componentType] = null;
                    return;
                }
                if (!markerModel) {
                    if (isInit) {
                        // Default label emphasis `position` and `show`
                        fillLabel(markerOpt);
                    }
                    zrUtil.each(markerOpt.data, function (item) {
                        // FIXME Overwrite fillLabel method ?
                        if (item instanceof Array) {
                            fillLabel(item[0]);
                            fillLabel(item[1]);
                        }
                        else {
                            fillLabel(item);
                        }
                    });
                    markerModel = this.createMarkerModelFromSeries(markerOpt, this, ecModel);
                    // markerModel = new ImplementedMarkerModel(
                    //     markerOpt, this, ecModel
                    // );
                    zrUtil.extend(markerModel, {
                        mainType: this.mainType,
                        // Use the same series index and name
                        seriesIndex: seriesModel.seriesIndex,
                        name: seriesModel.name,
                        createdBySelf: true
                    });
                    markerModel.__hostSeries = seriesModel;
                }
                else {
                    markerModel._mergeOption(markerOpt, ecModel, true);
                }
                inner(seriesModel)[componentType] = markerModel;
            }, this);
        }
    }
    formatTooltip(dataIndex, multipleSeries, dataType) {
        const data = this.getData();
        const value = this.getRawValue(dataIndex);
        const itemName = data.getName(dataIndex);
        return createTooltipMarkup('section', {
            header: this.name,
            blocks: [createTooltipMarkup('nameValue', {
                    name: itemName,
                    value: value,
                    noName: !itemName,
                    noValue: value == null
                })]
        });
    }
    getData() {
        return this._data;
    }
    setData(data) {
        this._data = data;
    }
    static getMarkerModelFromSeries(seriesModel, 
    // Support three types of markers. Strict check.
    componentType) {
        return inner(seriesModel)[componentType];
    }
}
MarkerModel.type = 'marker';
MarkerModel.dependencies = ['series', 'grid', 'polar', 'geo'];
zrUtil.mixin(MarkerModel, DataFormatMixin.prototype);
export default MarkerModel;
