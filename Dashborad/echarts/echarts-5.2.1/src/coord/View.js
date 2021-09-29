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
/**
 * Simple view coordinate system
 * Mapping given x, y to transformd view x, y
 */
import * as vector from 'zrender/src/core/vector';
import * as matrix from 'zrender/src/core/matrix';
import BoundingRect from 'zrender/src/core/BoundingRect';
import Transformable from 'zrender/src/core/Transformable';
const v2ApplyTransform = vector.applyTransform;
class View extends Transformable {
    constructor(name) {
        super();
        this.type = 'view';
        this.dimensions = ['x', 'y'];
        /**
         * Represents the transform brought by roam/zoom.
         * If `View['_viewRect']` applies roam transform,
         * we can get the final displayed rect.
         */
        this._roamTransformable = new Transformable();
        /**
         * Represents the transform from `View['_rect']` to `View['_viewRect']`.
         */
        this._rawTransformable = new Transformable();
        this.name = name;
    }
    setBoundingRect(x, y, width, height) {
        this._rect = new BoundingRect(x, y, width, height);
        return this._rect;
    }
    /**
     * @return {module:zrender/core/BoundingRect}
     */
    getBoundingRect() {
        return this._rect;
    }
    setViewRect(x, y, width, height) {
        this._transformTo(x, y, width, height);
        this._viewRect = new BoundingRect(x, y, width, height);
    }
    /**
     * Transformed to particular position and size
     */
    _transformTo(x, y, width, height) {
        const rect = this.getBoundingRect();
        const rawTransform = this._rawTransformable;
        rawTransform.transform = rect.calculateTransform(new BoundingRect(x, y, width, height));
        const rawParent = rawTransform.parent;
        rawTransform.parent = null;
        rawTransform.decomposeTransform();
        rawTransform.parent = rawParent;
        this._updateTransform();
    }
    /**
     * Set center of view
     */
    setCenter(centerCoord) {
        if (!centerCoord) {
            return;
        }
        this._center = centerCoord;
        this._updateCenterAndZoom();
    }
    setZoom(zoom) {
        zoom = zoom || 1;
        const zoomLimit = this.zoomLimit;
        if (zoomLimit) {
            if (zoomLimit.max != null) {
                zoom = Math.min(zoomLimit.max, zoom);
            }
            if (zoomLimit.min != null) {
                zoom = Math.max(zoomLimit.min, zoom);
            }
        }
        this._zoom = zoom;
        this._updateCenterAndZoom();
    }
    /**
     * Get default center without roam
     */
    getDefaultCenter() {
        // Rect before any transform
        const rawRect = this.getBoundingRect();
        const cx = rawRect.x + rawRect.width / 2;
        const cy = rawRect.y + rawRect.height / 2;
        return [cx, cy];
    }
    getCenter() {
        return this._center || this.getDefaultCenter();
    }
    getZoom() {
        return this._zoom || 1;
    }
    getRoamTransform() {
        return this._roamTransformable.getLocalTransform();
    }
    /**
     * Remove roam
     */
    _updateCenterAndZoom() {
        // Must update after view transform updated
        const rawTransformMatrix = this._rawTransformable.getLocalTransform();
        const roamTransform = this._roamTransformable;
        let defaultCenter = this.getDefaultCenter();
        let center = this.getCenter();
        const zoom = this.getZoom();
        center = vector.applyTransform([], center, rawTransformMatrix);
        defaultCenter = vector.applyTransform([], defaultCenter, rawTransformMatrix);
        roamTransform.originX = center[0];
        roamTransform.originY = center[1];
        roamTransform.x = defaultCenter[0] - center[0];
        roamTransform.y = defaultCenter[1] - center[1];
        roamTransform.scaleX = roamTransform.scaleY = zoom;
        this._updateTransform();
    }
    /**
     * Update transform props on `this` based on the current
     * `this._roamTransformable` and `this._rawTransformable`.
     */
    _updateTransform() {
        const roamTransformable = this._roamTransformable;
        const rawTransformable = this._rawTransformable;
        rawTransformable.parent = roamTransformable;
        roamTransformable.updateTransform();
        rawTransformable.updateTransform();
        matrix.copy(this.transform || (this.transform = []), rawTransformable.transform || matrix.create());
        this._rawTransform = rawTransformable.getLocalTransform();
        this.invTransform = this.invTransform || [];
        matrix.invert(this.invTransform, this.transform);
        this.decomposeTransform();
    }
    getTransformInfo() {
        const rawTransformable = this._rawTransformable;
        const roamTransformable = this._roamTransformable;
        // Becuase roamTransformabel has `originX/originY` modified,
        // but the caller of `getTransformInfo` can not handle `originX/originY`,
        // so need to recalcualte them.
        const dummyTransformable = new Transformable();
        dummyTransformable.transform = roamTransformable.transform;
        dummyTransformable.decomposeTransform();
        return {
            roam: {
                x: dummyTransformable.x,
                y: dummyTransformable.y,
                scaleX: dummyTransformable.scaleX,
                scaleY: dummyTransformable.scaleY
            },
            raw: {
                x: rawTransformable.x,
                y: rawTransformable.y,
                scaleX: rawTransformable.scaleX,
                scaleY: rawTransformable.scaleY
            }
        };
    }
    getViewRect() {
        return this._viewRect;
    }
    /**
     * Get view rect after roam transform
     */
    getViewRectAfterRoam() {
        const rect = this.getBoundingRect().clone();
        rect.applyTransform(this.transform);
        return rect;
    }
    /**
     * Convert a single (lon, lat) data item to (x, y) point.
     */
    dataToPoint(data, noRoam, out) {
        const transform = noRoam ? this._rawTransform : this.transform;
        out = out || [];
        return transform
            ? v2ApplyTransform(out, data, transform)
            : vector.copy(out, data);
    }
    /**
     * Convert a (x, y) point to (lon, lat) data
     */
    pointToData(point) {
        const invTransform = this.invTransform;
        return invTransform
            ? v2ApplyTransform([], point, invTransform)
            : [point[0], point[1]];
    }
    convertToPixel(ecModel, finder, value) {
        const coordSys = getCoordSys(finder);
        return coordSys === this ? coordSys.dataToPoint(value) : null;
    }
    convertFromPixel(ecModel, finder, pixel) {
        const coordSys = getCoordSys(finder);
        return coordSys === this ? coordSys.pointToData(pixel) : null;
    }
    /**
     * @implements
     */
    containPoint(point) {
        return this.getViewRectAfterRoam().contain(point[0], point[1]);
    }
}
View.dimensions = ['x', 'y'];
function getCoordSys(finder) {
    const seriesModel = finder.seriesModel;
    return seriesModel ? seriesModel.coordinateSystem : null; // e.g., graph.
}
export default View;
