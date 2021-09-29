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
import { each, isObject, isArray, createHashMap, map, assert, isString, indexOf, isStringSafe } from 'zrender/src/core/util';
import env from 'zrender/src/core/env';
import { isNumeric, getRandomIdBase, getPrecision, round } from './number';
import { interpolateNumber } from 'zrender/src/animation/Animator';
import { warn } from './log';
/**
 * Make the name displayable. But we should
 * make sure it is not duplicated with user
 * specified name, so use '\0';
 */
const DUMMY_COMPONENT_NAME_PREFIX = 'series\0';
const INTERNAL_COMPONENT_ID_PREFIX = '\0_ec_\0';
/**
 * If value is not array, then translate it to array.
 * @param  {*} value
 * @return {Array} [value] or value
 */
export function normalizeToArray(value) {
    return value instanceof Array
        ? value
        : value == null
            ? []
            : [value];
}
/**
 * Sync default option between normal and emphasis like `position` and `show`
 * In case some one will write code like
 *     label: {
 *          show: false,
 *          position: 'outside',
 *          fontSize: 18
 *     },
 *     emphasis: {
 *          label: { show: true }
 *     }
 */
export function defaultEmphasis(opt, key, subOpts) {
    // Caution: performance sensitive.
    if (opt) {
        opt[key] = opt[key] || {};
        opt.emphasis = opt.emphasis || {};
        opt.emphasis[key] = opt.emphasis[key] || {};
        // Default emphasis option from normal
        for (let i = 0, len = subOpts.length; i < len; i++) {
            const subOptName = subOpts[i];
            if (!opt.emphasis[key].hasOwnProperty(subOptName)
                && opt[key].hasOwnProperty(subOptName)) {
                opt.emphasis[key][subOptName] = opt[key][subOptName];
            }
        }
    }
}
export const TEXT_STYLE_OPTIONS = [
    'fontStyle', 'fontWeight', 'fontSize', 'fontFamily',
    'rich', 'tag', 'color', 'textBorderColor', 'textBorderWidth',
    'width', 'height', 'lineHeight', 'align', 'verticalAlign', 'baseline',
    'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY',
    'textShadowColor', 'textShadowBlur', 'textShadowOffsetX', 'textShadowOffsetY',
    'backgroundColor', 'borderColor', 'borderWidth', 'borderRadius', 'padding'
];
// modelUtil.LABEL_OPTIONS = modelUtil.TEXT_STYLE_OPTIONS.concat([
//     'position', 'offset', 'rotate', 'origin', 'show', 'distance', 'formatter',
//     'fontStyle', 'fontWeight', 'fontSize', 'fontFamily',
//     // FIXME: deprecated, check and remove it.
//     'textStyle'
// ]);
/**
 * The method do not ensure performance.
 * data could be [12, 2323, {value: 223}, [1221, 23], {value: [2, 23]}]
 * This helper method retieves value from data.
 */
export function getDataItemValue(dataItem) {
    return (isObject(dataItem) && !isArray(dataItem) && !(dataItem instanceof Date))
        ? dataItem.value : dataItem;
}
/**
 * data could be [12, 2323, {value: 223}, [1221, 23], {value: [2, 23]}]
 * This helper method determine if dataItem has extra option besides value
 */
export function isDataItemOption(dataItem) {
    return isObject(dataItem)
        && !(dataItem instanceof Array);
    // // markLine data can be array
    // && !(dataItem[0] && isObject(dataItem[0]) && !(dataItem[0] instanceof Array));
}
;
/**
 * Mapping to existings for merge.
 *
 * Mode "normalMege":
 *     The mapping result (merge result) will keep the order of the existing
 *     component, rather than the order of new option. Because we should ensure
 *     some specified index reference (like xAxisIndex) keep work.
 *     And in most cases, "merge option" is used to update partial option but not
 *     be expected to change the order.
 *
 * Mode "replaceMege":
 *     (1) Only the id mapped components will be merged.
 *     (2) Other existing components (except internal compoonets) will be removed.
 *     (3) Other new options will be used to create new component.
 *     (4) The index of the existing compoents will not be modified.
 *     That means their might be "hole" after the removal.
 *     The new components are created first at those available index.
 *
 * Mode "replaceAll":
 *     This mode try to support that reproduce an echarts instance from another
 *     echarts instance (via `getOption`) in some simple cases.
 *     In this senario, the `result` index are exactly the consistent with the `newCmptOptions`,
 *     which ensures the compoennt index referring (like `xAxisIndex: ?`) corrent. That is,
 *     the "hole" in `newCmptOptions` will also be kept.
 *     On the contrary, other modes try best to eliminate holes.
 *     PENDING: This is an experimental mode yet.
 *
 * @return See the comment of <MappingResult>.
 */
export function mappingToExists(existings, newCmptOptions, mode) {
    const isNormalMergeMode = mode === 'normalMerge';
    const isReplaceMergeMode = mode === 'replaceMerge';
    const isReplaceAllMode = mode === 'replaceAll';
    existings = existings || [];
    newCmptOptions = (newCmptOptions || []).slice();
    const existingIdIdxMap = createHashMap();
    // Validate id and name on user input option.
    each(newCmptOptions, function (cmptOption, index) {
        if (!isObject(cmptOption)) {
            newCmptOptions[index] = null;
            return;
        }
        if (__DEV__) {
            // There is some legacy case that name is set as `false`.
            // But should work normally rather than throw error.
            if (cmptOption.id != null && !isValidIdOrName(cmptOption.id)) {
                warnInvalidateIdOrName(cmptOption.id);
            }
            if (cmptOption.name != null && !isValidIdOrName(cmptOption.name)) {
                warnInvalidateIdOrName(cmptOption.name);
            }
        }
    });
    const result = prepareResult(existings, existingIdIdxMap, mode);
    if (isNormalMergeMode || isReplaceMergeMode) {
        mappingById(result, existings, existingIdIdxMap, newCmptOptions);
    }
    if (isNormalMergeMode) {
        mappingByName(result, newCmptOptions);
    }
    if (isNormalMergeMode || isReplaceMergeMode) {
        mappingByIndex(result, newCmptOptions, isReplaceMergeMode);
    }
    else if (isReplaceAllMode) {
        mappingInReplaceAllMode(result, newCmptOptions);
    }
    makeIdAndName(result);
    // The array `result` MUST NOT contain elided items, otherwise the
    // forEach will ommit those items and result in incorrect result.
    return result;
}
function prepareResult(existings, existingIdIdxMap, mode) {
    const result = [];
    if (mode === 'replaceAll') {
        return result;
    }
    // Do not use native `map` to in case that the array `existings`
    // contains elided items, which will be ommited.
    for (let index = 0; index < existings.length; index++) {
        const existing = existings[index];
        // Because of replaceMerge, `existing` may be null/undefined.
        if (existing && existing.id != null) {
            existingIdIdxMap.set(existing.id, index);
        }
        // For non-internal-componnets:
        //     Mode "normalMerge": all existings kept.
        //     Mode "replaceMerge": all existing removed unless mapped by id.
        // For internal-components:
        //     go with "replaceMerge" approach in both mode.
        result.push({
            existing: (mode === 'replaceMerge' || isComponentIdInternal(existing))
                ? null
                : existing,
            newOption: null,
            keyInfo: null,
            brandNew: null
        });
    }
    return result;
}
function mappingById(result, existings, existingIdIdxMap, newCmptOptions) {
    // Mapping by id if specified.
    each(newCmptOptions, function (cmptOption, index) {
        if (!cmptOption || cmptOption.id == null) {
            return;
        }
        const optionId = makeComparableKey(cmptOption.id);
        const existingIdx = existingIdIdxMap.get(optionId);
        if (existingIdx != null) {
            const resultItem = result[existingIdx];
            assert(!resultItem.newOption, 'Duplicated option on id "' + optionId + '".');
            resultItem.newOption = cmptOption;
            // In both mode, if id matched, new option will be merged to
            // the existings rather than creating new component model.
            resultItem.existing = existings[existingIdx];
            newCmptOptions[index] = null;
        }
    });
}
function mappingByName(result, newCmptOptions) {
    // Mapping by name if specified.
    each(newCmptOptions, function (cmptOption, index) {
        if (!cmptOption || cmptOption.name == null) {
            return;
        }
        for (let i = 0; i < result.length; i++) {
            const existing = result[i].existing;
            if (!result[i].newOption // Consider name: two map to one.
                // Can not match when both ids existing but different.
                && existing
                && (existing.id == null || cmptOption.id == null)
                && !isComponentIdInternal(cmptOption)
                && !isComponentIdInternal(existing)
                && keyExistAndEqual('name', existing, cmptOption)) {
                result[i].newOption = cmptOption;
                newCmptOptions[index] = null;
                return;
            }
        }
    });
}
function mappingByIndex(result, newCmptOptions, brandNew) {
    each(newCmptOptions, function (cmptOption) {
        if (!cmptOption) {
            return;
        }
        // Find the first place that not mapped by id and not internal component (consider the "hole").
        let resultItem;
        let nextIdx = 0;
        while (
        // Be `!resultItem` only when `nextIdx >= result.length`.
        (resultItem = result[nextIdx])
            // (1) Existing models that already have id should be able to mapped to. Because
            // after mapping performed, model will always be assigned with an id if user not given.
            // After that all models have id.
            // (2) If new option has id, it can only set to a hole or append to the last. It should
            // not be merged to the existings with different id. Because id should not be overwritten.
            // (3) Name can be overwritten, because axis use name as 'show label text'.
            && (resultItem.newOption
                || isComponentIdInternal(resultItem.existing)
                || (
                // In mode "replaceMerge", here no not-mapped-non-internal-existing.
                resultItem.existing
                    && cmptOption.id != null
                    && !keyExistAndEqual('id', cmptOption, resultItem.existing)))) {
            nextIdx++;
        }
        if (resultItem) {
            resultItem.newOption = cmptOption;
            resultItem.brandNew = brandNew;
        }
        else {
            result.push({
                newOption: cmptOption,
                brandNew: brandNew,
                existing: null,
                keyInfo: null
            });
        }
        nextIdx++;
    });
}
function mappingInReplaceAllMode(result, newCmptOptions) {
    each(newCmptOptions, function (cmptOption) {
        // The feature "reproduce" requires "hole" will also reproduced
        // in case that compoennt index referring are broken.
        result.push({
            newOption: cmptOption,
            brandNew: true,
            existing: null,
            keyInfo: null
        });
    });
}
/**
 * Make id and name for mapping result (result of mappingToExists)
 * into `keyInfo` field.
 */
function makeIdAndName(mapResult) {
    // We use this id to hash component models and view instances
    // in echarts. id can be specified by user, or auto generated.
    // The id generation rule ensures new view instance are able
    // to mapped to old instance when setOption are called in
    // no-merge mode. So we generate model id by name and plus
    // type in view id.
    // name can be duplicated among components, which is convenient
    // to specify multi components (like series) by one name.
    // Ensure that each id is distinct.
    const idMap = createHashMap();
    each(mapResult, function (item) {
        const existing = item.existing;
        existing && idMap.set(existing.id, item);
    });
    each(mapResult, function (item) {
        const opt = item.newOption;
        // Force ensure id not duplicated.
        assert(!opt || opt.id == null || !idMap.get(opt.id) || idMap.get(opt.id) === item, 'id duplicates: ' + (opt && opt.id));
        opt && opt.id != null && idMap.set(opt.id, item);
        !item.keyInfo && (item.keyInfo = {});
    });
    // Make name and id.
    each(mapResult, function (item, index) {
        const existing = item.existing;
        const opt = item.newOption;
        const keyInfo = item.keyInfo;
        if (!isObject(opt)) {
            return;
        }
        // name can be overwitten. Consider case: axis.name = '20km'.
        // But id generated by name will not be changed, which affect
        // only in that case: setOption with 'not merge mode' and view
        // instance will be recreated, which can be accepted.
        keyInfo.name = opt.name != null
            ? makeComparableKey(opt.name)
            : existing
                ? existing.name
                // Avoid diffferent series has the same name,
                // because name may be used like in color pallet.
                : DUMMY_COMPONENT_NAME_PREFIX + index;
        if (existing) {
            keyInfo.id = makeComparableKey(existing.id);
        }
        else if (opt.id != null) {
            keyInfo.id = makeComparableKey(opt.id);
        }
        else {
            // Consider this situatoin:
            //  optionA: [{name: 'a'}, {name: 'a'}, {..}]
            //  optionB [{..}, {name: 'a'}, {name: 'a'}]
            // Series with the same name between optionA and optionB
            // should be mapped.
            let idNum = 0;
            do {
                keyInfo.id = '\0' + keyInfo.name + '\0' + idNum++;
            } while (idMap.get(keyInfo.id));
        }
        idMap.set(keyInfo.id, item);
    });
}
function keyExistAndEqual(attr, obj1, obj2) {
    const key1 = convertOptionIdName(obj1[attr], null);
    const key2 = convertOptionIdName(obj2[attr], null);
    // See `MappingExistingItem`. `id` and `name` trade string equals to number.
    return key1 != null && key2 != null && key1 === key2;
}
/**
 * @return return null if not exist.
 */
function makeComparableKey(val) {
    if (__DEV__) {
        if (val == null) {
            throw new Error();
        }
    }
    return convertOptionIdName(val, '');
}
export function convertOptionIdName(idOrName, defaultValue) {
    if (idOrName == null) {
        return defaultValue;
    }
    const type = typeof idOrName;
    return type === 'string'
        ? idOrName
        : (type === 'number' || isStringSafe(idOrName))
            ? idOrName + ''
            : defaultValue;
}
function warnInvalidateIdOrName(idOrName) {
    if (__DEV__) {
        warn('`' + idOrName + '` is invalid id or name. Must be a string or number.');
    }
}
function isValidIdOrName(idOrName) {
    return isStringSafe(idOrName) || isNumeric(idOrName);
}
export function isNameSpecified(componentModel) {
    const name = componentModel.name;
    // Is specified when `indexOf` get -1 or > 0.
    return !!(name && name.indexOf(DUMMY_COMPONENT_NAME_PREFIX));
}
/**
 * @public
 * @param {Object} cmptOption
 * @return {boolean}
 */
export function isComponentIdInternal(cmptOption) {
    return cmptOption
        && cmptOption.id != null
        && makeComparableKey(cmptOption.id).indexOf(INTERNAL_COMPONENT_ID_PREFIX) === 0;
}
export function makeInternalComponentId(idSuffix) {
    return INTERNAL_COMPONENT_ID_PREFIX + idSuffix;
}
export function setComponentTypeToKeyInfo(mappingResult, mainType, componentModelCtor) {
    // Set mainType and complete subType.
    each(mappingResult, function (item) {
        const newOption = item.newOption;
        if (isObject(newOption)) {
            item.keyInfo.mainType = mainType;
            item.keyInfo.subType = determineSubType(mainType, newOption, item.existing, componentModelCtor);
        }
    });
}
function determineSubType(mainType, newCmptOption, existComponent, componentModelCtor) {
    const subType = newCmptOption.type
        ? newCmptOption.type
        : existComponent
            ? existComponent.subType
            // Use determineSubType only when there is no existComponent.
            : componentModelCtor.determineSubType(mainType, newCmptOption);
    // tooltip, markline, markpoint may always has no subType
    return subType;
}
/**
 * A helper for removing duplicate items between batchA and batchB,
 * and in themselves, and categorize by series.
 *
 * @param batchA Like: [{seriesId: 2, dataIndex: [32, 4, 5]}, ...]
 * @param batchB Like: [{seriesId: 2, dataIndex: [32, 4, 5]}, ...]
 * @return result: [resultBatchA, resultBatchB]
 */
export function compressBatches(batchA, batchB) {
    const mapA = {};
    const mapB = {};
    makeMap(batchA || [], mapA);
    makeMap(batchB || [], mapB, mapA);
    return [mapToArray(mapA), mapToArray(mapB)];
    function makeMap(sourceBatch, map, otherMap) {
        for (let i = 0, len = sourceBatch.length; i < len; i++) {
            const seriesId = convertOptionIdName(sourceBatch[i].seriesId, null);
            if (seriesId == null) {
                return;
            }
            const dataIndices = normalizeToArray(sourceBatch[i].dataIndex);
            const otherDataIndices = otherMap && otherMap[seriesId];
            for (let j = 0, lenj = dataIndices.length; j < lenj; j++) {
                const dataIndex = dataIndices[j];
                if (otherDataIndices && otherDataIndices[dataIndex]) {
                    otherDataIndices[dataIndex] = null;
                }
                else {
                    (map[seriesId] || (map[seriesId] = {}))[dataIndex] = 1;
                }
            }
        }
    }
    function mapToArray(map, isData) {
        const result = [];
        for (const i in map) {
            if (map.hasOwnProperty(i) && map[i] != null) {
                if (isData) {
                    result.push(+i);
                }
                else {
                    const dataIndices = mapToArray(map[i], true);
                    dataIndices.length && result.push({ seriesId: i, dataIndex: dataIndices });
                }
            }
        }
        return result;
    }
}
/**
 * @param payload Contains dataIndex (means rawIndex) / dataIndexInside / name
 *                         each of which can be Array or primary type.
 * @return dataIndex If not found, return undefined/null.
 */
export function queryDataIndex(data, payload) {
    if (payload.dataIndexInside != null) {
        return payload.dataIndexInside;
    }
    else if (payload.dataIndex != null) {
        return isArray(payload.dataIndex)
            ? map(payload.dataIndex, function (value) {
                return data.indexOfRawIndex(value);
            })
            : data.indexOfRawIndex(payload.dataIndex);
    }
    else if (payload.name != null) {
        return isArray(payload.name)
            ? map(payload.name, function (value) {
                return data.indexOfName(value);
            })
            : data.indexOfName(payload.name);
    }
}
/**
 * Enable property storage to any host object.
 * Notice: Serialization is not supported.
 *
 * For example:
 * let inner = zrUitl.makeInner();
 *
 * function some1(hostObj) {
 *      inner(hostObj).someProperty = 1212;
 *      ...
 * }
 * function some2() {
 *      let fields = inner(this);
 *      fields.someProperty1 = 1212;
 *      fields.someProperty2 = 'xx';
 *      ...
 * }
 *
 * @return {Function}
 */
export function makeInner() {
    const key = '__ec_inner_' + innerUniqueIndex++;
    return function (hostObj) {
        return hostObj[key] || (hostObj[key] = {});
    };
}
let innerUniqueIndex = getRandomIdBase();
/**
 * The same behavior as `component.getReferringComponents`.
 */
export function parseFinder(ecModel, finderInput, opt) {
    const { mainTypeSpecified, queryOptionMap, others } = preParseFinder(finderInput, opt);
    const result = others;
    const defaultMainType = opt ? opt.defaultMainType : null;
    if (!mainTypeSpecified && defaultMainType) {
        queryOptionMap.set(defaultMainType, {});
    }
    queryOptionMap.each(function (queryOption, mainType) {
        const queryResult = queryReferringComponents(ecModel, mainType, queryOption, {
            useDefault: defaultMainType === mainType,
            enableAll: (opt && opt.enableAll != null) ? opt.enableAll : true,
            enableNone: (opt && opt.enableNone != null) ? opt.enableNone : true
        });
        result[mainType + 'Models'] = queryResult.models;
        result[mainType + 'Model'] = queryResult.models[0];
    });
    return result;
}
export function preParseFinder(finderInput, opt) {
    let finder;
    if (isString(finderInput)) {
        const obj = {};
        obj[finderInput + 'Index'] = 0;
        finder = obj;
    }
    else {
        finder = finderInput;
    }
    const queryOptionMap = createHashMap();
    const others = {};
    let mainTypeSpecified = false;
    each(finder, function (value, key) {
        // Exclude 'dataIndex' and other illgal keys.
        if (key === 'dataIndex' || key === 'dataIndexInside') {
            others[key] = value;
            return;
        }
        const parsedKey = key.match(/^(\w+)(Index|Id|Name)$/) || [];
        const mainType = parsedKey[1];
        const queryType = (parsedKey[2] || '').toLowerCase();
        if (!mainType
            || !queryType
            || (opt && opt.includeMainTypes && indexOf(opt.includeMainTypes, mainType) < 0)) {
            return;
        }
        mainTypeSpecified = mainTypeSpecified || !!mainType;
        const queryOption = queryOptionMap.get(mainType) || queryOptionMap.set(mainType, {});
        queryOption[queryType] = value;
    });
    return { mainTypeSpecified, queryOptionMap, others };
}
export const SINGLE_REFERRING = { useDefault: true, enableAll: false, enableNone: false };
export const MULTIPLE_REFERRING = { useDefault: false, enableAll: true, enableNone: true };
export function queryReferringComponents(ecModel, mainType, userOption, opt) {
    opt = opt || SINGLE_REFERRING;
    let indexOption = userOption.index;
    let idOption = userOption.id;
    let nameOption = userOption.name;
    const result = {
        models: null,
        specified: indexOption != null || idOption != null || nameOption != null
    };
    if (!result.specified) {
        // Use the first as default if `useDefault`.
        let firstCmpt;
        result.models = (opt.useDefault && (firstCmpt = ecModel.getComponent(mainType))) ? [firstCmpt] : [];
        return result;
    }
    if (indexOption === 'none' || indexOption === false) {
        assert(opt.enableNone, '`"none"` or `false` is not a valid value on index option.');
        result.models = [];
        return result;
    }
    // `queryComponents` will return all components if
    // both all of index/id/name are null/undefined.
    if (indexOption === 'all') {
        assert(opt.enableAll, '`"all"` is not a valid value on index option.');
        indexOption = idOption = nameOption = null;
    }
    result.models = ecModel.queryComponents({
        mainType: mainType,
        index: indexOption,
        id: idOption,
        name: nameOption
    });
    return result;
}
export function setAttribute(dom, key, value) {
    dom.setAttribute
        ? dom.setAttribute(key, value)
        : (dom[key] = value);
}
export function getAttribute(dom, key) {
    return dom.getAttribute
        ? dom.getAttribute(key)
        : dom[key];
}
export function getTooltipRenderMode(renderModeOption) {
    if (renderModeOption === 'auto') {
        // Using html when `document` exists, use richText otherwise
        return env.domSupported ? 'html' : 'richText';
    }
    else {
        return renderModeOption || 'html';
    }
}
/**
 * Group a list by key.
 */
export function groupData(array, getKey // return key
) {
    const buckets = createHashMap();
    const keys = [];
    each(array, function (item) {
        const key = getKey(item);
        (buckets.get(key)
            || (keys.push(key), buckets.set(key, []))).push(item);
    });
    return {
        keys: keys,
        buckets: buckets
    };
}
/**
 * Interpolate raw values of a series with percent
 *
 * @param data         data
 * @param labelModel   label model of the text element
 * @param sourceValue  start value. May be null/undefined when init.
 * @param targetValue  end value
 * @param percent      0~1 percentage; 0 uses start value while 1 uses end value
 * @return             interpolated values
 *                     If `sourceValue` and `targetValue` are `number`, return `number`.
 *                     If `sourceValue` and `targetValue` are `string`, return `string`.
 *                     If `sourceValue` and `targetValue` are `(string | number)[]`, return `(string | number)[]`.
 *                     Other cases do not supported.
 */
export function interpolateRawValues(data, precision, sourceValue, targetValue, percent) {
    const isAutoPrecision = precision == null || precision === 'auto';
    if (targetValue == null) {
        return targetValue;
    }
    if (typeof targetValue === 'number') {
        const value = interpolateNumber(sourceValue || 0, targetValue, percent);
        return round(value, isAutoPrecision ? Math.max(getPrecision(sourceValue || 0), getPrecision(targetValue))
            : precision);
    }
    else if (typeof targetValue === 'string') {
        return percent < 1 ? sourceValue : targetValue;
    }
    else {
        const interpolated = [];
        const leftArr = sourceValue;
        const rightArr = targetValue;
        const length = Math.max(leftArr ? leftArr.length : 0, rightArr.length);
        for (let i = 0; i < length; ++i) {
            const info = data.getDimensionInfo(i);
            // Don't interpolate ordinal dims
            if (info && info.type === 'ordinal') {
                // In init, there is no `sourceValue`, but should better not to get undefined result.
                interpolated[i] = (percent < 1 && leftArr ? leftArr : rightArr)[i];
            }
            else {
                const leftVal = leftArr && leftArr[i] ? leftArr[i] : 0;
                const rightVal = rightArr[i];
                const value = interpolateNumber(leftVal, rightVal, percent);
                interpolated[i] = round(value, isAutoPrecision ? Math.max(getPrecision(leftVal), getPrecision(rightVal))
                    : precision);
            }
        }
        return interpolated;
    }
}
