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
// TODO
// ??? refactor? check the outer usage of data provider.
// merge with defaultDimValueGetter?
import { isTypedArray, extend, assert, each, isObject, bind } from 'zrender/src/core/util';
import { getDataItemValue } from '../../util/model';
import { createSourceFromSeriesDataOption, isSourceInstance } from '../Source';
import { SOURCE_FORMAT_ORIGINAL, SOURCE_FORMAT_OBJECT_ROWS, SOURCE_FORMAT_KEYED_COLUMNS, SOURCE_FORMAT_TYPED_ARRAY, SOURCE_FORMAT_ARRAY_ROWS, SERIES_LAYOUT_BY_COLUMN, SERIES_LAYOUT_BY_ROW } from '../../util/types';
let providerMethods;
let mountMethods;
/**
 * If normal array used, mutable chunk size is supported.
 * If typed array used, chunk size must be fixed.
 */
export class DefaultDataProvider {
    constructor(sourceParam, dimSize) {
        // let source: Source;
        const source = !isSourceInstance(sourceParam)
            ? createSourceFromSeriesDataOption(sourceParam)
            : sourceParam;
        // declare source is Source;
        this._source = source;
        const data = this._data = source.data;
        // Typed array. TODO IE10+?
        if (source.sourceFormat === SOURCE_FORMAT_TYPED_ARRAY) {
            if (__DEV__) {
                if (dimSize == null) {
                    throw new Error('Typed array data must specify dimension size');
                }
            }
            this._offset = 0;
            this._dimSize = dimSize;
            this._data = data;
        }
        mountMethods(this, data, source);
    }
    getSource() {
        return this._source;
    }
    count() {
        return 0;
    }
    getItem(idx, out) {
        return;
    }
    appendData(newData) {
    }
    clean() {
    }
}
DefaultDataProvider.protoInitialize = (function () {
    // PENDING: To avoid potential incompat (e.g., prototype
    // is visited somewhere), still init them on prototype.
    const proto = DefaultDataProvider.prototype;
    proto.pure = false;
    proto.persistent = true;
})();
DefaultDataProvider.internalField = (function () {
    mountMethods = function (provider, data, source) {
        const sourceFormat = source.sourceFormat;
        const seriesLayoutBy = source.seriesLayoutBy;
        const startIndex = source.startIndex;
        const dimsDef = source.dimensionsDefine;
        const methods = providerMethods[getMethodMapKey(sourceFormat, seriesLayoutBy)];
        if (__DEV__) {
            assert(methods, 'Invalide sourceFormat: ' + sourceFormat);
        }
        extend(provider, methods);
        if (sourceFormat === SOURCE_FORMAT_TYPED_ARRAY) {
            provider.getItem = getItemForTypedArray;
            provider.count = countForTypedArray;
            provider.fillStorage = fillStorageForTypedArray;
        }
        else {
            const rawItemGetter = getRawSourceItemGetter(sourceFormat, seriesLayoutBy);
            provider.getItem = bind(rawItemGetter, null, data, startIndex, dimsDef);
            const rawCounter = getRawSourceDataCounter(sourceFormat, seriesLayoutBy);
            provider.count = bind(rawCounter, null, data, startIndex, dimsDef);
        }
    };
    const getItemForTypedArray = function (idx, out) {
        idx = idx - this._offset;
        out = out || [];
        const data = this._data;
        const dimSize = this._dimSize;
        const offset = dimSize * idx;
        for (let i = 0; i < dimSize; i++) {
            out[i] = data[offset + i];
        }
        return out;
    };
    const fillStorageForTypedArray = function (start, end, storage, extent) {
        const data = this._data;
        const dimSize = this._dimSize;
        for (let dim = 0; dim < dimSize; dim++) {
            const dimExtent = extent[dim];
            let min = dimExtent[0] == null ? Infinity : dimExtent[0];
            let max = dimExtent[1] == null ? -Infinity : dimExtent[1];
            const count = end - start;
            const arr = storage[dim];
            for (let i = 0; i < count; i++) {
                // appendData with TypedArray will always do replace in provider.
                const val = data[i * dimSize + dim];
                arr[start + i] = val;
                val < min && (min = val);
                val > max && (max = val);
            }
            dimExtent[0] = min;
            dimExtent[1] = max;
        }
    };
    const countForTypedArray = function () {
        return this._data ? (this._data.length / this._dimSize) : 0;
    };
    providerMethods = {
        [SOURCE_FORMAT_ARRAY_ROWS + '_' + SERIES_LAYOUT_BY_COLUMN]: {
            pure: true,
            appendData: appendDataSimply
        },
        [SOURCE_FORMAT_ARRAY_ROWS + '_' + SERIES_LAYOUT_BY_ROW]: {
            pure: true,
            appendData: function () {
                throw new Error('Do not support appendData when set seriesLayoutBy: "row".');
            }
        },
        [SOURCE_FORMAT_OBJECT_ROWS]: {
            pure: true,
            appendData: appendDataSimply
        },
        [SOURCE_FORMAT_KEYED_COLUMNS]: {
            pure: true,
            appendData: function (newData) {
                const data = this._data;
                each(newData, function (newCol, key) {
                    const oldCol = data[key] || (data[key] = []);
                    for (let i = 0; i < (newCol || []).length; i++) {
                        oldCol.push(newCol[i]);
                    }
                });
            }
        },
        [SOURCE_FORMAT_ORIGINAL]: {
            appendData: appendDataSimply
        },
        [SOURCE_FORMAT_TYPED_ARRAY]: {
            persistent: false,
            pure: true,
            appendData: function (newData) {
                if (__DEV__) {
                    assert(isTypedArray(newData), 'Added data must be TypedArray if data in initialization is TypedArray');
                }
                this._data = newData;
            },
            // Clean self if data is already used.
            clean: function () {
                // PENDING
                this._offset += this.count();
                this._data = null;
            }
        }
    };
    function appendDataSimply(newData) {
        for (let i = 0; i < newData.length; i++) {
            this._data.push(newData[i]);
        }
    }
})();
const getItemSimply = function (rawData, startIndex, dimsDef, idx) {
    return rawData[idx];
};
const rawSourceItemGetterMap = {
    [SOURCE_FORMAT_ARRAY_ROWS + '_' + SERIES_LAYOUT_BY_COLUMN]: function (rawData, startIndex, dimsDef, idx) {
        return rawData[idx + startIndex];
    },
    [SOURCE_FORMAT_ARRAY_ROWS + '_' + SERIES_LAYOUT_BY_ROW]: function (rawData, startIndex, dimsDef, idx, out) {
        idx += startIndex;
        const item = out || [];
        const data = rawData;
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            item[i] = row ? row[idx] : null;
        }
        return item;
    },
    [SOURCE_FORMAT_OBJECT_ROWS]: getItemSimply,
    [SOURCE_FORMAT_KEYED_COLUMNS]: function (rawData, startIndex, dimsDef, idx, out) {
        const item = out || [];
        for (let i = 0; i < dimsDef.length; i++) {
            const dimName = dimsDef[i].name;
            if (__DEV__) {
                if (dimName == null) {
                    throw new Error();
                }
            }
            const col = rawData[dimName];
            item[i] = col ? col[idx] : null;
        }
        return item;
    },
    [SOURCE_FORMAT_ORIGINAL]: getItemSimply
};
export function getRawSourceItemGetter(sourceFormat, seriesLayoutBy) {
    const method = rawSourceItemGetterMap[getMethodMapKey(sourceFormat, seriesLayoutBy)];
    if (__DEV__) {
        assert(method, 'Do not support get item on "' + sourceFormat + '", "' + seriesLayoutBy + '".');
    }
    return method;
}
const countSimply = function (rawData, startIndex, dimsDef) {
    return rawData.length;
};
const rawSourceDataCounterMap = {
    [SOURCE_FORMAT_ARRAY_ROWS + '_' + SERIES_LAYOUT_BY_COLUMN]: function (rawData, startIndex, dimsDef) {
        return Math.max(0, rawData.length - startIndex);
    },
    [SOURCE_FORMAT_ARRAY_ROWS + '_' + SERIES_LAYOUT_BY_ROW]: function (rawData, startIndex, dimsDef) {
        const row = rawData[0];
        return row ? Math.max(0, row.length - startIndex) : 0;
    },
    [SOURCE_FORMAT_OBJECT_ROWS]: countSimply,
    [SOURCE_FORMAT_KEYED_COLUMNS]: function (rawData, startIndex, dimsDef) {
        const dimName = dimsDef[0].name;
        if (__DEV__) {
            if (dimName == null) {
                throw new Error();
            }
        }
        const col = rawData[dimName];
        return col ? col.length : 0;
    },
    [SOURCE_FORMAT_ORIGINAL]: countSimply
};
export function getRawSourceDataCounter(sourceFormat, seriesLayoutBy) {
    const method = rawSourceDataCounterMap[getMethodMapKey(sourceFormat, seriesLayoutBy)];
    if (__DEV__) {
        assert(method, 'Do not suppport count on "' + sourceFormat + '", "' + seriesLayoutBy + '".');
    }
    return method;
}
const getRawValueSimply = function (dataItem, dimIndex, property) {
    return dataItem[dimIndex];
};
const rawSourceValueGetterMap = {
    [SOURCE_FORMAT_ARRAY_ROWS]: getRawValueSimply,
    [SOURCE_FORMAT_OBJECT_ROWS]: function (dataItem, dimIndex, property) {
        return dataItem[property];
    },
    [SOURCE_FORMAT_KEYED_COLUMNS]: getRawValueSimply,
    [SOURCE_FORMAT_ORIGINAL]: function (dataItem, dimIndex, property) {
        // FIXME: In some case (markpoint in geo (geo-map.html)),
        // dataItem is {coord: [...]}
        const value = getDataItemValue(dataItem);
        return !(value instanceof Array)
            ? value
            : value[dimIndex];
    },
    [SOURCE_FORMAT_TYPED_ARRAY]: getRawValueSimply
};
export function getRawSourceValueGetter(sourceFormat) {
    const method = rawSourceValueGetterMap[sourceFormat];
    if (__DEV__) {
        assert(method, 'Do not suppport get value on "' + sourceFormat + '".');
    }
    return method;
}
function getMethodMapKey(sourceFormat, seriesLayoutBy) {
    return sourceFormat === SOURCE_FORMAT_ARRAY_ROWS
        ? sourceFormat + '_' + seriesLayoutBy
        : sourceFormat;
}
// ??? FIXME can these logic be more neat: getRawValue, getRawDataItem,
// Consider persistent.
// Caution: why use raw value to display on label or tooltip?
// A reason is to avoid format. For example time value we do not know
// how to format is expected. More over, if stack is used, calculated
// value may be 0.91000000001, which have brings trouble to display.
// TODO: consider how to treat null/undefined/NaN when display?
export function retrieveRawValue(data, dataIndex, 
// If dimIndex is null/undefined, return OptionDataItem.
// Otherwise, return OptionDataValue.
dim) {
    if (!data) {
        return;
    }
    // Consider data may be not persistent.
    const dataItem = data.getRawDataItem(dataIndex);
    if (dataItem == null) {
        return;
    }
    const store = data.getStore();
    const sourceFormat = store.getSource().sourceFormat;
    if (dim != null) {
        const dimIndex = data.getDimensionIndex(dim);
        const property = store.getDimensionProperty(dimIndex);
        return getRawSourceValueGetter(sourceFormat)(dataItem, dimIndex, property);
    }
    else {
        let result = dataItem;
        if (sourceFormat === SOURCE_FORMAT_ORIGINAL) {
            result = getDataItemValue(dataItem);
        }
        return result;
    }
}
/**
 * Compatible with some cases (in pie, map) like:
 * data: [{name: 'xx', value: 5, selected: true}, ...]
 * where only sourceFormat is 'original' and 'objectRows' supported.
 *
 * // TODO
 * Supported detail options in data item when using 'arrayRows'.
 *
 * @param data
 * @param dataIndex
 * @param attr like 'selected'
 */
export function retrieveRawAttr(data, dataIndex, attr) {
    if (!data) {
        return;
    }
    const sourceFormat = data.getStore().getSource().sourceFormat;
    if (sourceFormat !== SOURCE_FORMAT_ORIGINAL
        && sourceFormat !== SOURCE_FORMAT_OBJECT_ROWS) {
        return;
    }
    let dataItem = data.getRawDataItem(dataIndex);
    if (sourceFormat === SOURCE_FORMAT_ORIGINAL && !isObject(dataItem)) {
        dataItem = null;
    }
    if (dataItem) {
        return dataItem[attr];
    }
}
