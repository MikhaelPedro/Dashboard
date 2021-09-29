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
/**
 * Parallel Coordinates
 * <https://en.wikipedia.org/wiki/Parallel_coordinates>
 */
import * as zrUtil from 'zrender/src/core/util';
import * as matrix from 'zrender/src/core/matrix';
import * as layoutUtil from '../../util/layout';
import * as axisHelper from '../../coord/axisHelper';
import ParallelAxis from './ParallelAxis';
import * as graphic from '../../util/graphic';
import * as numberUtil from '../../util/number';
import sliderMove from '../../component/helper/sliderMove';
const each = zrUtil.each;
const mathMin = Math.min;
const mathMax = Math.max;
const mathFloor = Math.floor;
const mathCeil = Math.ceil;
const round = numberUtil.round;
const PI = Math.PI;
class Parallel {
    constructor(parallelModel, ecModel, api) {
        this.type = 'parallel';
        /**
         * key: dimension
         */
        this._axesMap = zrUtil.createHashMap();
        /**
         * key: dimension
         * value: {position: [], rotation, }
         */
        this._axesLayout = {};
        this.dimensions = parallelModel.dimensions;
        this._model = parallelModel;
        this._init(parallelModel, ecModel, api);
    }
    _init(parallelModel, ecModel, api) {
        const dimensions = parallelModel.dimensions;
        const parallelAxisIndex = parallelModel.parallelAxisIndex;
        each(dimensions, function (dim, idx) {
            const axisIndex = parallelAxisIndex[idx];
            const axisModel = ecModel.getComponent('parallelAxis', axisIndex);
            const axis = this._axesMap.set(dim, new ParallelAxis(dim, axisHelper.createScaleByModel(axisModel), [0, 0], axisModel.get('type'), axisIndex));
            const isCategory = axis.type === 'category';
            axis.onBand = isCategory
                && axisModel.get('boundaryGap');
            axis.inverse = axisModel.get('inverse');
            // Injection
            axisModel.axis = axis;
            axis.model = axisModel;
            axis.coordinateSystem = axisModel.coordinateSystem = this;
        }, this);
    }
    /**
     * Update axis scale after data processed
     */
    update(ecModel, api) {
        this._updateAxesFromSeries(this._model, ecModel);
    }
    containPoint(point) {
        const layoutInfo = this._makeLayoutInfo();
        const axisBase = layoutInfo.axisBase;
        const layoutBase = layoutInfo.layoutBase;
        const pixelDimIndex = layoutInfo.pixelDimIndex;
        const pAxis = point[1 - pixelDimIndex];
        const pLayout = point[pixelDimIndex];
        return pAxis >= axisBase
            && pAxis <= axisBase + layoutInfo.axisLength
            && pLayout >= layoutBase
            && pLayout <= layoutBase + layoutInfo.layoutLength;
    }
    getModel() {
        return this._model;
    }
    /**
     * Update properties from series
     */
    _updateAxesFromSeries(parallelModel, ecModel) {
        ecModel.eachSeries(function (seriesModel) {
            if (!parallelModel.contains(seriesModel, ecModel)) {
                return;
            }
            const data = seriesModel.getData();
            each(this.dimensions, function (dim) {
                const axis = this._axesMap.get(dim);
                axis.scale.unionExtentFromData(data, data.mapDimension(dim));
                axisHelper.niceScaleExtent(axis.scale, axis.model);
            }, this);
        }, this);
    }
    /**
     * Resize the parallel coordinate system.
     */
    resize(parallelModel, api) {
        this._rect = layoutUtil.getLayoutRect(parallelModel.getBoxLayoutParams(), {
            width: api.getWidth(),
            height: api.getHeight()
        });
        this._layoutAxes();
    }
    getRect() {
        return this._rect;
    }
    _makeLayoutInfo() {
        const parallelModel = this._model;
        const rect = this._rect;
        const xy = ['x', 'y'];
        const wh = ['width', 'height'];
        const layout = parallelModel.get('layout');
        const pixelDimIndex = layout === 'horizontal' ? 0 : 1;
        const layoutLength = rect[wh[pixelDimIndex]];
        const layoutExtent = [0, layoutLength];
        const axisCount = this.dimensions.length;
        const axisExpandWidth = restrict(parallelModel.get('axisExpandWidth'), layoutExtent);
        const axisExpandCount = restrict(parallelModel.get('axisExpandCount') || 0, [0, axisCount]);
        const axisExpandable = parallelModel.get('axisExpandable')
            && axisCount > 3
            && axisCount > axisExpandCount
            && axisExpandCount > 1
            && axisExpandWidth > 0
            && layoutLength > 0;
        // `axisExpandWindow` is According to the coordinates of [0, axisExpandLength],
        // for sake of consider the case that axisCollapseWidth is 0 (when screen is narrow),
        // where collapsed axes should be overlapped.
        let axisExpandWindow = parallelModel.get('axisExpandWindow');
        let winSize;
        if (!axisExpandWindow) {
            winSize = restrict(axisExpandWidth * (axisExpandCount - 1), layoutExtent);
            const axisExpandCenter = parallelModel.get('axisExpandCenter') || mathFloor(axisCount / 2);
            axisExpandWindow = [axisExpandWidth * axisExpandCenter - winSize / 2];
            axisExpandWindow[1] = axisExpandWindow[0] + winSize;
        }
        else {
            winSize = restrict(axisExpandWindow[1] - axisExpandWindow[0], layoutExtent);
            axisExpandWindow[1] = axisExpandWindow[0] + winSize;
        }
        let axisCollapseWidth = (layoutLength - winSize) / (axisCount - axisExpandCount);
        // Avoid axisCollapseWidth is too small.
        axisCollapseWidth < 3 && (axisCollapseWidth = 0);
        // Find the first and last indices > ewin[0] and < ewin[1].
        const winInnerIndices = [
            mathFloor(round(axisExpandWindow[0] / axisExpandWidth, 1)) + 1,
            mathCeil(round(axisExpandWindow[1] / axisExpandWidth, 1)) - 1
        ];
        // Pos in ec coordinates.
        const axisExpandWindow0Pos = axisCollapseWidth / axisExpandWidth * axisExpandWindow[0];
        return {
            layout: layout,
            pixelDimIndex: pixelDimIndex,
            layoutBase: rect[xy[pixelDimIndex]],
            layoutLength: layoutLength,
            axisBase: rect[xy[1 - pixelDimIndex]],
            axisLength: rect[wh[1 - pixelDimIndex]],
            axisExpandable: axisExpandable,
            axisExpandWidth: axisExpandWidth,
            axisCollapseWidth: axisCollapseWidth,
            axisExpandWindow: axisExpandWindow,
            axisCount: axisCount,
            winInnerIndices: winInnerIndices,
            axisExpandWindow0Pos: axisExpandWindow0Pos
        };
    }
    _layoutAxes() {
        const rect = this._rect;
        const axes = this._axesMap;
        const dimensions = this.dimensions;
        const layoutInfo = this._makeLayoutInfo();
        const layout = layoutInfo.layout;
        axes.each(function (axis) {
            const axisExtent = [0, layoutInfo.axisLength];
            const idx = axis.inverse ? 1 : 0;
            axis.setExtent(axisExtent[idx], axisExtent[1 - idx]);
        });
        each(dimensions, function (dim, idx) {
            const posInfo = (layoutInfo.axisExpandable
                ? layoutAxisWithExpand : layoutAxisWithoutExpand)(idx, layoutInfo);
            const positionTable = {
                horizontal: {
                    x: posInfo.position,
                    y: layoutInfo.axisLength
                },
                vertical: {
                    x: 0,
                    y: posInfo.position
                }
            };
            const rotationTable = {
                horizontal: PI / 2,
                vertical: 0
            };
            const position = [
                positionTable[layout].x + rect.x,
                positionTable[layout].y + rect.y
            ];
            const rotation = rotationTable[layout];
            const transform = matrix.create();
            matrix.rotate(transform, transform, rotation);
            matrix.translate(transform, transform, position);
            // TODO
            // tick layout info
            // TODO
            // update dimensions info based on axis order.
            this._axesLayout[dim] = {
                position: position,
                rotation: rotation,
                transform: transform,
                axisNameAvailableWidth: posInfo.axisNameAvailableWidth,
                axisLabelShow: posInfo.axisLabelShow,
                nameTruncateMaxWidth: posInfo.nameTruncateMaxWidth,
                tickDirection: 1,
                labelDirection: 1
            };
        }, this);
    }
    /**
     * Get axis by dim.
     */
    getAxis(dim) {
        return this._axesMap.get(dim);
    }
    /**
     * Convert a dim value of a single item of series data to Point.
     */
    dataToPoint(value, dim) {
        return this.axisCoordToPoint(this._axesMap.get(dim).dataToCoord(value), dim);
    }
    /**
     * Travel data for one time, get activeState of each data item.
     * @param start the start dataIndex that travel from.
     * @param end the next dataIndex of the last dataIndex will be travel.
     */
    eachActiveState(data, callback, start, end) {
        start == null && (start = 0);
        end == null && (end = data.count());
        const axesMap = this._axesMap;
        const dimensions = this.dimensions;
        const dataDimensions = [];
        const axisModels = [];
        zrUtil.each(dimensions, function (axisDim) {
            dataDimensions.push(data.mapDimension(axisDim));
            axisModels.push(axesMap.get(axisDim).model);
        });
        const hasActiveSet = this.hasAxisBrushed();
        for (let dataIndex = start; dataIndex < end; dataIndex++) {
            let activeState;
            if (!hasActiveSet) {
                activeState = 'normal';
            }
            else {
                activeState = 'active';
                const values = data.getValues(dataDimensions, dataIndex);
                for (let j = 0, lenj = dimensions.length; j < lenj; j++) {
                    const state = axisModels[j].getActiveState(values[j]);
                    if (state === 'inactive') {
                        activeState = 'inactive';
                        break;
                    }
                }
            }
            callback(activeState, dataIndex);
        }
    }
    /**
     * Whether has any activeSet.
     */
    hasAxisBrushed() {
        const dimensions = this.dimensions;
        const axesMap = this._axesMap;
        let hasActiveSet = false;
        for (let j = 0, lenj = dimensions.length; j < lenj; j++) {
            if (axesMap.get(dimensions[j]).model.getActiveState() !== 'normal') {
                hasActiveSet = true;
            }
        }
        return hasActiveSet;
    }
    /**
     * Convert coords of each axis to Point.
     *  Return point. For example: [10, 20]
     */
    axisCoordToPoint(coord, dim) {
        const axisLayout = this._axesLayout[dim];
        return graphic.applyTransform([coord, 0], axisLayout.transform);
    }
    /**
     * Get axis layout.
     */
    getAxisLayout(dim) {
        return zrUtil.clone(this._axesLayout[dim]);
    }
    /**
     * @return {Object} {axisExpandWindow, delta, behavior: 'jump' | 'slide' | 'none'}.
     */
    getSlidedAxisExpandWindow(point) {
        const layoutInfo = this._makeLayoutInfo();
        const pixelDimIndex = layoutInfo.pixelDimIndex;
        let axisExpandWindow = layoutInfo.axisExpandWindow.slice();
        const winSize = axisExpandWindow[1] - axisExpandWindow[0];
        const extent = [0, layoutInfo.axisExpandWidth * (layoutInfo.axisCount - 1)];
        // Out of the area of coordinate system.
        if (!this.containPoint(point)) {
            return { behavior: 'none', axisExpandWindow: axisExpandWindow };
        }
        // Conver the point from global to expand coordinates.
        const pointCoord = point[pixelDimIndex] - layoutInfo.layoutBase - layoutInfo.axisExpandWindow0Pos;
        // For dragging operation convenience, the window should not be
        // slided when mouse is the center area of the window.
        let delta;
        let behavior = 'slide';
        const axisCollapseWidth = layoutInfo.axisCollapseWidth;
        const triggerArea = this._model.get('axisExpandSlideTriggerArea');
        // But consider touch device, jump is necessary.
        const useJump = triggerArea[0] != null;
        if (axisCollapseWidth) {
            if (useJump && axisCollapseWidth && pointCoord < winSize * triggerArea[0]) {
                behavior = 'jump';
                delta = pointCoord - winSize * triggerArea[2];
            }
            else if (useJump && axisCollapseWidth && pointCoord > winSize * (1 - triggerArea[0])) {
                behavior = 'jump';
                delta = pointCoord - winSize * (1 - triggerArea[2]);
            }
            else {
                (delta = pointCoord - winSize * triggerArea[1]) >= 0
                    && (delta = pointCoord - winSize * (1 - triggerArea[1])) <= 0
                    && (delta = 0);
            }
            delta *= layoutInfo.axisExpandWidth / axisCollapseWidth;
            delta
                ? sliderMove(delta, axisExpandWindow, extent, 'all')
                // Avoid nonsense triger on mousemove.
                : (behavior = 'none');
        }
        // When screen is too narrow, make it visible and slidable, although it is hard to interact.
        else {
            const winSize2 = axisExpandWindow[1] - axisExpandWindow[0];
            const pos = extent[1] * pointCoord / winSize2;
            axisExpandWindow = [mathMax(0, pos - winSize2 / 2)];
            axisExpandWindow[1] = mathMin(extent[1], axisExpandWindow[0] + winSize2);
            axisExpandWindow[0] = axisExpandWindow[1] - winSize2;
        }
        return {
            axisExpandWindow: axisExpandWindow,
            behavior: behavior
        };
    }
}
function restrict(len, extent) {
    return mathMin(mathMax(len, extent[0]), extent[1]);
}
function layoutAxisWithoutExpand(axisIndex, layoutInfo) {
    const step = layoutInfo.layoutLength / (layoutInfo.axisCount - 1);
    return {
        position: step * axisIndex,
        axisNameAvailableWidth: step,
        axisLabelShow: true
    };
}
function layoutAxisWithExpand(axisIndex, layoutInfo) {
    const layoutLength = layoutInfo.layoutLength;
    const axisExpandWidth = layoutInfo.axisExpandWidth;
    const axisCount = layoutInfo.axisCount;
    const axisCollapseWidth = layoutInfo.axisCollapseWidth;
    const winInnerIndices = layoutInfo.winInnerIndices;
    let position;
    let axisNameAvailableWidth = axisCollapseWidth;
    let axisLabelShow = false;
    let nameTruncateMaxWidth;
    if (axisIndex < winInnerIndices[0]) {
        position = axisIndex * axisCollapseWidth;
        nameTruncateMaxWidth = axisCollapseWidth;
    }
    else if (axisIndex <= winInnerIndices[1]) {
        position = layoutInfo.axisExpandWindow0Pos
            + axisIndex * axisExpandWidth - layoutInfo.axisExpandWindow[0];
        axisNameAvailableWidth = axisExpandWidth;
        axisLabelShow = true;
    }
    else {
        position = layoutLength - (axisCount - 1 - axisIndex) * axisCollapseWidth;
        nameTruncateMaxWidth = axisCollapseWidth;
    }
    return {
        position: position,
        axisNameAvailableWidth: axisNameAvailableWidth,
        axisLabelShow: axisLabelShow,
        nameTruncateMaxWidth: nameTruncateMaxWidth
    };
}
export default Parallel;
