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
import BoundingRect from 'zrender/src/core/BoundingRect';
import * as visualSolution from '../../visual/visualSolution';
import { makeBrushCommonSelectorForSeries } from './selector';
import * as throttleUtil from '../../util/throttle';
import BrushTargetManager from '../helper/BrushTargetManager';
const STATE_LIST = ['inBrush', 'outOfBrush'];
const DISPATCH_METHOD = '__ecBrushSelect';
const DISPATCH_FLAG = '__ecInBrushSelectEvent';
;
export function layoutCovers(ecModel) {
    ecModel.eachComponent({ mainType: 'brush' }, function (brushModel) {
        const brushTargetManager = brushModel.brushTargetManager = new BrushTargetManager(brushModel.option, ecModel);
        brushTargetManager.setInputRanges(brushModel.areas, ecModel);
    });
}
/**
 * Register the visual encoding if this modules required.
 */
export default function brushVisual(ecModel, api, payload) {
    const brushSelected = [];
    let throttleType;
    let throttleDelay;
    ecModel.eachComponent({ mainType: 'brush' }, function (brushModel) {
        payload && payload.type === 'takeGlobalCursor' && brushModel.setBrushOption(payload.key === 'brush' ? payload.brushOption : { brushType: false });
    });
    layoutCovers(ecModel);
    ecModel.eachComponent({ mainType: 'brush' }, function (brushModel, brushIndex) {
        const thisBrushSelected = {
            brushId: brushModel.id,
            brushIndex: brushIndex,
            brushName: brushModel.name,
            areas: zrUtil.clone(brushModel.areas),
            selected: []
        };
        // Every brush component exists in event params, convenient
        // for user to find by index.
        brushSelected.push(thisBrushSelected);
        const brushOption = brushModel.option;
        const brushLink = brushOption.brushLink;
        const linkedSeriesMap = [];
        const selectedDataIndexForLink = [];
        const rangeInfoBySeries = [];
        let hasBrushExists = false;
        if (!brushIndex) { // Only the first throttle setting works.
            throttleType = brushOption.throttleType;
            throttleDelay = brushOption.throttleDelay;
        }
        // Add boundingRect and selectors to range.
        const areas = zrUtil.map(brushModel.areas, function (area) {
            const builder = boundingRectBuilders[area.brushType];
            const selectableArea = zrUtil.defaults({ boundingRect: builder ? builder(area) : void 0 }, area);
            selectableArea.selectors = makeBrushCommonSelectorForSeries(selectableArea);
            return selectableArea;
        });
        const visualMappings = visualSolution.createVisualMappings(brushModel.option, STATE_LIST, function (mappingOption) {
            mappingOption.mappingMethod = 'fixed';
        });
        zrUtil.isArray(brushLink) && zrUtil.each(brushLink, function (seriesIndex) {
            linkedSeriesMap[seriesIndex] = 1;
        });
        function linkOthers(seriesIndex) {
            return brushLink === 'all' || !!linkedSeriesMap[seriesIndex];
        }
        // If no supported brush or no brush on the series,
        // all visuals should be in original state.
        function brushed(rangeInfoList) {
            return !!rangeInfoList.length;
        }
        /**
         * Logic for each series: (If the logic has to be modified one day, do it carefully!)
         *
         * ( brushed ┬ && ┬hasBrushExist ┬ && linkOthers  ) => StepA: ┬record, ┬ StepB: ┬visualByRecord.
         *   !brushed┘    ├hasBrushExist ┤                            └nothing,┘        ├visualByRecord.
         *                └!hasBrushExist┘                                              └nothing.
         * ( !brushed  && ┬hasBrushExist ┬ && linkOthers  ) => StepA:  nothing,  StepB: ┬visualByRecord.
         *                └!hasBrushExist┘                                              └nothing.
         * ( brushed ┬ &&                     !linkOthers ) => StepA:  nothing,  StepB: ┬visualByCheck.
         *   !brushed┘                                                                  └nothing.
         * ( !brushed  &&                     !linkOthers ) => StepA:  nothing,  StepB:  nothing.
         */
        // Step A
        ecModel.eachSeries(function (seriesModel, seriesIndex) {
            const rangeInfoList = rangeInfoBySeries[seriesIndex] = [];
            seriesModel.subType === 'parallel'
                ? stepAParallel(seriesModel, seriesIndex)
                : stepAOthers(seriesModel, seriesIndex, rangeInfoList);
        });
        function stepAParallel(seriesModel, seriesIndex) {
            const coordSys = seriesModel.coordinateSystem;
            hasBrushExists = hasBrushExists || coordSys.hasAxisBrushed();
            linkOthers(seriesIndex) && coordSys.eachActiveState(seriesModel.getData(), function (activeState, dataIndex) {
                activeState === 'active' && (selectedDataIndexForLink[dataIndex] = 1);
            });
        }
        function stepAOthers(seriesModel, seriesIndex, rangeInfoList) {
            if (!seriesModel.brushSelector || brushModelNotControll(brushModel, seriesIndex)) {
                return;
            }
            zrUtil.each(areas, function (area) {
                if (brushModel.brushTargetManager.controlSeries(area, seriesModel, ecModel)) {
                    rangeInfoList.push(area);
                }
                hasBrushExists = hasBrushExists || brushed(rangeInfoList);
            });
            if (linkOthers(seriesIndex) && brushed(rangeInfoList)) {
                const data = seriesModel.getData();
                data.each(function (dataIndex) {
                    if (checkInRange(seriesModel, rangeInfoList, data, dataIndex)) {
                        selectedDataIndexForLink[dataIndex] = 1;
                    }
                });
            }
        }
        // Step B
        ecModel.eachSeries(function (seriesModel, seriesIndex) {
            const seriesBrushSelected = {
                seriesId: seriesModel.id,
                seriesIndex: seriesIndex,
                seriesName: seriesModel.name,
                dataIndex: []
            };
            // Every series exists in event params, convenient
            // for user to find series by seriesIndex.
            thisBrushSelected.selected.push(seriesBrushSelected);
            const rangeInfoList = rangeInfoBySeries[seriesIndex];
            const data = seriesModel.getData();
            const getValueState = linkOthers(seriesIndex)
                ? function (dataIndex) {
                    return selectedDataIndexForLink[dataIndex]
                        ? (seriesBrushSelected.dataIndex.push(data.getRawIndex(dataIndex)), 'inBrush')
                        : 'outOfBrush';
                }
                : function (dataIndex) {
                    return checkInRange(seriesModel, rangeInfoList, data, dataIndex)
                        ? (seriesBrushSelected.dataIndex.push(data.getRawIndex(dataIndex)), 'inBrush')
                        : 'outOfBrush';
                };
            // If no supported brush or no brush, all visuals are in original state.
            (linkOthers(seriesIndex) ? hasBrushExists : brushed(rangeInfoList))
                && visualSolution.applyVisual(STATE_LIST, visualMappings, data, getValueState);
        });
    });
    dispatchAction(api, throttleType, throttleDelay, brushSelected, payload);
}
;
function dispatchAction(api, throttleType, throttleDelay, brushSelected, payload) {
    // This event will not be triggered when `setOpion`, otherwise dead lock may
    // triggered when do `setOption` in event listener, which we do not find
    // satisfactory way to solve yet. Some considered resolutions:
    // (a) Diff with prevoius selected data ant only trigger event when changed.
    // But store previous data and diff precisely (i.e., not only by dataIndex, but
    // also detect value changes in selected data) might bring complexity or fragility.
    // (b) Use spectial param like `silent` to suppress event triggering.
    // But such kind of volatile param may be weird in `setOption`.
    if (!payload) {
        return;
    }
    const zr = api.getZr();
    if (zr[DISPATCH_FLAG]) {
        return;
    }
    if (!zr[DISPATCH_METHOD]) {
        zr[DISPATCH_METHOD] = doDispatch;
    }
    const fn = throttleUtil.createOrUpdate(zr, DISPATCH_METHOD, throttleDelay, throttleType);
    fn(api, brushSelected);
}
function doDispatch(api, brushSelected) {
    if (!api.isDisposed()) {
        const zr = api.getZr();
        zr[DISPATCH_FLAG] = true;
        api.dispatchAction({
            type: 'brushSelect',
            batch: brushSelected
        });
        zr[DISPATCH_FLAG] = false;
    }
}
function checkInRange(seriesModel, rangeInfoList, data, dataIndex) {
    for (let i = 0, len = rangeInfoList.length; i < len; i++) {
        const area = rangeInfoList[i];
        if (seriesModel.brushSelector(dataIndex, data, area.selectors, area)) {
            return true;
        }
    }
}
function brushModelNotControll(brushModel, seriesIndex) {
    const seriesIndices = brushModel.option.seriesIndex;
    return seriesIndices != null
        && seriesIndices !== 'all'
        && (zrUtil.isArray(seriesIndices)
            ? zrUtil.indexOf(seriesIndices, seriesIndex) < 0
            : seriesIndex !== seriesIndices);
}
const boundingRectBuilders = {
    rect: function (area) {
        return getBoundingRectFromMinMax(area.range);
    },
    polygon: function (area) {
        let minMax;
        const range = area.range;
        for (let i = 0, len = range.length; i < len; i++) {
            minMax = minMax || [[Infinity, -Infinity], [Infinity, -Infinity]];
            const rg = range[i];
            rg[0] < minMax[0][0] && (minMax[0][0] = rg[0]);
            rg[0] > minMax[0][1] && (minMax[0][1] = rg[0]);
            rg[1] < minMax[1][0] && (minMax[1][0] = rg[1]);
            rg[1] > minMax[1][1] && (minMax[1][1] = rg[1]);
        }
        return minMax && getBoundingRectFromMinMax(minMax);
    }
};
function getBoundingRectFromMinMax(minMax) {
    return new BoundingRect(minMax[0][0], minMax[1][0], minMax[0][1] - minMax[0][0], minMax[1][1] - minMax[1][0]);
}
