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
import env from 'zrender/src/core/env';
import * as modelUtil from '../util/model';
import ComponentModel from './Component';
import { PaletteMixin } from './mixin/palette';
import { DataFormatMixin } from '../model/mixin/dataFormat';
import { getLayoutParams, mergeLayoutParam, fetchLayoutMode } from '../util/layout';
import { createTask } from '../core/task';
import { mountExtend } from '../util/clazz';
import { SourceManager } from '../data/helper/sourceManager';
import { defaultSeriesFormatTooltip } from '../component/tooltip/seriesFormatTooltip';
const inner = modelUtil.makeInner();
function getSelectionKey(data, dataIndex) {
    return data.getName(dataIndex) || data.getId(dataIndex);
}
export const SERIES_UNIVERSAL_TRANSITION_PROP = '__universalTransitionEnabled';
class SeriesModel extends ComponentModel {
    constructor() {
        // [Caution]: Becuase this class or desecendants can be used as `XXX.extend(subProto)`,
        // the class members must not be initialized in constructor or declaration place.
        // Otherwise there is bad case:
        //   class A {xxx = 1;}
        //   enableClassExtend(A);
        //   class B extends A {}
        //   var C = B.extend({xxx: 5});
        //   var c = new C();
        //   console.log(c.xxx); // expect 5 but always 1.
        super(...arguments);
        // ---------------------------------------
        // Props about data selection
        // ---------------------------------------
        this._selectedDataIndicesMap = {};
    }
    init(option, parentModel, ecModel) {
        this.seriesIndex = this.componentIndex;
        this.dataTask = createTask({
            count: dataTaskCount,
            reset: dataTaskReset
        });
        this.dataTask.context = { model: this };
        this.mergeDefaultAndTheme(option, ecModel);
        const sourceManager = inner(this).sourceManager = new SourceManager(this);
        sourceManager.prepareSource();
        const data = this.getInitialData(option, ecModel);
        wrapData(data, this);
        this.dataTask.context.data = data;
        if (__DEV__) {
            zrUtil.assert(data, 'getInitialData returned invalid data.');
        }
        inner(this).dataBeforeProcessed = data;
        // If we reverse the order (make data firstly, and then make
        // dataBeforeProcessed by cloneShallow), cloneShallow will
        // cause data.graph.data !== data when using
        // module:echarts/data/Graph or module:echarts/data/Tree.
        // See module:echarts/data/helper/linkSeriesData
        // Theoretically, it is unreasonable to call `seriesModel.getData()` in the model
        // init or merge stage, because the data can be restored. So we do not `restoreData`
        // and `setData` here, which forbids calling `seriesModel.getData()` in this stage.
        // Call `seriesModel.getRawData()` instead.
        // this.restoreData();
        autoSeriesName(this);
        this._initSelectedMapFromData(data);
    }
    /**
     * Util for merge default and theme to option
     */
    mergeDefaultAndTheme(option, ecModel) {
        const layoutMode = fetchLayoutMode(this);
        const inputPositionParams = layoutMode
            ? getLayoutParams(option) : {};
        // Backward compat: using subType on theme.
        // But if name duplicate between series subType
        // (for example: parallel) add component mainType,
        // add suffix 'Series'.
        let themeSubType = this.subType;
        if (ComponentModel.hasClass(themeSubType)) {
            themeSubType += 'Series';
        }
        zrUtil.merge(option, ecModel.getTheme().get(this.subType));
        zrUtil.merge(option, this.getDefaultOption());
        // Default label emphasis `show`
        modelUtil.defaultEmphasis(option, 'label', ['show']);
        this.fillDataTextStyle(option.data);
        if (layoutMode) {
            mergeLayoutParam(option, inputPositionParams, layoutMode);
        }
    }
    mergeOption(newSeriesOption, ecModel) {
        // this.settingTask.dirty();
        newSeriesOption = zrUtil.merge(this.option, newSeriesOption, true);
        this.fillDataTextStyle(newSeriesOption.data);
        const layoutMode = fetchLayoutMode(this);
        if (layoutMode) {
            mergeLayoutParam(this.option, newSeriesOption, layoutMode);
        }
        const sourceManager = inner(this).sourceManager;
        sourceManager.dirty();
        sourceManager.prepareSource();
        const data = this.getInitialData(newSeriesOption, ecModel);
        wrapData(data, this);
        this.dataTask.dirty();
        this.dataTask.context.data = data;
        inner(this).dataBeforeProcessed = data;
        autoSeriesName(this);
        this._initSelectedMapFromData(data);
    }
    fillDataTextStyle(data) {
        // Default data label emphasis `show`
        // FIXME Tree structure data ?
        // FIXME Performance ?
        if (data && !zrUtil.isTypedArray(data)) {
            const props = ['show'];
            for (let i = 0; i < data.length; i++) {
                if (data[i] && data[i].label) {
                    modelUtil.defaultEmphasis(data[i], 'label', props);
                }
            }
        }
    }
    /**
     * Init a data structure from data related option in series
     * Must be overriden.
     */
    getInitialData(option, ecModel) {
        return;
    }
    /**
     * Append data to list
     */
    appendData(params) {
        // FIXME ???
        // (1) If data from dataset, forbidden append.
        // (2) support append data of dataset.
        const data = this.getRawData();
        data.appendData(params.data);
    }
    /**
     * Consider some method like `filter`, `map` need make new data,
     * We should make sure that `seriesModel.getData()` get correct
     * data in the stream procedure. So we fetch data from upstream
     * each time `task.perform` called.
     */
    getData(dataType) {
        const task = getCurrentTask(this);
        if (task) {
            const data = task.context.data;
            return (dataType == null ? data : data.getLinkedData(dataType));
        }
        else {
            // When series is not alive (that may happen when click toolbox
            // restore or setOption with not merge mode), series data may
            // be still need to judge animation or something when graphic
            // elements want to know whether fade out.
            return inner(this).data;
        }
    }
    getAllData() {
        const mainData = this.getData();
        return (mainData && mainData.getLinkedDataAll)
            ? mainData.getLinkedDataAll()
            : [{ data: mainData }];
    }
    setData(data) {
        const task = getCurrentTask(this);
        if (task) {
            const context = task.context;
            // Consider case: filter, data sample.
            // FIXME:TS never used, so comment it
            // if (context.data !== data && task.modifyOutputEnd) {
            //     task.setOutputEnd(data.count());
            // }
            context.outputData = data;
            // Caution: setData should update context.data,
            // Because getData may be called multiply in a
            // single stage and expect to get the data just
            // set. (For example, AxisProxy, x y both call
            // getData and setDate sequentially).
            // So the context.data should be fetched from
            // upstream each time when a stage starts to be
            // performed.
            if (task !== this.dataTask) {
                context.data = data;
            }
        }
        inner(this).data = data;
    }
    getEncode() {
        const encode = this.get('encode', true);
        if (encode) {
            return zrUtil.createHashMap(encode);
        }
    }
    getSourceManager() {
        return inner(this).sourceManager;
    }
    getSource() {
        return this.getSourceManager().getSource();
    }
    /**
     * Get data before processed
     */
    getRawData() {
        return inner(this).dataBeforeProcessed;
    }
    getColorBy() {
        const colorBy = this.get('colorBy');
        return colorBy || 'series';
    }
    isColorBySeries() {
        return this.getColorBy() === 'series';
    }
    /**
     * Get base axis if has coordinate system and has axis.
     * By default use coordSys.getBaseAxis();
     * Can be overrided for some chart.
     * @return {type} description
     */
    getBaseAxis() {
        const coordSys = this.coordinateSystem;
        // @ts-ignore
        return coordSys && coordSys.getBaseAxis && coordSys.getBaseAxis();
    }
    /**
     * Default tooltip formatter
     *
     * @param dataIndex
     * @param multipleSeries
     * @param dataType
     * @param renderMode valid values: 'html'(by default) and 'richText'.
     *        'html' is used for rendering tooltip in extra DOM form, and the result
     *        string is used as DOM HTML content.
     *        'richText' is used for rendering tooltip in rich text form, for those where
     *        DOM operation is not supported.
     * @return formatted tooltip with `html` and `markers`
     *        Notice: The override method can also return string
     */
    formatTooltip(dataIndex, multipleSeries, dataType) {
        return defaultSeriesFormatTooltip({
            series: this,
            dataIndex: dataIndex,
            multipleSeries: multipleSeries
        });
    }
    isAnimationEnabled() {
        if (env.node) {
            return false;
        }
        let animationEnabled = this.getShallow('animation');
        if (animationEnabled) {
            if (this.getData().count() > this.getShallow('animationThreshold')) {
                animationEnabled = false;
            }
        }
        return !!animationEnabled;
    }
    restoreData() {
        this.dataTask.dirty();
    }
    getColorFromPalette(name, scope, requestColorNum) {
        const ecModel = this.ecModel;
        // PENDING
        let color = PaletteMixin.prototype.getColorFromPalette.call(this, name, scope, requestColorNum);
        if (!color) {
            color = ecModel.getColorFromPalette(name, scope, requestColorNum);
        }
        return color;
    }
    /**
     * Use `data.mapDimensionsAll(coordDim)` instead.
     * @deprecated
     */
    coordDimToDataDim(coordDim) {
        return this.getRawData().mapDimensionsAll(coordDim);
    }
    /**
     * Get progressive rendering count each step
     */
    getProgressive() {
        return this.get('progressive');
    }
    /**
     * Get progressive rendering count each step
     */
    getProgressiveThreshold() {
        return this.get('progressiveThreshold');
    }
    // PENGING If selectedMode is null ?
    select(innerDataIndices, dataType) {
        this._innerSelect(this.getData(dataType), innerDataIndices);
    }
    unselect(innerDataIndices, dataType) {
        const selectedMap = this.option.selectedMap;
        if (!selectedMap) {
            return;
        }
        const data = this.getData(dataType);
        for (let i = 0; i < innerDataIndices.length; i++) {
            const dataIndex = innerDataIndices[i];
            const nameOrId = getSelectionKey(data, dataIndex);
            selectedMap[nameOrId] = false;
            this._selectedDataIndicesMap[nameOrId] = -1;
        }
    }
    toggleSelect(innerDataIndices, dataType) {
        const tmpArr = [];
        for (let i = 0; i < innerDataIndices.length; i++) {
            tmpArr[0] = innerDataIndices[i];
            this.isSelected(innerDataIndices[i], dataType)
                ? this.unselect(tmpArr, dataType)
                : this.select(tmpArr, dataType);
        }
    }
    getSelectedDataIndices() {
        const selectedDataIndicesMap = this._selectedDataIndicesMap;
        const nameOrIds = zrUtil.keys(selectedDataIndicesMap);
        const dataIndices = [];
        for (let i = 0; i < nameOrIds.length; i++) {
            const dataIndex = selectedDataIndicesMap[nameOrIds[i]];
            if (dataIndex >= 0) {
                dataIndices.push(dataIndex);
            }
        }
        return dataIndices;
    }
    isSelected(dataIndex, dataType) {
        const selectedMap = this.option.selectedMap;
        if (!selectedMap) {
            return false;
        }
        const data = this.getData(dataType);
        const nameOrId = getSelectionKey(data, dataIndex);
        return selectedMap[nameOrId] || false;
    }
    isUniversalTransitionEnabled() {
        if (this[SERIES_UNIVERSAL_TRANSITION_PROP]) {
            return true;
        }
        const universalTransitionOpt = this.option.universalTransition;
        // Quick reject
        if (!universalTransitionOpt) {
            return false;
        }
        if (universalTransitionOpt === true) {
            return true;
        }
        // Can be simply 'universalTransition: true'
        return universalTransitionOpt && universalTransitionOpt.enabled;
    }
    _innerSelect(data, innerDataIndices) {
        const selectedMode = this.option.selectedMode;
        const len = innerDataIndices.length;
        if (!selectedMode || !len) {
            return;
        }
        if (selectedMode === 'multiple') {
            const selectedMap = this.option.selectedMap || (this.option.selectedMap = {});
            for (let i = 0; i < len; i++) {
                const dataIndex = innerDataIndices[i];
                // TODO diffrent types of data share same object.
                const nameOrId = getSelectionKey(data, dataIndex);
                selectedMap[nameOrId] = true;
                this._selectedDataIndicesMap[nameOrId] = data.getRawIndex(dataIndex);
            }
        }
        else if (selectedMode === 'single' || selectedMode === true) {
            const lastDataIndex = innerDataIndices[len - 1];
            const nameOrId = getSelectionKey(data, lastDataIndex);
            this.option.selectedMap = {
                [nameOrId]: true
            };
            this._selectedDataIndicesMap = {
                [nameOrId]: data.getRawIndex(lastDataIndex)
            };
        }
    }
    _initSelectedMapFromData(data) {
        // Ignore select info in data if selectedMap exists.
        // NOTE It's only for legacy usage. edge data is not supported.
        if (this.option.selectedMap) {
            return;
        }
        const dataIndices = [];
        if (data.hasItemOption) {
            data.each(function (idx) {
                const rawItem = data.getRawDataItem(idx);
                if (rawItem && rawItem.selected) {
                    dataIndices.push(idx);
                }
            });
        }
        if (dataIndices.length > 0) {
            this._innerSelect(data, dataIndices);
        }
    }
    // /**
    //  * @see {module:echarts/stream/Scheduler}
    //  */
    // abstract pipeTask: null
    static registerClass(clz) {
        return ComponentModel.registerClass(clz);
    }
}
SeriesModel.protoInitialize = (function () {
    const proto = SeriesModel.prototype;
    proto.type = 'series.__base__';
    proto.seriesIndex = 0;
    proto.ignoreStyleOnData = false;
    proto.hasSymbolVisual = false;
    proto.defaultSymbol = 'circle';
    // Make sure the values can be accessed!
    proto.visualStyleAccessPath = 'itemStyle';
    proto.visualDrawType = 'fill';
})();
zrUtil.mixin(SeriesModel, DataFormatMixin);
zrUtil.mixin(SeriesModel, PaletteMixin);
mountExtend(SeriesModel, ComponentModel);
/**
 * MUST be called after `prepareSource` called
 * Here we need to make auto series, especially for auto legend. But we
 * do not modify series.name in option to avoid side effects.
 */
function autoSeriesName(seriesModel) {
    // User specified name has higher priority, otherwise it may cause
    // series can not be queried unexpectedly.
    const name = seriesModel.name;
    if (!modelUtil.isNameSpecified(seriesModel)) {
        seriesModel.name = getSeriesAutoName(seriesModel) || name;
    }
}
function getSeriesAutoName(seriesModel) {
    const data = seriesModel.getRawData();
    const dataDims = data.mapDimensionsAll('seriesName');
    const nameArr = [];
    zrUtil.each(dataDims, function (dataDim) {
        const dimInfo = data.getDimensionInfo(dataDim);
        dimInfo.displayName && nameArr.push(dimInfo.displayName);
    });
    return nameArr.join(' ');
}
function dataTaskCount(context) {
    return context.model.getRawData().count();
}
function dataTaskReset(context) {
    const seriesModel = context.model;
    seriesModel.setData(seriesModel.getRawData().cloneShallow());
    return dataTaskProgress;
}
function dataTaskProgress(param, context) {
    // Avoid repead cloneShallow when data just created in reset.
    if (context.outputData && param.end > context.outputData.count()) {
        context.model.getRawData().cloneShallow(context.outputData);
    }
}
// TODO refactor
function wrapData(data, seriesModel) {
    zrUtil.each(zrUtil.concatArray(data.CHANGABLE_METHODS, data.DOWNSAMPLE_METHODS), function (methodName) {
        data.wrapMethod(methodName, zrUtil.curry(onDataChange, seriesModel));
    });
}
function onDataChange(seriesModel, newList) {
    const task = getCurrentTask(seriesModel);
    if (task) {
        // Consider case: filter, selectRange
        task.setOutputEnd((newList || this).count());
    }
    return newList;
}
function getCurrentTask(seriesModel) {
    const scheduler = (seriesModel.ecModel || {}).scheduler;
    const pipeline = scheduler && scheduler.getPipeline(seriesModel.uid);
    if (pipeline) {
        // When pipline finished, the currrentTask keep the last
        // task (renderTask).
        let task = pipeline.currentTask;
        if (task) {
            const agentStubMap = task.agentStubMap;
            if (agentStubMap) {
                task = agentStubMap.get(seriesModel.uid);
            }
        }
        return task;
    }
}
export default SeriesModel;
