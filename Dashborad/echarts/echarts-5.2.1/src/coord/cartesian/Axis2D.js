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
import Axis from '../Axis';
class Axis2D extends Axis {
    constructor(dim, scale, coordExtent, axisType, position) {
        super(dim, scale, coordExtent);
        /**
         * Index of axis, can be used as key
         * Injected outside.
         */
        this.index = 0;
        this.type = axisType || 'value';
        this.position = position || 'bottom';
    }
    isHorizontal() {
        const position = this.position;
        return position === 'top' || position === 'bottom';
    }
    /**
     * Each item cooresponds to this.getExtent(), which
     * means globalExtent[0] may greater than globalExtent[1],
     * unless `asc` is input.
     *
     * @param {boolean} [asc]
     * @return {Array.<number>}
     */
    getGlobalExtent(asc) {
        const ret = this.getExtent();
        ret[0] = this.toGlobalCoord(ret[0]);
        ret[1] = this.toGlobalCoord(ret[1]);
        asc && ret[0] > ret[1] && ret.reverse();
        return ret;
    }
    pointToData(point, clamp) {
        return this.coordToData(this.toLocalCoord(point[this.dim === 'x' ? 0 : 1]), clamp);
    }
    /**
     * Set ordinalSortInfo
     * @param info new OrdinalSortInfo
     */
    setCategorySortInfo(info) {
        if (this.type !== 'category') {
            return false;
        }
        this.model.option.categorySortInfo = info;
        this.scale.setSortInfo(info);
    }
}
export default Axis2D;
