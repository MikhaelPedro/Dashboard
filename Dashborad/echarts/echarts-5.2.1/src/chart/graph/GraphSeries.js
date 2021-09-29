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
import SeriesData from '../../data/SeriesData';
import * as zrUtil from 'zrender/src/core/util';
import { defaultEmphasis } from '../../util/model';
import Model from '../../model/Model';
import createGraphFromNodeEdge from '../helper/createGraphFromNodeEdge';
import LegendVisualProvider from '../../visual/LegendVisualProvider';
import SeriesModel from '../../model/Series';
import { createTooltipMarkup } from '../../component/tooltip/tooltipMarkup';
import { defaultSeriesFormatTooltip } from '../../component/tooltip/seriesFormatTooltip';
import { initCurvenessList, createEdgeMapForCurveness } from '../helper/multipleGraphEdgeHelper';
class GraphSeriesModel extends SeriesModel {
    constructor() {
        super(...arguments);
        this.type = GraphSeriesModel.type;
        this.hasSymbolVisual = true;
    }
    init(option) {
        super.init.apply(this, arguments);
        const self = this;
        function getCategoriesData() {
            return self._categoriesData;
        }
        // Provide data for legend select
        this.legendVisualProvider = new LegendVisualProvider(getCategoriesData, getCategoriesData);
        this.fillDataTextStyle(option.edges || option.links);
        this._updateCategoriesData();
    }
    mergeOption(option) {
        super.mergeOption.apply(this, arguments);
        this.fillDataTextStyle(option.edges || option.links);
        this._updateCategoriesData();
    }
    mergeDefaultAndTheme(option) {
        super.mergeDefaultAndTheme.apply(this, arguments);
        defaultEmphasis(option, 'edgeLabel', ['show']);
    }
    getInitialData(option, ecModel) {
        const edges = option.edges || option.links || [];
        const nodes = option.data || option.nodes || [];
        const self = this;
        if (nodes && edges) {
            // auto curveness
            initCurvenessList(this);
            const graph = createGraphFromNodeEdge(nodes, edges, this, true, beforeLink);
            zrUtil.each(graph.edges, function (edge) {
                createEdgeMapForCurveness(edge.node1, edge.node2, this, edge.dataIndex);
            }, this);
            return graph.data;
        }
        function beforeLink(nodeData, edgeData) {
            // Overwrite nodeData.getItemModel to
            nodeData.wrapMethod('getItemModel', function (model) {
                const categoriesModels = self._categoriesModels;
                const categoryIdx = model.getShallow('category');
                const categoryModel = categoriesModels[categoryIdx];
                if (categoryModel) {
                    categoryModel.parentModel = model.parentModel;
                    model.parentModel = categoryModel;
                }
                return model;
            });
            // TODO Inherit resolveParentPath by default in Model#getModel?
            const oldGetModel = Model.prototype.getModel;
            function newGetModel(path, parentModel) {
                const model = oldGetModel.call(this, path, parentModel);
                model.resolveParentPath = resolveParentPath;
                return model;
            }
            edgeData.wrapMethod('getItemModel', function (model) {
                model.resolveParentPath = resolveParentPath;
                model.getModel = newGetModel;
                return model;
            });
            function resolveParentPath(pathArr) {
                if (pathArr && (pathArr[0] === 'label' || pathArr[1] === 'label')) {
                    const newPathArr = pathArr.slice();
                    if (pathArr[0] === 'label') {
                        newPathArr[0] = 'edgeLabel';
                    }
                    else if (pathArr[1] === 'label') {
                        newPathArr[1] = 'edgeLabel';
                    }
                    return newPathArr;
                }
                return pathArr;
            }
        }
    }
    getGraph() {
        return this.getData().graph;
    }
    getEdgeData() {
        return this.getGraph().edgeData;
    }
    getCategoriesData() {
        return this._categoriesData;
    }
    formatTooltip(dataIndex, multipleSeries, dataType) {
        if (dataType === 'edge') {
            const nodeData = this.getData();
            const params = this.getDataParams(dataIndex, dataType);
            const edge = nodeData.graph.getEdgeByIndex(dataIndex);
            const sourceName = nodeData.getName(edge.node1.dataIndex);
            const targetName = nodeData.getName(edge.node2.dataIndex);
            const nameArr = [];
            sourceName != null && nameArr.push(sourceName);
            targetName != null && nameArr.push(targetName);
            return createTooltipMarkup('nameValue', {
                name: nameArr.join(' > '),
                value: params.value,
                noValue: params.value == null
            });
        }
        // dataType === 'node' or empty
        const nodeMarkup = defaultSeriesFormatTooltip({
            series: this,
            dataIndex: dataIndex,
            multipleSeries: multipleSeries
        });
        return nodeMarkup;
    }
    _updateCategoriesData() {
        const categories = zrUtil.map(this.option.categories || [], function (category) {
            // Data must has value
            return category.value != null ? category : zrUtil.extend({
                value: 0
            }, category);
        });
        const categoriesData = new SeriesData(['value'], this);
        categoriesData.initData(categories);
        this._categoriesData = categoriesData;
        this._categoriesModels = categoriesData.mapArray(function (idx) {
            return categoriesData.getItemModel(idx);
        });
    }
    setZoom(zoom) {
        this.option.zoom = zoom;
    }
    setCenter(center) {
        this.option.center = center;
    }
    isAnimationEnabled() {
        return super.isAnimationEnabled()
            // Not enable animation when do force layout
            && !(this.get('layout') === 'force' && this.get(['force', 'layoutAnimation']));
    }
}
GraphSeriesModel.type = 'series.graph';
GraphSeriesModel.dependencies = ['grid', 'polar', 'geo', 'singleAxis', 'calendar'];
GraphSeriesModel.defaultOption = {
    zlevel: 0,
    z: 2,
    coordinateSystem: 'view',
    // Default option for all coordinate systems
    // xAxisIndex: 0,
    // yAxisIndex: 0,
    // polarIndex: 0,
    // geoIndex: 0,
    legendHoverLink: true,
    layout: null,
    // Configuration of circular layout
    circular: {
        rotateLabel: false
    },
    // Configuration of force directed layout
    force: {
        initLayout: null,
        // Node repulsion. Can be an array to represent range.
        repulsion: [0, 50],
        gravity: 0.1,
        // Initial friction
        friction: 0.6,
        // Edge length. Can be an array to represent range.
        edgeLength: 30,
        layoutAnimation: true
    },
    left: 'center',
    top: 'center',
    // right: null,
    // bottom: null,
    // width: '80%',
    // height: '80%',
    symbol: 'circle',
    symbolSize: 10,
    edgeSymbol: ['none', 'none'],
    edgeSymbolSize: 10,
    edgeLabel: {
        position: 'middle',
        distance: 5
    },
    draggable: false,
    roam: false,
    // Default on center of graph
    center: null,
    zoom: 1,
    // Symbol size scale ratio in roam
    nodeScaleRatio: 0.6,
    // cursor: null,
    // categories: [],
    // data: []
    // Or
    // nodes: []
    //
    // links: []
    // Or
    // edges: []
    label: {
        show: false,
        formatter: '{b}'
    },
    itemStyle: {},
    lineStyle: {
        color: '#aaa',
        width: 1,
        opacity: 0.5
    },
    emphasis: {
        scale: true,
        label: {
            show: true
        }
    },
    select: {
        itemStyle: {
            borderColor: '#212121'
        }
    }
};
export default GraphSeriesModel;
