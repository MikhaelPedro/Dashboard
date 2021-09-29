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
import { parseClassType } from './clazz';
import { makePrintable } from './log';
// A random offset
let base = Math.round(Math.random() * 10);
/**
 * @public
 * @param {string} type
 * @return {string}
 */
export function getUID(type) {
    // Considering the case of crossing js context,
    // use Math.random to make id as unique as possible.
    return [(type || ''), base++].join('_');
}
/**
 * Implements `SubTypeDefaulterManager` for `target`.
 */
export function enableSubTypeDefaulter(target) {
    const subTypeDefaulters = {};
    target.registerSubTypeDefaulter = function (componentType, defaulter) {
        const componentTypeInfo = parseClassType(componentType);
        subTypeDefaulters[componentTypeInfo.main] = defaulter;
    };
    target.determineSubType = function (componentType, option) {
        let type = option.type;
        if (!type) {
            const componentTypeMain = parseClassType(componentType).main;
            if (target.hasSubTypes(componentType) && subTypeDefaulters[componentTypeMain]) {
                type = subTypeDefaulters[componentTypeMain](option);
            }
        }
        return type;
    };
}
/**
 * Implements `TopologicalTravelable<any>` for `entity`.
 *
 * Topological travel on Activity Network (Activity On Vertices).
 * Dependencies is defined in Model.prototype.dependencies, like ['xAxis', 'yAxis'].
 * If 'xAxis' or 'yAxis' is absent in componentTypeList, just ignore it in topology.
 * If there is circular dependencey, Error will be thrown.
 */
export function enableTopologicalTravel(entity, dependencyGetter) {
    /**
     * @param targetNameList Target Component type list.
     *                       Can be ['aa', 'bb', 'aa.xx']
     * @param fullNameList By which we can build dependency graph.
     * @param callback Params: componentType, dependencies.
     * @param context Scope of callback.
     */
    entity.topologicalTravel = function (targetNameList, fullNameList, callback, context) {
        if (!targetNameList.length) {
            return;
        }
        const result = makeDepndencyGraph(fullNameList);
        const graph = result.graph;
        const noEntryList = result.noEntryList;
        const targetNameSet = {};
        zrUtil.each(targetNameList, function (name) {
            targetNameSet[name] = true;
        });
        while (noEntryList.length) {
            const currComponentType = noEntryList.pop();
            const currVertex = graph[currComponentType];
            const isInTargetNameSet = !!targetNameSet[currComponentType];
            if (isInTargetNameSet) {
                callback.call(context, currComponentType, currVertex.originalDeps.slice());
                delete targetNameSet[currComponentType];
            }
            zrUtil.each(currVertex.successor, isInTargetNameSet ? removeEdgeAndAdd : removeEdge);
        }
        zrUtil.each(targetNameSet, function () {
            let errMsg = '';
            if (__DEV__) {
                errMsg = makePrintable('Circular dependency may exists: ', targetNameSet, targetNameList, fullNameList);
            }
            throw new Error(errMsg);
        });
        function removeEdge(succComponentType) {
            graph[succComponentType].entryCount--;
            if (graph[succComponentType].entryCount === 0) {
                noEntryList.push(succComponentType);
            }
        }
        // Consider this case: legend depends on series, and we call
        // chart.setOption({series: [...]}), where only series is in option.
        // If we do not have 'removeEdgeAndAdd', legendModel.mergeOption will
        // not be called, but only sereis.mergeOption is called. Thus legend
        // have no chance to update its local record about series (like which
        // name of series is available in legend).
        function removeEdgeAndAdd(succComponentType) {
            targetNameSet[succComponentType] = true;
            removeEdge(succComponentType);
        }
    };
    function makeDepndencyGraph(fullNameList) {
        const graph = {};
        const noEntryList = [];
        zrUtil.each(fullNameList, function (name) {
            const thisItem = createDependencyGraphItem(graph, name);
            const originalDeps = thisItem.originalDeps = dependencyGetter(name);
            const availableDeps = getAvailableDependencies(originalDeps, fullNameList);
            thisItem.entryCount = availableDeps.length;
            if (thisItem.entryCount === 0) {
                noEntryList.push(name);
            }
            zrUtil.each(availableDeps, function (dependentName) {
                if (zrUtil.indexOf(thisItem.predecessor, dependentName) < 0) {
                    thisItem.predecessor.push(dependentName);
                }
                const thatItem = createDependencyGraphItem(graph, dependentName);
                if (zrUtil.indexOf(thatItem.successor, dependentName) < 0) {
                    thatItem.successor.push(name);
                }
            });
        });
        return { graph: graph, noEntryList: noEntryList };
    }
    function createDependencyGraphItem(graph, name) {
        if (!graph[name]) {
            graph[name] = { predecessor: [], successor: [] };
        }
        return graph[name];
    }
    function getAvailableDependencies(originalDeps, fullNameList) {
        const availableDeps = [];
        zrUtil.each(originalDeps, function (dep) {
            zrUtil.indexOf(fullNameList, dep) >= 0 && availableDeps.push(dep);
        });
        return availableDeps;
    }
}
export function inheritDefaultOption(superOption, subOption) {
    // See also `model/Component.ts#getDefaultOption`
    return zrUtil.merge(zrUtil.merge({}, superOption, true), subOption, true);
}
