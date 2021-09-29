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
import ComponentModel from '../../model/Component';
import makeStyleMapper from '../../model/mixin/makeStyleMapper';
import * as numberUtil from '../../util/number';
import { AxisModelCommonMixin } from '../axisModelCommonMixin';
class ParallelAxisModel extends ComponentModel {
    constructor() {
        super(...arguments);
        this.type = ParallelAxisModel.type;
        /**
         * @readOnly
         */
        this.activeIntervals = [];
    }
    getAreaSelectStyle() {
        return makeStyleMapper([
            ['fill', 'color'],
            ['lineWidth', 'borderWidth'],
            ['stroke', 'borderColor'],
            ['width', 'width'],
            ['opacity', 'opacity']
            // Option decal is in `DecalObject` but style.decal is in `PatternObject`.
            // So do not transfer decal directly.
        ])(this.getModel('areaSelectStyle'));
    }
    /**
     * The code of this feature is put on AxisModel but not ParallelAxis,
     * because axisModel can be alive after echarts updating but instance of
     * ParallelAxis having been disposed. this._activeInterval should be kept
     * when action dispatched (i.e. legend click).
     *
     * @param intervals `interval.length === 0` means set all active.
     */
    setActiveIntervals(intervals) {
        const activeIntervals = this.activeIntervals = zrUtil.clone(intervals);
        // Normalize
        if (activeIntervals) {
            for (let i = activeIntervals.length - 1; i >= 0; i--) {
                numberUtil.asc(activeIntervals[i]);
            }
        }
    }
    /**
     * @param value When only attempting detect whether 'no activeIntervals set',
     *        `value` is not needed to be input.
     */
    getActiveState(value) {
        const activeIntervals = this.activeIntervals;
        if (!activeIntervals.length) {
            return 'normal';
        }
        if (value == null || isNaN(+value)) {
            return 'inactive';
        }
        // Simple optimization
        if (activeIntervals.length === 1) {
            const interval = activeIntervals[0];
            if (interval[0] <= value && value <= interval[1]) {
                return 'active';
            }
        }
        else {
            for (let i = 0, len = activeIntervals.length; i < len; i++) {
                if (activeIntervals[i][0] <= value && value <= activeIntervals[i][1]) {
                    return 'active';
                }
            }
        }
        return 'inactive';
    }
}
zrUtil.mixin(ParallelAxisModel, AxisModelCommonMixin);
export default ParallelAxisModel;
