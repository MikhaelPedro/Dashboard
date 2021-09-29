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
import * as modelUtil from '../../util/model';
import ComponentModel from '../../model/Component';
import Model from '../../model/Model';
import geoCreator from './geoCreator';
import geoSourceManager from './geoSourceManager';
;
class GeoModel extends ComponentModel {
    constructor() {
        super(...arguments);
        this.type = GeoModel.type;
    }
    init(option, parentModel, ecModel) {
        const source = geoSourceManager.getGeoResource(option.map);
        if (source && source.type === 'geoJSON') {
            const itemStyle = option.itemStyle = option.itemStyle || {};
            if (!('color' in itemStyle)) {
                itemStyle.color = '#eee';
            }
        }
        this.mergeDefaultAndTheme(option, ecModel);
        // Default label emphasis `show`
        modelUtil.defaultEmphasis(option, 'label', ['show']);
    }
    optionUpdated() {
        const option = this.option;
        option.regions = geoCreator.getFilledRegions(option.regions, option.map, option.nameMap, option.nameProperty);
        const selectedMap = {};
        this._optionModelMap = zrUtil.reduce(option.regions || [], (optionModelMap, regionOpt) => {
            const regionName = regionOpt.name;
            if (regionName) {
                optionModelMap.set(regionName, new Model(regionOpt, this, this.ecModel));
                if (regionOpt.selected) {
                    selectedMap[regionName] = true;
                }
            }
            return optionModelMap;
        }, zrUtil.createHashMap());
        if (!option.selectedMap) {
            option.selectedMap = selectedMap;
        }
    }
    /**
     * Get model of region.
     */
    getRegionModel(name) {
        return this._optionModelMap.get(name) || new Model(null, this, this.ecModel);
    }
    /**
     * Format label
     * @param name Region name
     */
    getFormattedLabel(name, status) {
        const regionModel = this.getRegionModel(name);
        const formatter = status === 'normal'
            ? regionModel.get(['label', 'formatter'])
            : regionModel.get(['emphasis', 'label', 'formatter']);
        const params = {
            name: name
        };
        if (typeof formatter === 'function') {
            params.status = status;
            return formatter(params);
        }
        else if (typeof formatter === 'string') {
            return formatter.replace('{a}', name != null ? name : '');
        }
    }
    setZoom(zoom) {
        this.option.zoom = zoom;
    }
    setCenter(center) {
        this.option.center = center;
    }
    // PENGING If selectedMode is null ?
    select(name) {
        const option = this.option;
        const selectedMode = option.selectedMode;
        if (!selectedMode) {
            return;
        }
        if (selectedMode !== 'multiple') {
            option.selectedMap = null;
        }
        const selectedMap = option.selectedMap || (option.selectedMap = {});
        selectedMap[name] = true;
    }
    unSelect(name) {
        const selectedMap = this.option.selectedMap;
        if (selectedMap) {
            selectedMap[name] = false;
        }
    }
    toggleSelected(name) {
        this[this.isSelected(name) ? 'unSelect' : 'select'](name);
    }
    isSelected(name) {
        const selectedMap = this.option.selectedMap;
        return !!(selectedMap && selectedMap[name]);
    }
}
GeoModel.type = 'geo';
GeoModel.layoutMode = 'box';
GeoModel.defaultOption = {
    zlevel: 0,
    z: 0,
    show: true,
    left: 'center',
    top: 'center',
    // Default value:
    // for geoSVG source: 1,
    // for geoJSON source: 0.75.
    aspectScale: null,
    ///// Layout with center and size
    // If you wan't to put map in a fixed size box with right aspect ratio
    // This two properties may more conveninet
    // layoutCenter: [50%, 50%]
    // layoutSize: 100
    silent: false,
    // Map type
    map: '',
    // Define left-top, right-bottom coords to control view
    // For example, [ [180, 90], [-180, -90] ]
    boundingCoords: null,
    // Default on center of map
    center: null,
    zoom: 1,
    scaleLimit: null,
    // selectedMode: false
    label: {
        show: false,
        color: '#000'
    },
    itemStyle: {
        borderWidth: 0.5,
        borderColor: '#444'
        // Default color:
        // + geoJSON: #eee
        // + geoSVG: null (use SVG original `fill`)
        // color: '#eee'
    },
    emphasis: {
        label: {
            show: true,
            color: 'rgb(100,0,0)'
        },
        itemStyle: {
            color: 'rgba(255,215,0,0.8)'
        }
    },
    select: {
        label: {
            show: true,
            color: 'rgb(100,0,0)'
        },
        itemStyle: {
            color: 'rgba(255,215,0,0.8)'
        }
    },
    regions: []
    // tooltip: {
    //     show: false
    // }
};
export default GeoModel;
