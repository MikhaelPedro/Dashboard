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
import SymbolClz from './Symbol';
import { isObject } from 'zrender/src/core/util';
import { getLabelStatesModels } from '../../label/labelStyle';
function symbolNeedsDraw(data, point, idx, opt) {
    return point && !isNaN(point[0]) && !isNaN(point[1])
        && !(opt.isIgnore && opt.isIgnore(idx))
        // We do not set clipShape on group, because it will cut part of
        // the symbol element shape. We use the same clip shape here as
        // the line clip.
        && !(opt.clipShape && !opt.clipShape.contain(point[0], point[1]))
        && data.getItemVisual(idx, 'symbol') !== 'none';
}
function normalizeUpdateOpt(opt) {
    if (opt != null && !isObject(opt)) {
        opt = { isIgnore: opt };
    }
    return opt || {};
}
function makeSeriesScope(data) {
    const seriesModel = data.hostModel;
    const emphasisModel = seriesModel.getModel('emphasis');
    return {
        emphasisItemStyle: emphasisModel.getModel('itemStyle').getItemStyle(),
        blurItemStyle: seriesModel.getModel(['blur', 'itemStyle']).getItemStyle(),
        selectItemStyle: seriesModel.getModel(['select', 'itemStyle']).getItemStyle(),
        focus: emphasisModel.get('focus'),
        blurScope: emphasisModel.get('blurScope'),
        hoverScale: emphasisModel.get('scale'),
        labelStatesModels: getLabelStatesModels(seriesModel),
        cursorStyle: seriesModel.get('cursor')
    };
}
class SymbolDraw {
    constructor(SymbolCtor) {
        this.group = new graphic.Group();
        this._SymbolCtor = SymbolCtor || SymbolClz;
    }
    /**
     * Update symbols draw by new data
     */
    updateData(data, opt) {
        opt = normalizeUpdateOpt(opt);
        const group = this.group;
        const seriesModel = data.hostModel;
        const oldData = this._data;
        const SymbolCtor = this._SymbolCtor;
        const disableAnimation = opt.disableAnimation;
        const seriesScope = makeSeriesScope(data);
        const symbolUpdateOpt = { disableAnimation };
        const getSymbolPoint = opt.getSymbolPoint || function (idx) {
            return data.getItemLayout(idx);
        };
        // There is no oldLineData only when first rendering or switching from
        // stream mode to normal mode, where previous elements should be removed.
        if (!oldData) {
            group.removeAll();
        }
        data.diff(oldData)
            .add(function (newIdx) {
            const point = getSymbolPoint(newIdx);
            if (symbolNeedsDraw(data, point, newIdx, opt)) {
                const symbolEl = new SymbolCtor(data, newIdx, seriesScope, symbolUpdateOpt);
                symbolEl.setPosition(point);
                data.setItemGraphicEl(newIdx, symbolEl);
                group.add(symbolEl);
            }
        })
            .update(function (newIdx, oldIdx) {
            let symbolEl = oldData.getItemGraphicEl(oldIdx);
            const point = getSymbolPoint(newIdx);
            if (!symbolNeedsDraw(data, point, newIdx, opt)) {
                group.remove(symbolEl);
                return;
            }
            const newSymbolType = data.getItemVisual(newIdx, 'symbol') || 'circle';
            const oldSymbolType = symbolEl
                && symbolEl.getSymbolType
                && symbolEl.getSymbolType();
            if (!symbolEl
                // Create a new if symbol type changed.
                || (oldSymbolType && oldSymbolType !== newSymbolType)) {
                group.remove(symbolEl);
                symbolEl = new SymbolCtor(data, newIdx, seriesScope, symbolUpdateOpt);
                symbolEl.setPosition(point);
            }
            else {
                symbolEl.updateData(data, newIdx, seriesScope, symbolUpdateOpt);
                const target = {
                    x: point[0],
                    y: point[1]
                };
                disableAnimation
                    ? symbolEl.attr(target)
                    : graphic.updateProps(symbolEl, target, seriesModel);
            }
            // Add back
            group.add(symbolEl);
            data.setItemGraphicEl(newIdx, symbolEl);
        })
            .remove(function (oldIdx) {
            const el = oldData.getItemGraphicEl(oldIdx);
            el && el.fadeOut(function () {
                group.remove(el);
            });
        })
            .execute();
        this._getSymbolPoint = getSymbolPoint;
        this._data = data;
    }
    ;
    isPersistent() {
        return true;
    }
    ;
    updateLayout() {
        const data = this._data;
        if (data) {
            // Not use animation
            data.eachItemGraphicEl((el, idx) => {
                const point = this._getSymbolPoint(idx);
                el.setPosition(point);
                el.markRedraw();
            });
        }
    }
    ;
    incrementalPrepareUpdate(data) {
        this._seriesScope = makeSeriesScope(data);
        this._data = null;
        this.group.removeAll();
    }
    ;
    /**
     * Update symbols draw by new data
     */
    incrementalUpdate(taskParams, data, opt) {
        opt = normalizeUpdateOpt(opt);
        function updateIncrementalAndHover(el) {
            if (!el.isGroup) {
                el.incremental = true;
                el.ensureState('emphasis').hoverLayer = true;
            }
        }
        for (let idx = taskParams.start; idx < taskParams.end; idx++) {
            const point = data.getItemLayout(idx);
            if (symbolNeedsDraw(data, point, idx, opt)) {
                const el = new this._SymbolCtor(data, idx, this._seriesScope);
                el.traverse(updateIncrementalAndHover);
                el.setPosition(point);
                this.group.add(el);
                data.setItemGraphicEl(idx, el);
            }
        }
    }
    ;
    remove(enableAnimation) {
        const group = this.group;
        const data = this._data;
        // Incremental model do not have this._data.
        if (data && enableAnimation) {
            data.eachItemGraphicEl(function (el) {
                el.fadeOut(function () {
                    group.remove(el);
                });
            });
        }
        else {
            group.removeAll();
        }
    }
    ;
}
export default SymbolDraw;
