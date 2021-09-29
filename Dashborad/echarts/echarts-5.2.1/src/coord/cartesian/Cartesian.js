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
class Cartesian {
    constructor(name) {
        this.type = 'cartesian';
        this._dimList = [];
        this._axes = {};
        this.name = name || '';
    }
    getAxis(dim) {
        return this._axes[dim];
    }
    getAxes() {
        return zrUtil.map(this._dimList, function (dim) {
            return this._axes[dim];
        }, this);
    }
    getAxesByScale(scaleType) {
        scaleType = scaleType.toLowerCase();
        return zrUtil.filter(this.getAxes(), function (axis) {
            return axis.scale.type === scaleType;
        });
    }
    addAxis(axis) {
        const dim = axis.dim;
        this._axes[dim] = axis;
        this._dimList.push(dim);
    }
}
;
export default Cartesian;
