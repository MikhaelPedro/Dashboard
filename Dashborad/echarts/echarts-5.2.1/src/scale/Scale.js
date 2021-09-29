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
import * as clazzUtil from '../util/clazz';
class Scale {
    constructor(setting) {
        this._setting = setting || {};
        this._extent = [Infinity, -Infinity];
    }
    getSetting(name) {
        return this._setting[name];
    }
    /**
     * Set extent from data
     */
    unionExtent(other) {
        const extent = this._extent;
        other[0] < extent[0] && (extent[0] = other[0]);
        other[1] > extent[1] && (extent[1] = other[1]);
        // not setExtent because in log axis it may transformed to power
        // this.setExtent(extent[0], extent[1]);
    }
    /**
     * Set extent from data
     */
    unionExtentFromData(data, dim) {
        this.unionExtent(data.getApproximateExtent(dim));
    }
    /**
     * Get extent
     *
     * Extent is always in increase order.
     */
    getExtent() {
        return this._extent.slice();
    }
    /**
     * Set extent
     */
    setExtent(start, end) {
        const thisExtent = this._extent;
        if (!isNaN(start)) {
            thisExtent[0] = start;
        }
        if (!isNaN(end)) {
            thisExtent[1] = end;
        }
    }
    /**
     * If value is in extent range
     */
    isInExtentRange(value) {
        return this._extent[0] <= value && this._extent[1] >= value;
    }
    /**
     * When axis extent depends on data and no data exists,
     * axis ticks should not be drawn, which is named 'blank'.
     */
    isBlank() {
        return this._isBlank;
    }
    /**
     * When axis extent depends on data and no data exists,
     * axis ticks should not be drawn, which is named 'blank'.
     */
    setBlank(isBlank) {
        this._isBlank = isBlank;
    }
}
clazzUtil.enableClassManagement(Scale);
export default Scale;
