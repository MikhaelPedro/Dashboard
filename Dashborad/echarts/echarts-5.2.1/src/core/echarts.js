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
import * as zrender from 'zrender/src/zrender';
import { assert, each, isFunction, isObject, indexOf, bind, clone, setAsPrimitive, createCanvas, extend, createHashMap, map, defaults, isDom, isArray, $override, noop } from 'zrender/src/core/util';
import * as colorTool from 'zrender/src/tool/color';
import env from 'zrender/src/core/env';
import timsort from 'zrender/src/core/timsort';
import Eventful from 'zrender/src/core/Eventful';
import GlobalModel from '../model/Global';
import ExtensionAPI from './ExtensionAPI';
import CoordinateSystemManager from './CoordinateSystem';
import OptionManager from '../model/OptionManager';
import backwardCompat from '../preprocessor/backwardCompat';
import dataStack from '../processor/dataStack';
import SeriesModel from '../model/Series';
import ComponentView from '../view/Component';
import ChartView from '../view/Chart';
import * as graphic from '../util/graphic';
import { getECData } from '../util/innerStore';
import { isHighDownDispatcher, HOVER_STATE_EMPHASIS, HOVER_STATE_BLUR, blurSeriesFromHighlightPayload, toggleSelectionFromPayload, updateSeriesElementSelection, getAllSelectedIndices, isSelectChangePayload, isHighDownPayload, HIGHLIGHT_ACTION_TYPE, DOWNPLAY_ACTION_TYPE, SELECT_ACTION_TYPE, UNSELECT_ACTION_TYPE, TOGGLE_SELECT_ACTION_TYPE, savePathStates, enterEmphasis, leaveEmphasis, leaveBlur, enterSelect, leaveSelect, enterBlur, allLeaveBlur, findComponentHighDownDispatchers, blurComponent, handleGlobalMouseOverForHighDown, handleGlboalMouseOutForHighDown } from '../util/states';
import * as modelUtil from '../util/model';
import { throttle } from '../util/throttle';
import { seriesStyleTask, dataStyleTask, dataColorPaletteTask } from '../visual/style';
import loadingDefault from '../loading/default';
import Scheduler from './Scheduler';
import lightTheme from '../theme/light';
import darkTheme from '../theme/dark';
import { parseClassType } from '../util/clazz';
import { ECEventProcessor } from '../util/ECEventProcessor';
import { seriesSymbolTask, dataSymbolTask } from '../visual/symbol';
import { getVisualFromData, getItemVisualFromData } from '../visual/helper';
import { deprecateLog } from '../util/log';
import { handleLegacySelectEvents } from '../legacy/dataSelectAction';
import { registerExternalTransform } from '../data/helper/transform';
import { createLocaleObject, SYSTEM_LANG } from './locale';
import { findEventDispatcher } from '../util/event';
import decal from '../visual/decal';
import geoSourceManager from '../coord/geo/geoSourceManager';
import lifecycle from './lifecycle';
const hasWindow = typeof window !== 'undefined';
export const version = '5.2.1';
export const dependencies = {
    zrender: '5.2.1'
};
const TEST_FRAME_REMAIN_TIME = 1;
const PRIORITY_PROCESSOR_SERIES_FILTER = 800;
// Some data processors depends on the stack result dimension (to calculate data extent).
// So data stack stage should be in front of data processing stage.
const PRIORITY_PROCESSOR_DATASTACK = 900;
// "Data filter" will block the stream, so it should be
// put at the begining of data processing.
const PRIORITY_PROCESSOR_FILTER = 1000;
const PRIORITY_PROCESSOR_DEFAULT = 2000;
const PRIORITY_PROCESSOR_STATISTIC = 5000;
const PRIORITY_VISUAL_LAYOUT = 1000;
const PRIORITY_VISUAL_PROGRESSIVE_LAYOUT = 1100;
const PRIORITY_VISUAL_GLOBAL = 2000;
const PRIORITY_VISUAL_CHART = 3000;
const PRIORITY_VISUAL_COMPONENT = 4000;
// Visual property in data. Greater than `PRIORITY_VISUAL_COMPONENT` to enable to
// overwrite the viusal result of component (like `visualMap`)
// using data item specific setting (like itemStyle.xxx on data item)
const PRIORITY_VISUAL_CHART_DATA_CUSTOM = 4500;
// Greater than `PRIORITY_VISUAL_CHART_DATA_CUSTOM` to enable to layout based on
// visual result like `symbolSize`.
const PRIORITY_VISUAL_POST_CHART_LAYOUT = 4600;
const PRIORITY_VISUAL_BRUSH = 5000;
const PRIORITY_VISUAL_ARIA = 6000;
const PRIORITY_VISUAL_DECAL = 7000;
export const PRIORITY = {
    PROCESSOR: {
        FILTER: PRIORITY_PROCESSOR_FILTER,
        SERIES_FILTER: PRIORITY_PROCESSOR_SERIES_FILTER,
        STATISTIC: PRIORITY_PROCESSOR_STATISTIC
    },
    VISUAL: {
        LAYOUT: PRIORITY_VISUAL_LAYOUT,
        PROGRESSIVE_LAYOUT: PRIORITY_VISUAL_PROGRESSIVE_LAYOUT,
        GLOBAL: PRIORITY_VISUAL_GLOBAL,
        CHART: PRIORITY_VISUAL_CHART,
        POST_CHART_LAYOUT: PRIORITY_VISUAL_POST_CHART_LAYOUT,
        COMPONENT: PRIORITY_VISUAL_COMPONENT,
        BRUSH: PRIORITY_VISUAL_BRUSH,
        CHART_ITEM: PRIORITY_VISUAL_CHART_DATA_CUSTOM,
        ARIA: PRIORITY_VISUAL_ARIA,
        DECAL: PRIORITY_VISUAL_DECAL
    }
};
// Main process have three entries: `setOption`, `dispatchAction` and `resize`,
// where they must not be invoked nestedly, except the only case: invoke
// dispatchAction with updateMethod "none" in main process.
// This flag is used to carry out this rule.
// All events will be triggered out side main process (i.e. when !this[IN_MAIN_PROCESS]).
const IN_MAIN_PROCESS_KEY = '__flagInMainProcess';
const PENDING_UPDATE = '__pendingUpdate';
const STATUS_NEEDS_UPDATE_KEY = '__needsUpdateStatus';
const ACTION_REG = /^[a-zA-Z0-9_]+$/;
const CONNECT_STATUS_KEY = '__connectUpdateStatus';
const CONNECT_STATUS_PENDING = 0;
const CONNECT_STATUS_UPDATING = 1;
const CONNECT_STATUS_UPDATED = 2;
;
;
function createRegisterEventWithLowercaseECharts(method) {
    return function (...args) {
        if (this.isDisposed()) {
            disposedWarning(this.id);
            return;
        }
        return toLowercaseNameAndCallEventful(this, method, args);
    };
}
function createRegisterEventWithLowercaseMessageCenter(method) {
    return function (...args) {
        return toLowercaseNameAndCallEventful(this, method, args);
    };
}
function toLowercaseNameAndCallEventful(host, method, args) {
    // `args[0]` is event name. Event name is all lowercase.
    args[0] = args[0] && args[0].toLowerCase();
    return Eventful.prototype[method].apply(host, args);
}
class MessageCenter extends Eventful {
}
const messageCenterProto = MessageCenter.prototype;
messageCenterProto.on = createRegisterEventWithLowercaseMessageCenter('on');
messageCenterProto.off = createRegisterEventWithLowercaseMessageCenter('off');
// ---------------------------------------
// Internal method names for class ECharts
// ---------------------------------------
let prepare;
let prepareView;
let updateDirectly;
let updateMethods;
let doConvertPixel;
let updateStreamModes;
let doDispatchAction;
let flushPendingActions;
let triggerUpdatedEvent;
let bindRenderedEvent;
let bindMouseEvent;
let clearColorPalette;
let render;
let renderComponents;
let renderSeries;
let createExtensionAPI;
let enableConnect;
let markStatusToUpdate;
let applyChangedStates;
class ECharts extends Eventful {
    constructor(dom, 
    // Theme name or themeOption.
    theme, opts) {
        super(new ECEventProcessor());
        this._chartsViews = [];
        this._chartsMap = {};
        this._componentsViews = [];
        this._componentsMap = {};
        // Can't dispatch action during rendering procedure
        this._pendingActions = [];
        opts = opts || {};
        // Get theme by name
        if (typeof theme === 'string') {
            theme = themeStorage[theme];
        }
        this._dom = dom;
        let defaultRenderer = 'canvas';
        let defaultUseDirtyRect = false;
        if (__DEV__) {
            const root = (
            /* eslint-disable-next-line */
            hasWindow ? window : global);
            defaultRenderer = root.__ECHARTS__DEFAULT__RENDERER__ || defaultRenderer;
            const devUseDirtyRect = root.__ECHARTS__DEFAULT__USE_DIRTY_RECT__;
            defaultUseDirtyRect = devUseDirtyRect == null
                ? defaultUseDirtyRect
                : devUseDirtyRect;
        }
        const zr = this._zr = zrender.init(dom, {
            renderer: opts.renderer || defaultRenderer,
            devicePixelRatio: opts.devicePixelRatio,
            width: opts.width,
            height: opts.height,
            useDirtyRect: opts.useDirtyRect == null ? defaultUseDirtyRect : opts.useDirtyRect
        });
        // Expect 60 fps.
        this._throttledZrFlush = throttle(bind(zr.flush, zr), 17);
        theme = clone(theme);
        theme && backwardCompat(theme, true);
        this._theme = theme;
        this._locale = createLocaleObject(opts.locale || SYSTEM_LANG);
        this._coordSysMgr = new CoordinateSystemManager();
        const api = this._api = createExtensionAPI(this);
        // Sort on demand
        function prioritySortFunc(a, b) {
            return a.__prio - b.__prio;
        }
        timsort(visualFuncs, prioritySortFunc);
        timsort(dataProcessorFuncs, prioritySortFunc);
        this._scheduler = new Scheduler(this, api, dataProcessorFuncs, visualFuncs);
        this._messageCenter = new MessageCenter();
        // Init mouse events
        this._initEvents();
        // In case some people write `window.onresize = chart.resize`
        this.resize = bind(this.resize, this);
        zr.animation.on('frame', this._onframe, this);
        bindRenderedEvent(zr, this);
        bindMouseEvent(zr, this);
        // ECharts instance can be used as value.
        setAsPrimitive(this);
    }
    _onframe() {
        if (this._disposed) {
            return;
        }
        applyChangedStates(this);
        const scheduler = this._scheduler;
        // Lazy update
        if (this[PENDING_UPDATE]) {
            const silent = this[PENDING_UPDATE].silent;
            this[IN_MAIN_PROCESS_KEY] = true;
            prepare(this);
            updateMethods.update.call(this, null, this[PENDING_UPDATE].updateParams);
            // At present, in each frame, zrender performs:
            //   (1) animation step forward.
            //   (2) trigger('frame') (where this `_onframe` is called)
            //   (3) zrender flush (render).
            // If we do nothing here, since we use `setToFinal: true`, the step (3) above
            // will render the final state of the elements before the real animation started.
            this._zr.flush();
            this[IN_MAIN_PROCESS_KEY] = false;
            this[PENDING_UPDATE] = null;
            flushPendingActions.call(this, silent);
            triggerUpdatedEvent.call(this, silent);
        }
        // Avoid do both lazy update and progress in one frame.
        else if (scheduler.unfinished) {
            // Stream progress.
            let remainTime = TEST_FRAME_REMAIN_TIME;
            const ecModel = this._model;
            const api = this._api;
            scheduler.unfinished = false;
            do {
                const startTime = +new Date();
                scheduler.performSeriesTasks(ecModel);
                // Currently dataProcessorFuncs do not check threshold.
                scheduler.performDataProcessorTasks(ecModel);
                updateStreamModes(this, ecModel);
                // Do not update coordinate system here. Because that coord system update in
                // each frame is not a good user experience. So we follow the rule that
                // the extent of the coordinate system is determin in the first frame (the
                // frame is executed immedietely after task reset.
                // this._coordSysMgr.update(ecModel, api);
                // console.log('--- ec frame visual ---', remainTime);
                scheduler.performVisualTasks(ecModel);
                renderSeries(this, this._model, api, 'remain', {});
                remainTime -= (+new Date() - startTime);
            } while (remainTime > 0 && scheduler.unfinished);
            // Call flush explicitly for trigger finished event.
            if (!scheduler.unfinished) {
                this._zr.flush();
            }
            // Else, zr flushing be ensue within the same frame,
            // because zr flushing is after onframe event.
        }
    }
    getDom() {
        return this._dom;
    }
    getId() {
        return this.id;
    }
    getZr() {
        return this._zr;
    }
    /* eslint-disable-next-line */
    setOption(option, notMerge, lazyUpdate) {
        if (__DEV__) {
            assert(!this[IN_MAIN_PROCESS_KEY], '`setOption` should not be called during main process.');
        }
        if (this._disposed) {
            disposedWarning(this.id);
            return;
        }
        let silent;
        let replaceMerge;
        let transitionOpt;
        if (isObject(notMerge)) {
            lazyUpdate = notMerge.lazyUpdate;
            silent = notMerge.silent;
            replaceMerge = notMerge.replaceMerge;
            transitionOpt = notMerge.transition;
            notMerge = notMerge.notMerge;
        }
        this[IN_MAIN_PROCESS_KEY] = true;
        if (!this._model || notMerge) {
            const optionManager = new OptionManager(this._api);
            const theme = this._theme;
            const ecModel = this._model = new GlobalModel();
            ecModel.scheduler = this._scheduler;
            ecModel.init(null, null, null, theme, this._locale, optionManager);
        }
        this._model.setOption(option, { replaceMerge }, optionPreprocessorFuncs);
        const updateParams = {
            seriesTransition: transitionOpt,
            optionChanged: true
        };
        if (lazyUpdate) {
            this[PENDING_UPDATE] = {
                silent: silent,
                updateParams: updateParams
            };
            this[IN_MAIN_PROCESS_KEY] = false;
            // `setOption(option, {lazyMode: true})` may be called when zrender has been slept.
            // It should wake it up to make sure zrender start to render at the next frame.
            this.getZr().wakeUp();
        }
        else {
            prepare(this);
            updateMethods.update.call(this, null, updateParams);
            // Ensure zr refresh sychronously, and then pixel in canvas can be
            // fetched after `setOption`.
            this._zr.flush();
            this[PENDING_UPDATE] = null;
            this[IN_MAIN_PROCESS_KEY] = false;
            flushPendingActions.call(this, silent);
            triggerUpdatedEvent.call(this, silent);
        }
    }
    /**
     * @DEPRECATED
     */
    setTheme() {
        console.error('ECharts#setTheme() is DEPRECATED in ECharts 3.0');
    }
    // We don't want developers to use getModel directly.
    getModel() {
        return this._model;
    }
    getOption() {
        return this._model && this._model.getOption();
    }
    getWidth() {
        return this._zr.getWidth();
    }
    getHeight() {
        return this._zr.getHeight();
    }
    getDevicePixelRatio() {
        return this._zr.painter.dpr
            /* eslint-disable-next-line */
            || (hasWindow && window.devicePixelRatio) || 1;
    }
    /**
     * Get canvas which has all thing rendered
     */
    getRenderedCanvas(opts) {
        if (!env.canvasSupported) {
            return;
        }
        opts = opts || {};
        return this._zr.painter.getRenderedCanvas({
            backgroundColor: (opts.backgroundColor || this._model.get('backgroundColor')),
            pixelRatio: opts.pixelRatio || this.getDevicePixelRatio()
        });
    }
    /**
     * Get svg data url
     */
    getSvgDataURL() {
        if (!env.svgSupported) {
            return;
        }
        const zr = this._zr;
        const list = zr.storage.getDisplayList();
        // Stop animations
        each(list, function (el) {
            el.stopAnimation(null, true);
        });
        return zr.painter.toDataURL();
    }
    getDataURL(opts) {
        if (this._disposed) {
            disposedWarning(this.id);
            return;
        }
        opts = opts || {};
        const excludeComponents = opts.excludeComponents;
        const ecModel = this._model;
        const excludesComponentViews = [];
        const self = this;
        each(excludeComponents, function (componentType) {
            ecModel.eachComponent({
                mainType: componentType
            }, function (component) {
                const view = self._componentsMap[component.__viewId];
                if (!view.group.ignore) {
                    excludesComponentViews.push(view);
                    view.group.ignore = true;
                }
            });
        });
        const url = this._zr.painter.getType() === 'svg'
            ? this.getSvgDataURL()
            : this.getRenderedCanvas(opts).toDataURL('image/' + (opts && opts.type || 'png'));
        each(excludesComponentViews, function (view) {
            view.group.ignore = false;
        });
        return url;
    }
    getConnectedDataURL(opts) {
        if (this._disposed) {
            disposedWarning(this.id);
            return;
        }
        if (!env.canvasSupported) {
            return;
        }
        const isSvg = opts.type === 'svg';
        const groupId = this.group;
        const mathMin = Math.min;
        const mathMax = Math.max;
        const MAX_NUMBER = Infinity;
        if (connectedGroups[groupId]) {
            let left = MAX_NUMBER;
            let top = MAX_NUMBER;
            let right = -MAX_NUMBER;
            let bottom = -MAX_NUMBER;
            const canvasList = [];
            const dpr = (opts && opts.pixelRatio) || this.getDevicePixelRatio();
            each(instances, function (chart, id) {
                if (chart.group === groupId) {
                    const canvas = isSvg
                        ? chart.getZr().painter.getSvgDom().innerHTML
                        : chart.getRenderedCanvas(clone(opts));
                    const boundingRect = chart.getDom().getBoundingClientRect();
                    left = mathMin(boundingRect.left, left);
                    top = mathMin(boundingRect.top, top);
                    right = mathMax(boundingRect.right, right);
                    bottom = mathMax(boundingRect.bottom, bottom);
                    canvasList.push({
                        dom: canvas,
                        left: boundingRect.left,
                        top: boundingRect.top
                    });
                }
            });
            left *= dpr;
            top *= dpr;
            right *= dpr;
            bottom *= dpr;
            const width = right - left;
            const height = bottom - top;
            const targetCanvas = createCanvas();
            const zr = zrender.init(targetCanvas, {
                renderer: isSvg ? 'svg' : 'canvas'
            });
            zr.resize({
                width: width,
                height: height
            });
            if (isSvg) {
                let content = '';
                each(canvasList, function (item) {
                    const x = item.left - left;
                    const y = item.top - top;
                    content += '<g transform="translate(' + x + ','
                        + y + ')">' + item.dom + '</g>';
                });
                zr.painter.getSvgRoot().innerHTML = content;
                if (opts.connectedBackgroundColor) {
                    zr.painter.setBackgroundColor(opts.connectedBackgroundColor);
                }
                zr.refreshImmediately();
                return zr.painter.toDataURL();
            }
            else {
                // Background between the charts
                if (opts.connectedBackgroundColor) {
                    zr.add(new graphic.Rect({
                        shape: {
                            x: 0,
                            y: 0,
                            width: width,
                            height: height
                        },
                        style: {
                            fill: opts.connectedBackgroundColor
                        }
                    }));
                }
                each(canvasList, function (item) {
                    const img = new graphic.Image({
                        style: {
                            x: item.left * dpr - left,
                            y: item.top * dpr - top,
                            image: item.dom
                        }
                    });
                    zr.add(img);
                });
                zr.refreshImmediately();
                return targetCanvas.toDataURL('image/' + (opts && opts.type || 'png'));
            }
        }
        else {
            return this.getDataURL(opts);
        }
    }
    convertToPixel(finder, value) {
        return doConvertPixel(this, 'convertToPixel', finder, value);
    }
    convertFromPixel(finder, value) {
        return doConvertPixel(this, 'convertFromPixel', finder, value);
    }
    /**
     * Is the specified coordinate systems or components contain the given pixel point.
     * @param {Array|number} value
     * @return {boolean} result
     */
    containPixel(finder, value) {
        if (this._disposed) {
            disposedWarning(this.id);
            return;
        }
        const ecModel = this._model;
        let result;
        const findResult = modelUtil.parseFinder(ecModel, finder);
        each(findResult, function (models, key) {
            key.indexOf('Models') >= 0 && each(models, function (model) {
                const coordSys = model.coordinateSystem;
                if (coordSys && coordSys.containPoint) {
                    result = result || !!coordSys.containPoint(value);
                }
                else if (key === 'seriesModels') {
                    const view = this._chartsMap[model.__viewId];
                    if (view && view.containPoint) {
                        result = result || view.containPoint(value, model);
                    }
                    else {
                        if (__DEV__) {
                            console.warn(key + ': ' + (view
                                ? 'The found component do not support containPoint.'
                                : 'No view mapping to the found component.'));
                        }
                    }
                }
                else {
                    if (__DEV__) {
                        console.warn(key + ': containPoint is not supported');
                    }
                }
            }, this);
        }, this);
        return !!result;
    }
    /**
     * Get visual from series or data.
     * @param finder
     *        If string, e.g., 'series', means {seriesIndex: 0}.
     *        If Object, could contain some of these properties below:
     *        {
     *            seriesIndex / seriesId / seriesName,
     *            dataIndex / dataIndexInside
     *        }
     *        If dataIndex is not specified, series visual will be fetched,
     *        but not data item visual.
     *        If all of seriesIndex, seriesId, seriesName are not specified,
     *        visual will be fetched from first series.
     * @param visualType 'color', 'symbol', 'symbolSize'
     */
    getVisual(finder, visualType) {
        const ecModel = this._model;
        const parsedFinder = modelUtil.parseFinder(ecModel, finder, {
            defaultMainType: 'series'
        });
        const seriesModel = parsedFinder.seriesModel;
        if (__DEV__) {
            if (!seriesModel) {
                console.warn('There is no specified seires model');
            }
        }
        const data = seriesModel.getData();
        const dataIndexInside = parsedFinder.hasOwnProperty('dataIndexInside')
            ? parsedFinder.dataIndexInside
            : parsedFinder.hasOwnProperty('dataIndex')
                ? data.indexOfRawIndex(parsedFinder.dataIndex)
                : null;
        return dataIndexInside != null
            ? getItemVisualFromData(data, dataIndexInside, visualType)
            : getVisualFromData(data, visualType);
    }
    /**
     * Get view of corresponding component model
     */
    getViewOfComponentModel(componentModel) {
        return this._componentsMap[componentModel.__viewId];
    }
    /**
     * Get view of corresponding series model
     */
    getViewOfSeriesModel(seriesModel) {
        return this._chartsMap[seriesModel.__viewId];
    }
    _initEvents() {
        each(MOUSE_EVENT_NAMES, (eveName) => {
            const handler = (e) => {
                const ecModel = this.getModel();
                const el = e.target;
                let params;
                const isGlobalOut = eveName === 'globalout';
                // no e.target when 'globalout'.
                if (isGlobalOut) {
                    params = {};
                }
                else {
                    el && findEventDispatcher(el, (parent) => {
                        const ecData = getECData(parent);
                        if (ecData && ecData.dataIndex != null) {
                            const dataModel = ecData.dataModel || ecModel.getSeriesByIndex(ecData.seriesIndex);
                            params = (dataModel && dataModel.getDataParams(ecData.dataIndex, ecData.dataType) || {});
                            return true;
                        }
                        // If element has custom eventData of components
                        else if (ecData.eventData) {
                            params = extend({}, ecData.eventData);
                            return true;
                        }
                    }, true);
                }
                // Contract: if params prepared in mouse event,
                // these properties must be specified:
                // {
                //    componentType: string (component main type)
                //    componentIndex: number
                // }
                // Otherwise event query can not work.
                if (params) {
                    let componentType = params.componentType;
                    let componentIndex = params.componentIndex;
                    // Special handling for historic reason: when trigger by
                    // markLine/markPoint/markArea, the componentType is
                    // 'markLine'/'markPoint'/'markArea', but we should better
                    // enable them to be queried by seriesIndex, since their
                    // option is set in each series.
                    if (componentType === 'markLine'
                        || componentType === 'markPoint'
                        || componentType === 'markArea') {
                        componentType = 'series';
                        componentIndex = params.seriesIndex;
                    }
                    const model = componentType && componentIndex != null
                        && ecModel.getComponent(componentType, componentIndex);
                    const view = model && this[model.mainType === 'series' ? '_chartsMap' : '_componentsMap'][model.__viewId];
                    if (__DEV__) {
                        // `event.componentType` and `event[componentTpype + 'Index']` must not
                        // be missed, otherwise there is no way to distinguish source component.
                        // See `dataFormat.getDataParams`.
                        if (!isGlobalOut && !(model && view)) {
                            console.warn('model or view can not be found by params');
                        }
                    }
                    params.event = e;
                    params.type = eveName;
                    this._$eventProcessor.eventInfo = {
                        targetEl: el,
                        packedEvent: params,
                        model: model,
                        view: view
                    };
                    this.trigger(eveName, params);
                }
            };
            // Consider that some component (like tooltip, brush, ...)
            // register zr event handler, but user event handler might
            // do anything, such as call `setOption` or `dispatchAction`,
            // which probably update any of the content and probably
            // cause problem if it is called previous other inner handlers.
            handler.zrEventfulCallAtLast = true;
            this._zr.on(eveName, handler, this);
        });
        each(eventActionMap, (actionType, eventType) => {
            this._messageCenter.on(eventType, function (event) {
                this.trigger(eventType, event);
            }, this);
        });
        // Extra events
        // TODO register?
        each(['selectchanged'], (eventType) => {
            this._messageCenter.on(eventType, function (event) {
                this.trigger(eventType, event);
            }, this);
        });
        handleLegacySelectEvents(this._messageCenter, this, this._api);
    }
    isDisposed() {
        return this._disposed;
    }
    clear() {
        if (this._disposed) {
            disposedWarning(this.id);
            return;
        }
        this.setOption({ series: [] }, true);
    }
    dispose() {
        if (this._disposed) {
            disposedWarning(this.id);
            return;
        }
        this._disposed = true;
        modelUtil.setAttribute(this.getDom(), DOM_ATTRIBUTE_KEY, '');
        const chart = this;
        const api = chart._api;
        const ecModel = chart._model;
        each(chart._componentsViews, function (component) {
            component.dispose(ecModel, api);
        });
        each(chart._chartsViews, function (chart) {
            chart.dispose(ecModel, api);
        });
        // Dispose after all views disposed
        chart._zr.dispose();
        // Set properties to null.
        // To reduce the memory cost in case the top code still holds this instance unexpectedly.
        chart._dom =
            chart._model =
                chart._chartsMap =
                    chart._componentsMap =
                        chart._chartsViews =
                            chart._componentsViews =
                                chart._scheduler =
                                    chart._api =
                                        chart._zr =
                                            chart._throttledZrFlush =
                                                chart._theme =
                                                    chart._coordSysMgr =
                                                        chart._messageCenter = null;
        delete instances[chart.id];
    }
    /**
     * Resize the chart
     */
    resize(opts) {
        if (__DEV__) {
            assert(!this[IN_MAIN_PROCESS_KEY], '`resize` should not be called during main process.');
        }
        if (this._disposed) {
            disposedWarning(this.id);
            return;
        }
        this._zr.resize(opts);
        const ecModel = this._model;
        // Resize loading effect
        this._loadingFX && this._loadingFX.resize();
        if (!ecModel) {
            return;
        }
        let needPrepare = ecModel.resetOption('media');
        let silent = opts && opts.silent;
        // There is some real cases that:
        // chart.setOption(option, { lazyUpdate: true });
        // chart.resize();
        if (this[PENDING_UPDATE]) {
            if (silent == null) {
                silent = this[PENDING_UPDATE].silent;
            }
            needPrepare = true;
            this[PENDING_UPDATE] = null;
        }
        this[IN_MAIN_PROCESS_KEY] = true;
        needPrepare && prepare(this);
        updateMethods.update.call(this, {
            type: 'resize',
            animation: extend({
                // Disable animation
                duration: 0
            }, opts && opts.animation)
        });
        this[IN_MAIN_PROCESS_KEY] = false;
        flushPendingActions.call(this, silent);
        triggerUpdatedEvent.call(this, silent);
    }
    showLoading(name, cfg) {
        if (this._disposed) {
            disposedWarning(this.id);
            return;
        }
        if (isObject(name)) {
            cfg = name;
            name = '';
        }
        name = name || 'default';
        this.hideLoading();
        if (!loadingEffects[name]) {
            if (__DEV__) {
                console.warn('Loading effects ' + name + ' not exists.');
            }
            return;
        }
        const el = loadingEffects[name](this._api, cfg);
        const zr = this._zr;
        this._loadingFX = el;
        zr.add(el);
    }
    /**
     * Hide loading effect
     */
    hideLoading() {
        if (this._disposed) {
            disposedWarning(this.id);
            return;
        }
        this._loadingFX && this._zr.remove(this._loadingFX);
        this._loadingFX = null;
    }
    makeActionFromEvent(eventObj) {
        const payload = extend({}, eventObj);
        payload.type = eventActionMap[eventObj.type];
        return payload;
    }
    /**
     * @param opt If pass boolean, means opt.silent
     * @param opt.silent Default `false`. Whether trigger events.
     * @param opt.flush Default `undefined`.
     *        true: Flush immediately, and then pixel in canvas can be fetched
     *            immediately. Caution: it might affect performance.
     *        false: Not flush.
     *        undefined: Auto decide whether perform flush.
     */
    dispatchAction(payload, opt) {
        if (this._disposed) {
            disposedWarning(this.id);
            return;
        }
        if (!isObject(opt)) {
            opt = { silent: !!opt };
        }
        if (!actions[payload.type]) {
            return;
        }
        // Avoid dispatch action before setOption. Especially in `connect`.
        if (!this._model) {
            return;
        }
        // May dispatchAction in rendering procedure
        if (this[IN_MAIN_PROCESS_KEY]) {
            this._pendingActions.push(payload);
            return;
        }
        const silent = opt.silent;
        doDispatchAction.call(this, payload, silent);
        const flush = opt.flush;
        if (flush) {
            this._zr.flush();
        }
        else if (flush !== false && env.browser.weChat) {
            // In WeChat embeded browser, `requestAnimationFrame` and `setInterval`
            // hang when sliding page (on touch event), which cause that zr does not
            // refresh util user interaction finished, which is not expected.
            // But `dispatchAction` may be called too frequently when pan on touch
            // screen, which impacts performance if do not throttle them.
            this._throttledZrFlush();
        }
        flushPendingActions.call(this, silent);
        triggerUpdatedEvent.call(this, silent);
    }
    updateLabelLayout() {
        lifecycle.trigger('series:layoutlabels', this._model, this._api, {
            // Not adding series labels.
            // TODO
            updatedSeries: []
        });
    }
    appendData(params) {
        if (this._disposed) {
            disposedWarning(this.id);
            return;
        }
        const seriesIndex = params.seriesIndex;
        const ecModel = this.getModel();
        const seriesModel = ecModel.getSeriesByIndex(seriesIndex);
        if (__DEV__) {
            assert(params.data && seriesModel);
        }
        seriesModel.appendData(params);
        // Note: `appendData` does not support that update extent of coordinate
        // system, util some scenario require that. In the expected usage of
        // `appendData`, the initial extent of coordinate system should better
        // be fixed by axis `min`/`max` setting or initial data, otherwise if
        // the extent changed while `appendData`, the location of the painted
        // graphic elements have to be changed, which make the usage of
        // `appendData` meaningless.
        this._scheduler.unfinished = true;
        this.getZr().wakeUp();
    }
}
// A work around for no `internal` modifier in ts yet but
// need to strictly hide private methods to JS users.
ECharts.internalField = (function () {
    prepare = function (ecIns) {
        const scheduler = ecIns._scheduler;
        scheduler.restorePipelines(ecIns._model);
        scheduler.prepareStageTasks();
        prepareView(ecIns, true);
        prepareView(ecIns, false);
        scheduler.plan();
    };
    /**
     * Prepare view instances of charts and components
     */
    prepareView = function (ecIns, isComponent) {
        const ecModel = ecIns._model;
        const scheduler = ecIns._scheduler;
        const viewList = isComponent ? ecIns._componentsViews : ecIns._chartsViews;
        const viewMap = isComponent ? ecIns._componentsMap : ecIns._chartsMap;
        const zr = ecIns._zr;
        const api = ecIns._api;
        for (let i = 0; i < viewList.length; i++) {
            viewList[i].__alive = false;
        }
        isComponent
            ? ecModel.eachComponent(function (componentType, model) {
                componentType !== 'series' && doPrepare(model);
            })
            : ecModel.eachSeries(doPrepare);
        function doPrepare(model) {
            // By defaut view will be reused if possible for the case that `setOption` with "notMerge"
            // mode and need to enable transition animation. (Usually, when they have the same id, or
            // especially no id but have the same type & name & index. See the `model.id` generation
            // rule in `makeIdAndName` and `viewId` generation rule here).
            // But in `replaceMerge` mode, this feature should be able to disabled when it is clear that
            // the new model has nothing to do with the old model.
            const requireNewView = model.__requireNewView;
            // This command should not work twice.
            model.__requireNewView = false;
            // Consider: id same and type changed.
            const viewId = '_ec_' + model.id + '_' + model.type;
            let view = !requireNewView && viewMap[viewId];
            if (!view) {
                const classType = parseClassType(model.type);
                const Clazz = isComponent
                    ? ComponentView.getClass(classType.main, classType.sub)
                    : (
                    // FIXME:TS
                    // (ChartView as ChartViewConstructor).getClass('series', classType.sub)
                    // For backward compat, still support a chart type declared as only subType
                    // like "liquidfill", but recommend "series.liquidfill"
                    // But need a base class to make a type series.
                    ChartView.getClass(classType.sub));
                if (__DEV__) {
                    assert(Clazz, classType.sub + ' does not exist.');
                }
                view = new Clazz();
                view.init(ecModel, api);
                viewMap[viewId] = view;
                viewList.push(view);
                zr.add(view.group);
            }
            model.__viewId = view.__id = viewId;
            view.__alive = true;
            view.__model = model;
            view.group.__ecComponentInfo = {
                mainType: model.mainType,
                index: model.componentIndex
            };
            !isComponent && scheduler.prepareView(view, model, ecModel, api);
        }
        for (let i = 0; i < viewList.length;) {
            const view = viewList[i];
            if (!view.__alive) {
                !isComponent && view.renderTask.dispose();
                zr.remove(view.group);
                view.dispose(ecModel, api);
                viewList.splice(i, 1);
                if (viewMap[view.__id] === view) {
                    delete viewMap[view.__id];
                }
                view.__id = view.group.__ecComponentInfo = null;
            }
            else {
                i++;
            }
        }
    };
    updateDirectly = function (ecIns, method, payload, mainType, subType) {
        const ecModel = ecIns._model;
        ecModel.setUpdatePayload(payload);
        // broadcast
        if (!mainType) {
            // FIXME
            // Chart will not be update directly here, except set dirty.
            // But there is no such scenario now.
            each([].concat(ecIns._componentsViews).concat(ecIns._chartsViews), callView);
            return;
        }
        const query = {};
        query[mainType + 'Id'] = payload[mainType + 'Id'];
        query[mainType + 'Index'] = payload[mainType + 'Index'];
        query[mainType + 'Name'] = payload[mainType + 'Name'];
        const condition = { mainType: mainType, query: query };
        subType && (condition.subType = subType); // subType may be '' by parseClassType;
        const excludeSeriesId = payload.excludeSeriesId;
        let excludeSeriesIdMap;
        if (excludeSeriesId != null) {
            excludeSeriesIdMap = createHashMap();
            each(modelUtil.normalizeToArray(excludeSeriesId), id => {
                const modelId = modelUtil.convertOptionIdName(id, null);
                if (modelId != null) {
                    excludeSeriesIdMap.set(modelId, true);
                }
            });
        }
        if (isHighDownPayload(payload)) {
            allLeaveBlur(ecIns._api);
        }
        // If dispatchAction before setOption, do nothing.
        ecModel && ecModel.eachComponent(condition, function (model) {
            const isExcluded = excludeSeriesIdMap && excludeSeriesIdMap.get(model.id) !== null;
            if (isExcluded) {
                return;
            }
            ;
            if (isHighDownPayload(payload)) {
                if (model instanceof SeriesModel) {
                    if (payload.type === HIGHLIGHT_ACTION_TYPE && !payload.notBlur) {
                        blurSeriesFromHighlightPayload(model, payload, ecIns._api);
                    }
                }
                else {
                    const { focusSelf, dispatchers } = findComponentHighDownDispatchers(model.mainType, model.componentIndex, payload.name, ecIns._api);
                    if (payload.type === HIGHLIGHT_ACTION_TYPE && focusSelf && !payload.notBlur) {
                        blurComponent(model.mainType, model.componentIndex, ecIns._api);
                    }
                    // PENDING:
                    // Whether to put this "enter emphasis" code in `ComponentView`,
                    // which will be the same as `ChartView` but might be not necessary
                    // and will be far from this logic.
                    if (dispatchers) {
                        each(dispatchers, dispatcher => {
                            payload.type === HIGHLIGHT_ACTION_TYPE
                                ? enterEmphasis(dispatcher)
                                : leaveEmphasis(dispatcher);
                        });
                    }
                }
            }
            else if (isSelectChangePayload(payload)) {
                // TODO geo
                if (model instanceof SeriesModel) {
                    toggleSelectionFromPayload(model, payload, ecIns._api);
                    updateSeriesElementSelection(model);
                    markStatusToUpdate(ecIns);
                }
            }
        }, ecIns);
        ecModel && ecModel.eachComponent(condition, function (model) {
            const isExcluded = excludeSeriesIdMap && excludeSeriesIdMap.get(model.id) !== null;
            if (isExcluded) {
                return;
            }
            ;
            callView(ecIns[mainType === 'series' ? '_chartsMap' : '_componentsMap'][model.__viewId]);
        }, ecIns);
        function callView(view) {
            view && view.__alive && view[method] && view[method](view.__model, ecModel, ecIns._api, payload);
        }
    };
    updateMethods = {
        prepareAndUpdate(payload) {
            prepare(this);
            updateMethods.update.call(this, payload, {
                // Needs to mark option changed if newOption is given.
                // It's from MagicType.
                // TODO If use a separate flag optionChanged in payload?
                optionChanged: payload.newOption != null
            });
        },
        update(payload, updateParams) {
            const ecModel = this._model;
            const api = this._api;
            const zr = this._zr;
            const coordSysMgr = this._coordSysMgr;
            const scheduler = this._scheduler;
            // update before setOption
            if (!ecModel) {
                return;
            }
            ecModel.setUpdatePayload(payload);
            scheduler.restoreData(ecModel, payload);
            scheduler.performSeriesTasks(ecModel);
            // TODO
            // Save total ecModel here for undo/redo (after restoring data and before processing data).
            // Undo (restoration of total ecModel) can be carried out in 'action' or outside API call.
            // Create new coordinate system each update
            // In LineView may save the old coordinate system and use it to get the orignal point
            coordSysMgr.create(ecModel, api);
            scheduler.performDataProcessorTasks(ecModel, payload);
            // Current stream render is not supported in data process. So we can update
            // stream modes after data processing, where the filtered data is used to
            // deteming whether use progressive rendering.
            updateStreamModes(this, ecModel);
            // We update stream modes before coordinate system updated, then the modes info
            // can be fetched when coord sys updating (consider the barGrid extent fix). But
            // the drawback is the full coord info can not be fetched. Fortunately this full
            // coord is not requied in stream mode updater currently.
            coordSysMgr.update(ecModel, api);
            clearColorPalette(ecModel);
            scheduler.performVisualTasks(ecModel, payload);
            render(this, ecModel, api, payload, updateParams);
            // Set background
            let backgroundColor = ecModel.get('backgroundColor') || 'transparent';
            const darkMode = ecModel.get('darkMode');
            // In IE8
            if (!env.canvasSupported) {
                const colorArr = colorTool.parse(backgroundColor);
                backgroundColor = colorTool.stringify(colorArr, 'rgb');
                if (colorArr[3] === 0) {
                    backgroundColor = 'transparent';
                }
            }
            else {
                zr.setBackgroundColor(backgroundColor);
                // Force set dark mode.
                if (darkMode != null && darkMode !== 'auto') {
                    zr.setDarkMode(darkMode);
                }
            }
            lifecycle.trigger('afterupdate', ecModel, api);
        },
        updateTransform(payload) {
            const ecModel = this._model;
            const api = this._api;
            // update before setOption
            if (!ecModel) {
                return;
            }
            ecModel.setUpdatePayload(payload);
            // ChartView.markUpdateMethod(payload, 'updateTransform');
            const componentDirtyList = [];
            ecModel.eachComponent((componentType, componentModel) => {
                if (componentType === 'series') {
                    return;
                }
                const componentView = this.getViewOfComponentModel(componentModel);
                if (componentView && componentView.__alive) {
                    if (componentView.updateTransform) {
                        const result = componentView.updateTransform(componentModel, ecModel, api, payload);
                        result && result.update && componentDirtyList.push(componentView);
                    }
                    else {
                        componentDirtyList.push(componentView);
                    }
                }
            });
            const seriesDirtyMap = createHashMap();
            ecModel.eachSeries((seriesModel) => {
                const chartView = this._chartsMap[seriesModel.__viewId];
                if (chartView.updateTransform) {
                    const result = chartView.updateTransform(seriesModel, ecModel, api, payload);
                    result && result.update && seriesDirtyMap.set(seriesModel.uid, 1);
                }
                else {
                    seriesDirtyMap.set(seriesModel.uid, 1);
                }
            });
            clearColorPalette(ecModel);
            // Keep pipe to the exist pipeline because it depends on the render task of the full pipeline.
            // this._scheduler.performVisualTasks(ecModel, payload, 'layout', true);
            this._scheduler.performVisualTasks(ecModel, payload, { setDirty: true, dirtyMap: seriesDirtyMap });
            // Currently, not call render of components. Geo render cost a lot.
            // renderComponents(ecIns, ecModel, api, payload, componentDirtyList);
            renderSeries(this, ecModel, api, payload, {}, seriesDirtyMap);
            lifecycle.trigger('afterupdate', ecModel, api);
        },
        updateView(payload) {
            const ecModel = this._model;
            // update before setOption
            if (!ecModel) {
                return;
            }
            ecModel.setUpdatePayload(payload);
            ChartView.markUpdateMethod(payload, 'updateView');
            clearColorPalette(ecModel);
            // Keep pipe to the exist pipeline because it depends on the render task of the full pipeline.
            this._scheduler.performVisualTasks(ecModel, payload, { setDirty: true });
            render(this, ecModel, this._api, payload, {});
            lifecycle.trigger('afterupdate', ecModel, this._api);
        },
        updateVisual(payload) {
            // updateMethods.update.call(this, payload);
            const ecModel = this._model;
            // update before setOption
            if (!ecModel) {
                return;
            }
            ecModel.setUpdatePayload(payload);
            // clear all visual
            ecModel.eachSeries(function (seriesModel) {
                seriesModel.getData().clearAllVisual();
            });
            // Perform visual
            ChartView.markUpdateMethod(payload, 'updateVisual');
            clearColorPalette(ecModel);
            // Keep pipe to the exist pipeline because it depends on the render task of the full pipeline.
            this._scheduler.performVisualTasks(ecModel, payload, { visualType: 'visual', setDirty: true });
            ecModel.eachComponent((componentType, componentModel) => {
                if (componentType !== 'series') {
                    const componentView = this.getViewOfComponentModel(componentModel);
                    componentView && componentView.__alive
                        && componentView.updateVisual(componentModel, ecModel, this._api, payload);
                }
            });
            ecModel.eachSeries((seriesModel) => {
                const chartView = this._chartsMap[seriesModel.__viewId];
                chartView.updateVisual(seriesModel, ecModel, this._api, payload);
            });
            lifecycle.trigger('afterupdate', ecModel, this._api);
        },
        updateLayout(payload) {
            updateMethods.update.call(this, payload);
        }
    };
    doConvertPixel = function (ecIns, methodName, finder, value) {
        if (ecIns._disposed) {
            disposedWarning(ecIns.id);
            return;
        }
        const ecModel = ecIns._model;
        const coordSysList = ecIns._coordSysMgr.getCoordinateSystems();
        let result;
        const parsedFinder = modelUtil.parseFinder(ecModel, finder);
        for (let i = 0; i < coordSysList.length; i++) {
            const coordSys = coordSysList[i];
            if (coordSys[methodName]
                && (result = coordSys[methodName](ecModel, parsedFinder, value)) != null) {
                return result;
            }
        }
        if (__DEV__) {
            console.warn('No coordinate system that supports ' + methodName + ' found by the given finder.');
        }
    };
    updateStreamModes = function (ecIns, ecModel) {
        const chartsMap = ecIns._chartsMap;
        const scheduler = ecIns._scheduler;
        ecModel.eachSeries(function (seriesModel) {
            scheduler.updateStreamModes(seriesModel, chartsMap[seriesModel.__viewId]);
        });
    };
    doDispatchAction = function (payload, silent) {
        const ecModel = this.getModel();
        const payloadType = payload.type;
        const escapeConnect = payload.escapeConnect;
        const actionWrap = actions[payloadType];
        const actionInfo = actionWrap.actionInfo;
        const cptTypeTmp = (actionInfo.update || 'update').split(':');
        const updateMethod = cptTypeTmp.pop();
        const cptType = cptTypeTmp[0] != null && parseClassType(cptTypeTmp[0]);
        this[IN_MAIN_PROCESS_KEY] = true;
        let payloads = [payload];
        let batched = false;
        // Batch action
        if (payload.batch) {
            batched = true;
            payloads = map(payload.batch, function (item) {
                item = defaults(extend({}, item), payload);
                item.batch = null;
                return item;
            });
        }
        const eventObjBatch = [];
        let eventObj;
        const isSelectChange = isSelectChangePayload(payload);
        const isHighDown = isHighDownPayload(payload);
        each(payloads, (batchItem) => {
            // Action can specify the event by return it.
            eventObj = actionWrap.action(batchItem, this._model, this._api);
            // Emit event outside
            eventObj = eventObj || extend({}, batchItem);
            // Convert type to eventType
            eventObj.type = actionInfo.event || eventObj.type;
            eventObjBatch.push(eventObj);
            // light update does not perform data process, layout and visual.
            if (isHighDown) {
                const { queryOptionMap, mainTypeSpecified } = modelUtil.preParseFinder(payload);
                const componentMainType = mainTypeSpecified ? queryOptionMap.keys()[0] : 'series';
                updateDirectly(this, updateMethod, batchItem, componentMainType);
                markStatusToUpdate(this);
            }
            else if (isSelectChange) {
                // At present `dispatchAction({ type: 'select', ... })` is not supported on components.
                // geo still use 'geoselect'.
                updateDirectly(this, updateMethod, batchItem, 'series');
                markStatusToUpdate(this);
            }
            else if (cptType) {
                updateDirectly(this, updateMethod, batchItem, cptType.main, cptType.sub);
            }
        });
        if (updateMethod !== 'none' && !isHighDown && !isSelectChange && !cptType) {
            // Still dirty
            if (this[PENDING_UPDATE]) {
                prepare(this);
                updateMethods.update.call(this, payload);
                this[PENDING_UPDATE] = null;
            }
            else {
                updateMethods[updateMethod].call(this, payload);
            }
        }
        // Follow the rule of action batch
        if (batched) {
            eventObj = {
                type: actionInfo.event || payloadType,
                escapeConnect: escapeConnect,
                batch: eventObjBatch
            };
        }
        else {
            eventObj = eventObjBatch[0];
        }
        this[IN_MAIN_PROCESS_KEY] = false;
        if (!silent) {
            const messageCenter = this._messageCenter;
            messageCenter.trigger(eventObj.type, eventObj);
            // Extra triggered 'selectchanged' event
            if (isSelectChange) {
                const newObj = {
                    type: 'selectchanged',
                    escapeConnect: escapeConnect,
                    selected: getAllSelectedIndices(ecModel),
                    isFromClick: payload.isFromClick || false,
                    fromAction: payload.type,
                    fromActionPayload: payload
                };
                messageCenter.trigger(newObj.type, newObj);
            }
        }
    };
    flushPendingActions = function (silent) {
        const pendingActions = this._pendingActions;
        while (pendingActions.length) {
            const payload = pendingActions.shift();
            doDispatchAction.call(this, payload, silent);
        }
    };
    triggerUpdatedEvent = function (silent) {
        !silent && this.trigger('updated');
    };
    /**
     * Event `rendered` is triggered when zr
     * rendered. It is useful for realtime
     * snapshot (reflect animation).
     *
     * Event `finished` is triggered when:
     * (1) zrender rendering finished.
     * (2) initial animation finished.
     * (3) progressive rendering finished.
     * (4) no pending action.
     * (5) no delayed setOption needs to be processed.
     */
    bindRenderedEvent = function (zr, ecIns) {
        zr.on('rendered', function (params) {
            ecIns.trigger('rendered', params);
            // The `finished` event should not be triggered repeatly,
            // so it should only be triggered when rendering indeed happend
            // in zrender. (Consider the case that dipatchAction is keep
            // triggering when mouse move).
            if (
            // Although zr is dirty if initial animation is not finished
            // and this checking is called on frame, we also check
            // animation finished for robustness.
            zr.animation.isFinished()
                && !ecIns[PENDING_UPDATE]
                && !ecIns._scheduler.unfinished
                && !ecIns._pendingActions.length) {
                ecIns.trigger('finished');
            }
        });
    };
    bindMouseEvent = function (zr, ecIns) {
        zr.on('mouseover', function (e) {
            const el = e.target;
            const dispatcher = findEventDispatcher(el, isHighDownDispatcher);
            if (dispatcher) {
                handleGlobalMouseOverForHighDown(dispatcher, e, ecIns._api);
                markStatusToUpdate(ecIns);
            }
        }).on('mouseout', function (e) {
            const el = e.target;
            const dispatcher = findEventDispatcher(el, isHighDownDispatcher);
            if (dispatcher) {
                handleGlboalMouseOutForHighDown(dispatcher, e, ecIns._api);
                markStatusToUpdate(ecIns);
            }
        }).on('click', function (e) {
            const el = e.target;
            const dispatcher = findEventDispatcher(el, (target) => getECData(target).dataIndex != null, true);
            if (dispatcher) {
                const actionType = dispatcher.selected ? 'unselect' : 'select';
                const ecData = getECData(dispatcher);
                ecIns._api.dispatchAction({
                    type: actionType,
                    dataType: ecData.dataType,
                    dataIndexInside: ecData.dataIndex,
                    seriesIndex: ecData.seriesIndex,
                    isFromClick: true
                });
            }
        });
    };
    clearColorPalette = function (ecModel) {
        ecModel.clearColorPalette();
        ecModel.eachSeries(function (seriesModel) {
            seriesModel.clearColorPalette();
        });
    };
    render = (ecIns, ecModel, api, payload, updateParams) => {
        renderComponents(ecIns, ecModel, api, payload, updateParams);
        each(ecIns._chartsViews, function (chart) {
            chart.__alive = false;
        });
        renderSeries(ecIns, ecModel, api, payload, updateParams);
        // Remove groups of unrendered charts
        each(ecIns._chartsViews, function (chart) {
            if (!chart.__alive) {
                chart.remove(ecModel, api);
            }
        });
    };
    renderComponents = (ecIns, ecModel, api, payload, updateParams, dirtyList) => {
        each(dirtyList || ecIns._componentsViews, function (componentView) {
            const componentModel = componentView.__model;
            clearStates(componentModel, componentView);
            componentView.render(componentModel, ecModel, api, payload);
            updateZ(componentModel, componentView);
            updateStates(componentModel, componentView);
        });
    };
    /**
     * Render each chart and component
     */
    renderSeries = (ecIns, ecModel, api, payload, updateParams, dirtyMap) => {
        // Render all charts
        const scheduler = ecIns._scheduler;
        updateParams = extend(updateParams || {}, {
            updatedSeries: ecModel.getSeries()
        });
        // TODO progressive?
        lifecycle.trigger('series:beforeupdate', ecModel, api, updateParams);
        let unfinished = false;
        ecModel.eachSeries(function (seriesModel) {
            const chartView = ecIns._chartsMap[seriesModel.__viewId];
            chartView.__alive = true;
            const renderTask = chartView.renderTask;
            scheduler.updatePayload(renderTask, payload);
            // TODO states on marker.
            clearStates(seriesModel, chartView);
            if (dirtyMap && dirtyMap.get(seriesModel.uid)) {
                renderTask.dirty();
            }
            if (renderTask.perform(scheduler.getPerformArgs(renderTask))) {
                unfinished = true;
            }
            chartView.group.silent = !!seriesModel.get('silent');
            // Should not call markRedraw on group, because it will disable zrender
            // increamental render (alway render from the __startIndex each frame)
            // chartView.group.markRedraw();
            updateBlend(seriesModel, chartView);
            updateSeriesElementSelection(seriesModel);
        });
        scheduler.unfinished = unfinished || scheduler.unfinished;
        lifecycle.trigger('series:layoutlabels', ecModel, api, updateParams);
        // transition after label is layouted.
        lifecycle.trigger('series:transition', ecModel, api, updateParams);
        ecModel.eachSeries(function (seriesModel) {
            const chartView = ecIns._chartsMap[seriesModel.__viewId];
            // Update Z after labels updated. Before applying states.
            updateZ(seriesModel, chartView);
            // NOTE: Update states after label is updated.
            // label should be in normal status when layouting.
            updateStates(seriesModel, chartView);
        });
        // If use hover layer
        updateHoverLayerStatus(ecIns, ecModel);
        lifecycle.trigger('series:afterupdate', ecModel, api, updateParams);
    };
    markStatusToUpdate = function (ecIns) {
        ecIns[STATUS_NEEDS_UPDATE_KEY] = true;
        // Wake up zrender if it's sleep. Let it update states in the next frame.
        ecIns.getZr().wakeUp();
    };
    applyChangedStates = function (ecIns) {
        if (!ecIns[STATUS_NEEDS_UPDATE_KEY]) {
            return;
        }
        ecIns.getZr().storage.traverse(function (el) {
            // Not applied on removed elements, it may still in fading.
            if (graphic.isElementRemoved(el)) {
                return;
            }
            applyElementStates(el);
        });
        ecIns[STATUS_NEEDS_UPDATE_KEY] = false;
    };
    function applyElementStates(el) {
        const newStates = [];
        const oldStates = el.currentStates;
        // Keep other states.
        for (let i = 0; i < oldStates.length; i++) {
            const stateName = oldStates[i];
            if (!(stateName === 'emphasis' || stateName === 'blur' || stateName === 'select')) {
                newStates.push(stateName);
            }
        }
        // Only use states when it's exists.
        if (el.selected && el.states.select) {
            newStates.push('select');
        }
        if (el.hoverState === HOVER_STATE_EMPHASIS && el.states.emphasis) {
            newStates.push('emphasis');
        }
        else if (el.hoverState === HOVER_STATE_BLUR && el.states.blur) {
            newStates.push('blur');
        }
        el.useStates(newStates);
    }
    function updateHoverLayerStatus(ecIns, ecModel) {
        const zr = ecIns._zr;
        const storage = zr.storage;
        let elCount = 0;
        storage.traverse(function (el) {
            if (!el.isGroup) {
                elCount++;
            }
        });
        if (elCount > ecModel.get('hoverLayerThreshold') && !env.node && !env.worker) {
            ecModel.eachSeries(function (seriesModel) {
                if (seriesModel.preventUsingHoverLayer) {
                    return;
                }
                const chartView = ecIns._chartsMap[seriesModel.__viewId];
                if (chartView.__alive) {
                    chartView.group.traverse(function (el) {
                        if (el.states.emphasis) {
                            el.states.emphasis.hoverLayer = true;
                        }
                    });
                }
            });
        }
    }
    ;
    /**
     * Update chart and blend.
     */
    function updateBlend(seriesModel, chartView) {
        const blendMode = seriesModel.get('blendMode') || null;
        if (__DEV__) {
            if (!env.canvasSupported && blendMode && blendMode !== 'source-over') {
                console.warn('Only canvas support blendMode');
            }
        }
        chartView.group.traverse(function (el) {
            // FIXME marker and other components
            if (!el.isGroup) {
                // DONT mark the element dirty. In case element is incremental and don't wan't to rerender.
                el.style.blend = blendMode;
            }
            if (el.eachPendingDisplayable) {
                el.eachPendingDisplayable(function (displayable) {
                    displayable.style.blend = blendMode;
                });
            }
        });
    }
    ;
    function updateZ(model, view) {
        if (model.preventAutoZ) {
            return;
        }
        // Set z and zlevel
        _updateZ(view.group, model.get('z') || 0, model.get('zlevel') || 0, -Infinity);
    }
    ;
    function _updateZ(el, z, zlevel, maxZ2) {
        // Group may also have textContent
        const label = el.getTextContent();
        const labelLine = el.getTextGuideLine();
        const isGroup = el.isGroup;
        if (isGroup) {
            // set z & zlevel of children elements of Group
            // el.traverse((childEl: Element) => _updateZ(childEl, z, zlevel));
            const children = el.childrenRef();
            for (let i = 0; i < children.length; i++) {
                maxZ2 = Math.max(_updateZ(children[i], z, zlevel, maxZ2), maxZ2);
            }
        }
        else {
            // not Group
            el.z = z;
            el.zlevel = zlevel;
            maxZ2 = Math.max(el.z2, maxZ2);
        }
        // always set z and zlevel if label/labelLine exists
        if (label) {
            label.z = z;
            label.zlevel = zlevel;
            // lift z2 of text content
            // TODO if el.emphasis.z2 is spcefied, what about textContent.
            isFinite(maxZ2) && (label.z2 = maxZ2 + 2);
        }
        if (labelLine) {
            const textGuideLineConfig = el.textGuideLineConfig;
            labelLine.z = z;
            labelLine.zlevel = zlevel;
            isFinite(maxZ2)
                && (labelLine.z2 = maxZ2 + (textGuideLineConfig && textGuideLineConfig.showAbove ? 1 : -1));
        }
        return maxZ2;
    }
    // Clear states without animation.
    // TODO States on component.
    function clearStates(model, view) {
        view.group.traverse(function (el) {
            // Not applied on removed elements, it may still in fading.
            if (graphic.isElementRemoved(el)) {
                return;
            }
            const textContent = el.getTextContent();
            const textGuide = el.getTextGuideLine();
            if (el.stateTransition) {
                el.stateTransition = null;
            }
            if (textContent && textContent.stateTransition) {
                textContent.stateTransition = null;
            }
            if (textGuide && textGuide.stateTransition) {
                textGuide.stateTransition = null;
            }
            // TODO If el is incremental.
            if (el.hasState()) {
                el.prevStates = el.currentStates;
                el.clearStates();
            }
            else if (el.prevStates) {
                el.prevStates = null;
            }
        });
    }
    function updateStates(model, view) {
        const stateAnimationModel = model.getModel('stateAnimation');
        const enableAnimation = model.isAnimationEnabled();
        const duration = stateAnimationModel.get('duration');
        const stateTransition = duration > 0 ? {
            duration,
            delay: stateAnimationModel.get('delay'),
            easing: stateAnimationModel.get('easing')
            // additive: stateAnimationModel.get('additive')
        } : null;
        view.group.traverse(function (el) {
            if (el.states && el.states.emphasis) {
                // Not applied on removed elements, it may still in fading.
                if (graphic.isElementRemoved(el)) {
                    return;
                }
                if (el instanceof graphic.Path) {
                    savePathStates(el);
                }
                // Only updated on changed element. In case element is incremental and don't wan't to rerender.
                // TODO, a more proper way?
                if (el.__dirty) {
                    const prevStates = el.prevStates;
                    // Restore states without animation
                    if (prevStates) {
                        el.useStates(prevStates);
                    }
                }
                // Update state transition and enable animation again.
                if (enableAnimation) {
                    el.stateTransition = stateTransition;
                    const textContent = el.getTextContent();
                    const textGuide = el.getTextGuideLine();
                    // TODO Is it necessary to animate label?
                    if (textContent) {
                        textContent.stateTransition = stateTransition;
                    }
                    if (textGuide) {
                        textGuide.stateTransition = stateTransition;
                    }
                }
                // The use higlighted and selected flag to toggle states.
                if (el.__dirty) {
                    applyElementStates(el);
                }
            }
        });
    }
    ;
    createExtensionAPI = function (ecIns) {
        return new (class extends ExtensionAPI {
            getCoordinateSystems() {
                return ecIns._coordSysMgr.getCoordinateSystems();
            }
            getComponentByElement(el) {
                while (el) {
                    const modelInfo = el.__ecComponentInfo;
                    if (modelInfo != null) {
                        return ecIns._model.getComponent(modelInfo.mainType, modelInfo.index);
                    }
                    el = el.parent;
                }
            }
            enterEmphasis(el, highlightDigit) {
                enterEmphasis(el, highlightDigit);
                markStatusToUpdate(ecIns);
            }
            leaveEmphasis(el, highlightDigit) {
                leaveEmphasis(el, highlightDigit);
                markStatusToUpdate(ecIns);
            }
            enterBlur(el) {
                enterBlur(el);
                markStatusToUpdate(ecIns);
            }
            leaveBlur(el) {
                leaveBlur(el);
                markStatusToUpdate(ecIns);
            }
            enterSelect(el) {
                enterSelect(el);
                markStatusToUpdate(ecIns);
            }
            leaveSelect(el) {
                leaveSelect(el);
                markStatusToUpdate(ecIns);
            }
            getModel() {
                return ecIns.getModel();
            }
            getViewOfComponentModel(componentModel) {
                return ecIns.getViewOfComponentModel(componentModel);
            }
            getViewOfSeriesModel(seriesModel) {
                return ecIns.getViewOfSeriesModel(seriesModel);
            }
        })(ecIns);
    };
    enableConnect = function (chart) {
        function updateConnectedChartsStatus(charts, status) {
            for (let i = 0; i < charts.length; i++) {
                const otherChart = charts[i];
                otherChart[CONNECT_STATUS_KEY] = status;
            }
        }
        each(eventActionMap, function (actionType, eventType) {
            chart._messageCenter.on(eventType, function (event) {
                if (connectedGroups[chart.group] && chart[CONNECT_STATUS_KEY] !== CONNECT_STATUS_PENDING) {
                    if (event && event.escapeConnect) {
                        return;
                    }
                    const action = chart.makeActionFromEvent(event);
                    const otherCharts = [];
                    each(instances, function (otherChart) {
                        if (otherChart !== chart && otherChart.group === chart.group) {
                            otherCharts.push(otherChart);
                        }
                    });
                    updateConnectedChartsStatus(otherCharts, CONNECT_STATUS_PENDING);
                    each(otherCharts, function (otherChart) {
                        if (otherChart[CONNECT_STATUS_KEY] !== CONNECT_STATUS_UPDATING) {
                            otherChart.dispatchAction(action);
                        }
                    });
                    updateConnectedChartsStatus(otherCharts, CONNECT_STATUS_UPDATED);
                }
            });
        });
    };
})();
const echartsProto = ECharts.prototype;
echartsProto.on = createRegisterEventWithLowercaseECharts('on');
echartsProto.off = createRegisterEventWithLowercaseECharts('off');
/**
 * @deprecated
 */
// @ts-ignore
echartsProto.one = function (eventName, cb, ctx) {
    const self = this;
    deprecateLog('ECharts#one is deprecated.');
    function wrapped(...args2) {
        cb && cb.apply && cb.apply(this, args2);
        // @ts-ignore
        self.off(eventName, wrapped);
    }
    ;
    // @ts-ignore
    this.on.call(this, eventName, wrapped, ctx);
};
// /**
//  * Encode visual infomation from data after data processing
//  *
//  * @param {module:echarts/model/Global} ecModel
//  * @param {object} layout
//  * @param {boolean} [layoutFilter] `true`: only layout,
//  *                                 `false`: only not layout,
//  *                                 `null`/`undefined`: all.
//  * @param {string} taskBaseTag
//  * @private
//  */
// function startVisualEncoding(ecIns, ecModel, api, payload, layoutFilter) {
//     each(visualFuncs, function (visual, index) {
//         let isLayout = visual.isLayout;
//         if (layoutFilter == null
//             || (layoutFilter === false && !isLayout)
//             || (layoutFilter === true && isLayout)
//         ) {
//             visual.func(ecModel, api, payload);
//         }
//     });
// }
const MOUSE_EVENT_NAMES = [
    'click', 'dblclick', 'mouseover', 'mouseout', 'mousemove',
    'mousedown', 'mouseup', 'globalout', 'contextmenu'
];
function disposedWarning(id) {
    if (__DEV__) {
        console.warn('Instance ' + id + ' has been disposed');
    }
}
const actions = {};
/**
 * Map eventType to actionType
 */
const eventActionMap = {};
const dataProcessorFuncs = [];
const optionPreprocessorFuncs = [];
const visualFuncs = [];
const themeStorage = {};
const loadingEffects = {};
const instances = {};
const connectedGroups = {};
let idBase = +(new Date()) - 0;
let groupIdBase = +(new Date()) - 0;
const DOM_ATTRIBUTE_KEY = '_echarts_instance_';
/**
 * @param opts.devicePixelRatio Use window.devicePixelRatio by default
 * @param opts.renderer Can choose 'canvas' or 'svg' to render the chart.
 * @param opts.width Use clientWidth of the input `dom` by default.
 *        Can be 'auto' (the same as null/undefined)
 * @param opts.height Use clientHeight of the input `dom` by default.
 *        Can be 'auto' (the same as null/undefined)
 * @param opts.locale Specify the locale.
 * @param opts.useDirtyRect Enable dirty rectangle rendering or not.
 */
export function init(dom, theme, opts) {
    if (__DEV__) {
        if (!dom) {
            throw new Error('Initialize failed: invalid dom.');
        }
    }
    const existInstance = getInstanceByDom(dom);
    if (existInstance) {
        if (__DEV__) {
            console.warn('There is a chart instance already initialized on the dom.');
        }
        return existInstance;
    }
    if (__DEV__) {
        if (isDom(dom)
            && dom.nodeName.toUpperCase() !== 'CANVAS'
            && ((!dom.clientWidth && (!opts || opts.width == null))
                || (!dom.clientHeight && (!opts || opts.height == null)))) {
            console.warn('Can\'t get DOM width or height. Please check '
                + 'dom.clientWidth and dom.clientHeight. They should not be 0.'
                + 'For example, you may need to call this in the callback '
                + 'of window.onload.');
        }
    }
    const chart = new ECharts(dom, theme, opts);
    chart.id = 'ec_' + idBase++;
    instances[chart.id] = chart;
    modelUtil.setAttribute(dom, DOM_ATTRIBUTE_KEY, chart.id);
    enableConnect(chart);
    lifecycle.trigger('afterinit', chart);
    return chart;
}
/**
 * @usage
 * (A)
 * ```js
 * let chart1 = echarts.init(dom1);
 * let chart2 = echarts.init(dom2);
 * chart1.group = 'xxx';
 * chart2.group = 'xxx';
 * echarts.connect('xxx');
 * ```
 * (B)
 * ```js
 * let chart1 = echarts.init(dom1);
 * let chart2 = echarts.init(dom2);
 * echarts.connect('xxx', [chart1, chart2]);
 * ```
 */
export function connect(groupId) {
    // Is array of charts
    if (isArray(groupId)) {
        const charts = groupId;
        groupId = null;
        // If any chart has group
        each(charts, function (chart) {
            if (chart.group != null) {
                groupId = chart.group;
            }
        });
        groupId = groupId || ('g_' + groupIdBase++);
        each(charts, function (chart) {
            chart.group = groupId;
        });
    }
    connectedGroups[groupId] = true;
    return groupId;
}
/**
 * @deprecated
 */
export function disConnect(groupId) {
    connectedGroups[groupId] = false;
}
/**
 * Alias and backword compat
 */
export const disconnect = disConnect;
/**
 * Dispose a chart instance
 */
export function dispose(chart) {
    if (typeof chart === 'string') {
        chart = instances[chart];
    }
    else if (!(chart instanceof ECharts)) {
        // Try to treat as dom
        chart = getInstanceByDom(chart);
    }
    if ((chart instanceof ECharts) && !chart.isDisposed()) {
        chart.dispose();
    }
}
export function getInstanceByDom(dom) {
    return instances[modelUtil.getAttribute(dom, DOM_ATTRIBUTE_KEY)];
}
export function getInstanceById(key) {
    return instances[key];
}
/**
 * Register theme
 */
export function registerTheme(name, theme) {
    themeStorage[name] = theme;
}
/**
 * Register option preprocessor
 */
export function registerPreprocessor(preprocessorFunc) {
    if (indexOf(optionPreprocessorFuncs, preprocessorFunc) < 0) {
        optionPreprocessorFuncs.push(preprocessorFunc);
    }
}
export function registerProcessor(priority, processor) {
    normalizeRegister(dataProcessorFuncs, priority, processor, PRIORITY_PROCESSOR_DEFAULT);
}
/**
 * Register postIniter
 * @param {Function} postInitFunc
 */
export function registerPostInit(postInitFunc) {
    registerUpdateLifecycle('afterinit', postInitFunc);
}
/**
 * Register postUpdater
 * @param {Function} postUpdateFunc
 */
export function registerPostUpdate(postUpdateFunc) {
    registerUpdateLifecycle('afterupdate', postUpdateFunc);
}
export function registerUpdateLifecycle(name, cb) {
    lifecycle.on(name, cb);
}
export function registerAction(actionInfo, eventName, action) {
    if (typeof eventName === 'function') {
        action = eventName;
        eventName = '';
    }
    const actionType = isObject(actionInfo)
        ? actionInfo.type
        : ([actionInfo, actionInfo = {
                event: eventName
            }][0]);
    // Event name is all lowercase
    actionInfo.event = (actionInfo.event || actionType).toLowerCase();
    eventName = actionInfo.event;
    if (eventActionMap[eventName]) {
        // Already registered.
        return;
    }
    // Validate action type and event name.
    assert(ACTION_REG.test(actionType) && ACTION_REG.test(eventName));
    if (!actions[actionType]) {
        actions[actionType] = { action: action, actionInfo: actionInfo };
    }
    eventActionMap[eventName] = actionType;
}
export function registerCoordinateSystem(type, coordSysCreator) {
    CoordinateSystemManager.register(type, coordSysCreator);
}
/**
 * Get dimensions of specified coordinate system.
 * @param {string} type
 * @return {Array.<string|Object>}
 */
export function getCoordinateSystemDimensions(type) {
    const coordSysCreator = CoordinateSystemManager.get(type);
    if (coordSysCreator) {
        return coordSysCreator.getDimensionsInfo
            ? coordSysCreator.getDimensionsInfo()
            : coordSysCreator.dimensions.slice();
    }
}
export { registerLocale } from './locale';
function registerLayout(priority, layoutTask) {
    normalizeRegister(visualFuncs, priority, layoutTask, PRIORITY_VISUAL_LAYOUT, 'layout');
}
function registerVisual(priority, visualTask) {
    normalizeRegister(visualFuncs, priority, visualTask, PRIORITY_VISUAL_CHART, 'visual');
}
export { registerLayout, registerVisual };
const registeredTasks = [];
function normalizeRegister(targetList, priority, fn, defaultPriority, visualType) {
    if (isFunction(priority) || isObject(priority)) {
        fn = priority;
        priority = defaultPriority;
    }
    if (__DEV__) {
        if (isNaN(priority) || priority == null) {
            throw new Error('Illegal priority');
        }
        // Check duplicate
        each(targetList, function (wrap) {
            assert(wrap.__raw !== fn);
        });
    }
    // Already registered
    if (indexOf(registeredTasks, fn) >= 0) {
        return;
    }
    registeredTasks.push(fn);
    const stageHandler = Scheduler.wrapStageHandler(fn, visualType);
    stageHandler.__prio = priority;
    stageHandler.__raw = fn;
    targetList.push(stageHandler);
}
export function registerLoading(name, loadingFx) {
    loadingEffects[name] = loadingFx;
}
/**
 * ZRender need a canvas context to do measureText.
 * But in node environment canvas may be created by node-canvas.
 * So we need to specify how to create a canvas instead of using document.createElement('canvas')
 *
 * Be careful of using it in the browser.
 *
 * @example
 *     let Canvas = require('canvas');
 *     let echarts = require('echarts');
 *     echarts.setCanvasCreator(function () {
 *         // Small size is enough.
 *         return new Canvas(32, 32);
 *     });
 */
export function setCanvasCreator(creator) {
    $override('createCanvas', creator);
}
/**
 * The parameters and usage: see `geoSourceManager.registerMap`.
 * Compatible with previous `echarts.registerMap`.
 */
export function registerMap(mapName, geoJson, specialAreas) {
    geoSourceManager.registerMap(mapName, geoJson, specialAreas);
}
export function getMap(mapName) {
    return geoSourceManager.getMapForUser(mapName);
}
export const registerTransform = registerExternalTransform;
/**
 * Globa dispatchAction to a specified chart instance.
 */
// export function dispatchAction(payload: { chartId: string } & Payload, opt?: Parameters<ECharts['dispatchAction']>[1]) {
//     if (!payload || !payload.chartId) {
//         // Must have chartId to find chart
//         return;
//     }
//     const chart = instances[payload.chartId];
//     if (chart) {
//         chart.dispatchAction(payload, opt);
//     }
// }
// Buitlin global visual
registerVisual(PRIORITY_VISUAL_GLOBAL, seriesStyleTask);
registerVisual(PRIORITY_VISUAL_CHART_DATA_CUSTOM, dataStyleTask);
registerVisual(PRIORITY_VISUAL_CHART_DATA_CUSTOM, dataColorPaletteTask);
registerVisual(PRIORITY_VISUAL_GLOBAL, seriesSymbolTask);
registerVisual(PRIORITY_VISUAL_CHART_DATA_CUSTOM, dataSymbolTask);
registerVisual(PRIORITY_VISUAL_DECAL, decal);
registerPreprocessor(backwardCompat);
registerProcessor(PRIORITY_PROCESSOR_DATASTACK, dataStack);
registerLoading('default', loadingDefault);
// Default actions
registerAction({
    type: HIGHLIGHT_ACTION_TYPE,
    event: HIGHLIGHT_ACTION_TYPE,
    update: HIGHLIGHT_ACTION_TYPE
}, noop);
registerAction({
    type: DOWNPLAY_ACTION_TYPE,
    event: DOWNPLAY_ACTION_TYPE,
    update: DOWNPLAY_ACTION_TYPE
}, noop);
registerAction({
    type: SELECT_ACTION_TYPE,
    event: SELECT_ACTION_TYPE,
    update: SELECT_ACTION_TYPE
}, noop);
registerAction({
    type: UNSELECT_ACTION_TYPE,
    event: UNSELECT_ACTION_TYPE,
    update: UNSELECT_ACTION_TYPE
}, noop);
registerAction({
    type: TOGGLE_SELECT_ACTION_TYPE,
    event: TOGGLE_SELECT_ACTION_TYPE,
    update: TOGGLE_SELECT_ACTION_TYPE
}, noop);
// Default theme
registerTheme('light', lightTheme);
registerTheme('dark', darkTheme);
// For backward compatibility, where the namespace `dataTool` will
// be mounted on `echarts` is the extension `dataTool` is imported.
export const dataTool = {};
