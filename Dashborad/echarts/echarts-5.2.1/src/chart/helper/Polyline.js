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
import { enableHoverEmphasis } from '../../util/states';
class Polyline extends graphic.Group {
    constructor(lineData, idx, seriesScope) {
        super();
        this._createPolyline(lineData, idx, seriesScope);
    }
    _createPolyline(lineData, idx, seriesScope) {
        // let seriesModel = lineData.hostModel;
        const points = lineData.getItemLayout(idx);
        const line = new graphic.Polyline({
            shape: {
                points: points
            }
        });
        this.add(line);
        this._updateCommonStl(lineData, idx, seriesScope);
    }
    ;
    updateData(lineData, idx, seriesScope) {
        const seriesModel = lineData.hostModel;
        const line = this.childAt(0);
        const target = {
            shape: {
                points: lineData.getItemLayout(idx)
            }
        };
        graphic.updateProps(line, target, seriesModel, idx);
        this._updateCommonStl(lineData, idx, seriesScope);
    }
    ;
    _updateCommonStl(lineData, idx, seriesScope) {
        const line = this.childAt(0);
        const itemModel = lineData.getItemModel(idx);
        let hoverLineStyle = seriesScope && seriesScope.emphasisLineStyle;
        if (!seriesScope || lineData.hasItemOption) {
            hoverLineStyle = itemModel.getModel(['emphasis', 'lineStyle']).getLineStyle();
        }
        line.useStyle(lineData.getItemVisual(idx, 'style'));
        line.style.fill = null;
        line.style.strokeNoScale = true;
        const lineEmphasisState = line.ensureState('emphasis');
        lineEmphasisState.style = hoverLineStyle;
        enableHoverEmphasis(this);
    }
    ;
    updateLayout(lineData, idx) {
        const polyline = this.childAt(0);
        polyline.setShape('points', lineData.getItemLayout(idx));
    }
    ;
}
export default Polyline;
