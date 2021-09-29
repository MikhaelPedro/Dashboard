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
function dataIndexMapValueLength(valNumOrArrLengthMoreThan2) {
    return valNumOrArrLengthMoreThan2 == null
        ? 0
        : (valNumOrArrLengthMoreThan2.length || 1);
}
function defaultKeyGetter(item) {
    return item;
}
class DataDiffer {
    /**
     * @param context Can be visited by this.context in callback.
     */
    constructor(oldArr, newArr, oldKeyGetter, newKeyGetter, context, 
    // By default: 'oneToOne'.
    diffMode) {
        this._old = oldArr;
        this._new = newArr;
        this._oldKeyGetter = oldKeyGetter || defaultKeyGetter;
        this._newKeyGetter = newKeyGetter || defaultKeyGetter;
        // Visible in callback via `this.context`;
        this.context = context;
        this._diffModeMultiple = diffMode === 'multiple';
    }
    /**
     * Callback function when add a data
     */
    add(func) {
        this._add = func;
        return this;
    }
    /**
     * Callback function when update a data
     */
    update(func) {
        this._update = func;
        return this;
    }
    /**
     * Callback function when update a data and only work in `cbMode: 'byKey'`.
     */
    updateManyToOne(func) {
        this._updateManyToOne = func;
        return this;
    }
    /**
     * Callback function when update a data and only work in `cbMode: 'byKey'`.
     */
    updateOneToMany(func) {
        this._updateOneToMany = func;
        return this;
    }
    /**
     * Callback function when update a data and only work in `cbMode: 'byKey'`.
     */
    updateManyToMany(func) {
        this._updateManyToMany = func;
        return this;
    }
    /**
     * Callback function when remove a data
     */
    remove(func) {
        this._remove = func;
        return this;
    }
    execute() {
        this[this._diffModeMultiple ? '_executeMultiple' : '_executeOneToOne']();
    }
    _executeOneToOne() {
        const oldArr = this._old;
        const newArr = this._new;
        const newDataIndexMap = {};
        const oldDataKeyArr = new Array(oldArr.length);
        const newDataKeyArr = new Array(newArr.length);
        this._initIndexMap(oldArr, null, oldDataKeyArr, '_oldKeyGetter');
        this._initIndexMap(newArr, newDataIndexMap, newDataKeyArr, '_newKeyGetter');
        for (let i = 0; i < oldArr.length; i++) {
            const oldKey = oldDataKeyArr[i];
            const newIdxMapVal = newDataIndexMap[oldKey];
            const newIdxMapValLen = dataIndexMapValueLength(newIdxMapVal);
            // idx can never be empty array here. see 'set null' logic below.
            if (newIdxMapValLen > 1) {
                // Consider there is duplicate key (for example, use dataItem.name as key).
                // We should make sure every item in newArr and oldArr can be visited.
                const newIdx = newIdxMapVal.shift();
                if (newIdxMapVal.length === 1) {
                    newDataIndexMap[oldKey] = newIdxMapVal[0];
                }
                this._update && this._update(newIdx, i);
            }
            else if (newIdxMapValLen === 1) {
                newDataIndexMap[oldKey] = null;
                this._update && this._update(newIdxMapVal, i);
            }
            else {
                this._remove && this._remove(i);
            }
        }
        this._performRestAdd(newDataKeyArr, newDataIndexMap);
    }
    /**
     * For example, consider the case:
     * oldData: [o0, o1, o2, o3, o4, o5, o6, o7],
     * newData: [n0, n1, n2, n3, n4, n5, n6, n7, n8],
     * Where:
     *     o0, o1, n0 has key 'a' (many to one)
     *     o5, n4, n5, n6 has key 'b' (one to many)
     *     o2, n1 has key 'c' (one to one)
     *     n2, n3 has key 'd' (add)
     *     o3, o4 has key 'e' (remove)
     *     o6, o7, n7, n8 has key 'f' (many to many, treated as add and remove)
     * Then:
     *     (The order of the following directives are not ensured.)
     *     this._updateManyToOne(n0, [o0, o1]);
     *     this._updateOneToMany([n4, n5, n6], o5);
     *     this._update(n1, o2);
     *     this._remove(o3);
     *     this._remove(o4);
     *     this._remove(o6);
     *     this._remove(o7);
     *     this._add(n2);
     *     this._add(n3);
     *     this._add(n7);
     *     this._add(n8);
     */
    _executeMultiple() {
        const oldArr = this._old;
        const newArr = this._new;
        const oldDataIndexMap = {};
        const newDataIndexMap = {};
        const oldDataKeyArr = [];
        const newDataKeyArr = [];
        this._initIndexMap(oldArr, oldDataIndexMap, oldDataKeyArr, '_oldKeyGetter');
        this._initIndexMap(newArr, newDataIndexMap, newDataKeyArr, '_newKeyGetter');
        for (let i = 0; i < oldDataKeyArr.length; i++) {
            const oldKey = oldDataKeyArr[i];
            const oldIdxMapVal = oldDataIndexMap[oldKey];
            const newIdxMapVal = newDataIndexMap[oldKey];
            const oldIdxMapValLen = dataIndexMapValueLength(oldIdxMapVal);
            const newIdxMapValLen = dataIndexMapValueLength(newIdxMapVal);
            if (oldIdxMapValLen > 1 && newIdxMapValLen === 1) {
                this._updateManyToOne && this._updateManyToOne(newIdxMapVal, oldIdxMapVal);
                newDataIndexMap[oldKey] = null;
            }
            else if (oldIdxMapValLen === 1 && newIdxMapValLen > 1) {
                this._updateOneToMany && this._updateOneToMany(newIdxMapVal, oldIdxMapVal);
                newDataIndexMap[oldKey] = null;
            }
            else if (oldIdxMapValLen === 1 && newIdxMapValLen === 1) {
                this._update && this._update(newIdxMapVal, oldIdxMapVal);
                newDataIndexMap[oldKey] = null;
            }
            else if (oldIdxMapValLen > 1 && newIdxMapValLen > 1) {
                this._updateManyToMany && this._updateManyToMany(newIdxMapVal, oldIdxMapVal);
                newDataIndexMap[oldKey] = null;
            }
            else if (oldIdxMapValLen > 1) {
                for (let i = 0; i < oldIdxMapValLen; i++) {
                    this._remove && this._remove(oldIdxMapVal[i]);
                }
            }
            else {
                this._remove && this._remove(oldIdxMapVal);
            }
        }
        this._performRestAdd(newDataKeyArr, newDataIndexMap);
    }
    _performRestAdd(newDataKeyArr, newDataIndexMap) {
        for (let i = 0; i < newDataKeyArr.length; i++) {
            const newKey = newDataKeyArr[i];
            const newIdxMapVal = newDataIndexMap[newKey];
            const idxMapValLen = dataIndexMapValueLength(newIdxMapVal);
            if (idxMapValLen > 1) {
                for (let j = 0; j < idxMapValLen; j++) {
                    this._add && this._add(newIdxMapVal[j]);
                }
            }
            else if (idxMapValLen === 1) {
                this._add && this._add(newIdxMapVal);
            }
            // Support both `newDataKeyArr` are duplication removed or not removed.
            newDataIndexMap[newKey] = null;
        }
    }
    _initIndexMap(arr, 
    // Can be null.
    map, 
    // In 'byKey', the output `keyArr` is duplication removed.
    // In 'byIndex', the output `keyArr` is not duplication removed and
    //     its indices are accurately corresponding to `arr`.
    keyArr, keyGetterName) {
        const cbModeMultiple = this._diffModeMultiple;
        for (let i = 0; i < arr.length; i++) {
            // Add prefix to avoid conflict with Object.prototype.
            const key = '_ec_' + this[keyGetterName](arr[i], i);
            if (!cbModeMultiple) {
                keyArr[i] = key;
            }
            if (!map) {
                continue;
            }
            const idxMapVal = map[key];
            const idxMapValLen = dataIndexMapValueLength(idxMapVal);
            if (idxMapValLen === 0) {
                // Simple optimize: in most cases, one index has one key,
                // do not need array.
                map[key] = i;
                if (cbModeMultiple) {
                    keyArr.push(key);
                }
            }
            else if (idxMapValLen === 1) {
                map[key] = [idxMapVal, i];
            }
            else {
                idxMapVal.push(i);
            }
        }
    }
}
export default DataDiffer;
