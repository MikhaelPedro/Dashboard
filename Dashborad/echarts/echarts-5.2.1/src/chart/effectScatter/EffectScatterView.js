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
import SymbolDraw from '../helper/SymbolDraw';
import EffectSymbol from '../helper/EffectSymbol';
import * as matrix from 'zrender/src/core/matrix';
import pointsLayout from '../../layout/points';
import ChartView from '../../view/Chart';
class EffectScatterView extends ChartView {
    constructor() {
        super(...arguments);
        this.type = EffectScatterView.type;
    }
    init() {
        this._symbolDraw = new SymbolDraw(EffectSymbol);
    }
    render(seriesModel, ecModel, api) {
        const data = seriesModel.getData();
        const effectSymbolDraw = this._symbolDraw;
        effectSymbolDraw.updateData(data, { clipShape: this._getClipShape(seriesModel) });
        this.group.add(effectSymbolDraw.group);
    }
    _getClipShape(seriesModel) {
        const coordSys = seriesModel.coordinateSystem;
        const clipArea = coordSys && coordSys.getArea && coordSys.getArea();
        return seriesModel.get('clip', true) ? clipArea : null;
    }
    updateTransform(seriesModel, ecModel, api) {
        const data = seriesModel.getData();
        this.group.dirty();
        const res = pointsLayout('').reset(seriesModel, ecModel, api);
        if (res.progress) {
            res.progress({
                start: 0,
                end: data.count(),
                count: data.count()
            }, data);
        }
        this._symbolDraw.updateLayout();
    }
    _updateGroupTransform(seriesModel) {
        const coordSys = seriesModel.coordinateSystem;
        if (coordSys && coordSys.getRoamTransform) {
            this.group.transform = matrix.clone(coordSys.getRoamTransform());
            this.group.decomposeTransform();
        }
    }
    remove(ecModel, api) {
        this._symbolDraw && this._symbolDraw.remove(true);
    }
}
EffectScatterView.type = 'effectScatter';
export default EffectScatterView;
