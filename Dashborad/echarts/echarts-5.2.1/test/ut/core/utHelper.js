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
import { init } from '../../../src/echarts.all';
import { curry as zrUtilCurry, bind as zrUtilBind, extend as zrUtilExtend } from 'zrender/src/core/util';
export function createChart(params) {
    params = params || {};
    const el = document.createElement('div');
    el.style.cssText = [
        'visibility:hidden',
        'width:' + (params.width || '500') + 'px',
        'height:' + (params.height || '400') + 'px',
        'position:absolute',
        'bottom:0',
        'right:0'
    ].join(';');
    Object.defineProperty(el, 'clientWidth', {
        get() {
            return params.width || 500;
        }
    });
    Object.defineProperty(el, 'clientHeight', {
        get() {
            return params.height || 400;
        }
    });
    const chart = init(el, params.theme, params.opts);
    return chart;
}
;
export function removeChart(chart) {
    chart.dispose();
}
;
export const extend = zrUtilExtend;
export function g(id) {
    return document.getElementById(id);
}
export function removeEl(el) {
    const parent = parentEl(el);
    parent && parent.removeChild(el);
}
export function parentEl(el) {
    //parentElement for ie.
    return el.parentElement || el.parentNode;
}
export function getHeadEl() {
    return document.head
        || document.getElementsByTagName('head')[0]
        || document.documentElement;
}
export const curry = zrUtilCurry;
export const bind = zrUtilBind;
// /**
//  * @public
//  * @param {Array.<string>} deps
//  * @param {Array.<Function>} testFnList
//  * @param {Function} done All done callback.
//  */
// export function resetAMDLoaderEachTest(deps, testFnList, done) {
//     const i = -1;
//     next();
//     function next() {
//         i++;
//         if (testFnList.length <= i) {
//             done();
//             return;
//         }
//         utHelper.resetAMDLoader(function () {
//             global.require(deps, function () {
//                 testFnList[i].apply(null, arguments);
//                 next();
//             });
//         });
//     }
// };
export function getGraphicElements(chartOrGroup, mainType, index) {
    if (chartOrGroup.type === 'group') {
        return chartOrGroup.children();
    }
    else {
        const viewGroup = getViewGroup(chartOrGroup, mainType, index);
        if (viewGroup) {
            const list = [viewGroup];
            viewGroup.traverse(function (el) {
                list.push(el);
            });
            return list;
        }
        else {
            return [];
        }
    }
}
export function getViewGroup(chart, mainType, index) {
    const component = getECModel(chart).getComponent(mainType, index);
    return component ? chart[mainType === 'series' ? '_chartsMap' : '_componentsMap'][component.__viewId].group : null;
}
export function getECModel(chart) {
    // @ts-ignore
    return chart.getModel();
}
