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
// TODO depends on DataZoom and Brush
import * as zrUtil from 'zrender/src/core/util';
import BrushController from '../../helper/BrushController';
import BrushTargetManager from '../../helper/BrushTargetManager';
import * as history from '../../dataZoom/history';
import sliderMove from '../../helper/sliderMove';
import { ToolboxFeature } from '../featureManager';
import { makeInternalComponentId, parseFinder } from '../../../util/model';
import { registerInternalOptionCreator } from '../../../model/internalComponentCreator';
const each = zrUtil.each;
const DATA_ZOOM_ID_BASE = makeInternalComponentId('toolbox-dataZoom_');
const ICON_TYPES = ['zoom', 'back'];
class DataZoomFeature extends ToolboxFeature {
    render(featureModel, ecModel, api, payload) {
        if (!this._brushController) {
            this._brushController = new BrushController(api.getZr());
            this._brushController.on('brush', zrUtil.bind(this._onBrush, this))
                .mount();
        }
        updateZoomBtnStatus(featureModel, ecModel, this, payload, api);
        updateBackBtnStatus(featureModel, ecModel);
    }
    onclick(ecModel, api, type) {
        handlers[type].call(this);
    }
    remove(ecModel, api) {
        this._brushController && this._brushController.unmount();
    }
    dispose(ecModel, api) {
        this._brushController && this._brushController.dispose();
    }
    _onBrush(eventParam) {
        const areas = eventParam.areas;
        if (!eventParam.isEnd || !areas.length) {
            return;
        }
        const snapshot = {};
        const ecModel = this.ecModel;
        this._brushController.updateCovers([]); // remove cover
        const brushTargetManager = new BrushTargetManager(makeAxisFinder(this.model), ecModel, { include: ['grid'] });
        brushTargetManager.matchOutputRanges(areas, ecModel, function (area, coordRange, coordSys) {
            if (coordSys.type !== 'cartesian2d') {
                return;
            }
            const brushType = area.brushType;
            if (brushType === 'rect') {
                setBatch('x', coordSys, coordRange[0]);
                setBatch('y', coordSys, coordRange[1]);
            }
            else {
                setBatch({ lineX: 'x', lineY: 'y' }[brushType], coordSys, coordRange);
            }
        });
        history.push(ecModel, snapshot);
        this._dispatchZoomAction(snapshot);
        function setBatch(dimName, coordSys, minMax) {
            const axis = coordSys.getAxis(dimName);
            const axisModel = axis.model;
            const dataZoomModel = findDataZoom(dimName, axisModel, ecModel);
            // Restrict range.
            const minMaxSpan = dataZoomModel.findRepresentativeAxisProxy(axisModel).getMinMaxSpan();
            if (minMaxSpan.minValueSpan != null || minMaxSpan.maxValueSpan != null) {
                minMax = sliderMove(0, minMax.slice(), axis.scale.getExtent(), 0, minMaxSpan.minValueSpan, minMaxSpan.maxValueSpan);
            }
            dataZoomModel && (snapshot[dataZoomModel.id] = {
                dataZoomId: dataZoomModel.id,
                startValue: minMax[0],
                endValue: minMax[1]
            });
        }
        function findDataZoom(dimName, axisModel, ecModel) {
            let found;
            ecModel.eachComponent({ mainType: 'dataZoom', subType: 'select' }, function (dzModel) {
                const has = dzModel.getAxisModel(dimName, axisModel.componentIndex);
                has && (found = dzModel);
            });
            return found;
        }
    }
    ;
    _dispatchZoomAction(snapshot) {
        const batch = [];
        // Convert from hash map to array.
        each(snapshot, function (batchItem, dataZoomId) {
            batch.push(zrUtil.clone(batchItem));
        });
        batch.length && this.api.dispatchAction({
            type: 'dataZoom',
            from: this.uid,
            batch: batch
        });
    }
    static getDefaultOption(ecModel) {
        const defaultOption = {
            show: true,
            filterMode: 'filter',
            // Icon group
            icon: {
                zoom: 'M0,13.5h26.9 M13.5,26.9V0 M32.1,13.5H58V58H13.5 V32.1',
                back: 'M22,1.4L9.9,13.5l12.3,12.3 M10.3,13.5H54.9v44.6 H10.3v-26'
            },
            // `zoom`, `back`
            title: ecModel.getLocaleModel().get(['toolbox', 'dataZoom', 'title']),
            brushStyle: {
                borderWidth: 0,
                color: 'rgba(210,219,238,0.2)'
            }
        };
        return defaultOption;
    }
}
const handlers = {
    zoom: function () {
        const nextActive = !this._isZoomActive;
        this.api.dispatchAction({
            type: 'takeGlobalCursor',
            key: 'dataZoomSelect',
            dataZoomSelectActive: nextActive
        });
    },
    back: function () {
        this._dispatchZoomAction(history.pop(this.ecModel));
    }
};
function makeAxisFinder(dzFeatureModel) {
    const setting = {
        xAxisIndex: dzFeatureModel.get('xAxisIndex', true),
        yAxisIndex: dzFeatureModel.get('yAxisIndex', true),
        xAxisId: dzFeatureModel.get('xAxisId', true),
        yAxisId: dzFeatureModel.get('yAxisId', true)
    };
    // If both `xAxisIndex` `xAxisId` not set, it means 'all'.
    // If both `yAxisIndex` `yAxisId` not set, it means 'all'.
    // Some old cases set like this below to close yAxis control but leave xAxis control:
    // `{ feature: { dataZoom: { yAxisIndex: false } }`.
    if (setting.xAxisIndex == null && setting.xAxisId == null) {
        setting.xAxisIndex = 'all';
    }
    if (setting.yAxisIndex == null && setting.yAxisId == null) {
        setting.yAxisIndex = 'all';
    }
    return setting;
}
function updateBackBtnStatus(featureModel, ecModel) {
    featureModel.setIconStatus('back', history.count(ecModel) > 1 ? 'emphasis' : 'normal');
}
function updateZoomBtnStatus(featureModel, ecModel, view, payload, api) {
    let zoomActive = view._isZoomActive;
    if (payload && payload.type === 'takeGlobalCursor') {
        zoomActive = payload.key === 'dataZoomSelect'
            ? payload.dataZoomSelectActive : false;
    }
    view._isZoomActive = zoomActive;
    featureModel.setIconStatus('zoom', zoomActive ? 'emphasis' : 'normal');
    const brushTargetManager = new BrushTargetManager(makeAxisFinder(featureModel), ecModel, { include: ['grid'] });
    const panels = brushTargetManager.makePanelOpts(api, function (targetInfo) {
        return (targetInfo.xAxisDeclared && !targetInfo.yAxisDeclared)
            ? 'lineX'
            : (!targetInfo.xAxisDeclared && targetInfo.yAxisDeclared)
                ? 'lineY'
                : 'rect';
    });
    view._brushController
        .setPanels(panels)
        .enableBrush((zoomActive && panels.length)
        ? {
            brushType: 'auto',
            brushStyle: featureModel.getModel('brushStyle').getItemStyle()
        }
        : false);
}
registerInternalOptionCreator('dataZoom', function (ecModel) {
    const toolboxModel = ecModel.getComponent('toolbox', 0);
    const featureDataZoomPath = ['feature', 'dataZoom'];
    if (!toolboxModel || toolboxModel.get(featureDataZoomPath) == null) {
        return;
    }
    const dzFeatureModel = toolboxModel.getModel(featureDataZoomPath);
    const dzOptions = [];
    const finder = makeAxisFinder(dzFeatureModel);
    const finderResult = parseFinder(ecModel, finder);
    each(finderResult.xAxisModels, axisModel => buildInternalOptions(axisModel, 'xAxis', 'xAxisIndex'));
    each(finderResult.yAxisModels, axisModel => buildInternalOptions(axisModel, 'yAxis', 'yAxisIndex'));
    function buildInternalOptions(axisModel, axisMainType, axisIndexPropName) {
        const axisIndex = axisModel.componentIndex;
        const newOpt = {
            type: 'select',
            $fromToolbox: true,
            // Default to be filter
            filterMode: dzFeatureModel.get('filterMode', true) || 'filter',
            // Id for merge mapping.
            id: DATA_ZOOM_ID_BASE + axisMainType + axisIndex
        };
        newOpt[axisIndexPropName] = axisIndex;
        dzOptions.push(newOpt);
    }
    return dzOptions;
});
export default DataZoomFeature;
