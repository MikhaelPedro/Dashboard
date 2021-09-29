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
 * @file Visual solution, for consistent option specification.
 */
import * as zrUtil from 'zrender/src/core/util';
import VisualMapping from './VisualMapping';
import { getItemVisualFromData, setItemVisualFromData } from './helper';
const each = zrUtil.each;
function hasKeys(obj) {
    if (obj) {
        for (const name in obj) {
            if (obj.hasOwnProperty(name)) {
                return true;
            }
        }
    }
}
export function createVisualMappings(option, stateList, supplementVisualOption) {
    const visualMappings = {};
    each(stateList, function (state) {
        const mappings = visualMappings[state] = createMappings();
        each(option[state], function (visualData, visualType) {
            if (!VisualMapping.isValidType(visualType)) {
                return;
            }
            let mappingOption = {
                type: visualType,
                visual: visualData
            };
            supplementVisualOption && supplementVisualOption(mappingOption, state);
            mappings[visualType] = new VisualMapping(mappingOption);
            // Prepare a alpha for opacity, for some case that opacity
            // is not supported, such as rendering using gradient color.
            if (visualType === 'opacity') {
                mappingOption = zrUtil.clone(mappingOption);
                mappingOption.type = 'colorAlpha';
                mappings.__hidden.__alphaForOpacity = new VisualMapping(mappingOption);
            }
        });
    });
    return visualMappings;
    function createMappings() {
        const Creater = function () { };
        // Make sure hidden fields will not be visited by
        // object iteration (with hasOwnProperty checking).
        Creater.prototype.__hidden = Creater.prototype;
        const obj = new Creater();
        return obj;
    }
}
export function replaceVisualOption(thisOption, newOption, keys) {
    // Visual attributes merge is not supported, otherwise it
    // brings overcomplicated merge logic. See #2853. So if
    // newOption has anyone of these keys, all of these keys
    // will be reset. Otherwise, all keys remain.
    let has;
    zrUtil.each(keys, function (key) {
        if (newOption.hasOwnProperty(key) && hasKeys(newOption[key])) {
            has = true;
        }
    });
    has && zrUtil.each(keys, function (key) {
        if (newOption.hasOwnProperty(key) && hasKeys(newOption[key])) {
            thisOption[key] = zrUtil.clone(newOption[key]);
        }
        else {
            delete thisOption[key];
        }
    });
}
/**
 * @param stateList
 * @param visualMappings
 * @param list
 * @param getValueState param: valueOrIndex, return: state.
 * @param scope Scope for getValueState
 * @param dimension Concrete dimension, if used.
 */
// ???! handle brush?
export function applyVisual(stateList, visualMappings, data, getValueState, scope, dimension) {
    const visualTypesMap = {};
    zrUtil.each(stateList, function (state) {
        const visualTypes = VisualMapping.prepareVisualTypes(visualMappings[state]);
        visualTypesMap[state] = visualTypes;
    });
    let dataIndex;
    function getVisual(key) {
        return getItemVisualFromData(data, dataIndex, key);
    }
    function setVisual(key, value) {
        setItemVisualFromData(data, dataIndex, key, value);
    }
    if (dimension == null) {
        data.each(eachItem);
    }
    else {
        data.each([dimension], eachItem);
    }
    function eachItem(valueOrIndex, index) {
        dataIndex = dimension == null
            ? valueOrIndex // First argument is index
            : index;
        const rawDataItem = data.getRawDataItem(dataIndex);
        // Consider performance
        // @ts-ignore
        if (rawDataItem && rawDataItem.visualMap === false) {
            return;
        }
        const valueState = getValueState.call(scope, valueOrIndex);
        const mappings = visualMappings[valueState];
        const visualTypes = visualTypesMap[valueState];
        for (let i = 0, len = visualTypes.length; i < len; i++) {
            const type = visualTypes[i];
            mappings[type] && mappings[type].applyVisual(valueOrIndex, getVisual, setVisual);
        }
    }
}
/**
 * @param data
 * @param stateList
 * @param visualMappings <state, Object.<visualType, module:echarts/visual/VisualMapping>>
 * @param getValueState param: valueOrIndex, return: state.
 * @param dim dimension or dimension index.
 */
export function incrementalApplyVisual(stateList, visualMappings, getValueState, dim) {
    const visualTypesMap = {};
    zrUtil.each(stateList, function (state) {
        const visualTypes = VisualMapping.prepareVisualTypes(visualMappings[state]);
        visualTypesMap[state] = visualTypes;
    });
    return {
        progress: function progress(params, data) {
            let dimIndex;
            if (dim != null) {
                dimIndex = data.getDimensionIndex(dim);
            }
            function getVisual(key) {
                return getItemVisualFromData(data, dataIndex, key);
            }
            function setVisual(key, value) {
                setItemVisualFromData(data, dataIndex, key, value);
            }
            let dataIndex;
            const store = data.getStore();
            while ((dataIndex = params.next()) != null) {
                const rawDataItem = data.getRawDataItem(dataIndex);
                // Consider performance
                // @ts-ignore
                if (rawDataItem && rawDataItem.visualMap === false) {
                    continue;
                }
                const value = dim != null
                    ? store.get(dimIndex, dataIndex)
                    : dataIndex;
                const valueState = getValueState(value);
                const mappings = visualMappings[valueState];
                const visualTypes = visualTypesMap[valueState];
                for (let i = 0, len = visualTypes.length; i < len; i++) {
                    const type = visualTypes[i];
                    mappings[type] && mappings[type].applyVisual(value, getVisual, setVisual);
                }
            }
        }
    };
}
