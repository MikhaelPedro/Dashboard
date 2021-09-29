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
import LineDraw from '../helper/LineDraw';
import EffectLine from '../helper/EffectLine';
import Line from '../helper/Line';
import Polyline from '../helper/Polyline';
import EffectPolyline from '../helper/EffectPolyline';
import LargeLineDraw from '../helper/LargeLineDraw';
import linesLayout from './linesLayout';
import { createClipPath } from '../helper/createClipPathFromCoordSys';
import ChartView from '../../view/Chart';
class LinesView extends ChartView {
    constructor() {
        super(...arguments);
        this.type = LinesView.type;
    }
    render(seriesModel, ecModel, api) {
        const data = seriesModel.getData();
        const lineDraw = this._updateLineDraw(data, seriesModel);
        const zlevel = seriesModel.get('zlevel');
        const trailLength = seriesModel.get(['effect', 'trailLength']);
        const zr = api.getZr();
        // Avoid the drag cause ghost shadow
        // FIXME Better way ?
        // SVG doesn't support
        const isSvg = zr.painter.getType() === 'svg';
        if (!isSvg) {
            zr.painter.getLayer(zlevel).clear(true);
        }
        // Config layer with motion blur
        if (this._lastZlevel != null && !isSvg) {
            zr.configLayer(this._lastZlevel, {
                motionBlur: false
            });
        }
        if (this._showEffect(seriesModel) && trailLength) {
            if (__DEV__) {
                let notInIndividual = false;
                ecModel.eachSeries(function (otherSeriesModel) {
                    if (otherSeriesModel !== seriesModel && otherSeriesModel.get('zlevel') === zlevel) {
                        notInIndividual = true;
                    }
                });
                notInIndividual && console.warn('Lines with trail effect should have an individual zlevel');
            }
            if (!isSvg) {
                zr.configLayer(zlevel, {
                    motionBlur: true,
                    lastFrameAlpha: Math.max(Math.min(trailLength / 10 + 0.9, 1), 0)
                });
            }
        }
        lineDraw.updateData(data);
        const clipPath = seriesModel.get('clip', true) && createClipPath(seriesModel.coordinateSystem, false, seriesModel);
        if (clipPath) {
            this.group.setClipPath(clipPath);
        }
        else {
            this.group.removeClipPath();
        }
        this._lastZlevel = zlevel;
        this._finished = true;
    }
    incrementalPrepareRender(seriesModel, ecModel, api) {
        const data = seriesModel.getData();
        const lineDraw = this._updateLineDraw(data, seriesModel);
        lineDraw.incrementalPrepareUpdate(data);
        this._clearLayer(api);
        this._finished = false;
    }
    incrementalRender(taskParams, seriesModel, ecModel) {
        this._lineDraw.incrementalUpdate(taskParams, seriesModel.getData());
        this._finished = taskParams.end === seriesModel.getData().count();
    }
    updateTransform(seriesModel, ecModel, api) {
        const data = seriesModel.getData();
        const pipelineContext = seriesModel.pipelineContext;
        if (!this._finished || pipelineContext.large || pipelineContext.progressiveRender) {
            // TODO Don't have to do update in large mode. Only do it when there are millions of data.
            return {
                update: true
            };
        }
        else {
            // TODO Use same logic with ScatterView.
            // Manually update layout
            const res = linesLayout.reset(seriesModel, ecModel, api);
            if (res.progress) {
                res.progress({
                    start: 0,
                    end: data.count(),
                    count: data.count()
                }, data);
            }
            // Not in large mode
            this._lineDraw.updateLayout();
            this._clearLayer(api);
        }
    }
    _updateLineDraw(data, seriesModel) {
        let lineDraw = this._lineDraw;
        const hasEffect = this._showEffect(seriesModel);
        const isPolyline = !!seriesModel.get('polyline');
        const pipelineContext = seriesModel.pipelineContext;
        const isLargeDraw = pipelineContext.large;
        if (__DEV__) {
            if (hasEffect && isLargeDraw) {
                console.warn('Large lines not support effect');
            }
        }
        if (!lineDraw
            || hasEffect !== this._hasEffet
            || isPolyline !== this._isPolyline
            || isLargeDraw !== this._isLargeDraw) {
            if (lineDraw) {
                lineDraw.remove();
            }
            lineDraw = this._lineDraw = isLargeDraw
                ? new LargeLineDraw()
                : new LineDraw(isPolyline
                    ? (hasEffect ? EffectPolyline : Polyline)
                    : (hasEffect ? EffectLine : Line));
            this._hasEffet = hasEffect;
            this._isPolyline = isPolyline;
            this._isLargeDraw = isLargeDraw;
        }
        this.group.add(lineDraw.group);
        return lineDraw;
    }
    _showEffect(seriesModel) {
        return !!seriesModel.get(['effect', 'show']);
    }
    _clearLayer(api) {
        // Not use motion when dragging or zooming
        const zr = api.getZr();
        const isSvg = zr.painter.getType() === 'svg';
        if (!isSvg && this._lastZlevel != null) {
            zr.painter.getLayer(this._lastZlevel).clear(true);
        }
    }
    remove(ecModel, api) {
        this._lineDraw && this._lineDraw.remove();
        this._lineDraw = null;
        // Clear motion when lineDraw is removed
        this._clearLayer(api);
    }
    dispose(ecModel, api) {
        this.remove(ecModel, api);
    }
}
LinesView.type = 'lines';
export default LinesView;
