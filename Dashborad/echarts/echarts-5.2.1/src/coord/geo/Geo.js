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
import BoundingRect from 'zrender/src/core/BoundingRect';
import View from '../View';
import geoSourceManager from './geoSourceManager';
import { SINGLE_REFERRING } from '../../util/model';
const GEO_DEFAULT_PARAMS = {
    'geoJSON': {
        aspectScale: 0.75,
        invertLongitute: true
    },
    'geoSVG': {
        aspectScale: 1,
        invertLongitute: false
    }
};
export const geo2DDimensions = ['lng', 'lat'];
class Geo extends View {
    constructor(name, map, opt) {
        super(name);
        this.dimensions = geo2DDimensions;
        this.type = 'geo';
        // Only store specified name coord via `addGeoCoord`.
        this._nameCoordMap = zrUtil.createHashMap();
        this.map = map;
        const source = geoSourceManager.load(map, opt.nameMap, opt.nameProperty);
        const resource = geoSourceManager.getGeoResource(map);
        this.resourceType = resource ? resource.type : null;
        const defaultParmas = GEO_DEFAULT_PARAMS[resource.type];
        this._regionsMap = source.regionsMap;
        this._invertLongitute = defaultParmas.invertLongitute;
        this.regions = source.regions;
        this.aspectScale = zrUtil.retrieve2(opt.aspectScale, defaultParmas.aspectScale);
        const boundingRect = source.boundingRect;
        this.setBoundingRect(boundingRect.x, boundingRect.y, boundingRect.width, boundingRect.height);
    }
    /**
     * Whether contain the given [lng, lat] coord.
     */
    // Never used yet.
    // containCoord(coord: number[]) {
    //     const regions = this.regions;
    //     for (let i = 0; i < regions.length; i++) {
    //         const region = regions[i];
    //         if (region.type === 'geoJSON' && (region as GeoJSONRegion).contain(coord)) {
    //             return true;
    //         }
    //     }
    //     return false;
    // }
    _transformTo(x, y, width, height) {
        let rect = this.getBoundingRect();
        const invertLongitute = this._invertLongitute;
        rect = rect.clone();
        if (invertLongitute) {
            // Longitute is inverted
            rect.y = -rect.y - rect.height;
        }
        const rawTransformable = this._rawTransformable;
        rawTransformable.transform = rect.calculateTransform(new BoundingRect(x, y, width, height));
        const rawParent = rawTransformable.parent;
        rawTransformable.parent = null;
        rawTransformable.decomposeTransform();
        rawTransformable.parent = rawParent;
        if (invertLongitute) {
            rawTransformable.scaleY = -rawTransformable.scaleY;
        }
        this._updateTransform();
    }
    getRegion(name) {
        return this._regionsMap.get(name);
    }
    getRegionByCoord(coord) {
        const regions = this.regions;
        for (let i = 0; i < regions.length; i++) {
            const region = regions[i];
            if (region.type === 'geoJSON' && region.contain(coord)) {
                return regions[i];
            }
        }
    }
    /**
     * Add geoCoord for indexing by name
     */
    addGeoCoord(name, geoCoord) {
        this._nameCoordMap.set(name, geoCoord);
    }
    /**
     * Get geoCoord by name
     */
    getGeoCoord(name) {
        const region = this._regionsMap.get(name);
        // calcualte center only on demand.
        return this._nameCoordMap.get(name) || (region && region.getCenter());
    }
    dataToPoint(data, noRoam, out) {
        if (typeof data === 'string') {
            // Map area name to geoCoord
            data = this.getGeoCoord(data);
        }
        if (data) {
            return View.prototype.dataToPoint.call(this, data, noRoam, out);
        }
    }
    convertToPixel(ecModel, finder, value) {
        const coordSys = getCoordSys(finder);
        return coordSys === this ? coordSys.dataToPoint(value) : null;
    }
    convertFromPixel(ecModel, finder, pixel) {
        const coordSys = getCoordSys(finder);
        return coordSys === this ? coordSys.pointToData(pixel) : null;
    }
}
;
zrUtil.mixin(Geo, View);
function getCoordSys(finder) {
    const geoModel = finder.geoModel;
    const seriesModel = finder.seriesModel;
    return geoModel
        ? geoModel.coordinateSystem
        : seriesModel
            ? (seriesModel.coordinateSystem // For map series.
                || (seriesModel.getReferringComponents('geo', SINGLE_REFERRING).models[0] || {}).coordinateSystem)
            : null;
}
export default Geo;
