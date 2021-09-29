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
import * as graphic from '../../util/graphic';
import { setStatesStylesFromModel, enableHoverEmphasis } from '../../util/states';
import ChartView from '../../view/Chart';
import { numericToNumber } from '../../util/number';
import { eqNaN } from 'zrender/src/core/util';
import { saveOldStyle } from '../../animation/basicTrasition';
const DEFAULT_SMOOTH = 0.3;
class ParallelView extends ChartView {
    constructor() {
        super(...arguments);
        this.type = ParallelView.type;
        this._dataGroup = new graphic.Group();
        this._initialized = false;
    }
    init() {
        this.group.add(this._dataGroup);
    }
    /**
     * @override
     */
    render(seriesModel, ecModel, api, payload) {
        const dataGroup = this._dataGroup;
        const data = seriesModel.getData();
        const oldData = this._data;
        const coordSys = seriesModel.coordinateSystem;
        const dimensions = coordSys.dimensions;
        const seriesScope = makeSeriesScope(seriesModel);
        data.diff(oldData)
            .add(add)
            .update(update)
            .remove(remove)
            .execute();
        function add(newDataIndex) {
            const line = addEl(data, dataGroup, newDataIndex, dimensions, coordSys);
            updateElCommon(line, data, newDataIndex, seriesScope);
        }
        function update(newDataIndex, oldDataIndex) {
            const line = oldData.getItemGraphicEl(oldDataIndex);
            const points = createLinePoints(data, newDataIndex, dimensions, coordSys);
            data.setItemGraphicEl(newDataIndex, line);
            graphic.updateProps(line, { shape: { points: points } }, seriesModel, newDataIndex);
            saveOldStyle(line);
            updateElCommon(line, data, newDataIndex, seriesScope);
        }
        function remove(oldDataIndex) {
            const line = oldData.getItemGraphicEl(oldDataIndex);
            dataGroup.remove(line);
        }
        // First create
        if (!this._initialized) {
            this._initialized = true;
            const clipPath = createGridClipShape(coordSys, seriesModel, function () {
                // Callback will be invoked immediately if there is no animation
                setTimeout(function () {
                    dataGroup.removeClipPath();
                });
            });
            dataGroup.setClipPath(clipPath);
        }
        this._data = data;
    }
    incrementalPrepareRender(seriesModel, ecModel, api) {
        this._initialized = true;
        this._data = null;
        this._dataGroup.removeAll();
    }
    incrementalRender(taskParams, seriesModel, ecModel) {
        const data = seriesModel.getData();
        const coordSys = seriesModel.coordinateSystem;
        const dimensions = coordSys.dimensions;
        const seriesScope = makeSeriesScope(seriesModel);
        for (let dataIndex = taskParams.start; dataIndex < taskParams.end; dataIndex++) {
            const line = addEl(data, this._dataGroup, dataIndex, dimensions, coordSys);
            line.incremental = true;
            updateElCommon(line, data, dataIndex, seriesScope);
        }
    }
    remove() {
        this._dataGroup && this._dataGroup.removeAll();
        this._data = null;
    }
}
ParallelView.type = 'parallel';
function createGridClipShape(coordSys, seriesModel, cb) {
    const parallelModel = coordSys.model;
    const rect = coordSys.getRect();
    const rectEl = new graphic.Rect({
        shape: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
        }
    });
    const dim = parallelModel.get('layout') === 'horizontal' ? 'width' : 'height';
    rectEl.setShape(dim, 0);
    graphic.initProps(rectEl, {
        shape: {
            width: rect.width,
            height: rect.height
        }
    }, seriesModel, cb);
    return rectEl;
}
function createLinePoints(data, dataIndex, dimensions, coordSys) {
    const points = [];
    for (let i = 0; i < dimensions.length; i++) {
        const dimName = dimensions[i];
        const value = data.get(data.mapDimension(dimName), dataIndex);
        if (!isEmptyValue(value, coordSys.getAxis(dimName).type)) {
            points.push(coordSys.dataToPoint(value, dimName));
        }
    }
    return points;
}
function addEl(data, dataGroup, dataIndex, dimensions, coordSys) {
    const points = createLinePoints(data, dataIndex, dimensions, coordSys);
    const line = new graphic.Polyline({
        shape: { points: points },
        // silent: true,
        z2: 10
    });
    dataGroup.add(line);
    data.setItemGraphicEl(dataIndex, line);
    return line;
}
function makeSeriesScope(seriesModel) {
    let smooth = seriesModel.get('smooth', true);
    smooth === true && (smooth = DEFAULT_SMOOTH);
    smooth = numericToNumber(smooth);
    eqNaN(smooth) && (smooth = 0);
    return { smooth };
}
function updateElCommon(el, data, dataIndex, seriesScope) {
    el.useStyle(data.getItemVisual(dataIndex, 'style'));
    el.style.fill = null;
    el.setShape('smooth', seriesScope.smooth);
    const itemModel = data.getItemModel(dataIndex);
    const emphasisModel = itemModel.getModel('emphasis');
    setStatesStylesFromModel(el, itemModel, 'lineStyle');
    enableHoverEmphasis(el, emphasisModel.get('focus'), emphasisModel.get('blurScope'));
}
// function simpleDiff(oldData, newData, dimensions) {
//     let oldLen;
//     if (!oldData
//         || !oldData.__plProgressive
//         || (oldLen = oldData.count()) !== newData.count()
//     ) {
//         return true;
//     }
//     let dimLen = dimensions.length;
//     for (let i = 0; i < oldLen; i++) {
//         for (let j = 0; j < dimLen; j++) {
//             if (oldData.get(dimensions[j], i) !== newData.get(dimensions[j], i)) {
//                 return true;
//             }
//         }
//     }
//     return false;
// }
// FIXME put in common util?
function isEmptyValue(val, axisType) {
    return axisType === 'category'
        ? val == null
        : (val == null || isNaN(val)); // axisType === 'value'
}
export default ParallelView;
