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
 * Caution: If the mechanism should be changed some day, these cases
 * should be considered:
 *
 * (1) In `merge option` mode, if using the same option to call `setOption`
 * many times, the result should be the same (try our best to ensure that).
 * (2) In `merge option` mode, if a component has no id/name specified, it
 * will be merged by index, and the result sequence of the components is
 * consistent to the original sequence.
 * (3) In `replaceMerge` mode, keep the result sequence of the components is
 * consistent to the original sequence, even though there might result in "hole".
 * (4) `reset` feature (in toolbox). Find detailed info in comments about
 * `mergeOption` in module:echarts/model/OptionManager.
 */
import { each, filter, isArray, isObject, isString, createHashMap, assert, clone, merge, extend, mixin, isFunction } from 'zrender/src/core/util';
import * as modelUtil from '../util/model';
import Model from './Model';
import ComponentModel from './Component';
import globalDefault from './globalDefault';
import { resetSourceDefaulter } from '../data/helper/sourceHelper';
import { concatInternalOptions } from './internalComponentCreator';
import { PaletteMixin } from './mixin/palette';
import { error } from '../util/log';
// -----------------------
// Internal method names:
// -----------------------
let reCreateSeriesIndices;
let assertSeriesInitialized;
let initBase;
const OPTION_INNER_KEY = '\0_ec_inner';
const OPTION_INNER_VALUE = 1;
const BUITIN_COMPONENTS_MAP = {
    grid: 'GridComponent',
    polar: 'PolarComponent',
    geo: 'GeoComponent',
    singleAxis: 'SingleAxisComponent',
    parallel: 'ParallelComponent',
    calendar: 'CalendarComponent',
    graphic: 'GraphicComponent',
    toolbox: 'ToolboxComponent',
    tooltip: 'TooltipComponent',
    axisPointer: 'AxisPointerComponent',
    brush: 'BrushComponent',
    title: 'TitleComponent',
    timeline: 'TimelineComponent',
    markPoint: 'MarkPointComponent',
    markLine: 'MarkLineComponent',
    markArea: 'MarkAreaComponent',
    legend: 'LegendComponent',
    dataZoom: 'DataZoomComponent',
    visualMap: 'VisualMapComponent',
    // aria: 'AriaComponent',
    // dataset: 'DatasetComponent',
    // Dependencies
    xAxis: 'GridComponent',
    yAxis: 'GridComponent',
    angleAxis: 'PolarComponent',
    radiusAxis: 'PolarComponent'
};
const BUILTIN_CHARTS_MAP = {
    line: 'LineChart',
    bar: 'BarChart',
    pie: 'PieChart',
    scatter: 'ScatterChart',
    radar: 'RadarChart',
    map: 'MapChart',
    tree: 'TreeChart',
    treemap: 'TreemapChart',
    graph: 'GraphChart',
    gauge: 'GaugeChart',
    funnel: 'FunnelChart',
    parallel: 'ParallelChart',
    sankey: 'SankeyChart',
    boxplot: 'BoxplotChart',
    candlestick: 'CandlestickChart',
    effectScatter: 'EffectScatterChart',
    lines: 'LinesChart',
    heatmap: 'HeatmapChart',
    pictorialBar: 'PictorialBarChart',
    themeRiver: 'ThemeRiverChart',
    sunburst: 'SunburstChart',
    custom: 'CustomChart'
};
const componetsMissingLogPrinted = {};
function checkMissingComponents(option) {
    each(option, function (componentOption, mainType) {
        if (!ComponentModel.hasClass(mainType)) {
            const componentImportName = BUITIN_COMPONENTS_MAP[mainType];
            if (componentImportName && !componetsMissingLogPrinted[componentImportName]) {
                error(`Component ${mainType} is used but not imported.
import { ${componentImportName} } from 'echarts/components';
echarts.use([${componentImportName}]);`);
                componetsMissingLogPrinted[componentImportName] = true;
            }
        }
    });
}
class GlobalModel extends Model {
    init(option, parentModel, ecModel, theme, locale, optionManager) {
        theme = theme || {};
        this.option = null; // Mark as not initialized.
        this._theme = new Model(theme);
        this._locale = new Model(locale);
        this._optionManager = optionManager;
    }
    setOption(option, opts, optionPreprocessorFuncs) {
        if (__DEV__) {
            assert(option != null, 'option is null/undefined');
            assert(option[OPTION_INNER_KEY] !== OPTION_INNER_VALUE, 'please use chart.getOption()');
        }
        const innerOpt = normalizeSetOptionInput(opts);
        this._optionManager.setOption(option, optionPreprocessorFuncs, innerOpt);
        this._resetOption(null, innerOpt);
    }
    /**
     * @param type null/undefined: reset all.
     *        'recreate': force recreate all.
     *        'timeline': only reset timeline option
     *        'media': only reset media query option
     * @return Whether option changed.
     */
    resetOption(type, opt) {
        return this._resetOption(type, normalizeSetOptionInput(opt));
    }
    _resetOption(type, opt) {
        let optionChanged = false;
        const optionManager = this._optionManager;
        if (!type || type === 'recreate') {
            const baseOption = optionManager.mountOption(type === 'recreate');
            if (__DEV__) {
                checkMissingComponents(baseOption);
            }
            if (!this.option || type === 'recreate') {
                initBase(this, baseOption);
            }
            else {
                this.restoreData();
                this._mergeOption(baseOption, opt);
            }
            optionChanged = true;
        }
        if (type === 'timeline' || type === 'media') {
            this.restoreData();
        }
        // By design, if `setOption(option2)` at the second time, and `option2` is a `ECUnitOption`,
        // it should better not have the same props with `MediaUnit['option']`.
        // Becuase either `option2` or `MediaUnit['option']` will be always merged to "current option"
        // rather than original "baseOption". If they both override a prop, the result might be
        // unexpected when media state changed after `setOption` called.
        // If we really need to modify a props in each `MediaUnit['option']`, use the full version
        // (`{baseOption, media}`) in `setOption`.
        // For `timeline`, the case is the same.
        if (!type || type === 'recreate' || type === 'timeline') {
            const timelineOption = optionManager.getTimelineOption(this);
            if (timelineOption) {
                optionChanged = true;
                this._mergeOption(timelineOption, opt);
            }
        }
        if (!type || type === 'recreate' || type === 'media') {
            const mediaOptions = optionManager.getMediaOption(this);
            if (mediaOptions.length) {
                each(mediaOptions, function (mediaOption) {
                    optionChanged = true;
                    this._mergeOption(mediaOption, opt);
                }, this);
            }
        }
        return optionChanged;
    }
    mergeOption(option) {
        this._mergeOption(option, null);
    }
    _mergeOption(newOption, opt) {
        const option = this.option;
        const componentsMap = this._componentsMap;
        const componentsCount = this._componentsCount;
        const newCmptTypes = [];
        const newCmptTypeMap = createHashMap();
        const replaceMergeMainTypeMap = opt && opt.replaceMergeMainTypeMap;
        resetSourceDefaulter(this);
        // If no component class, merge directly.
        // For example: color, animaiton options, etc.
        each(newOption, function (componentOption, mainType) {
            if (componentOption == null) {
                return;
            }
            if (!ComponentModel.hasClass(mainType)) {
                // globalSettingTask.dirty();
                option[mainType] = option[mainType] == null
                    ? clone(componentOption)
                    : merge(option[mainType], componentOption, true);
            }
            else if (mainType) {
                newCmptTypes.push(mainType);
                newCmptTypeMap.set(mainType, true);
            }
        });
        if (replaceMergeMainTypeMap) {
            // If there is a mainType `xxx` in `replaceMerge` but not declared in option,
            // we trade it as it is declared in option as `{xxx: []}`. Because:
            // (1) for normal merge, `{xxx: null/undefined}` are the same meaning as `{xxx: []}`.
            // (2) some preprocessor may convert some of `{xxx: null/undefined}` to `{xxx: []}`.
            replaceMergeMainTypeMap.each(function (val, mainTypeInReplaceMerge) {
                if (ComponentModel.hasClass(mainTypeInReplaceMerge) && !newCmptTypeMap.get(mainTypeInReplaceMerge)) {
                    newCmptTypes.push(mainTypeInReplaceMerge);
                    newCmptTypeMap.set(mainTypeInReplaceMerge, true);
                }
            });
        }
        ComponentModel.topologicalTravel(newCmptTypes, ComponentModel.getAllClassMainTypes(), visitComponent, this);
        function visitComponent(mainType) {
            const newCmptOptionList = concatInternalOptions(this, mainType, modelUtil.normalizeToArray(newOption[mainType]));
            const oldCmptList = componentsMap.get(mainType);
            const mergeMode = 
            // `!oldCmptList` means init. See the comment in `mappingToExists`
            !oldCmptList ? 'replaceAll'
                : (replaceMergeMainTypeMap && replaceMergeMainTypeMap.get(mainType)) ? 'replaceMerge'
                    : 'normalMerge';
            const mappingResult = modelUtil.mappingToExists(oldCmptList, newCmptOptionList, mergeMode);
            // Set mainType and complete subType.
            modelUtil.setComponentTypeToKeyInfo(mappingResult, mainType, ComponentModel);
            // Empty it before the travel, in order to prevent `this._componentsMap`
            // from being used in the `init`/`mergeOption`/`optionUpdated` of some
            // components, which is probably incorrect logic.
            option[mainType] = null;
            componentsMap.set(mainType, null);
            componentsCount.set(mainType, 0);
            const optionsByMainType = [];
            const cmptsByMainType = [];
            let cmptsCountByMainType = 0;
            each(mappingResult, function (resultItem, index) {
                let componentModel = resultItem.existing;
                const newCmptOption = resultItem.newOption;
                if (!newCmptOption) {
                    if (componentModel) {
                        // Consider where is no new option and should be merged using {},
                        // see removeEdgeAndAdd in topologicalTravel and
                        // ComponentModel.getAllClassMainTypes.
                        componentModel.mergeOption({}, this);
                        componentModel.optionUpdated({}, false);
                    }
                    // If no both `resultItem.exist` and `resultItem.option`,
                    // either it is in `replaceMerge` and not matched by any id,
                    // or it has been removed in previous `replaceMerge` and left a "hole" in this component index.
                }
                else {
                    const isSeriesType = mainType === 'series';
                    const ComponentModelClass = ComponentModel.getClass(mainType, resultItem.keyInfo.subType, !isSeriesType // Give a more detailed warn later if series don't exists
                    );
                    if (!ComponentModelClass) {
                        if (__DEV__) {
                            const subType = resultItem.keyInfo.subType;
                            const seriesImportName = BUILTIN_CHARTS_MAP[subType];
                            if (!componetsMissingLogPrinted[subType]) {
                                componetsMissingLogPrinted[subType] = true;
                                if (seriesImportName) {
                                    error(`Series ${subType} is used but not imported.
import { ${seriesImportName} } from 'echarts/charts';
echarts.use([${seriesImportName}]);`);
                                }
                                else {
                                    error(`Unkown series ${subType}`);
                                }
                            }
                        }
                        return;
                    }
                    if (componentModel && componentModel.constructor === ComponentModelClass) {
                        componentModel.name = resultItem.keyInfo.name;
                        // componentModel.settingTask && componentModel.settingTask.dirty();
                        componentModel.mergeOption(newCmptOption, this);
                        componentModel.optionUpdated(newCmptOption, false);
                    }
                    else {
                        // PENDING Global as parent ?
                        const extraOpt = extend({
                            componentIndex: index
                        }, resultItem.keyInfo);
                        componentModel = new ComponentModelClass(newCmptOption, this, this, extraOpt);
                        // Assign `keyInfo`
                        extend(componentModel, extraOpt);
                        if (resultItem.brandNew) {
                            componentModel.__requireNewView = true;
                        }
                        componentModel.init(newCmptOption, this, this);
                        // Call optionUpdated after init.
                        // newCmptOption has been used as componentModel.option
                        // and may be merged with theme and default, so pass null
                        // to avoid confusion.
                        componentModel.optionUpdated(null, true);
                    }
                }
                if (componentModel) {
                    optionsByMainType.push(componentModel.option);
                    cmptsByMainType.push(componentModel);
                    cmptsCountByMainType++;
                }
                else {
                    // Always do assign to avoid elided item in array.
                    optionsByMainType.push(void 0);
                    cmptsByMainType.push(void 0);
                }
            }, this);
            option[mainType] = optionsByMainType;
            componentsMap.set(mainType, cmptsByMainType);
            componentsCount.set(mainType, cmptsCountByMainType);
            // Backup series for filtering.
            if (mainType === 'series') {
                reCreateSeriesIndices(this);
            }
        }
        // If no series declared, ensure `_seriesIndices` initialized.
        if (!this._seriesIndices) {
            reCreateSeriesIndices(this);
        }
    }
    /**
     * Get option for output (cloned option and inner info removed)
     */
    getOption() {
        const option = clone(this.option);
        each(option, function (optInMainType, mainType) {
            if (ComponentModel.hasClass(mainType)) {
                const opts = modelUtil.normalizeToArray(optInMainType);
                // Inner cmpts need to be removed.
                // Inner cmpts might not be at last since ec5.0, but still
                // compatible for users: if inner cmpt at last, splice the returned array.
                let realLen = opts.length;
                let metNonInner = false;
                for (let i = realLen - 1; i >= 0; i--) {
                    // Remove options with inner id.
                    if (opts[i] && !modelUtil.isComponentIdInternal(opts[i])) {
                        metNonInner = true;
                    }
                    else {
                        opts[i] = null;
                        !metNonInner && realLen--;
                    }
                }
                opts.length = realLen;
                option[mainType] = opts;
            }
        });
        delete option[OPTION_INNER_KEY];
        return option;
    }
    getTheme() {
        return this._theme;
    }
    getLocaleModel() {
        return this._locale;
    }
    setUpdatePayload(payload) {
        this._payload = payload;
    }
    getUpdatePayload() {
        return this._payload;
    }
    /**
     * @param idx If not specified, return the first one.
     */
    getComponent(mainType, idx) {
        const list = this._componentsMap.get(mainType);
        if (list) {
            const cmpt = list[idx || 0];
            if (cmpt) {
                return cmpt;
            }
            else if (idx == null) {
                for (let i = 0; i < list.length; i++) {
                    if (list[i]) {
                        return list[i];
                    }
                }
            }
        }
    }
    /**
     * @return Never be null/undefined.
     */
    queryComponents(condition) {
        const mainType = condition.mainType;
        if (!mainType) {
            return [];
        }
        const index = condition.index;
        const id = condition.id;
        const name = condition.name;
        const cmpts = this._componentsMap.get(mainType);
        if (!cmpts || !cmpts.length) {
            return [];
        }
        let result;
        if (index != null) {
            result = [];
            each(modelUtil.normalizeToArray(index), function (idx) {
                cmpts[idx] && result.push(cmpts[idx]);
            });
        }
        else if (id != null) {
            result = queryByIdOrName('id', id, cmpts);
        }
        else if (name != null) {
            result = queryByIdOrName('name', name, cmpts);
        }
        else {
            // Return all non-empty components in that mainType
            result = filter(cmpts, cmpt => !!cmpt);
        }
        return filterBySubType(result, condition);
    }
    /**
     * The interface is different from queryComponents,
     * which is convenient for inner usage.
     *
     * @usage
     * let result = findComponents(
     *     {mainType: 'dataZoom', query: {dataZoomId: 'abc'}}
     * );
     * let result = findComponents(
     *     {mainType: 'series', subType: 'pie', query: {seriesName: 'uio'}}
     * );
     * let result = findComponents(
     *     {mainType: 'series',
     *     filter: function (model, index) {...}}
     * );
     * // result like [component0, componnet1, ...]
     */
    findComponents(condition) {
        const query = condition.query;
        const mainType = condition.mainType;
        const queryCond = getQueryCond(query);
        const result = queryCond
            ? this.queryComponents(queryCond)
            // Retrieve all non-empty components.
            : filter(this._componentsMap.get(mainType), cmpt => !!cmpt);
        return doFilter(filterBySubType(result, condition));
        function getQueryCond(q) {
            const indexAttr = mainType + 'Index';
            const idAttr = mainType + 'Id';
            const nameAttr = mainType + 'Name';
            return q && (q[indexAttr] != null
                || q[idAttr] != null
                || q[nameAttr] != null)
                ? {
                    mainType: mainType,
                    // subType will be filtered finally.
                    index: q[indexAttr],
                    id: q[idAttr],
                    name: q[nameAttr]
                }
                : null;
        }
        function doFilter(res) {
            return condition.filter
                ? filter(res, condition.filter)
                : res;
        }
    }
    eachComponent(mainType, cb, context) {
        const componentsMap = this._componentsMap;
        if (isFunction(mainType)) {
            const ctxForAll = cb;
            const cbForAll = mainType;
            componentsMap.each(function (cmpts, componentType) {
                for (let i = 0; cmpts && i < cmpts.length; i++) {
                    const cmpt = cmpts[i];
                    cmpt && cbForAll.call(ctxForAll, componentType, cmpt, cmpt.componentIndex);
                }
            });
        }
        else {
            const cmpts = isString(mainType)
                ? componentsMap.get(mainType)
                : isObject(mainType)
                    ? this.findComponents(mainType)
                    : null;
            for (let i = 0; cmpts && i < cmpts.length; i++) {
                const cmpt = cmpts[i];
                cmpt && cb.call(context, cmpt, cmpt.componentIndex);
            }
        }
    }
    /**
     * Get series list before filtered by name.
     */
    getSeriesByName(name) {
        const nameStr = modelUtil.convertOptionIdName(name, null);
        return filter(this._componentsMap.get('series'), oneSeries => !!oneSeries && nameStr != null && oneSeries.name === nameStr);
    }
    /**
     * Get series list before filtered by index.
     */
    getSeriesByIndex(seriesIndex) {
        return this._componentsMap.get('series')[seriesIndex];
    }
    /**
     * Get series list before filtered by type.
     * FIXME: rename to getRawSeriesByType?
     */
    getSeriesByType(subType) {
        return filter(this._componentsMap.get('series'), oneSeries => !!oneSeries && oneSeries.subType === subType);
    }
    /**
     * Get all series before filtered.
     */
    getSeries() {
        return filter(this._componentsMap.get('series'), oneSeries => !!oneSeries);
    }
    /**
     * Count series before filtered.
     */
    getSeriesCount() {
        return this._componentsCount.get('series');
    }
    /**
     * After filtering, series may be different
     * frome raw series.
     */
    eachSeries(cb, context) {
        assertSeriesInitialized(this);
        each(this._seriesIndices, function (rawSeriesIndex) {
            const series = this._componentsMap.get('series')[rawSeriesIndex];
            cb.call(context, series, rawSeriesIndex);
        }, this);
    }
    /**
     * Iterate raw series before filtered.
     *
     * @param {Function} cb
     * @param {*} context
     */
    eachRawSeries(cb, context) {
        each(this._componentsMap.get('series'), function (series) {
            series && cb.call(context, series, series.componentIndex);
        });
    }
    /**
     * After filtering, series may be different.
     * frome raw series.
     */
    eachSeriesByType(subType, cb, context) {
        assertSeriesInitialized(this);
        each(this._seriesIndices, function (rawSeriesIndex) {
            const series = this._componentsMap.get('series')[rawSeriesIndex];
            if (series.subType === subType) {
                cb.call(context, series, rawSeriesIndex);
            }
        }, this);
    }
    /**
     * Iterate raw series before filtered of given type.
     */
    eachRawSeriesByType(subType, cb, context) {
        return each(this.getSeriesByType(subType), cb, context);
    }
    isSeriesFiltered(seriesModel) {
        assertSeriesInitialized(this);
        return this._seriesIndicesMap.get(seriesModel.componentIndex) == null;
    }
    getCurrentSeriesIndices() {
        return (this._seriesIndices || []).slice();
    }
    filterSeries(cb, context) {
        assertSeriesInitialized(this);
        const newSeriesIndices = [];
        each(this._seriesIndices, function (seriesRawIdx) {
            const series = this._componentsMap.get('series')[seriesRawIdx];
            cb.call(context, series, seriesRawIdx) && newSeriesIndices.push(seriesRawIdx);
        }, this);
        this._seriesIndices = newSeriesIndices;
        this._seriesIndicesMap = createHashMap(newSeriesIndices);
    }
    restoreData(payload) {
        reCreateSeriesIndices(this);
        const componentsMap = this._componentsMap;
        const componentTypes = [];
        componentsMap.each(function (components, componentType) {
            if (ComponentModel.hasClass(componentType)) {
                componentTypes.push(componentType);
            }
        });
        ComponentModel.topologicalTravel(componentTypes, ComponentModel.getAllClassMainTypes(), function (componentType) {
            each(componentsMap.get(componentType), function (component) {
                if (component
                    && (componentType !== 'series'
                        || !isNotTargetSeries(component, payload))) {
                    component.restoreData();
                }
            });
        });
    }
}
GlobalModel.internalField = (function () {
    reCreateSeriesIndices = function (ecModel) {
        const seriesIndices = ecModel._seriesIndices = [];
        each(ecModel._componentsMap.get('series'), function (series) {
            // series may have been removed by `replaceMerge`.
            series && seriesIndices.push(series.componentIndex);
        });
        ecModel._seriesIndicesMap = createHashMap(seriesIndices);
    };
    assertSeriesInitialized = function (ecModel) {
        // Components that use _seriesIndices should depends on series component,
        // which make sure that their initialization is after series.
        if (__DEV__) {
            if (!ecModel._seriesIndices) {
                throw new Error('Option should contains series.');
            }
        }
    };
    initBase = function (ecModel, baseOption) {
        // Using OPTION_INNER_KEY to mark that this option can not be used outside,
        // i.e. `chart.setOption(chart.getModel().option);` is forbiden.
        ecModel.option = {};
        ecModel.option[OPTION_INNER_KEY] = OPTION_INNER_VALUE;
        // Init with series: [], in case of calling findSeries method
        // before series initialized.
        ecModel._componentsMap = createHashMap({ series: [] });
        ecModel._componentsCount = createHashMap();
        // If user spefied `option.aria`, aria will be enable. This detection should be
        // performed before theme and globalDefault merge.
        const airaOption = baseOption.aria;
        if (isObject(airaOption) && airaOption.enabled == null) {
            airaOption.enabled = true;
        }
        mergeTheme(baseOption, ecModel._theme.option);
        // TODO Needs clone when merging to the unexisted property
        merge(baseOption, globalDefault, false);
        ecModel._mergeOption(baseOption, null);
    };
})();
function isNotTargetSeries(seriesModel, payload) {
    if (payload) {
        const index = payload.seriesIndex;
        const id = payload.seriesId;
        const name = payload.seriesName;
        return (index != null && seriesModel.componentIndex !== index)
            || (id != null && seriesModel.id !== id)
            || (name != null && seriesModel.name !== name);
    }
}
function mergeTheme(option, theme) {
    // PENDING
    // NOT use `colorLayer` in theme if option has `color`
    const notMergeColorLayer = option.color && !option.colorLayer;
    each(theme, function (themeItem, name) {
        if (name === 'colorLayer' && notMergeColorLayer) {
            return;
        }
        // If it is component model mainType, the model handles that merge later.
        // otherwise, merge them here.
        if (!ComponentModel.hasClass(name)) {
            if (typeof themeItem === 'object') {
                option[name] = !option[name]
                    ? clone(themeItem)
                    : merge(option[name], themeItem, false);
            }
            else {
                if (option[name] == null) {
                    option[name] = themeItem;
                }
            }
        }
    });
}
function queryByIdOrName(attr, idOrName, cmpts) {
    // Here is a break from echarts4: string and number are
    // treated as equal.
    if (isArray(idOrName)) {
        const keyMap = createHashMap();
        each(idOrName, function (idOrNameItem) {
            if (idOrNameItem != null) {
                const idName = modelUtil.convertOptionIdName(idOrNameItem, null);
                idName != null && keyMap.set(idOrNameItem, true);
            }
        });
        return filter(cmpts, cmpt => cmpt && keyMap.get(cmpt[attr]));
    }
    else {
        const idName = modelUtil.convertOptionIdName(idOrName, null);
        return filter(cmpts, cmpt => cmpt && idName != null && cmpt[attr] === idName);
    }
}
function filterBySubType(components, condition) {
    // Using hasOwnProperty for restrict. Consider
    // subType is undefined in user payload.
    return condition.hasOwnProperty('subType')
        ? filter(components, cmpt => cmpt && cmpt.subType === condition.subType)
        : components;
}
function normalizeSetOptionInput(opts) {
    const replaceMergeMainTypeMap = createHashMap();
    opts && each(modelUtil.normalizeToArray(opts.replaceMerge), function (mainType) {
        if (__DEV__) {
            assert(ComponentModel.hasClass(mainType), '"' + mainType + '" is not valid component main type in "replaceMerge"');
        }
        replaceMergeMainTypeMap.set(mainType, true);
    });
    return {
        replaceMergeMainTypeMap: replaceMergeMainTypeMap
    };
}
mixin(GlobalModel, PaletteMixin);
export default GlobalModel;
