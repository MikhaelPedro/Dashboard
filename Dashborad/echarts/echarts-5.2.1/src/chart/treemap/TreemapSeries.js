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
import SeriesModel from '../../model/Series';
import Tree from '../../data/Tree';
import Model from '../../model/Model';
import { wrapTreePathInfo } from '../helper/treeHelper';
import { normalizeToArray } from '../../util/model';
import { createTooltipMarkup } from '../../component/tooltip/tooltipMarkup';
import enableAriaDecalForTree from '../helper/enableAriaDecalForTree';
class TreemapSeriesModel extends SeriesModel {
    constructor() {
        super(...arguments);
        this.type = TreemapSeriesModel.type;
        this.preventUsingHoverLayer = true;
    }
    /**
     * @override
     */
    getInitialData(option, ecModel) {
        // Create a virtual root.
        const root = {
            name: option.name,
            children: option.data
        };
        completeTreeValue(root);
        let levels = option.levels || [];
        // Used in "visual priority" in `treemapVisual.js`.
        // This way is a little tricky, must satisfy the precondition:
        //   1. There is no `treeNode.getModel('itemStyle.xxx')` used.
        //   2. The `Model.prototype.getModel()` will not use any clone-like way.
        const designatedVisualItemStyle = this.designatedVisualItemStyle = {};
        const designatedVisualModel = new Model({ itemStyle: designatedVisualItemStyle }, this, ecModel);
        levels = option.levels = setDefault(levels, ecModel);
        const levelModels = zrUtil.map(levels || [], function (levelDefine) {
            return new Model(levelDefine, designatedVisualModel, ecModel);
        }, this);
        // Make sure always a new tree is created when setOption,
        // in TreemapView, we check whether oldTree === newTree
        // to choose mappings approach among old shapes and new shapes.
        const tree = Tree.createTree(root, this, beforeLink);
        function beforeLink(nodeData) {
            nodeData.wrapMethod('getItemModel', function (model, idx) {
                const node = tree.getNodeByDataIndex(idx);
                const levelModel = node ? levelModels[node.depth] : null;
                // If no levelModel, we also need `designatedVisualModel`.
                model.parentModel = levelModel || designatedVisualModel;
                return model;
            });
        }
        return tree.data;
    }
    optionUpdated() {
        this.resetViewRoot();
    }
    /**
     * @override
     * @param {number} dataIndex
     * @param {boolean} [mutipleSeries=false]
     */
    formatTooltip(dataIndex, multipleSeries, dataType) {
        const data = this.getData();
        const value = this.getRawValue(dataIndex);
        const name = data.getName(dataIndex);
        return createTooltipMarkup('nameValue', { name: name, value: value });
    }
    /**
     * Add tree path to tooltip param
     *
     * @override
     * @param {number} dataIndex
     * @return {Object}
     */
    getDataParams(dataIndex) {
        const params = super.getDataParams.apply(this, arguments);
        const node = this.getData().tree.getNodeByDataIndex(dataIndex);
        params.treeAncestors = wrapTreePathInfo(node, this);
        // compatitable the previous code.
        params.treePathInfo = params.treeAncestors;
        return params;
    }
    /**
     * @public
     * @param {Object} layoutInfo {
     *                                x: containerGroup x
     *                                y: containerGroup y
     *                                width: containerGroup width
     *                                height: containerGroup height
     *                            }
     */
    setLayoutInfo(layoutInfo) {
        /**
         * @readOnly
         * @type {Object}
         */
        this.layoutInfo = this.layoutInfo || {};
        zrUtil.extend(this.layoutInfo, layoutInfo);
    }
    /**
     * @param  {string} id
     * @return {number} index
     */
    mapIdToIndex(id) {
        // A feature is implemented:
        // index is monotone increasing with the sequence of
        // input id at the first time.
        // This feature can make sure that each data item and its
        // mapped color have the same index between data list and
        // color list at the beginning, which is useful for user
        // to adjust data-color mapping.
        /**
         * @private
         * @type {Object}
         */
        let idIndexMap = this._idIndexMap;
        if (!idIndexMap) {
            idIndexMap = this._idIndexMap = zrUtil.createHashMap();
            /**
             * @private
             * @type {number}
             */
            this._idIndexMapCount = 0;
        }
        let index = idIndexMap.get(id);
        if (index == null) {
            idIndexMap.set(id, index = this._idIndexMapCount++);
        }
        return index;
    }
    getViewRoot() {
        return this._viewRoot;
    }
    resetViewRoot(viewRoot) {
        viewRoot
            ? (this._viewRoot = viewRoot)
            : (viewRoot = this._viewRoot);
        const root = this.getRawData().tree.root;
        if (!viewRoot
            || (viewRoot !== root && !root.contains(viewRoot))) {
            this._viewRoot = root;
        }
    }
    enableAriaDecal() {
        enableAriaDecalForTree(this);
    }
}
TreemapSeriesModel.type = 'series.treemap';
TreemapSeriesModel.layoutMode = 'box';
TreemapSeriesModel.defaultOption = {
    // Disable progressive rendering
    progressive: 0,
    // size: ['80%', '80%'],            // deprecated, compatible with ec2.
    left: 'center',
    top: 'middle',
    width: '80%',
    height: '80%',
    sort: true,
    clipWindow: 'origin',
    squareRatio: 0.5 * (1 + Math.sqrt(5)),
    leafDepth: null,
    drillDownIcon: '▶',
    // to align specialized icon. ▷▶❒❐▼✚
    zoomToNodeRatio: 0.32 * 0.32,
    roam: true,
    nodeClick: 'zoomToNode',
    animation: true,
    animationDurationUpdate: 900,
    animationEasing: 'quinticInOut',
    breadcrumb: {
        show: true,
        height: 22,
        left: 'center',
        top: 'bottom',
        // right
        // bottom
        emptyItemWidth: 25,
        itemStyle: {
            color: 'rgba(0,0,0,0.7)',
            textStyle: {
                color: '#fff'
            }
        }
    },
    label: {
        show: true,
        // Do not use textDistance, for ellipsis rect just the same as treemap node rect.
        distance: 0,
        padding: 5,
        position: 'inside',
        // formatter: null,
        color: '#fff',
        overflow: 'truncate'
        // align
        // verticalAlign
    },
    upperLabel: {
        show: false,
        position: [0, '50%'],
        height: 20,
        // formatter: null,
        // color: '#fff',
        overflow: 'truncate',
        // align: null,
        verticalAlign: 'middle'
    },
    itemStyle: {
        color: null,
        colorAlpha: null,
        colorSaturation: null,
        borderWidth: 0,
        gapWidth: 0,
        borderColor: '#fff',
        borderColorSaturation: null // If specified, borderColor will be ineffective, and the
        // border color is evaluated by color of current node and
        // borderColorSaturation.
    },
    emphasis: {
        upperLabel: {
            show: true,
            position: [0, '50%'],
            ellipsis: true,
            verticalAlign: 'middle'
        }
    },
    visualDimension: 0,
    visualMin: null,
    visualMax: null,
    color: [],
    // level[n].color (if necessary).
    // + Specify color list of each level. level[0].color would be global
    // color list if not specified. (see method `setDefault`).
    // + But set as a empty array to forbid fetch color from global palette
    // when using nodeModel.get('color'), otherwise nodes on deep level
    // will always has color palette set and are not able to inherit color
    // from parent node.
    // + TreemapSeries.color can not be set as 'none', otherwise effect
    // legend color fetching (see seriesColor.js).
    colorAlpha: null,
    colorSaturation: null,
    colorMappingBy: 'index',
    visibleMin: 10,
    // be rendered. Only works when sort is 'asc' or 'desc'.
    childrenVisibleMin: null,
    // grandchildren will not show.
    // Why grandchildren? If not grandchildren but children,
    // some siblings show children and some not,
    // the appearance may be mess and not consistent,
    levels: [] // Each item: {
    //     visibleMin, itemStyle, visualDimension, label
    // }
    // data: {
    //      value: [],
    //      children: [],
    //      link: 'http://xxx.xxx.xxx',
    //      target: 'blank' or 'self'
    // }
};
/**
 * @param {Object} dataNode
 */
function completeTreeValue(dataNode) {
    // Postorder travel tree.
    // If value of none-leaf node is not set,
    // calculate it by suming up the value of all children.
    let sum = 0;
    zrUtil.each(dataNode.children, function (child) {
        completeTreeValue(child);
        let childValue = child.value;
        zrUtil.isArray(childValue) && (childValue = childValue[0]);
        sum += childValue;
    });
    let thisValue = dataNode.value;
    if (zrUtil.isArray(thisValue)) {
        thisValue = thisValue[0];
    }
    if (thisValue == null || isNaN(thisValue)) {
        thisValue = sum;
    }
    // Value should not less than 0.
    if (thisValue < 0) {
        thisValue = 0;
    }
    zrUtil.isArray(dataNode.value)
        ? (dataNode.value[0] = thisValue)
        : (dataNode.value = thisValue);
}
/**
 * set default to level configuration
 */
function setDefault(levels, ecModel) {
    const globalColorList = normalizeToArray(ecModel.get('color'));
    const globalDecalList = normalizeToArray(ecModel.get(['aria', 'decal', 'decals']));
    if (!globalColorList) {
        return;
    }
    levels = levels || [];
    let hasColorDefine;
    let hasDecalDefine;
    zrUtil.each(levels, function (levelDefine) {
        const model = new Model(levelDefine);
        const modelColor = model.get('color');
        const modelDecal = model.get('decal');
        if (model.get(['itemStyle', 'color'])
            || (modelColor && modelColor !== 'none')) {
            hasColorDefine = true;
        }
        if (model.get(['itemStyle', 'decal'])
            || (modelDecal && modelDecal !== 'none')) {
            hasDecalDefine = true;
        }
    });
    const level0 = levels[0] || (levels[0] = {});
    if (!hasColorDefine) {
        level0.color = globalColorList.slice();
    }
    if (!hasDecalDefine && globalDecalList) {
        level0.decal = globalDecalList.slice();
    }
    return levels;
}
export default TreemapSeriesModel;
