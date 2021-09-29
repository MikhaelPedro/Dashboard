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
import { createHashMap } from 'zrender/src/core/util';
import { GeoSVGResource } from './GeoSVGResource';
import { GeoJSONResource } from './GeoJSONResource';
const storage = createHashMap();
export default {
    /**
     * Compatible with previous `echarts.registerMap`.
     *
     * @usage
     * ```js
     *
     * echarts.registerMap('USA', geoJson, specialAreas);
     *
     * echarts.registerMap('USA', {
     *     geoJson: geoJson,
     *     specialAreas: {...}
     * });
     * echarts.registerMap('USA', {
     *     geoJSON: geoJson,
     *     specialAreas: {...}
     * });
     *
     * echarts.registerMap('airport', {
     *     svg: svg
     * }
     * ```
     *
     * Note:
     * Do not support that register multiple geoJSON or SVG
     * one map name. Because different geoJSON and SVG have
     * different unit. It's not easy to make sure how those
     * units are mapping/normalize.
     * If intending to use multiple geoJSON or SVG, we can
     * use multiple geo coordinate system.
     */
    registerMap: function (mapName, rawDef, rawSpecialAreas) {
        if (rawDef.svg) {
            const resource = new GeoSVGResource(mapName, rawDef.svg);
            storage.set(mapName, resource);
        }
        else {
            // Recommend:
            //     echarts.registerMap('eu', { geoJSON: xxx, specialAreas: xxx });
            // Backward compatibility:
            //     echarts.registerMap('eu', geoJSON, specialAreas);
            //     echarts.registerMap('eu', { geoJson: xxx, specialAreas: xxx });
            let geoJSON = rawDef.geoJson
                || rawDef.geoJSON;
            if (geoJSON && !rawDef.features) {
                rawSpecialAreas = rawDef.specialAreas;
            }
            else {
                geoJSON = rawDef;
            }
            const resource = new GeoJSONResource(mapName, geoJSON, rawSpecialAreas);
            storage.set(mapName, resource);
        }
    },
    getGeoResource(mapName) {
        return storage.get(mapName);
    },
    /**
     * Only for exporting to users.
     * **MUST NOT** used internally.
     */
    getMapForUser: function (mapName) {
        const resource = storage.get(mapName);
        // Do not support return SVG until some real requirement come.
        return resource && resource.type === 'geoJSON'
            && resource.getMapForUser();
    },
    load: function (mapName, nameMap, nameProperty) {
        const resource = storage.get(mapName);
        if (!resource) {
            if (__DEV__) {
                console.error('Map ' + mapName + ' not exists. The GeoJSON of the map must be provided.');
            }
            return;
        }
        return resource.load(nameMap, nameProperty);
    }
};
