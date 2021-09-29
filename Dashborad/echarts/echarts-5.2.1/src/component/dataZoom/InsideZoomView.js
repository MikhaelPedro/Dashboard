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
import DataZoomView from './DataZoomView';
import sliderMove from '../helper/sliderMove';
import * as roams from './roams';
import { bind } from 'zrender/src/core/util';
class InsideZoomView extends DataZoomView {
    constructor() {
        super(...arguments);
        this.type = 'dataZoom.inside';
    }
    render(dataZoomModel, ecModel, api) {
        super.render.apply(this, arguments);
        if (dataZoomModel.noTarget()) {
            this._clear();
            return;
        }
        // Hence the `throttle` util ensures to preserve command order,
        // here simply updating range all the time will not cause missing
        // any of the the roam change.
        this.range = dataZoomModel.getPercentRange();
        // Reset controllers.
        roams.setViewInfoToCoordSysRecord(api, dataZoomModel, {
            pan: bind(getRangeHandlers.pan, this),
            zoom: bind(getRangeHandlers.zoom, this),
            scrollMove: bind(getRangeHandlers.scrollMove, this)
        });
    }
    dispose() {
        this._clear();
        super.dispose.apply(this, arguments);
    }
    _clear() {
        roams.disposeCoordSysRecordIfNeeded(this.api, this.dataZoomModel);
        this.range = null;
    }
}
InsideZoomView.type = 'dataZoom.inside';
const getRangeHandlers = {
    zoom(coordSysInfo, coordSysMainType, controller, e) {
        const lastRange = this.range;
        const range = lastRange.slice();
        // Calculate transform by the first axis.
        const axisModel = coordSysInfo.axisModels[0];
        if (!axisModel) {
            return;
        }
        const directionInfo = getDirectionInfo[coordSysMainType](null, [e.originX, e.originY], axisModel, controller, coordSysInfo);
        const percentPoint = (directionInfo.signal > 0
            ? (directionInfo.pixelStart + directionInfo.pixelLength - directionInfo.pixel)
            : (directionInfo.pixel - directionInfo.pixelStart)) / directionInfo.pixelLength * (range[1] - range[0]) + range[0];
        const scale = Math.max(1 / e.scale, 0);
        range[0] = (range[0] - percentPoint) * scale + percentPoint;
        range[1] = (range[1] - percentPoint) * scale + percentPoint;
        // Restrict range.
        const minMaxSpan = this.dataZoomModel.findRepresentativeAxisProxy().getMinMaxSpan();
        sliderMove(0, range, [0, 100], 0, minMaxSpan.minSpan, minMaxSpan.maxSpan);
        this.range = range;
        if (lastRange[0] !== range[0] || lastRange[1] !== range[1]) {
            return range;
        }
    },
    pan: makeMover(function (range, axisModel, coordSysInfo, coordSysMainType, controller, e) {
        const directionInfo = getDirectionInfo[coordSysMainType]([e.oldX, e.oldY], [e.newX, e.newY], axisModel, controller, coordSysInfo);
        return directionInfo.signal
            * (range[1] - range[0])
            * directionInfo.pixel / directionInfo.pixelLength;
    }),
    scrollMove: makeMover(function (range, axisModel, coordSysInfo, coordSysMainType, controller, e) {
        const directionInfo = getDirectionInfo[coordSysMainType]([0, 0], [e.scrollDelta, e.scrollDelta], axisModel, controller, coordSysInfo);
        return directionInfo.signal * (range[1] - range[0]) * e.scrollDelta;
    })
};
function makeMover(getPercentDelta) {
    return function (coordSysInfo, coordSysMainType, controller, e) {
        const lastRange = this.range;
        const range = lastRange.slice();
        // Calculate transform by the first axis.
        const axisModel = coordSysInfo.axisModels[0];
        if (!axisModel) {
            return;
        }
        const percentDelta = getPercentDelta(range, axisModel, coordSysInfo, coordSysMainType, controller, e);
        sliderMove(percentDelta, range, [0, 100], 'all');
        this.range = range;
        if (lastRange[0] !== range[0] || lastRange[1] !== range[1]) {
            return range;
        }
    };
}
const getDirectionInfo = {
    grid(oldPoint, newPoint, axisModel, controller, coordSysInfo) {
        const axis = axisModel.axis;
        const ret = {};
        const rect = coordSysInfo.model.coordinateSystem.getRect();
        oldPoint = oldPoint || [0, 0];
        if (axis.dim === 'x') {
            ret.pixel = newPoint[0] - oldPoint[0];
            ret.pixelLength = rect.width;
            ret.pixelStart = rect.x;
            ret.signal = axis.inverse ? 1 : -1;
        }
        else { // axis.dim === 'y'
            ret.pixel = newPoint[1] - oldPoint[1];
            ret.pixelLength = rect.height;
            ret.pixelStart = rect.y;
            ret.signal = axis.inverse ? -1 : 1;
        }
        return ret;
    },
    polar(oldPoint, newPoint, axisModel, controller, coordSysInfo) {
        const axis = axisModel.axis;
        const ret = {};
        const polar = coordSysInfo.model.coordinateSystem;
        const radiusExtent = polar.getRadiusAxis().getExtent();
        const angleExtent = polar.getAngleAxis().getExtent();
        oldPoint = oldPoint ? polar.pointToCoord(oldPoint) : [0, 0];
        newPoint = polar.pointToCoord(newPoint);
        if (axisModel.mainType === 'radiusAxis') {
            ret.pixel = newPoint[0] - oldPoint[0];
            // ret.pixelLength = Math.abs(radiusExtent[1] - radiusExtent[0]);
            // ret.pixelStart = Math.min(radiusExtent[0], radiusExtent[1]);
            ret.pixelLength = radiusExtent[1] - radiusExtent[0];
            ret.pixelStart = radiusExtent[0];
            ret.signal = axis.inverse ? 1 : -1;
        }
        else { // 'angleAxis'
            ret.pixel = newPoint[1] - oldPoint[1];
            // ret.pixelLength = Math.abs(angleExtent[1] - angleExtent[0]);
            // ret.pixelStart = Math.min(angleExtent[0], angleExtent[1]);
            ret.pixelLength = angleExtent[1] - angleExtent[0];
            ret.pixelStart = angleExtent[0];
            ret.signal = axis.inverse ? -1 : 1;
        }
        return ret;
    },
    singleAxis(oldPoint, newPoint, axisModel, controller, coordSysInfo) {
        const axis = axisModel.axis;
        const rect = coordSysInfo.model.coordinateSystem.getRect();
        const ret = {};
        oldPoint = oldPoint || [0, 0];
        if (axis.orient === 'horizontal') {
            ret.pixel = newPoint[0] - oldPoint[0];
            ret.pixelLength = rect.width;
            ret.pixelStart = rect.x;
            ret.signal = axis.inverse ? 1 : -1;
        }
        else { // 'vertical'
            ret.pixel = newPoint[1] - oldPoint[1];
            ret.pixelLength = rect.height;
            ret.pixelStart = rect.y;
            ret.signal = axis.inverse ? -1 : 1;
        }
        return ret;
    }
};
export default InsideZoomView;
