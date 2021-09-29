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
 * Tree data structure
 */
import * as zrUtil from 'zrender/src/core/util';
import linkSeriesData from './helper/linkSeriesData';
import SeriesData from './SeriesData';
import prepareSeriesDataSchema from './helper/createDimensions';
import { convertOptionIdName } from '../util/model';
export class TreeNode {
    constructor(name, hostTree) {
        this.depth = 0;
        this.height = 0;
        /**
         * Reference to list item.
         * Do not persistent dataIndex outside,
         * besause it may be changed by list.
         * If dataIndex -1,
         * this node is logical deleted (filtered) in list.
         */
        this.dataIndex = -1;
        this.children = [];
        this.viewChildren = [];
        this.isExpand = false;
        this.name = name || '';
        this.hostTree = hostTree;
    }
    /**
     * The node is removed.
     */
    isRemoved() {
        return this.dataIndex < 0;
    }
    eachNode(options, cb, context) {
        if (typeof options === 'function') {
            context = cb;
            cb = options;
            options = null;
        }
        options = options || {};
        if (zrUtil.isString(options)) {
            options = { order: options };
        }
        const order = options.order || 'preorder';
        const children = this[options.attr || 'children'];
        let suppressVisitSub;
        order === 'preorder' && (suppressVisitSub = cb.call(context, this));
        for (let i = 0; !suppressVisitSub && i < children.length; i++) {
            children[i].eachNode(options, cb, context);
        }
        order === 'postorder' && cb.call(context, this);
    }
    /**
     * Update depth and height of this subtree.
     */
    updateDepthAndHeight(depth) {
        let height = 0;
        this.depth = depth;
        for (let i = 0; i < this.children.length; i++) {
            const child = this.children[i];
            child.updateDepthAndHeight(depth + 1);
            if (child.height > height) {
                height = child.height;
            }
        }
        this.height = height + 1;
    }
    getNodeById(id) {
        if (this.getId() === id) {
            return this;
        }
        for (let i = 0, children = this.children, len = children.length; i < len; i++) {
            const res = children[i].getNodeById(id);
            if (res) {
                return res;
            }
        }
    }
    contains(node) {
        if (node === this) {
            return true;
        }
        for (let i = 0, children = this.children, len = children.length; i < len; i++) {
            const res = children[i].contains(node);
            if (res) {
                return res;
            }
        }
    }
    /**
     * @param includeSelf Default false.
     * @return order: [root, child, grandchild, ...]
     */
    getAncestors(includeSelf) {
        const ancestors = [];
        let node = includeSelf ? this : this.parentNode;
        while (node) {
            ancestors.push(node);
            node = node.parentNode;
        }
        ancestors.reverse();
        return ancestors;
    }
    getAncestorsIndices() {
        const indices = [];
        let currNode = this;
        while (currNode) {
            indices.push(currNode.dataIndex);
            currNode = currNode.parentNode;
        }
        indices.reverse();
        return indices;
    }
    getDescendantIndices() {
        const indices = [];
        this.eachNode(childNode => {
            indices.push(childNode.dataIndex);
        });
        return indices;
    }
    getValue(dimension) {
        const data = this.hostTree.data;
        return data.getStore().get(data.getDimensionIndex(dimension || 'value'), this.dataIndex);
    }
    setLayout(layout, merge) {
        this.dataIndex >= 0
            && this.hostTree.data.setItemLayout(this.dataIndex, layout, merge);
    }
    /**
     * @return {Object} layout
     */
    getLayout() {
        return this.hostTree.data.getItemLayout(this.dataIndex);
    }
    // @depcrecated
    // getModel<T = unknown, S extends keyof T = keyof T>(path: S): Model<T[S]>
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getModel(path) {
        if (this.dataIndex < 0) {
            return;
        }
        const hostTree = this.hostTree;
        const itemModel = hostTree.data.getItemModel(this.dataIndex);
        return itemModel.getModel(path);
    }
    // TODO: TYPE More specific model
    getLevelModel() {
        return (this.hostTree.levelModels || [])[this.depth];
    }
    setVisual(key, value) {
        this.dataIndex >= 0
            && this.hostTree.data.setItemVisual(this.dataIndex, key, value);
    }
    /**
     * Get item visual
     * FIXME: make return type better
     */
    getVisual(key) {
        return this.hostTree.data.getItemVisual(this.dataIndex, key);
    }
    getRawIndex() {
        return this.hostTree.data.getRawIndex(this.dataIndex);
    }
    getId() {
        return this.hostTree.data.getId(this.dataIndex);
    }
    /**
     * index in parent's children
     */
    getChildIndex() {
        if (this.parentNode) {
            const children = this.parentNode.children;
            for (let i = 0; i < children.length; ++i) {
                if (children[i] === this) {
                    return i;
                }
            }
            return -1;
        }
        return -1;
    }
    /**
     * if this is an ancestor of another node
     *
     * @param node another node
     * @return if is ancestor
     */
    isAncestorOf(node) {
        let parent = node.parentNode;
        while (parent) {
            if (parent === this) {
                return true;
            }
            parent = parent.parentNode;
        }
        return false;
    }
    /**
     * if this is an descendant of another node
     *
     * @param node another node
     * @return if is descendant
     */
    isDescendantOf(node) {
        return node !== this && node.isAncestorOf(this);
    }
}
;
class Tree {
    constructor(hostModel) {
        this.type = 'tree';
        this._nodes = [];
        this.hostModel = hostModel;
    }
    eachNode(options, cb, context) {
        this.root.eachNode(options, cb, context);
    }
    getNodeByDataIndex(dataIndex) {
        const rawIndex = this.data.getRawIndex(dataIndex);
        return this._nodes[rawIndex];
    }
    getNodeById(name) {
        return this.root.getNodeById(name);
    }
    /**
     * Update item available by list,
     * when list has been performed options like 'filterSelf' or 'map'.
     */
    update() {
        const data = this.data;
        const nodes = this._nodes;
        for (let i = 0, len = nodes.length; i < len; i++) {
            nodes[i].dataIndex = -1;
        }
        for (let i = 0, len = data.count(); i < len; i++) {
            nodes[data.getRawIndex(i)].dataIndex = i;
        }
    }
    /**
     * Clear all layouts
     */
    clearLayouts() {
        this.data.clearItemLayouts();
    }
    /**
     * data node format:
     * {
     *     name: ...
     *     value: ...
     *     children: [
     *         {
     *             name: ...
     *             value: ...
     *             children: ...
     *         },
     *         ...
     *     ]
     * }
     */
    static createTree(dataRoot, hostModel, beforeLink) {
        const tree = new Tree(hostModel);
        const listData = [];
        let dimMax = 1;
        buildHierarchy(dataRoot);
        function buildHierarchy(dataNode, parentNode) {
            const value = dataNode.value;
            dimMax = Math.max(dimMax, zrUtil.isArray(value) ? value.length : 1);
            listData.push(dataNode);
            const node = new TreeNode(convertOptionIdName(dataNode.name, ''), tree);
            parentNode
                ? addChild(node, parentNode)
                : (tree.root = node);
            tree._nodes.push(node);
            const children = dataNode.children;
            if (children) {
                for (let i = 0; i < children.length; i++) {
                    buildHierarchy(children[i], node);
                }
            }
        }
        tree.root.updateDepthAndHeight(0);
        const { dimensions } = prepareSeriesDataSchema(listData, {
            coordDimensions: ['value'],
            dimensionsCount: dimMax
        });
        const list = new SeriesData(dimensions, hostModel);
        list.initData(listData);
        beforeLink && beforeLink(list);
        linkSeriesData({
            mainData: list,
            struct: tree,
            structAttr: 'tree'
        });
        tree.update();
        return tree;
    }
}
/**
 * It is needed to consider the mess of 'list', 'hostModel' when creating a TreeNote,
 * so this function is not ready and not necessary to be public.
 */
function addChild(child, node) {
    const children = node.children;
    if (child.parentNode === node) {
        return;
    }
    children.push(child);
    child.parentNode = node;
}
export default Tree;
