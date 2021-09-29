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
import LRU from 'zrender/src/core/LRU';
import { extend, indexOf, isArrayLike, isObject, keys, isArray, each } from 'zrender/src/core/util';
import { getECData } from './innerStore';
import * as colorTool from 'zrender/src/tool/color';
import { queryDataIndex, makeInner } from './model';
import Path from 'zrender/src/graphic/Path';
import { error } from './log';
// Reserve 0 as default.
let _highlightNextDigit = 1;
const _highlightKeyMap = {};
const getSavedStates = makeInner();
export const HOVER_STATE_NORMAL = 0;
export const HOVER_STATE_BLUR = 1;
export const HOVER_STATE_EMPHASIS = 2;
export const SPECIAL_STATES = ['emphasis', 'blur', 'select'];
export const DISPLAY_STATES = ['normal', 'emphasis', 'blur', 'select'];
export const Z2_EMPHASIS_LIFT = 10;
export const Z2_SELECT_LIFT = 9;
export const HIGHLIGHT_ACTION_TYPE = 'highlight';
export const DOWNPLAY_ACTION_TYPE = 'downplay';
export const SELECT_ACTION_TYPE = 'select';
export const UNSELECT_ACTION_TYPE = 'unselect';
export const TOGGLE_SELECT_ACTION_TYPE = 'toggleSelect';
function hasFillOrStroke(fillOrStroke) {
    return fillOrStroke != null && fillOrStroke !== 'none';
}
// Most lifted color are duplicated.
const liftedColorCache = new LRU(100);
function liftColor(color) {
    if (typeof color !== 'string') {
        return color;
    }
    let liftedColor = liftedColorCache.get(color);
    if (!liftedColor) {
        liftedColor = colorTool.lift(color, -0.1);
        liftedColorCache.put(color, liftedColor);
    }
    return liftedColor;
}
function doChangeHoverState(el, stateName, hoverStateEnum) {
    if (el.onHoverStateChange && (el.hoverState || 0) !== hoverStateEnum) {
        el.onHoverStateChange(stateName);
    }
    el.hoverState = hoverStateEnum;
}
function singleEnterEmphasis(el) {
    // Only mark the flag.
    // States will be applied in the echarts.ts in next frame.
    doChangeHoverState(el, 'emphasis', HOVER_STATE_EMPHASIS);
}
function singleLeaveEmphasis(el) {
    // Only mark the flag.
    // States will be applied in the echarts.ts in next frame.
    if (el.hoverState === HOVER_STATE_EMPHASIS) {
        doChangeHoverState(el, 'normal', HOVER_STATE_NORMAL);
    }
}
function singleEnterBlur(el) {
    doChangeHoverState(el, 'blur', HOVER_STATE_BLUR);
}
function singleLeaveBlur(el) {
    if (el.hoverState === HOVER_STATE_BLUR) {
        doChangeHoverState(el, 'normal', HOVER_STATE_NORMAL);
    }
}
function singleEnterSelect(el) {
    el.selected = true;
}
function singleLeaveSelect(el) {
    el.selected = false;
}
function updateElementState(el, updater, commonParam) {
    updater(el, commonParam);
}
function traverseUpdateState(el, updater, commonParam) {
    updateElementState(el, updater, commonParam);
    el.isGroup && el.traverse(function (child) {
        updateElementState(child, updater, commonParam);
    });
}
export function setStatesFlag(el, stateName) {
    switch (stateName) {
        case 'emphasis':
            el.hoverState = HOVER_STATE_EMPHASIS;
            break;
        case 'normal':
            el.hoverState = HOVER_STATE_NORMAL;
            break;
        case 'blur':
            el.hoverState = HOVER_STATE_BLUR;
            break;
        case 'select':
            el.selected = true;
    }
}
/**
 * If we reuse elements when rerender.
 * DONT forget to clearStates before we update the style and shape.
 * Or we may update on the wrong state instead of normal state.
 */
export function clearStates(el) {
    if (el.isGroup) {
        el.traverse(function (child) {
            child.clearStates();
        });
    }
    else {
        el.clearStates();
    }
}
function getFromStateStyle(el, props, toStateName, defaultValue) {
    const style = el.style;
    const fromState = {};
    for (let i = 0; i < props.length; i++) {
        const propName = props[i];
        const val = style[propName];
        fromState[propName] = val == null ? (defaultValue && defaultValue[propName]) : val;
    }
    for (let i = 0; i < el.animators.length; i++) {
        const animator = el.animators[i];
        if (animator.__fromStateTransition
            // Dont consider the animation to emphasis state.
            && animator.__fromStateTransition.indexOf(toStateName) < 0
            && animator.targetName === 'style') {
            animator.saveFinalToTarget(fromState, props);
        }
    }
    return fromState;
}
function createEmphasisDefaultState(el, stateName, targetStates, state) {
    const hasSelect = targetStates && indexOf(targetStates, 'select') >= 0;
    let cloned = false;
    if (el instanceof Path) {
        const store = getSavedStates(el);
        const fromFill = hasSelect ? (store.selectFill || store.normalFill) : store.normalFill;
        const fromStroke = hasSelect ? (store.selectStroke || store.normalStroke) : store.normalStroke;
        if (hasFillOrStroke(fromFill) || hasFillOrStroke(fromStroke)) {
            state = state || {};
            let emphasisStyle = state.style || {};
            // inherit case
            if (emphasisStyle.fill === 'inherit') {
                cloned = true;
                state = extend({}, state);
                emphasisStyle = extend({}, emphasisStyle);
                emphasisStyle.fill = fromFill;
            }
            // Apply default color lift
            else if (!hasFillOrStroke(emphasisStyle.fill) && hasFillOrStroke(fromFill)) {
                cloned = true;
                // Not modify the original value.
                state = extend({}, state);
                emphasisStyle = extend({}, emphasisStyle);
                // Already being applied 'emphasis'. DON'T lift color multiple times.
                emphasisStyle.fill = liftColor(fromFill);
            }
            // Not highlight stroke if fill has been highlighted.
            else if (!hasFillOrStroke(emphasisStyle.stroke) && hasFillOrStroke(fromStroke)) {
                if (!cloned) {
                    state = extend({}, state);
                    emphasisStyle = extend({}, emphasisStyle);
                }
                emphasisStyle.stroke = liftColor(fromStroke);
            }
            state.style = emphasisStyle;
        }
    }
    if (state) {
        // TODO Share with textContent?
        if (state.z2 == null) {
            if (!cloned) {
                state = extend({}, state);
            }
            const z2EmphasisLift = el.z2EmphasisLift;
            state.z2 = el.z2 + (z2EmphasisLift != null ? z2EmphasisLift : Z2_EMPHASIS_LIFT);
        }
    }
    return state;
}
function createSelectDefaultState(el, stateName, state) {
    // const hasSelect = indexOf(el.currentStates, stateName) >= 0;
    if (state) {
        // TODO Share with textContent?
        if (state.z2 == null) {
            state = extend({}, state);
            const z2SelectLift = el.z2SelectLift;
            state.z2 = el.z2 + (z2SelectLift != null ? z2SelectLift : Z2_SELECT_LIFT);
        }
    }
    return state;
}
function createBlurDefaultState(el, stateName, state) {
    const hasBlur = indexOf(el.currentStates, stateName) >= 0;
    const currentOpacity = el.style.opacity;
    const fromState = !hasBlur
        ? getFromStateStyle(el, ['opacity'], stateName, {
            opacity: 1
        })
        : null;
    state = state || {};
    let blurStyle = state.style || {};
    if (blurStyle.opacity == null) {
        // clone state
        state = extend({}, state);
        blurStyle = extend({
            // Already being applied 'emphasis'. DON'T mul opacity multiple times.
            opacity: hasBlur ? currentOpacity : (fromState.opacity * 0.1)
        }, blurStyle);
        state.style = blurStyle;
    }
    return state;
}
function elementStateProxy(stateName, targetStates) {
    const state = this.states[stateName];
    if (this.style) {
        if (stateName === 'emphasis') {
            return createEmphasisDefaultState(this, stateName, targetStates, state);
        }
        else if (stateName === 'blur') {
            return createBlurDefaultState(this, stateName, state);
        }
        else if (stateName === 'select') {
            return createSelectDefaultState(this, stateName, state);
        }
    }
    return state;
}
/**FI
 * Set hover style (namely "emphasis style") of element.
 * @param el Should not be `zrender/graphic/Group`.
 * @param focus 'self' | 'selfInSeries' | 'series'
 */
export function setDefaultStateProxy(el) {
    el.stateProxy = elementStateProxy;
    const textContent = el.getTextContent();
    const textGuide = el.getTextGuideLine();
    if (textContent) {
        textContent.stateProxy = elementStateProxy;
    }
    if (textGuide) {
        textGuide.stateProxy = elementStateProxy;
    }
}
export function enterEmphasisWhenMouseOver(el, e) {
    !shouldSilent(el, e)
        // "emphasis" event highlight has higher priority than mouse highlight.
        && !el.__highByOuter
        && traverseUpdateState(el, singleEnterEmphasis);
}
export function leaveEmphasisWhenMouseOut(el, e) {
    !shouldSilent(el, e)
        // "emphasis" event highlight has higher priority than mouse highlight.
        && !el.__highByOuter
        && traverseUpdateState(el, singleLeaveEmphasis);
}
export function enterEmphasis(el, highlightDigit) {
    el.__highByOuter |= 1 << (highlightDigit || 0);
    traverseUpdateState(el, singleEnterEmphasis);
}
export function leaveEmphasis(el, highlightDigit) {
    !(el.__highByOuter &= ~(1 << (highlightDigit || 0)))
        && traverseUpdateState(el, singleLeaveEmphasis);
}
export function enterBlur(el) {
    traverseUpdateState(el, singleEnterBlur);
}
export function leaveBlur(el) {
    traverseUpdateState(el, singleLeaveBlur);
}
export function enterSelect(el) {
    traverseUpdateState(el, singleEnterSelect);
}
export function leaveSelect(el) {
    traverseUpdateState(el, singleLeaveSelect);
}
function shouldSilent(el, e) {
    return el.__highDownSilentOnTouch && e.zrByTouch;
}
export function allLeaveBlur(api) {
    const model = api.getModel();
    model.eachComponent(function (componentType, componentModel) {
        const view = componentType === 'series'
            ? api.getViewOfSeriesModel(componentModel)
            : api.getViewOfComponentModel(componentModel);
        // Leave blur anyway
        view.group.traverse(function (child) {
            singleLeaveBlur(child);
        });
    });
}
export function blurSeries(targetSeriesIndex, focus, blurScope, api) {
    const ecModel = api.getModel();
    blurScope = blurScope || 'coordinateSystem';
    function leaveBlurOfIndices(data, dataIndices) {
        for (let i = 0; i < dataIndices.length; i++) {
            const itemEl = data.getItemGraphicEl(dataIndices[i]);
            itemEl && leaveBlur(itemEl);
        }
    }
    if (targetSeriesIndex == null) {
        return;
    }
    if (!focus || focus === 'none') {
        return;
    }
    const targetSeriesModel = ecModel.getSeriesByIndex(targetSeriesIndex);
    let targetCoordSys = targetSeriesModel.coordinateSystem;
    if (targetCoordSys && targetCoordSys.master) {
        targetCoordSys = targetCoordSys.master;
    }
    const blurredSeries = [];
    ecModel.eachSeries(function (seriesModel) {
        const sameSeries = targetSeriesModel === seriesModel;
        let coordSys = seriesModel.coordinateSystem;
        if (coordSys && coordSys.master) {
            coordSys = coordSys.master;
        }
        const sameCoordSys = coordSys && targetCoordSys
            ? coordSys === targetCoordSys
            : sameSeries; // If there is no coordinate system. use sameSeries instead.
        if (!(
        // Not blur other series if blurScope series
        blurScope === 'series' && !sameSeries
            // Not blur other coordinate system if blurScope is coordinateSystem
            || blurScope === 'coordinateSystem' && !sameCoordSys
            // Not blur self series if focus is series.
            || focus === 'series' && sameSeries
        // TODO blurScope: coordinate system
        )) {
            const view = api.getViewOfSeriesModel(seriesModel);
            view.group.traverse(function (child) {
                singleEnterBlur(child);
            });
            if (isArrayLike(focus)) {
                leaveBlurOfIndices(seriesModel.getData(), focus);
            }
            else if (isObject(focus)) {
                const dataTypes = keys(focus);
                for (let d = 0; d < dataTypes.length; d++) {
                    leaveBlurOfIndices(seriesModel.getData(dataTypes[d]), focus[dataTypes[d]]);
                }
            }
            blurredSeries.push(seriesModel);
        }
    });
    ecModel.eachComponent(function (componentType, componentModel) {
        if (componentType === 'series') {
            return;
        }
        const view = api.getViewOfComponentModel(componentModel);
        if (view && view.blurSeries) {
            view.blurSeries(blurredSeries, ecModel);
        }
    });
}
export function blurComponent(componentMainType, componentIndex, api) {
    if (componentMainType == null || componentIndex == null) {
        return;
    }
    const componentModel = api.getModel().getComponent(componentMainType, componentIndex);
    if (!componentModel) {
        return;
    }
    const view = api.getViewOfComponentModel(componentModel);
    if (!view || !view.focusBlurEnabled) {
        return;
    }
    view.group.traverse(function (child) {
        singleEnterBlur(child);
    });
}
export function blurSeriesFromHighlightPayload(seriesModel, payload, api) {
    const seriesIndex = seriesModel.seriesIndex;
    const data = seriesModel.getData(payload.dataType);
    let dataIndex = queryDataIndex(data, payload);
    // Pick the first one if there is multiple/none exists.
    dataIndex = (isArray(dataIndex) ? dataIndex[0] : dataIndex) || 0;
    let el = data.getItemGraphicEl(dataIndex);
    if (!el) {
        const count = data.count();
        let current = 0;
        // If data on dataIndex is NaN.
        while (!el && current < count) {
            el = data.getItemGraphicEl(current++);
        }
    }
    if (el) {
        const ecData = getECData(el);
        blurSeries(seriesIndex, ecData.focus, ecData.blurScope, api);
    }
    else {
        // If there is no element put on the data. Try getting it from raw option
        // TODO Should put it on seriesModel?
        const focus = seriesModel.get(['emphasis', 'focus']);
        const blurScope = seriesModel.get(['emphasis', 'blurScope']);
        if (focus != null) {
            blurSeries(seriesIndex, focus, blurScope, api);
        }
    }
}
export function findComponentHighDownDispatchers(componentMainType, componentIndex, name, api) {
    const ret = {
        focusSelf: false,
        dispatchers: null
    };
    if (componentMainType == null
        || componentMainType === 'series'
        || componentIndex == null
        || name == null) {
        return ret;
    }
    const componentModel = api.getModel().getComponent(componentMainType, componentIndex);
    if (!componentModel) {
        return ret;
    }
    const view = api.getViewOfComponentModel(componentModel);
    if (!view || !view.findHighDownDispatchers) {
        return ret;
    }
    const dispatchers = view.findHighDownDispatchers(name);
    // At presnet, the component (like Geo) only blur inside itself.
    // So we do not use `blurScope` in component.
    let focusSelf;
    for (let i = 0; i < dispatchers.length; i++) {
        if (__DEV__ && !isHighDownDispatcher(dispatchers[i])) {
            error('param should be highDownDispatcher');
        }
        if (getECData(dispatchers[i]).focus === 'self') {
            focusSelf = true;
            break;
        }
    }
    return { focusSelf, dispatchers };
}
export function handleGlobalMouseOverForHighDown(dispatcher, e, api) {
    if (__DEV__ && !isHighDownDispatcher(dispatcher)) {
        error('param should be highDownDispatcher');
    }
    const ecData = getECData(dispatcher);
    const { dispatchers, focusSelf } = findComponentHighDownDispatchers(ecData.componentMainType, ecData.componentIndex, ecData.componentHighDownName, api);
    // If `findHighDownDispatchers` is supported on the component,
    // highlight/downplay elements with the same name.
    if (dispatchers) {
        if (focusSelf) {
            blurComponent(ecData.componentMainType, ecData.componentIndex, api);
        }
        each(dispatchers, dispatcher => enterEmphasisWhenMouseOver(dispatcher, e));
    }
    else {
        // Try blur all in the related series. Then emphasis the hoverred.
        // TODO. progressive mode.
        blurSeries(ecData.seriesIndex, ecData.focus, ecData.blurScope, api);
        if (ecData.focus === 'self') {
            blurComponent(ecData.componentMainType, ecData.componentIndex, api);
        }
        // Other than series, component that not support `findHighDownDispatcher` will
        // also use it. But in this case, highlight/downplay are only supported in
        // mouse hover but not in dispatchAction.
        enterEmphasisWhenMouseOver(dispatcher, e);
    }
}
export function handleGlboalMouseOutForHighDown(dispatcher, e, api) {
    if (__DEV__ && !isHighDownDispatcher(dispatcher)) {
        error('param should be highDownDispatcher');
    }
    allLeaveBlur(api);
    const ecData = getECData(dispatcher);
    const { dispatchers } = findComponentHighDownDispatchers(ecData.componentMainType, ecData.componentIndex, ecData.componentHighDownName, api);
    if (dispatchers) {
        each(dispatchers, dispatcher => leaveEmphasisWhenMouseOut(dispatcher, e));
    }
    else {
        leaveEmphasisWhenMouseOut(dispatcher, e);
    }
}
export function toggleSelectionFromPayload(seriesModel, payload, api) {
    if (!(isSelectChangePayload(payload))) {
        return;
    }
    const dataType = payload.dataType;
    const data = seriesModel.getData(dataType);
    let dataIndex = queryDataIndex(data, payload);
    if (!isArray(dataIndex)) {
        dataIndex = [dataIndex];
    }
    seriesModel[payload.type === TOGGLE_SELECT_ACTION_TYPE ? 'toggleSelect'
        : payload.type === SELECT_ACTION_TYPE ? 'select' : 'unselect'](dataIndex, dataType);
}
export function updateSeriesElementSelection(seriesModel) {
    const allData = seriesModel.getAllData();
    each(allData, function ({ data, type }) {
        data.eachItemGraphicEl(function (el, idx) {
            seriesModel.isSelected(idx, type) ? enterSelect(el) : leaveSelect(el);
        });
    });
}
export function getAllSelectedIndices(ecModel) {
    const ret = [];
    ecModel.eachSeries(function (seriesModel) {
        const allData = seriesModel.getAllData();
        each(allData, function ({ data, type }) {
            const dataIndices = seriesModel.getSelectedDataIndices();
            if (dataIndices.length > 0) {
                const item = {
                    dataIndex: dataIndices,
                    seriesIndex: seriesModel.seriesIndex
                };
                if (type != null) {
                    item.dataType = type;
                }
                ret.push(item);
            }
        });
    });
    return ret;
}
/**
 * Enable the function that mouseover will trigger the emphasis state.
 *
 * NOTE:
 * This function should be used on the element with dataIndex, seriesIndex.
 *
 */
export function enableHoverEmphasis(el, focus, blurScope) {
    setAsHighDownDispatcher(el, true);
    traverseUpdateState(el, setDefaultStateProxy);
    enableHoverFocus(el, focus, blurScope);
}
export function enableHoverFocus(el, focus, blurScope) {
    const ecData = getECData(el);
    if (focus != null) {
        // TODO dataIndex may be set after this function. This check is not useful.
        // if (ecData.dataIndex == null) {
        //     if (__DEV__) {
        //         console.warn('focus can only been set on element with dataIndex');
        //     }
        // }
        // else {
        ecData.focus = focus;
        ecData.blurScope = blurScope;
        // }
    }
    else if (ecData.focus) {
        ecData.focus = null;
    }
}
const OTHER_STATES = ['emphasis', 'blur', 'select'];
const defaultStyleGetterMap = {
    itemStyle: 'getItemStyle',
    lineStyle: 'getLineStyle',
    areaStyle: 'getAreaStyle'
};
/**
 * Set emphasis/blur/selected states of element.
 */
export function setStatesStylesFromModel(el, itemModel, styleType, // default itemStyle
getter) {
    styleType = styleType || 'itemStyle';
    for (let i = 0; i < OTHER_STATES.length; i++) {
        const stateName = OTHER_STATES[i];
        const model = itemModel.getModel([stateName, styleType]);
        const state = el.ensureState(stateName);
        // Let it throw error if getterType is not found.
        state.style = getter ? getter(model) : model[defaultStyleGetterMap[styleType]]();
    }
}
/**
 * @parame el
 * @param el.highDownSilentOnTouch
 *        In touch device, mouseover event will be trigger on touchstart event
 *        (see module:zrender/dom/HandlerProxy). By this mechanism, we can
 *        conveniently use hoverStyle when tap on touch screen without additional
 *        code for compatibility.
 *        But if the chart/component has select feature, which usually also use
 *        hoverStyle, there might be conflict between 'select-highlight' and
 *        'hover-highlight' especially when roam is enabled (see geo for example).
 *        In this case, `highDownSilentOnTouch` should be used to disable
 *        hover-highlight on touch device.
 * @param asDispatcher If `false`, do not set as "highDownDispatcher".
 */
export function setAsHighDownDispatcher(el, asDispatcher) {
    const disable = asDispatcher === false;
    const extendedEl = el;
    // Make `highDownSilentOnTouch` and `onStateChange` only work after
    // `setAsHighDownDispatcher` called. Avoid it is modified by user unexpectedly.
    if (el.highDownSilentOnTouch) {
        extendedEl.__highDownSilentOnTouch = el.highDownSilentOnTouch;
    }
    // Simple optimize, since this method might be
    // called for each elements of a group in some cases.
    if (!disable || extendedEl.__highDownDispatcher) {
        // Emphasis, normal can be triggered manually by API or other components like hover link.
        // el[method]('emphasis', onElementEmphasisEvent)[method]('normal', onElementNormalEvent);
        // Also keep previous record.
        extendedEl.__highByOuter = extendedEl.__highByOuter || 0;
        extendedEl.__highDownDispatcher = !disable;
    }
}
export function isHighDownDispatcher(el) {
    return !!(el && el.__highDownDispatcher);
}
/**
 * Enable component highlight/downplay features:
 * + hover link (within the same name)
 * + focus blur in component
 */
export function enableComponentHighDownFeatures(el, componentModel, componentHighDownName) {
    const ecData = getECData(el);
    ecData.componentMainType = componentModel.mainType;
    ecData.componentIndex = componentModel.componentIndex;
    ecData.componentHighDownName = componentHighDownName;
}
/**
 * Support hightlight/downplay record on each elements.
 * For the case: hover highlight/downplay (legend, visualMap, ...) and
 * user triggerred hightlight/downplay should not conflict.
 * Only all of the highlightDigit cleared, return to normal.
 * @param {string} highlightKey
 * @return {number} highlightDigit
 */
export function getHighlightDigit(highlightKey) {
    let highlightDigit = _highlightKeyMap[highlightKey];
    if (highlightDigit == null && _highlightNextDigit <= 32) {
        highlightDigit = _highlightKeyMap[highlightKey] = _highlightNextDigit++;
    }
    return highlightDigit;
}
export function isSelectChangePayload(payload) {
    const payloadType = payload.type;
    return payloadType === SELECT_ACTION_TYPE
        || payloadType === UNSELECT_ACTION_TYPE
        || payloadType === TOGGLE_SELECT_ACTION_TYPE;
}
export function isHighDownPayload(payload) {
    const payloadType = payload.type;
    return payloadType === HIGHLIGHT_ACTION_TYPE
        || payloadType === DOWNPLAY_ACTION_TYPE;
}
export function savePathStates(el) {
    const store = getSavedStates(el);
    store.normalFill = el.style.fill;
    store.normalStroke = el.style.stroke;
    const selectState = el.states.select || {};
    store.selectFill = (selectState.style && selectState.style.fill) || null;
    store.selectStroke = (selectState.style && selectState.style.stroke) || null;
}
