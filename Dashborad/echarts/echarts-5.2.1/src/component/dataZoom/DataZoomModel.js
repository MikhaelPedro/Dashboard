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
import { each, createHashMap, merge, assert } from 'zrender/src/core/util';
import ComponentModel from '../../model/Component';
import { getAxisMainType, DATA_ZOOM_AXIS_DIMENSIONS } from './helper';
import { MULTIPLE_REFERRING, SINGLE_REFERRING } from '../../util/model';
class DataZoomAxisInfo {
    constructor() {
        this.indexList = [];
        this.indexMap = [];
    }
    add(axisCmptIdx) {
        // Remove duplication.
        if (!this.indexMap[axisCmptIdx]) {
            this.indexList.push(axisCmptIdx);
            this.indexMap[axisCmptIdx] = true;
        }
    }
}
class DataZoomModel extends ComponentModel {
    constructor() {
        super(...arguments);
        this.type = DataZoomModel.type;
        this._autoThrottle = true;
        this._noTarget = true;
        /**
         * It is `[rangeModeForMin, rangeModeForMax]`.
         * The optional values for `rangeMode`:
         * + `'value'` mode: the axis extent will always be determined by
         *     `dataZoom.startValue` and `dataZoom.endValue`, despite
         *     how data like and how `axis.min` and `axis.max` are.
         * + `'percent'` mode: `100` represents 100% of the `[dMin, dMax]`,
         *     where `dMin` is `axis.min` if `axis.min` specified, otherwise `data.extent[0]`,
         *     and `dMax` is `axis.max` if `axis.max` specified, otherwise `data.extent[1]`.
         *     Axis extent will be determined by the result of the percent of `[dMin, dMax]`.
         *
         * For example, when users are using dynamic data (update data periodically via `setOption`),
         * if in `'value`' mode, the window will be kept in a fixed value range despite how
         * data are appended, while if in `'percent'` mode, whe window range will be changed alone with
         * the appended data (suppose `axis.min` and `axis.max` are not specified).
         */
        this._rangePropMode = ['percent', 'percent'];
    }
    init(option, parentModel, ecModel) {
        const inputRawOption = retrieveRawOption(option);
        /**
         * Suppose a "main process" start at the point that model prepared (that is,
         * model initialized or merged or method called in `action`).
         * We should keep the `main process` idempotent, that is, given a set of values
         * on `option`, we get the same result.
         *
         * But sometimes, values on `option` will be updated for providing users
         * a "final calculated value" (`dataZoomProcessor` will do that). Those value
         * should not be the base/input of the `main process`.
         *
         * So in that case we should save and keep the input of the `main process`
         * separately, called `settledOption`.
         *
         * For example, consider the case:
         * (Step_1) brush zoom the grid by `toolbox.dataZoom`,
         *     where the original input `option.startValue`, `option.endValue` are earsed by
         *     calculated value.
         * (Step)2) click the legend to hide and show a series,
         *     where the new range is calculated by the earsed `startValue` and `endValue`,
         *     which brings incorrect result.
         */
        this.settledOption = inputRawOption;
        this.mergeDefaultAndTheme(option, ecModel);
        this._doInit(inputRawOption);
    }
    mergeOption(newOption) {
        const inputRawOption = retrieveRawOption(newOption);
        //FIX #2591
        merge(this.option, newOption, true);
        merge(this.settledOption, inputRawOption, true);
        this._doInit(inputRawOption);
    }
    _doInit(inputRawOption) {
        const thisOption = this.option;
        // if (!env.canvasSupported) {
        //     thisOption.realtime = false;
        // }
        this._setDefaultThrottle(inputRawOption);
        this._updateRangeUse(inputRawOption);
        const settledOption = this.settledOption;
        each([['start', 'startValue'], ['end', 'endValue']], function (names, index) {
            // start/end has higher priority over startValue/endValue if they
            // both set, but we should make chart.setOption({endValue: 1000})
            // effective, rather than chart.setOption({endValue: 1000, end: null}).
            if (this._rangePropMode[index] === 'value') {
                thisOption[names[0]] = settledOption[names[0]] = null;
            }
            // Otherwise do nothing and use the merge result.
        }, this);
        this._resetTarget();
    }
    _resetTarget() {
        const optionOrient = this.get('orient', true);
        const targetAxisIndexMap = this._targetAxisInfoMap = createHashMap();
        const hasAxisSpecified = this._fillSpecifiedTargetAxis(targetAxisIndexMap);
        if (hasAxisSpecified) {
            this._orient = optionOrient || this._makeAutoOrientByTargetAxis();
        }
        else {
            this._orient = optionOrient || 'horizontal';
            this._fillAutoTargetAxisByOrient(targetAxisIndexMap, this._orient);
        }
        this._noTarget = true;
        targetAxisIndexMap.each(function (axisInfo) {
            if (axisInfo.indexList.length) {
                this._noTarget = false;
            }
        }, this);
    }
    _fillSpecifiedTargetAxis(targetAxisIndexMap) {
        let hasAxisSpecified = false;
        each(DATA_ZOOM_AXIS_DIMENSIONS, function (axisDim) {
            const refering = this.getReferringComponents(getAxisMainType(axisDim), MULTIPLE_REFERRING);
            // When user set axisIndex as a empty array, we think that user specify axisIndex
            // but do not want use auto mode. Because empty array may be encountered when
            // some error occured.
            if (!refering.specified) {
                return;
            }
            hasAxisSpecified = true;
            const axisInfo = new DataZoomAxisInfo();
            each(refering.models, function (axisModel) {
                axisInfo.add(axisModel.componentIndex);
            });
            targetAxisIndexMap.set(axisDim, axisInfo);
        }, this);
        return hasAxisSpecified;
    }
    _fillAutoTargetAxisByOrient(targetAxisIndexMap, orient) {
        const ecModel = this.ecModel;
        let needAuto = true;
        // Find axis that parallel to dataZoom as default.
        if (needAuto) {
            const axisDim = orient === 'vertical' ? 'y' : 'x';
            const axisModels = ecModel.findComponents({ mainType: axisDim + 'Axis' });
            setParallelAxis(axisModels, axisDim);
        }
        // Find axis that parallel to dataZoom as default.
        if (needAuto) {
            const axisModels = ecModel.findComponents({
                mainType: 'singleAxis',
                filter: (axisModel) => axisModel.get('orient', true) === orient
            });
            setParallelAxis(axisModels, 'single');
        }
        function setParallelAxis(axisModels, axisDim) {
            // At least use the first parallel axis as the target axis.
            const axisModel = axisModels[0];
            if (!axisModel) {
                return;
            }
            const axisInfo = new DataZoomAxisInfo();
            axisInfo.add(axisModel.componentIndex);
            targetAxisIndexMap.set(axisDim, axisInfo);
            needAuto = false;
            // Find parallel axes in the same grid.
            if (axisDim === 'x' || axisDim === 'y') {
                const gridModel = axisModel.getReferringComponents('grid', SINGLE_REFERRING).models[0];
                gridModel && each(axisModels, function (axModel) {
                    if (axisModel.componentIndex !== axModel.componentIndex
                        && gridModel === axModel.getReferringComponents('grid', SINGLE_REFERRING).models[0]) {
                        axisInfo.add(axModel.componentIndex);
                    }
                });
            }
        }
        if (needAuto) {
            // If no parallel axis, find the first category axis as default. (Also consider polar).
            each(DATA_ZOOM_AXIS_DIMENSIONS, function (axisDim) {
                if (!needAuto) {
                    return;
                }
                const axisModels = ecModel.findComponents({
                    mainType: getAxisMainType(axisDim),
                    filter: (axisModel) => axisModel.get('type', true) === 'category'
                });
                if (axisModels[0]) {
                    const axisInfo = new DataZoomAxisInfo();
                    axisInfo.add(axisModels[0].componentIndex);
                    targetAxisIndexMap.set(axisDim, axisInfo);
                    needAuto = false;
                }
            }, this);
        }
    }
    _makeAutoOrientByTargetAxis() {
        let dim;
        // Find the first axis
        this.eachTargetAxis(function (axisDim) {
            !dim && (dim = axisDim);
        }, this);
        return dim === 'y' ? 'vertical' : 'horizontal';
    }
    _setDefaultThrottle(inputRawOption) {
        // When first time user set throttle, auto throttle ends.
        if (inputRawOption.hasOwnProperty('throttle')) {
            this._autoThrottle = false;
        }
        if (this._autoThrottle) {
            const globalOption = this.ecModel.option;
            this.option.throttle = (globalOption.animation && globalOption.animationDurationUpdate > 0) ? 100 : 20;
        }
    }
    _updateRangeUse(inputRawOption) {
        const rangePropMode = this._rangePropMode;
        const rangeModeInOption = this.get('rangeMode');
        each([['start', 'startValue'], ['end', 'endValue']], function (names, index) {
            const percentSpecified = inputRawOption[names[0]] != null;
            const valueSpecified = inputRawOption[names[1]] != null;
            if (percentSpecified && !valueSpecified) {
                rangePropMode[index] = 'percent';
            }
            else if (!percentSpecified && valueSpecified) {
                rangePropMode[index] = 'value';
            }
            else if (rangeModeInOption) {
                rangePropMode[index] = rangeModeInOption[index];
            }
            else if (percentSpecified) { // percentSpecified && valueSpecified
                rangePropMode[index] = 'percent';
            }
            // else remain its original setting.
        });
    }
    noTarget() {
        return this._noTarget;
    }
    getFirstTargetAxisModel() {
        let firstAxisModel;
        this.eachTargetAxis(function (axisDim, axisIndex) {
            if (firstAxisModel == null) {
                firstAxisModel = this.ecModel.getComponent(getAxisMainType(axisDim), axisIndex);
            }
        }, this);
        return firstAxisModel;
    }
    /**
     * @param {Function} callback param: axisModel, dimNames, axisIndex, dataZoomModel, ecModel
     */
    eachTargetAxis(callback, context) {
        this._targetAxisInfoMap.each(function (axisInfo, axisDim) {
            each(axisInfo.indexList, function (axisIndex) {
                callback.call(context, axisDim, axisIndex);
            });
        });
    }
    /**
     * @return If not found, return null/undefined.
     */
    getAxisProxy(axisDim, axisIndex) {
        const axisModel = this.getAxisModel(axisDim, axisIndex);
        if (axisModel) {
            return axisModel.__dzAxisProxy;
        }
    }
    /**
     * @return If not found, return null/undefined.
     */
    getAxisModel(axisDim, axisIndex) {
        if (__DEV__) {
            assert(axisDim && axisIndex != null);
        }
        const axisInfo = this._targetAxisInfoMap.get(axisDim);
        if (axisInfo && axisInfo.indexMap[axisIndex]) {
            return this.ecModel.getComponent(getAxisMainType(axisDim), axisIndex);
        }
    }
    /**
     * If not specified, set to undefined.
     */
    setRawRange(opt) {
        const thisOption = this.option;
        const settledOption = this.settledOption;
        each([['start', 'startValue'], ['end', 'endValue']], function (names) {
            // Consider the pair <start, startValue>:
            // If one has value and the other one is `null/undefined`, we both set them
            // to `settledOption`. This strategy enables the feature to clear the original
            // value in `settledOption` to `null/undefined`.
            // But if both of them are `null/undefined`, we do not set them to `settledOption`
            // and keep `settledOption` with the original value. This strategy enables users to
            // only set <end or endValue> but not set <start or startValue> when calling
            // `dispatchAction`.
            // The pair <end, endValue> is treated in the same way.
            if (opt[names[0]] != null || opt[names[1]] != null) {
                thisOption[names[0]] = settledOption[names[0]] = opt[names[0]];
                thisOption[names[1]] = settledOption[names[1]] = opt[names[1]];
            }
        }, this);
        this._updateRangeUse(opt);
    }
    setCalculatedRange(opt) {
        const option = this.option;
        each(['start', 'startValue', 'end', 'endValue'], function (name) {
            option[name] = opt[name];
        });
    }
    getPercentRange() {
        const axisProxy = this.findRepresentativeAxisProxy();
        if (axisProxy) {
            return axisProxy.getDataPercentWindow();
        }
    }
    /**
     * For example, chart.getModel().getComponent('dataZoom').getValueRange('y', 0);
     *
     * @return [startValue, endValue] value can only be '-' or finite number.
     */
    getValueRange(axisDim, axisIndex) {
        if (axisDim == null && axisIndex == null) {
            const axisProxy = this.findRepresentativeAxisProxy();
            if (axisProxy) {
                return axisProxy.getDataValueWindow();
            }
        }
        else {
            return this.getAxisProxy(axisDim, axisIndex).getDataValueWindow();
        }
    }
    /**
     * @param axisModel If axisModel given, find axisProxy
     *      corresponding to the axisModel
     */
    findRepresentativeAxisProxy(axisModel) {
        if (axisModel) {
            return axisModel.__dzAxisProxy;
        }
        // Find the first hosted axisProxy
        let firstProxy;
        const axisDimList = this._targetAxisInfoMap.keys();
        for (let i = 0; i < axisDimList.length; i++) {
            const axisDim = axisDimList[i];
            const axisInfo = this._targetAxisInfoMap.get(axisDim);
            for (let j = 0; j < axisInfo.indexList.length; j++) {
                const proxy = this.getAxisProxy(axisDim, axisInfo.indexList[j]);
                if (proxy.hostedBy(this)) {
                    return proxy;
                }
                if (!firstProxy) {
                    firstProxy = proxy;
                }
            }
        }
        // If no hosted proxy found, still need to return a proxy.
        // This case always happens in toolbox dataZoom, where axes are all hosted by
        // other dataZooms.
        return firstProxy;
    }
    getRangePropMode() {
        return this._rangePropMode.slice();
    }
    getOrient() {
        if (__DEV__) {
            // Should not be called before initialized.
            assert(this._orient);
        }
        return this._orient;
    }
}
DataZoomModel.type = 'dataZoom';
DataZoomModel.dependencies = [
    'xAxis', 'yAxis', 'radiusAxis', 'angleAxis', 'singleAxis', 'series', 'toolbox'
];
DataZoomModel.defaultOption = {
    zlevel: 0,
    z: 4,
    filterMode: 'filter',
    start: 0,
    end: 100
};
/**
 * Retrieve the those raw params from option, which will be cached separately.
 * becasue they will be overwritten by normalized/calculated values in the main
 * process.
 */
function retrieveRawOption(option) {
    const ret = {};
    each(['start', 'end', 'startValue', 'endValue', 'throttle'], function (name) {
        option.hasOwnProperty(name) && (ret[name] = option[name]);
    });
    return ret;
}
export default DataZoomModel;
