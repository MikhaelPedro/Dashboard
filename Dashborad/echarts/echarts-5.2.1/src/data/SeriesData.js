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
/* global Int32Array */
import * as zrUtil from 'zrender/src/core/util';
import Model from '../model/Model';
import DataDiffer from './DataDiffer';
import { DefaultDataProvider } from './helper/dataProvider';
import { summarizeDimensions } from './helper/dimensionHelper';
import SeriesDimensionDefine from './SeriesDimensionDefine';
import { SOURCE_FORMAT_TYPED_ARRAY, SOURCE_FORMAT_ORIGINAL } from '../util/types';
import { convertOptionIdName, isDataItemOption } from '../util/model';
import { setCommonECData } from '../util/innerStore';
import { isSourceInstance } from './Source';
import DataStore from './DataStore';
import { isSeriesDataSchema } from './helper/SeriesDataSchema';
const isObject = zrUtil.isObject;
const map = zrUtil.map;
const CtorInt32Array = typeof Int32Array === 'undefined' ? Array : Int32Array;
// Use prefix to avoid index to be the same as otherIdList[idx],
// which will cause weird udpate animation.
const ID_PREFIX = 'e\0\0';
const INDEX_NOT_FOUND = -1;
// type SeriesDimensionIndex = DimensionIndex;
const TRANSFERABLE_PROPERTIES = [
    'hasItemOption', '_nameList', '_idList', '_invertedIndicesMap',
    '_dimSummary', 'userOutput',
    '_rawData', '_dimValueGetter',
    '_nameDimIdx', '_idDimIdx', '_nameRepeatCount'
];
const CLONE_PROPERTIES = [
    '_approximateExtent'
];
// -----------------------------
// Internal method declarations:
// -----------------------------
let prepareInvertedIndex;
let getId;
let getIdNameFromStore;
let normalizeDimensions;
let transferProperties;
let cloneListForMapAndSample;
let makeIdFromName;
class SeriesData {
    /**
     * @param dimensionsInput.dimensions
     *        For example, ['someDimName', {name: 'someDimName', type: 'someDimType'}, ...].
     *        Dimensions should be concrete names like x, y, z, lng, lat, angle, radius
     */
    constructor(dimensionsInput, hostModel) {
        this.type = 'list';
        this._dimOmitted = false;
        this._nameList = [];
        this._idList = [];
        // Models of data option is stored sparse for optimizing memory cost
        // Never used yet (not used yet).
        // private _optionModels: Model[] = [];
        // Global visual properties after visual coding
        this._visual = {};
        // Globel layout properties.
        this._layout = {};
        // Item visual properties after visual coding
        this._itemVisuals = [];
        // Item layout properties after layout
        this._itemLayouts = [];
        // Graphic elemnents
        this._graphicEls = [];
        // key: dim, value: extent
        this._approximateExtent = {};
        this._calculationInfo = {};
        // Having detected that there is data item is non primitive type
        // (in type `OptionDataItemObject`).
        // Like `data: [ { value: xx, itemStyle: {...} }, ...]`
        // At present it only happen in `SOURCE_FORMAT_ORIGINAL`.
        this.hasItemOption = false;
        // Methods that create a new list based on this list should be listed here.
        // Notice that those method should `RETURN` the new list.
        this.TRANSFERABLE_METHODS = ['cloneShallow', 'downSample', 'lttbDownSample', 'map'];
        // Methods that change indices of this list should be listed here.
        this.CHANGABLE_METHODS = ['filterSelf', 'selectRange'];
        this.DOWNSAMPLE_METHODS = ['downSample', 'lttbDownSample'];
        let dimensions;
        let assignStoreDimIdx = false;
        if (isSeriesDataSchema(dimensionsInput)) {
            dimensions = dimensionsInput.dimensions;
            this._dimOmitted = dimensionsInput.isDimensionOmitted();
            this._schema = dimensionsInput;
        }
        else {
            assignStoreDimIdx = true;
            dimensions = dimensionsInput;
        }
        dimensions = dimensions || ['x', 'y'];
        const dimensionInfos = {};
        const dimensionNames = [];
        const invertedIndicesMap = {};
        let needsHasOwn = false;
        const emptyObj = {};
        for (let i = 0; i < dimensions.length; i++) {
            // Use the original dimensions[i], where other flag props may exists.
            const dimInfoInput = dimensions[i];
            const dimensionInfo = zrUtil.isString(dimInfoInput)
                ? new SeriesDimensionDefine({ name: dimInfoInput })
                : !(dimInfoInput instanceof SeriesDimensionDefine)
                    ? new SeriesDimensionDefine(dimInfoInput)
                    : dimInfoInput;
            const dimensionName = dimensionInfo.name;
            dimensionInfo.type = dimensionInfo.type || 'float';
            if (!dimensionInfo.coordDim) {
                dimensionInfo.coordDim = dimensionName;
                dimensionInfo.coordDimIndex = 0;
            }
            const otherDims = dimensionInfo.otherDims = dimensionInfo.otherDims || {};
            dimensionNames.push(dimensionName);
            dimensionInfos[dimensionName] = dimensionInfo;
            if (emptyObj[dimensionName] != null) {
                needsHasOwn = true;
            }
            if (dimensionInfo.createInvertedIndices) {
                invertedIndicesMap[dimensionName] = [];
            }
            if (otherDims.itemName === 0) {
                this._nameDimIdx = i;
            }
            if (otherDims.itemId === 0) {
                this._idDimIdx = i;
            }
            if (__DEV__) {
                zrUtil.assert(assignStoreDimIdx || dimensionInfo.storeDimIndex >= 0);
            }
            if (assignStoreDimIdx) {
                dimensionInfo.storeDimIndex = i;
            }
        }
        this.dimensions = dimensionNames;
        this._dimInfos = dimensionInfos;
        this._initGetDimensionInfo(needsHasOwn);
        this.hostModel = hostModel;
        this._invertedIndicesMap = invertedIndicesMap;
        if (this._dimOmitted) {
            const dimIdxToName = this._dimIdxToName = zrUtil.createHashMap();
            zrUtil.each(dimensionNames, dimName => {
                dimIdxToName.set(dimensionInfos[dimName].storeDimIndex, dimName);
            });
        }
    }
    /**
     *
     * Get concrete dimension name by dimension name or dimension index.
     * If input a dimension name, do not validate whether the dimension name exits.
     *
     * @caution
     * @param dim Must make sure the dimension is `SeriesDimensionLoose`.
     * Because only those dimensions will have auto-generated dimension names if not
     * have a user-specified name, and other dimensions will get a return of null/undefined.
     *
     * @notice Becuause of this reason, should better use `getDimensionIndex` instead, for examples:
     * ```js
     * const val = data.getStore().get(data.getDimensionIndex(dim), dataIdx);
     * ```
     *
     * @return Concrete dim name.
     */
    getDimension(dim) {
        let dimIdx = this._recognizeDimIndex(dim);
        if (dimIdx == null) {
            return dim;
        }
        dimIdx = dim;
        if (!this._dimOmitted) {
            return this.dimensions[dimIdx];
        }
        // Retrieve from series dimension definition becuase it probably contains
        // generated dimension name (like 'x', 'y').
        const dimName = this._dimIdxToName.get(dimIdx);
        if (dimName != null) {
            return dimName;
        }
        const sourceDimDef = this._schema.getSourceDimension(dimIdx);
        if (sourceDimDef) {
            return sourceDimDef.name;
        }
    }
    /**
     * Get dimension index in data store. Return -1 if not found.
     * Can be used to index value from getRawValue.
     */
    getDimensionIndex(dim) {
        const dimIdx = this._recognizeDimIndex(dim);
        if (dimIdx != null) {
            return dimIdx;
        }
        if (dim == null) {
            return -1;
        }
        const dimInfo = this._getDimInfo(dim);
        return dimInfo
            ? dimInfo.storeDimIndex
            : this._dimOmitted
                ? this._schema.getSourceDimensionIndex(dim)
                : -1;
    }
    /**
     * The meanings of the input parameter `dim`:
     *
     * + If dim is a number (e.g., `1`), it means the index of the dimension.
     *   For example, `getDimension(0)` will return 'x' or 'lng' or 'radius'.
     * + If dim is a number-like string (e.g., `"1"`):
     *     + If there is the same concrete dim name defined in `series.dimensions` or `dataset.dimensions`,
     *        it means that concrete name.
     *     + If not, it will be converted to a number, which means the index of the dimension.
     *        (why? because of the backward compatbility. We have been tolerating number-like string in
     *        dimension setting, although now it seems that it is not a good idea.)
     *     For example, `visualMap[i].dimension: "1"` is the same meaning as `visualMap[i].dimension: 1`,
     *     if no dimension name is defined as `"1"`.
     * + If dim is a not-number-like string, it means the concrete dim name.
     *   For example, it can be be default name `"x"`, `"y"`, `"z"`, `"lng"`, `"lat"`, `"angle"`, `"radius"`,
     *   or customized in `dimensions` property of option like `"age"`.
     *
     * @return recogonized `DimensionIndex`. Otherwise return null/undefined (means that dim is `DimensionName`).
     */
    _recognizeDimIndex(dim) {
        if (typeof dim === 'number'
            // If being a number-like string but not being defined as a dimension name.
            || (dim != null
                && !isNaN(dim)
                && !this._getDimInfo(dim)
                && (!this._dimOmitted || this._schema.getSourceDimensionIndex(dim) < 0))) {
            return +dim;
        }
    }
    _getStoreDimIndex(dim) {
        const dimIdx = this.getDimensionIndex(dim);
        if (__DEV__) {
            if (dimIdx == null) {
                throw new Error('Unkown dimension ' + dim);
            }
        }
        return dimIdx;
    }
    /**
     * Get type and calculation info of particular dimension
     * @param dim
     *        Dimension can be concrete names like x, y, z, lng, lat, angle, radius
     *        Or a ordinal number. For example getDimensionInfo(0) will return 'x' or 'lng' or 'radius'
     */
    getDimensionInfo(dim) {
        // Do not clone, because there may be categories in dimInfo.
        return this._getDimInfo(this.getDimension(dim));
    }
    _initGetDimensionInfo(needsHasOwn) {
        const dimensionInfos = this._dimInfos;
        this._getDimInfo = needsHasOwn
            ? dimName => (dimensionInfos.hasOwnProperty(dimName) ? dimensionInfos[dimName] : undefined)
            : dimName => dimensionInfos[dimName];
    }
    /**
     * concrete dimension name list on coord.
     */
    getDimensionsOnCoord() {
        return this._dimSummary.dataDimsOnCoord.slice();
    }
    mapDimension(coordDim, idx) {
        const dimensionsSummary = this._dimSummary;
        if (idx == null) {
            return dimensionsSummary.encodeFirstDimNotExtra[coordDim];
        }
        const dims = dimensionsSummary.encode[coordDim];
        return dims ? dims[idx] : null;
    }
    mapDimensionsAll(coordDim) {
        const dimensionsSummary = this._dimSummary;
        const dims = dimensionsSummary.encode[coordDim];
        return (dims || []).slice();
    }
    getStore() {
        return this._store;
    }
    /**
     * Initialize from data
     * @param data source or data or data store.
     * @param nameList The name of a datum is used on data diff and
     *        default label/tooltip.
     *        A name can be specified in encode.itemName,
     *        or dataItem.name (only for series option data),
     *        or provided in nameList from outside.
     */
    initData(data, nameList, dimValueGetter) {
        let store;
        if (data instanceof DataStore) {
            store = data;
        }
        if (!store) {
            const dimensions = this.dimensions;
            const provider = (isSourceInstance(data) || zrUtil.isArrayLike(data))
                ? new DefaultDataProvider(data, dimensions.length)
                : data;
            store = new DataStore();
            const dimensionInfos = map(dimensions, dimName => ({
                type: this._dimInfos[dimName].type,
                property: dimName
            }));
            store.initData(provider, dimensionInfos, dimValueGetter);
        }
        this._store = store;
        // Reset
        this._nameList = (nameList || []).slice();
        this._idList = [];
        this._nameRepeatCount = {};
        this._doInit(0, store.count());
        // Cache summary info for fast visit. See "dimensionHelper".
        // Needs to be initialized after store is prepared.
        this._dimSummary = summarizeDimensions(this, this._schema);
        this.userOutput = this._dimSummary.userOutput;
    }
    /**
     * Caution: Can be only called on raw data (before `this._indices` created).
     */
    appendData(data) {
        const range = this._store.appendData(data);
        this._doInit(range[0], range[1]);
    }
    /**
     * Caution: Can be only called on raw data (before `this._indices` created).
     * This method does not modify `rawData` (`dataProvider`), but only
     * add values to store.
     *
     * The final count will be increased by `Math.max(values.length, names.length)`.
     *
     * @param values That is the SourceType: 'arrayRows', like
     *        [
     *            [12, 33, 44],
     *            [NaN, 43, 1],
     *            ['-', 'asdf', 0]
     *        ]
     *        Each item is exaclty cooresponding to a dimension.
     */
    appendValues(values, names) {
        const { start, end } = this._store.appendValues(values, names.length);
        const shouldMakeIdFromName = this._shouldMakeIdFromName();
        this._updateOrdinalMeta();
        if (names) {
            for (let idx = start; idx < end; idx++) {
                const sourceIdx = idx - start;
                this._nameList[idx] = names[sourceIdx];
                if (shouldMakeIdFromName) {
                    makeIdFromName(this, idx);
                }
            }
        }
    }
    _updateOrdinalMeta() {
        const store = this._store;
        const dimensions = this.dimensions;
        for (let i = 0; i < dimensions.length; i++) {
            const dimInfo = this._dimInfos[dimensions[i]];
            if (dimInfo.ordinalMeta) {
                store.collectOrdinalMeta(dimInfo.storeDimIndex, dimInfo.ordinalMeta);
            }
        }
    }
    _shouldMakeIdFromName() {
        const provider = this._store.getProvider();
        return this._idDimIdx == null
            && provider.getSource().sourceFormat !== SOURCE_FORMAT_TYPED_ARRAY
            && !provider.fillStorage;
    }
    _doInit(start, end) {
        if (start >= end) {
            return;
        }
        const store = this._store;
        const provider = store.getProvider();
        this._updateOrdinalMeta();
        const nameList = this._nameList;
        const idList = this._idList;
        const sourceFormat = provider.getSource().sourceFormat;
        const isFormatOriginal = sourceFormat === SOURCE_FORMAT_ORIGINAL;
        // Each data item is value
        // [1, 2]
        // 2
        // Bar chart, line chart which uses category axis
        // only gives the 'y' value. 'x' value is the indices of category
        // Use a tempValue to normalize the value to be a (x, y) value
        // If dataItem is {name: ...} or {id: ...}, it has highest priority.
        // This kind of ids and names are always stored `_nameList` and `_idList`.
        if (isFormatOriginal && !provider.pure) {
            const sharedDataItem = [];
            for (let idx = start; idx < end; idx++) {
                // NOTICE: Try not to write things into dataItem
                const dataItem = provider.getItem(idx, sharedDataItem);
                if (!this.hasItemOption && isDataItemOption(dataItem)) {
                    this.hasItemOption = true;
                }
                if (dataItem) {
                    const itemName = dataItem.name;
                    if (nameList[idx] == null && itemName != null) {
                        nameList[idx] = convertOptionIdName(itemName, null);
                    }
                    const itemId = dataItem.id;
                    if (idList[idx] == null && itemId != null) {
                        idList[idx] = convertOptionIdName(itemId, null);
                    }
                }
            }
        }
        if (this._shouldMakeIdFromName()) {
            for (let idx = start; idx < end; idx++) {
                makeIdFromName(this, idx);
            }
        }
        prepareInvertedIndex(this);
    }
    /**
     * PENDING: In fact currently this function is only used to short-circuit
     * the calling of `scale.unionExtentFromData` when data have been filtered by modules
     * like "dataZoom". `scale.unionExtentFromData` is used to calculate data extent for series on
     * an axis, but if a "axis related data filter module" is used, the extent of the axis have
     * been fixed and no need to calling `scale.unionExtentFromData` actually.
     * But if we add "custom data filter" in future, which is not "axis related", this method may
     * be still needed.
     *
     * Optimize for the scenario that data is filtered by a given extent.
     * Consider that if data amount is more than hundreds of thousand,
     * extent calculation will cost more than 10ms and the cache will
     * be erased because of the filtering.
     */
    getApproximateExtent(dim) {
        return this._approximateExtent[dim] || this._store.getDataExtent(this._getStoreDimIndex(dim));
    }
    /**
     * Calculate extent on a filtered data might be time consuming.
     * Approximate extent is only used for: calculte extent of filtered data outside.
     */
    setApproximateExtent(extent, dim) {
        dim = this.getDimension(dim);
        this._approximateExtent[dim] = extent.slice();
    }
    getCalculationInfo(key) {
        return this._calculationInfo[key];
    }
    setCalculationInfo(key, value) {
        isObject(key)
            ? zrUtil.extend(this._calculationInfo, key)
            : (this._calculationInfo[key] = value);
    }
    /**
     * @return Never be null/undefined. `number` will be converted to string. Becuase:
     * In most cases, name is used in display, where returning a string is more convenient.
     * In other cases, name is used in query (see `indexOfName`), where we can keep the
     * rule that name `2` equals to name `'2'`.
     */
    getName(idx) {
        const rawIndex = this.getRawIndex(idx);
        let name = this._nameList[rawIndex];
        if (name == null && this._nameDimIdx != null) {
            name = getIdNameFromStore(this, this._nameDimIdx, rawIndex);
        }
        if (name == null) {
            name = '';
        }
        return name;
    }
    _getCategory(dimIdx, idx) {
        const ordinal = this._store.get(dimIdx, idx);
        const ordinalMeta = this._store.getOrdinalMeta(dimIdx);
        if (ordinalMeta) {
            return ordinalMeta.categories[ordinal];
        }
        return ordinal;
    }
    /**
     * @return Never null/undefined. `number` will be converted to string. Becuase:
     * In all cases having encountered at present, id is used in making diff comparison, which
     * are usually based on hash map. We can keep the rule that the internal id are always string
     * (treat `2` is the same as `'2'`) to make the related logic simple.
     */
    getId(idx) {
        return getId(this, this.getRawIndex(idx));
    }
    count() {
        return this._store.count();
    }
    /**
     * Get value. Return NaN if idx is out of range.
     *
     * @notice Should better to use `data.getStore().get(dimIndex, dataIdx)` instead.
     */
    get(dim, idx) {
        const store = this._store;
        const dimInfo = this._dimInfos[dim];
        if (dimInfo) {
            return store.get(dimInfo.storeDimIndex, idx);
        }
    }
    /**
     * @notice Should better to use `data.getStore().getByRawIndex(dimIndex, dataIdx)` instead.
     */
    getByRawIndex(dim, rawIdx) {
        const store = this._store;
        const dimInfo = this._dimInfos[dim];
        if (dimInfo) {
            return store.getByRawIndex(dimInfo.storeDimIndex, rawIdx);
        }
    }
    getIndices() {
        return this._store.getIndices();
    }
    getDataExtent(dim) {
        return this._store.getDataExtent(this._getStoreDimIndex(dim));
    }
    getSum(dim) {
        return this._store.getSum(this._getStoreDimIndex(dim));
    }
    getMedian(dim) {
        return this._store.getMedian(this._getStoreDimIndex(dim));
    }
    getValues(dimensions, idx) {
        const store = this._store;
        return zrUtil.isArray(dimensions)
            ? store.getValues(map(dimensions, dim => this._getStoreDimIndex(dim)), idx)
            : store.getValues(dimensions);
    }
    /**
     * If value is NaN. Inlcuding '-'
     * Only check the coord dimensions.
     */
    hasValue(idx) {
        const dataDimIndicesOnCoord = this._dimSummary.dataDimIndicesOnCoord;
        for (let i = 0, len = dataDimIndicesOnCoord.length; i < len; i++) {
            // Ordinal type originally can be string or number.
            // But when an ordinal type is used on coord, it can
            // not be string but only number. So we can also use isNaN.
            if (isNaN(this._store.get(dataDimIndicesOnCoord[i], idx))) {
                return false;
            }
        }
        return true;
    }
    /**
     * Retreive the index with given name
     */
    indexOfName(name) {
        for (let i = 0, len = this._store.count(); i < len; i++) {
            if (this.getName(i) === name) {
                return i;
            }
        }
        return -1;
    }
    getRawIndex(idx) {
        return this._store.getRawIndex(idx);
    }
    indexOfRawIndex(rawIndex) {
        return this._store.indexOfRawIndex(rawIndex);
    }
    /**
     * Only support the dimension which inverted index created.
     * Do not support other cases until required.
     * @param dim concrete dim
     * @param value ordinal index
     * @return rawIndex
     */
    rawIndexOf(dim, value) {
        const invertedIndices = dim && this._invertedIndicesMap[dim];
        if (__DEV__) {
            if (!invertedIndices) {
                throw new Error('Do not supported yet');
            }
        }
        const rawIndex = invertedIndices[value];
        if (rawIndex == null || isNaN(rawIndex)) {
            return INDEX_NOT_FOUND;
        }
        return rawIndex;
    }
    /**
     * Retreive the index of nearest value
     * @param dim
     * @param value
     * @param [maxDistance=Infinity]
     * @return If and only if multiple indices has
     *         the same value, they are put to the result.
     */
    indicesOfNearest(dim, value, maxDistance) {
        return this._store.indicesOfNearest(this._getStoreDimIndex(dim), value, maxDistance);
    }
    each(dims, cb, ctx) {
        'use strict';
        if (typeof dims === 'function') {
            ctx = cb;
            cb = dims;
            dims = [];
        }
        // ctxCompat just for compat echarts3
        const fCtx = (ctx || this);
        const dimIndices = map(normalizeDimensions(dims), this._getStoreDimIndex, this);
        this._store.each(dimIndices, (fCtx
            ? zrUtil.bind(cb, fCtx)
            : cb));
    }
    filterSelf(dims, cb, ctx) {
        'use strict';
        if (typeof dims === 'function') {
            ctx = cb;
            cb = dims;
            dims = [];
        }
        // ctxCompat just for compat echarts3
        const fCtx = (ctx || this);
        const dimIndices = map(normalizeDimensions(dims), this._getStoreDimIndex, this);
        this._store = this._store.filter(dimIndices, (fCtx
            ? zrUtil.bind(cb, fCtx)
            : cb));
        return this;
    }
    /**
     * Select data in range. (For optimization of filter)
     * (Manually inline code, support 5 million data filtering in data zoom.)
     */
    selectRange(range) {
        'use strict';
        const innerRange = {};
        const dims = zrUtil.keys(range);
        const dimIndices = [];
        zrUtil.each(dims, (dim) => {
            const dimIdx = this._getStoreDimIndex(dim);
            innerRange[dimIdx] = range[dim];
            dimIndices.push(dimIdx);
        });
        this._store = this._store.selectRange(innerRange);
        return this;
    }
    /* eslint-enable max-len */
    mapArray(dims, cb, ctx) {
        'use strict';
        if (typeof dims === 'function') {
            ctx = cb;
            cb = dims;
            dims = [];
        }
        // ctxCompat just for compat echarts3
        ctx = (ctx || this);
        const result = [];
        this.each(dims, function () {
            result.push(cb && cb.apply(this, arguments));
        }, ctx);
        return result;
    }
    map(dims, cb, ctx, ctxCompat) {
        'use strict';
        // ctxCompat just for compat echarts3
        const fCtx = (ctx || ctxCompat || this);
        const dimIndices = map(normalizeDimensions(dims), this._getStoreDimIndex, this);
        const list = cloneListForMapAndSample(this);
        list._store = this._store.map(dimIndices, fCtx ? zrUtil.bind(cb, fCtx) : cb);
        return list;
    }
    modify(dims, cb, ctx, ctxCompat) {
        // ctxCompat just for compat echarts3
        const fCtx = (ctx || ctxCompat || this);
        if (__DEV__) {
            zrUtil.each(normalizeDimensions(dims), dim => {
                const dimInfo = this.getDimensionInfo(dim);
                if (!dimInfo.isCalculationCoord) {
                    console.error('Danger: only stack dimension can be modified');
                }
            });
        }
        const dimIndices = map(normalizeDimensions(dims), this._getStoreDimIndex, this);
        // If do shallow clone here, if there are too many stacked series,
        // it still cost lots of memory, becuase `_store.dimensions` are not shared.
        // We should consider there probably be shallow clone happen in each sereis
        // in consequent filter/map.
        this._store.modify(dimIndices, fCtx ? zrUtil.bind(cb, fCtx) : cb);
    }
    /**
     * Large data down sampling on given dimension
     * @param sampleIndex Sample index for name and id
     */
    downSample(dimension, rate, sampleValue, sampleIndex) {
        const list = cloneListForMapAndSample(this);
        list._store = this._store.downSample(this._getStoreDimIndex(dimension), rate, sampleValue, sampleIndex);
        return list;
    }
    /**
     * Large data down sampling using largest-triangle-three-buckets
     * @param {string} valueDimension
     * @param {number} targetCount
     */
    lttbDownSample(valueDimension, rate) {
        const list = cloneListForMapAndSample(this);
        list._store = this._store.lttbDownSample(this._getStoreDimIndex(valueDimension), rate);
        return list;
    }
    getRawDataItem(idx) {
        return this._store.getRawDataItem(idx);
    }
    /**
     * Get model of one data item.
     */
    // TODO: Type of data item
    getItemModel(idx) {
        const hostModel = this.hostModel;
        const dataItem = this.getRawDataItem(idx);
        return new Model(dataItem, hostModel, hostModel && hostModel.ecModel);
    }
    /**
     * Create a data differ
     */
    diff(otherList) {
        const thisList = this;
        return new DataDiffer(otherList ? otherList.getStore().getIndices() : [], this.getStore().getIndices(), function (idx) {
            return getId(otherList, idx);
        }, function (idx) {
            return getId(thisList, idx);
        });
    }
    /**
     * Get visual property.
     */
    getVisual(key) {
        const visual = this._visual;
        return visual && visual[key];
    }
    setVisual(kvObj, val) {
        this._visual = this._visual || {};
        if (isObject(kvObj)) {
            zrUtil.extend(this._visual, kvObj);
        }
        else {
            this._visual[kvObj] = val;
        }
    }
    /**
     * Get visual property of single data item
     */
    // eslint-disable-next-line
    getItemVisual(idx, key) {
        const itemVisual = this._itemVisuals[idx];
        const val = itemVisual && itemVisual[key];
        if (val == null) {
            // Use global visual property
            return this.getVisual(key);
        }
        return val;
    }
    /**
     * If exists visual property of single data item
     */
    hasItemVisual() {
        return this._itemVisuals.length > 0;
    }
    /**
     * Make sure itemVisual property is unique
     */
    // TODO: use key to save visual to reduce memory.
    ensureUniqueItemVisual(idx, key) {
        const itemVisuals = this._itemVisuals;
        let itemVisual = itemVisuals[idx];
        if (!itemVisual) {
            itemVisual = itemVisuals[idx] = {};
        }
        let val = itemVisual[key];
        if (val == null) {
            val = this.getVisual(key);
            // TODO Performance?
            if (zrUtil.isArray(val)) {
                val = val.slice();
            }
            else if (isObject(val)) {
                val = zrUtil.extend({}, val);
            }
            itemVisual[key] = val;
        }
        return val;
    }
    // eslint-disable-next-line
    setItemVisual(idx, key, value) {
        const itemVisual = this._itemVisuals[idx] || {};
        this._itemVisuals[idx] = itemVisual;
        if (isObject(key)) {
            zrUtil.extend(itemVisual, key);
        }
        else {
            itemVisual[key] = value;
        }
    }
    /**
     * Clear itemVisuals and list visual.
     */
    clearAllVisual() {
        this._visual = {};
        this._itemVisuals = [];
    }
    setLayout(key, val) {
        if (isObject(key)) {
            for (const name in key) {
                if (key.hasOwnProperty(name)) {
                    this.setLayout(name, key[name]);
                }
            }
            return;
        }
        this._layout[key] = val;
    }
    /**
     * Get layout property.
     */
    getLayout(key) {
        return this._layout[key];
    }
    /**
     * Get layout of single data item
     */
    getItemLayout(idx) {
        return this._itemLayouts[idx];
    }
    /**
     * Set layout of single data item
     */
    setItemLayout(idx, layout, merge) {
        this._itemLayouts[idx] = merge
            ? zrUtil.extend(this._itemLayouts[idx] || {}, layout)
            : layout;
    }
    /**
     * Clear all layout of single data item
     */
    clearItemLayouts() {
        this._itemLayouts.length = 0;
    }
    /**
     * Set graphic element relative to data. It can be set as null
     */
    setItemGraphicEl(idx, el) {
        const seriesIndex = this.hostModel && this.hostModel.seriesIndex;
        setCommonECData(seriesIndex, this.dataType, idx, el);
        this._graphicEls[idx] = el;
    }
    getItemGraphicEl(idx) {
        return this._graphicEls[idx];
    }
    eachItemGraphicEl(cb, context) {
        zrUtil.each(this._graphicEls, function (el, idx) {
            if (el) {
                cb && cb.call(context, el, idx);
            }
        });
    }
    /**
     * Shallow clone a new list except visual and layout properties, and graph elements.
     * New list only change the indices.
     */
    cloneShallow(list) {
        if (!list) {
            list = new SeriesData(this._schema
                ? this._schema
                : map(this.dimensions, this._getDimInfo, this), this.hostModel);
        }
        transferProperties(list, this);
        list._store = this._store;
        return list;
    }
    /**
     * Wrap some method to add more feature
     */
    wrapMethod(methodName, injectFunction) {
        const originalMethod = this[methodName];
        if (typeof originalMethod !== 'function') {
            return;
        }
        this.__wrappedMethods = this.__wrappedMethods || [];
        this.__wrappedMethods.push(methodName);
        this[methodName] = function () {
            const res = originalMethod.apply(this, arguments);
            return injectFunction.apply(this, [res].concat(zrUtil.slice(arguments)));
        };
    }
}
// ----------------------------------------------------------
// A work around for internal method visiting private member.
// ----------------------------------------------------------
SeriesData.internalField = (function () {
    prepareInvertedIndex = function (data) {
        const invertedIndicesMap = data._invertedIndicesMap;
        zrUtil.each(invertedIndicesMap, function (invertedIndices, dim) {
            const dimInfo = data._dimInfos[dim];
            // Currently, only dimensions that has ordinalMeta can create inverted indices.
            const ordinalMeta = dimInfo.ordinalMeta;
            const store = data._store;
            if (ordinalMeta) {
                invertedIndices = invertedIndicesMap[dim] = new CtorInt32Array(ordinalMeta.categories.length);
                // The default value of TypedArray is 0. To avoid miss
                // mapping to 0, we should set it as INDEX_NOT_FOUND.
                for (let i = 0; i < invertedIndices.length; i++) {
                    invertedIndices[i] = INDEX_NOT_FOUND;
                }
                for (let i = 0; i < store.count(); i++) {
                    // Only support the case that all values are distinct.
                    invertedIndices[store.get(dimInfo.storeDimIndex, i)] = i;
                }
            }
        });
    };
    getIdNameFromStore = function (data, dimIdx, idx) {
        return convertOptionIdName(data._getCategory(dimIdx, idx), null);
    };
    /**
     * @see the comment of `List['getId']`.
     */
    getId = function (data, rawIndex) {
        let id = data._idList[rawIndex];
        if (id == null && data._idDimIdx != null) {
            id = getIdNameFromStore(data, data._idDimIdx, rawIndex);
        }
        if (id == null) {
            id = ID_PREFIX + rawIndex;
        }
        return id;
    };
    normalizeDimensions = function (dimensions) {
        if (!zrUtil.isArray(dimensions)) {
            dimensions = dimensions != null ? [dimensions] : [];
        }
        return dimensions;
    };
    /**
     * Data in excludeDimensions is copied, otherwise transfered.
     */
    cloneListForMapAndSample = function (original) {
        const list = new SeriesData(original._schema
            ? original._schema
            : map(original.dimensions, original._getDimInfo, original), original.hostModel);
        // FIXME If needs stackedOn, value may already been stacked
        transferProperties(list, original);
        return list;
    };
    transferProperties = function (target, source) {
        zrUtil.each(TRANSFERABLE_PROPERTIES.concat(source.__wrappedMethods || []), function (propName) {
            if (source.hasOwnProperty(propName)) {
                target[propName] = source[propName];
            }
        });
        target.__wrappedMethods = source.__wrappedMethods;
        zrUtil.each(CLONE_PROPERTIES, function (propName) {
            target[propName] = zrUtil.clone(source[propName]);
        });
        target._calculationInfo = zrUtil.extend({}, source._calculationInfo);
    };
    makeIdFromName = function (data, idx) {
        const nameList = data._nameList;
        const idList = data._idList;
        const nameDimIdx = data._nameDimIdx;
        const idDimIdx = data._idDimIdx;
        let name = nameList[idx];
        let id = idList[idx];
        if (name == null && nameDimIdx != null) {
            nameList[idx] = name = getIdNameFromStore(data, nameDimIdx, idx);
        }
        if (id == null && idDimIdx != null) {
            idList[idx] = id = getIdNameFromStore(data, idDimIdx, idx);
        }
        if (id == null && name != null) {
            const nameRepeatCount = data._nameRepeatCount;
            const nmCnt = nameRepeatCount[name] = (nameRepeatCount[name] || 0) + 1;
            id = name;
            if (nmCnt > 1) {
                id += '__ec__' + nmCnt;
            }
            idList[idx] = id;
        }
    };
})();
export default SeriesData;
