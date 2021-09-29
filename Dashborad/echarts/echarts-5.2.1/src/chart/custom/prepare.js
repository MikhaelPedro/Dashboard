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
import { customInnerStore, TRANSFORM_PROPS } from './CustomSeries';
import { normalizeToArray } from '../../util/model';
import { assert, hasOwn, indexOf, isArrayLike, keys } from 'zrender/src/core/util';
import { cloneValue } from 'zrender/src/animation/Animator';
const LEGACY_TRANSFORM_PROPS = {
    position: ['x', 'y'],
    scale: ['scaleX', 'scaleY'],
    origin: ['originX', 'originY']
};
function setLegacyTransformProp(elOption, targetProps, legacyName) {
    const legacyArr = elOption[legacyName];
    const xyName = LEGACY_TRANSFORM_PROPS[legacyName];
    if (legacyArr) {
        targetProps[xyName[0]] = legacyArr[0];
        targetProps[xyName[1]] = legacyArr[1];
    }
}
function setTransformProp(elOption, allProps, name) {
    if (elOption[name] != null) {
        allProps[name] = elOption[name];
    }
}
function setTransformPropToTransitionFrom(transitionFrom, name, fromTransformable // If provided, retrieve from the element.
) {
    if (fromTransformable) {
        transitionFrom[name] = fromTransformable[name];
    }
}
// See [STRATEGY_TRANSITION]
export function prepareShapeOrExtraTransitionFrom(mainAttr, fromEl, elOption, transFromProps, isInit) {
    const attrOpt = elOption[mainAttr];
    if (!attrOpt) {
        return;
    }
    const elPropsInAttr = fromEl[mainAttr];
    let transFromPropsInAttr;
    const enterFrom = attrOpt.enterFrom;
    if (isInit && enterFrom) {
        !transFromPropsInAttr && (transFromPropsInAttr = transFromProps[mainAttr] = {});
        const enterFromKeys = keys(enterFrom);
        for (let i = 0; i < enterFromKeys.length; i++) {
            // `enterFrom` props are not necessarily also declared in `shape`/`style`/...,
            // for example, `opacity` can only declared in `enterFrom` but not in `style`.
            const key = enterFromKeys[i];
            // Do not clone, animator will perform that clone.
            transFromPropsInAttr[key] = enterFrom[key];
        }
    }
    if (!isInit && elPropsInAttr) {
        if (attrOpt.transition) {
            !transFromPropsInAttr && (transFromPropsInAttr = transFromProps[mainAttr] = {});
            const transitionKeys = normalizeToArray(attrOpt.transition);
            for (let i = 0; i < transitionKeys.length; i++) {
                const key = transitionKeys[i];
                const elVal = elPropsInAttr[key];
                if (__DEV__) {
                    checkNonStyleTansitionRefer(key, attrOpt[key], elVal);
                }
                // Do not clone, see `checkNonStyleTansitionRefer`.
                transFromPropsInAttr[key] = elVal;
            }
        }
        else if (indexOf(elOption.transition, mainAttr) >= 0) {
            !transFromPropsInAttr && (transFromPropsInAttr = transFromProps[mainAttr] = {});
            const elPropsInAttrKeys = keys(elPropsInAttr);
            for (let i = 0; i < elPropsInAttrKeys.length; i++) {
                const key = elPropsInAttrKeys[i];
                const elVal = elPropsInAttr[key];
                if (isNonStyleTransitionEnabled(attrOpt[key], elVal)) {
                    transFromPropsInAttr[key] = elVal;
                }
            }
        }
    }
    const leaveTo = attrOpt.leaveTo;
    if (leaveTo) {
        const leaveToProps = getOrCreateLeaveToPropsFromEl(fromEl);
        const leaveToPropsInAttr = leaveToProps[mainAttr] || (leaveToProps[mainAttr] = {});
        const leaveToKeys = keys(leaveTo);
        for (let i = 0; i < leaveToKeys.length; i++) {
            const key = leaveToKeys[i];
            leaveToPropsInAttr[key] = leaveTo[key];
        }
    }
}
export function prepareShapeOrExtraAllPropsFinal(mainAttr, elOption, allProps) {
    const attrOpt = elOption[mainAttr];
    if (!attrOpt) {
        return;
    }
    const allPropsInAttr = allProps[mainAttr] = {};
    const keysInAttr = keys(attrOpt);
    for (let i = 0; i < keysInAttr.length; i++) {
        const key = keysInAttr[i];
        // To avoid share one object with different element, and
        // to avoid user modify the object inexpectedly, have to clone.
        allPropsInAttr[key] = cloneValue(attrOpt[key]);
    }
}
// See [STRATEGY_TRANSITION].
export function prepareTransformTransitionFrom(el, elOption, transFromProps, isInit) {
    const enterFrom = elOption.enterFrom;
    if (isInit && enterFrom) {
        const enterFromKeys = keys(enterFrom);
        for (let i = 0; i < enterFromKeys.length; i++) {
            const key = enterFromKeys[i];
            if (__DEV__) {
                checkTransformPropRefer(key, 'el.enterFrom');
            }
            // Do not clone, animator will perform that clone.
            transFromProps[key] = enterFrom[key];
        }
    }
    if (!isInit) {
        if (elOption.transition) {
            const transitionKeys = normalizeToArray(elOption.transition);
            for (let i = 0; i < transitionKeys.length; i++) {
                const key = transitionKeys[i];
                if (key === 'style' || key === 'shape' || key === 'extra') {
                    continue;
                }
                const elVal = el[key];
                if (__DEV__) {
                    checkTransformPropRefer(key, 'el.transition');
                    checkNonStyleTansitionRefer(key, elOption[key], elVal);
                }
                // Do not clone, see `checkNonStyleTansitionRefer`.
                transFromProps[key] = elVal;
            }
        }
        // This default transition see [STRATEGY_TRANSITION]
        else {
            setTransformPropToTransitionFrom(transFromProps, 'x', el);
            setTransformPropToTransitionFrom(transFromProps, 'y', el);
        }
    }
    const leaveTo = elOption.leaveTo;
    if (leaveTo) {
        const leaveToProps = getOrCreateLeaveToPropsFromEl(el);
        const leaveToKeys = keys(leaveTo);
        for (let i = 0; i < leaveToKeys.length; i++) {
            const key = leaveToKeys[i];
            if (__DEV__) {
                checkTransformPropRefer(key, 'el.leaveTo');
            }
            leaveToProps[key] = leaveTo[key];
        }
    }
}
export function prepareTransformAllPropsFinal(el, elOption, allProps) {
    setLegacyTransformProp(elOption, allProps, 'position');
    setLegacyTransformProp(elOption, allProps, 'scale');
    setLegacyTransformProp(elOption, allProps, 'origin');
    setTransformProp(elOption, allProps, 'x');
    setTransformProp(elOption, allProps, 'y');
    setTransformProp(elOption, allProps, 'scaleX');
    setTransformProp(elOption, allProps, 'scaleY');
    setTransformProp(elOption, allProps, 'originX');
    setTransformProp(elOption, allProps, 'originY');
    setTransformProp(elOption, allProps, 'rotation');
}
// See [STRATEGY_TRANSITION].
export function prepareStyleTransitionFrom(fromEl, elOption, styleOpt, transFromProps, isInit) {
    if (!styleOpt) {
        return;
    }
    const fromElStyle = fromEl.style;
    let transFromStyleProps;
    const enterFrom = styleOpt.enterFrom;
    if (isInit && enterFrom) {
        const enterFromKeys = keys(enterFrom);
        !transFromStyleProps && (transFromStyleProps = transFromProps.style = {});
        for (let i = 0; i < enterFromKeys.length; i++) {
            const key = enterFromKeys[i];
            // Do not clone, animator will perform that clone.
            transFromStyleProps[key] = enterFrom[key];
        }
    }
    if (!isInit && fromElStyle) {
        if (styleOpt.transition) {
            const transitionKeys = normalizeToArray(styleOpt.transition);
            !transFromStyleProps && (transFromStyleProps = transFromProps.style = {});
            for (let i = 0; i < transitionKeys.length; i++) {
                const key = transitionKeys[i];
                const elVal = fromElStyle[key];
                // Do not clone, see `checkNonStyleTansitionRefer`.
                transFromStyleProps[key] = elVal;
            }
        }
        else if (fromEl.getAnimationStyleProps
            && indexOf(elOption.transition, 'style') >= 0) {
            const animationProps = fromEl.getAnimationStyleProps();
            const animationStyleProps = animationProps ? animationProps.style : null;
            if (animationStyleProps) {
                !transFromStyleProps && (transFromStyleProps = transFromProps.style = {});
                const styleKeys = keys(styleOpt);
                for (let i = 0; i < styleKeys.length; i++) {
                    const key = styleKeys[i];
                    if (animationStyleProps[key]) {
                        const elVal = fromElStyle[key];
                        transFromStyleProps[key] = elVal;
                    }
                }
            }
        }
    }
    const leaveTo = styleOpt.leaveTo;
    if (leaveTo) {
        const leaveToKeys = keys(leaveTo);
        const leaveToProps = getOrCreateLeaveToPropsFromEl(fromEl);
        const leaveToStyleProps = leaveToProps.style || (leaveToProps.style = {});
        for (let i = 0; i < leaveToKeys.length; i++) {
            const key = leaveToKeys[i];
            leaveToStyleProps[key] = leaveTo[key];
        }
    }
}
let checkNonStyleTansitionRefer;
if (__DEV__) {
    checkNonStyleTansitionRefer = function (propName, optVal, elVal) {
        if (!isArrayLike(optVal)) {
            assert(optVal != null && isFinite(optVal), 'Prop `' + propName + '` must refer to a finite number or ArrayLike for transition.');
        }
        else {
            // Try not to copy array for performance, but if user use the same object in different
            // call of `renderItem`, it will casue animation transition fail.
            assert(optVal !== elVal, 'Prop `' + propName + '` must use different Array object each time for transition.');
        }
    };
}
function isNonStyleTransitionEnabled(optVal, elVal) {
    // The same as `checkNonStyleTansitionRefer`.
    return !isArrayLike(optVal)
        ? (optVal != null && isFinite(optVal))
        : optVal !== elVal;
}
let checkTransformPropRefer;
if (__DEV__) {
    checkTransformPropRefer = function (key, usedIn) {
        assert(hasOwn(TRANSFORM_PROPS, key), 'Prop `' + key + '` is not a permitted in `' + usedIn + '`. '
            + 'Only `' + keys(TRANSFORM_PROPS).join('`, `') + '` are permitted.');
    };
}
function getOrCreateLeaveToPropsFromEl(el) {
    const innerEl = customInnerStore(el);
    return innerEl.leaveToProps || (innerEl.leaveToProps = {});
}
