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
 * Linear continuous scale
 * http://en.wikipedia.org/wiki/Level_of_measurement
 */
// FIXME only one data
import Scale from './Scale';
import OrdinalMeta from '../data/OrdinalMeta';
import * as scaleHelper from './helper';
import { isArray, map, isObject } from 'zrender/src/core/util';
class OrdinalScale extends Scale {
    constructor(setting) {
        super(setting);
        this.type = 'ordinal';
        let ordinalMeta = this.getSetting('ordinalMeta');
        // Caution: Should not use instanceof, consider ec-extensions using
        // import approach to get OrdinalMeta class.
        if (!ordinalMeta) {
            ordinalMeta = new OrdinalMeta({});
        }
        if (isArray(ordinalMeta)) {
            ordinalMeta = new OrdinalMeta({
                categories: map(ordinalMeta, item => (isObject(item) ? item.value : item))
            });
        }
        this._ordinalMeta = ordinalMeta;
        this._extent = this.getSetting('extent') || [0, ordinalMeta.categories.length - 1];
    }
    parse(val) {
        return typeof val === 'string'
            ? this._ordinalMeta.getOrdinal(val)
            // val might be float.
            : Math.round(val);
    }
    contain(rank) {
        rank = this.parse(rank);
        return scaleHelper.contain(rank, this._extent)
            && this._ordinalMeta.categories[rank] != null;
    }
    /**
     * Normalize given rank or name to linear [0, 1]
     * @param val raw ordinal number.
     * @return normalized value in [0, 1].
     */
    normalize(val) {
        val = this._getTickNumber(this.parse(val));
        return scaleHelper.normalize(val, this._extent);
    }
    /**
     * @param val normalized value in [0, 1].
     * @return raw ordinal number.
     */
    scale(val) {
        val = Math.round(scaleHelper.scale(val, this._extent));
        return this.getRawOrdinalNumber(val);
    }
    getTicks() {
        const ticks = [];
        const extent = this._extent;
        let rank = extent[0];
        while (rank <= extent[1]) {
            ticks.push({
                value: rank
            });
            rank++;
        }
        return ticks;
    }
    getMinorTicks(splitNumber) {
        // Not support.
        return;
    }
    /**
     * @see `Ordinal['_ordinalNumbersByTick']`
     */
    setSortInfo(info) {
        if (info == null) {
            this._ordinalNumbersByTick = this._ticksByOrdinalNumber = null;
            return;
        }
        const infoOrdinalNumbers = info.ordinalNumbers;
        const ordinalsByTick = this._ordinalNumbersByTick = [];
        const ticksByOrdinal = this._ticksByOrdinalNumber = [];
        // Unnecessary support negative tick in `realtimeSort`.
        let tickNum = 0;
        const allCategoryLen = this._ordinalMeta.categories.length;
        for (const len = Math.min(allCategoryLen, infoOrdinalNumbers.length); tickNum < len; ++tickNum) {
            const ordinalNumber = infoOrdinalNumbers[tickNum];
            ordinalsByTick[tickNum] = ordinalNumber;
            ticksByOrdinal[ordinalNumber] = tickNum;
        }
        // Handle that `series.data` only covers part of the `axis.category.data`.
        let unusedOrdinal = 0;
        for (; tickNum < allCategoryLen; ++tickNum) {
            while (ticksByOrdinal[unusedOrdinal] != null) {
                unusedOrdinal++;
            }
            ;
            ordinalsByTick.push(unusedOrdinal);
            ticksByOrdinal[unusedOrdinal] = tickNum;
        }
    }
    _getTickNumber(ordinal) {
        const ticksByOrdinalNumber = this._ticksByOrdinalNumber;
        // also support ordinal out of range of `ordinalMeta.categories.length`,
        // where ordinal numbers are used as tick value directly.
        return (ticksByOrdinalNumber && ordinal >= 0 && ordinal < ticksByOrdinalNumber.length)
            ? ticksByOrdinalNumber[ordinal]
            : ordinal;
    }
    /**
     * @usage
     * ```js
     * const ordinalNumber = ordinalScale.getRawOrdinalNumber(tickVal);
     *
     * // case0
     * const rawOrdinalValue = axisModel.getCategories()[ordinalNumber];
     * // case1
     * const rawOrdinalValue = this._ordinalMeta.categories[ordinalNumber];
     * // case2
     * const coord = axis.dataToCoord(ordinalNumber);
     * ```
     *
     * @param {OrdinalNumber} tickNumber index of display
     */
    getRawOrdinalNumber(tickNumber) {
        const ordinalNumbersByTick = this._ordinalNumbersByTick;
        // tickNumber may be out of range, e.g., when axis max is larger than `ordinalMeta.categories.length`.,
        // where ordinal numbers are used as tick value directly.
        return (ordinalNumbersByTick && tickNumber >= 0 && tickNumber < ordinalNumbersByTick.length)
            ? ordinalNumbersByTick[tickNumber]
            : tickNumber;
    }
    /**
     * Get item on tick
     */
    getLabel(tick) {
        if (!this.isBlank()) {
            const ordinalNumber = this.getRawOrdinalNumber(tick.value);
            const cateogry = this._ordinalMeta.categories[ordinalNumber];
            // Note that if no data, ordinalMeta.categories is an empty array.
            // Return empty if it's not exist.
            return cateogry == null ? '' : cateogry + '';
        }
    }
    count() {
        return this._extent[1] - this._extent[0] + 1;
    }
    unionExtentFromData(data, dim) {
        this.unionExtent(data.getApproximateExtent(dim));
    }
    /**
     * @override
     * If value is in extent range
     */
    isInExtentRange(value) {
        value = this._getTickNumber(value);
        return this._extent[0] <= value && this._extent[1] >= value;
    }
    getOrdinalMeta() {
        return this._ordinalMeta;
    }
    niceTicks() { }
    niceExtent() { }
}
OrdinalScale.type = 'ordinal';
Scale.registerClass(OrdinalScale);
export default OrdinalScale;
