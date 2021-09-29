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
import SeriesModel from '../../model/Series';
import Tree from '../../data/Tree';
import Model from '../../model/Model';
import { createTooltipMarkup } from '../../component/tooltip/tooltipMarkup';
import { wrapTreePathInfo } from '../helper/treeHelper';
class TreeSeriesModel extends SeriesModel {
    constructor() {
        super(...arguments);
        this.hasSymbolVisual = true;
        // Do it self.
        this.ignoreStyleOnData = true;
    }
    /**
     * Init a tree data structure from data in option series
     */
    getInitialData(option) {
        //create an virtual root
        const root = {
            name: option.name,
            children: option.data
        };
        const leaves = option.leaves || {};
        const leavesModel = new Model(leaves, this, this.ecModel);
        const tree = Tree.createTree(root, this, beforeLink);
        function beforeLink(nodeData) {
            nodeData.wrapMethod('getItemModel', function (model, idx) {
                const node = tree.getNodeByDataIndex(idx);
                if (!(node && node.children.length && node.isExpand)) {
                    model.parentModel = leavesModel;
                }
                return model;
            });
        }
        let treeDepth = 0;
        tree.eachNode('preorder', function (node) {
            if (node.depth > treeDepth) {
                treeDepth = node.depth;
            }
        });
        const expandAndCollapse = option.expandAndCollapse;
        const expandTreeDepth = (expandAndCollapse && option.initialTreeDepth >= 0)
            ? option.initialTreeDepth : treeDepth;
        tree.root.eachNode('preorder', function (node) {
            const item = node.hostTree.data.getRawDataItem(node.dataIndex);
            // Add item.collapsed != null, because users can collapse node original in the series.data.
            node.isExpand = (item && item.collapsed != null)
                ? !item.collapsed
                : node.depth <= expandTreeDepth;
        });
        return tree.data;
    }
    /**
     * Make the configuration 'orient' backward compatibly, with 'horizontal = LR', 'vertical = TB'.
     * @returns {string} orient
     */
    getOrient() {
        let orient = this.get('orient');
        if (orient === 'horizontal') {
            orient = 'LR';
        }
        else if (orient === 'vertical') {
            orient = 'TB';
        }
        return orient;
    }
    setZoom(zoom) {
        this.option.zoom = zoom;
    }
    setCenter(center) {
        this.option.center = center;
    }
    formatTooltip(dataIndex, multipleSeries, dataType) {
        const tree = this.getData().tree;
        const realRoot = tree.root.children[0];
        let node = tree.getNodeByDataIndex(dataIndex);
        const value = node.getValue();
        let name = node.name;
        while (node && (node !== realRoot)) {
            name = node.parentNode.name + '.' + name;
            node = node.parentNode;
        }
        return createTooltipMarkup('nameValue', {
            name: name,
            value: value,
            noValue: isNaN(value) || value == null
        });
    }
    // Add tree path to tooltip param
    getDataParams(dataIndex) {
        const params = super.getDataParams.apply(this, arguments);
        const node = this.getData().tree.getNodeByDataIndex(dataIndex);
        params.treeAncestors = wrapTreePathInfo(node, this);
        return params;
    }
}
TreeSeriesModel.type = 'series.tree';
// can support the position parameters 'left', 'top','right','bottom', 'width',
// 'height' in the setOption() with 'merge' mode normal.
TreeSeriesModel.layoutMode = 'box';
TreeSeriesModel.defaultOption = {
    zlevel: 0,
    z: 2,
    coordinateSystem: 'view',
    // the position of the whole view
    left: '12%',
    top: '12%',
    right: '12%',
    bottom: '12%',
    // the layout of the tree, two value can be selected, 'orthogonal' or 'radial'
    layout: 'orthogonal',
    // value can be 'polyline'
    edgeShape: 'curve',
    edgeForkPosition: '50%',
    // true | false | 'move' | 'scale', see module:component/helper/RoamController.
    roam: false,
    // Symbol size scale ratio in roam
    nodeScaleRatio: 0.4,
    // Default on center of graph
    center: null,
    zoom: 1,
    orient: 'LR',
    symbol: 'emptyCircle',
    symbolSize: 7,
    expandAndCollapse: true,
    initialTreeDepth: 2,
    lineStyle: {
        color: '#ccc',
        width: 1.5,
        curveness: 0.5
    },
    itemStyle: {
        color: 'lightsteelblue',
        // borderColor: '#c23531',
        borderWidth: 1.5
    },
    label: {
        show: true
    },
    animationEasing: 'linear',
    animationDuration: 700,
    animationDurationUpdate: 500
};
export default TreeSeriesModel;
