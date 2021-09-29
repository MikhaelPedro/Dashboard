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
import LineGroup from './Line';
import { getLabelStatesModels } from '../../label/labelStyle';
class LineDraw {
    constructor(LineCtor) {
        this.group = new graphic.Group();
        this._LineCtor = LineCtor || LineGroup;
    }
    isPersistent() {
        return true;
    }
    ;
    updateData(lineData) {
        const lineDraw = this;
        const group = lineDraw.group;
        const oldLineData = lineDraw._lineData;
        lineDraw._lineData = lineData;
        // There is no oldLineData only when first rendering or switching from
        // stream mode to normal mode, where previous elements should be removed.
        if (!oldLineData) {
            group.removeAll();
        }
        const seriesScope = makeSeriesScope(lineData);
        lineData.diff(oldLineData)
            .add((idx) => {
            this._doAdd(lineData, idx, seriesScope);
        })
            .update((newIdx, oldIdx) => {
            this._doUpdate(oldLineData, lineData, oldIdx, newIdx, seriesScope);
        })
            .remove((idx) => {
            group.remove(oldLineData.getItemGraphicEl(idx));
        })
            .execute();
    }
    ;
    updateLayout() {
        const lineData = this._lineData;
        // Do not support update layout in incremental mode.
        if (!lineData) {
            return;
        }
        lineData.eachItemGraphicEl(function (el, idx) {
            el.updateLayout(lineData, idx);
        }, this);
    }
    ;
    incrementalPrepareUpdate(lineData) {
        this._seriesScope = makeSeriesScope(lineData);
        this._lineData = null;
        this.group.removeAll();
    }
    ;
    incrementalUpdate(taskParams, lineData) {
        function updateIncrementalAndHover(el) {
            if (!el.isGroup && !isEffectObject(el)) {
                el.incremental = true;
                el.ensureState('emphasis').hoverLayer = true;
            }
        }
        for (let idx = taskParams.start; idx < taskParams.end; idx++) {
            const itemLayout = lineData.getItemLayout(idx);
            if (lineNeedsDraw(itemLayout)) {
                const el = new this._LineCtor(lineData, idx, this._seriesScope);
                el.traverse(updateIncrementalAndHover);
                this.group.add(el);
                lineData.setItemGraphicEl(idx, el);
            }
        }
    }
    ;
    remove() {
        this.group.removeAll();
    }
    ;
    _doAdd(lineData, idx, seriesScope) {
        const itemLayout = lineData.getItemLayout(idx);
        if (!lineNeedsDraw(itemLayout)) {
            return;
        }
        const el = new this._LineCtor(lineData, idx, seriesScope);
        lineData.setItemGraphicEl(idx, el);
        this.group.add(el);
    }
    _doUpdate(oldLineData, newLineData, oldIdx, newIdx, seriesScope) {
        let itemEl = oldLineData.getItemGraphicEl(oldIdx);
        if (!lineNeedsDraw(newLineData.getItemLayout(newIdx))) {
            this.group.remove(itemEl);
            return;
        }
        if (!itemEl) {
            itemEl = new this._LineCtor(newLineData, newIdx, seriesScope);
        }
        else {
            itemEl.updateData(newLineData, newIdx, seriesScope);
        }
        newLineData.setItemGraphicEl(newIdx, itemEl);
        this.group.add(itemEl);
    }
}
function isEffectObject(el) {
    return el.animators && el.animators.length > 0;
}
function makeSeriesScope(lineData) {
    const hostModel = lineData.hostModel;
    return {
        lineStyle: hostModel.getModel('lineStyle').getLineStyle(),
        emphasisLineStyle: hostModel.getModel(['emphasis', 'lineStyle']).getLineStyle(),
        blurLineStyle: hostModel.getModel(['blur', 'lineStyle']).getLineStyle(),
        selectLineStyle: hostModel.getModel(['select', 'lineStyle']).getLineStyle(),
        labelStatesModels: getLabelStatesModels(hostModel)
    };
}
function isPointNaN(pt) {
    return isNaN(pt[0]) || isNaN(pt[1]);
}
function lineNeedsDraw(pts) {
    return !isPointNaN(pts[0]) && !isPointNaN(pts[1]);
}
export default LineDraw;
