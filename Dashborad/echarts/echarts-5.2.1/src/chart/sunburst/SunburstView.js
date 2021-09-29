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
import ChartView from '../../view/Chart';
import SunburstPiece from './SunburstPiece';
import DataDiffer from '../../data/DataDiffer';
import { ROOT_TO_NODE_ACTION } from './sunburstAction';
import { windowOpen } from '../../util/format';
class SunburstView extends ChartView {
    constructor() {
        super(...arguments);
        this.type = SunburstView.type;
    }
    render(seriesModel, ecModel, api, 
    // @ts-ignore
    payload) {
        const self = this;
        this.seriesModel = seriesModel;
        this.api = api;
        this.ecModel = ecModel;
        const data = seriesModel.getData();
        const virtualRoot = data.tree.root;
        const newRoot = seriesModel.getViewRoot();
        const group = this.group;
        const renderLabelForZeroData = seriesModel.get('renderLabelForZeroData');
        const newChildren = [];
        newRoot.eachNode(function (node) {
            newChildren.push(node);
        });
        const oldChildren = this._oldChildren || [];
        dualTravel(newChildren, oldChildren);
        renderRollUp(virtualRoot, newRoot);
        this._initEvents();
        this._oldChildren = newChildren;
        function dualTravel(newChildren, oldChildren) {
            if (newChildren.length === 0 && oldChildren.length === 0) {
                return;
            }
            new DataDiffer(oldChildren, newChildren, getKey, getKey)
                .add(processNode)
                .update(processNode)
                .remove(zrUtil.curry(processNode, null))
                .execute();
            function getKey(node) {
                return node.getId();
            }
            function processNode(newIdx, oldIdx) {
                const newNode = newIdx == null ? null : newChildren[newIdx];
                const oldNode = oldIdx == null ? null : oldChildren[oldIdx];
                doRenderNode(newNode, oldNode);
            }
        }
        function doRenderNode(newNode, oldNode) {
            if (!renderLabelForZeroData && newNode && !newNode.getValue()) {
                // Not render data with value 0
                newNode = null;
            }
            if (newNode !== virtualRoot && oldNode !== virtualRoot) {
                if (oldNode && oldNode.piece) {
                    if (newNode) {
                        // Update
                        oldNode.piece.updateData(false, newNode, seriesModel, ecModel, api);
                        // For tooltip
                        data.setItemGraphicEl(newNode.dataIndex, oldNode.piece);
                    }
                    else {
                        // Remove
                        removeNode(oldNode);
                    }
                }
                else if (newNode) {
                    // Add
                    const piece = new SunburstPiece(newNode, seriesModel, ecModel, api);
                    group.add(piece);
                    // For tooltip
                    data.setItemGraphicEl(newNode.dataIndex, piece);
                }
            }
        }
        function removeNode(node) {
            if (!node) {
                return;
            }
            if (node.piece) {
                group.remove(node.piece);
                node.piece = null;
            }
        }
        function renderRollUp(virtualRoot, viewRoot) {
            if (viewRoot.depth > 0) {
                // Render
                if (self.virtualPiece) {
                    // Update
                    self.virtualPiece.updateData(false, virtualRoot, seriesModel, ecModel, api);
                }
                else {
                    // Add
                    self.virtualPiece = new SunburstPiece(virtualRoot, seriesModel, ecModel, api);
                    group.add(self.virtualPiece);
                }
                // TODO event scope
                viewRoot.piece.off('click');
                self.virtualPiece.on('click', function (e) {
                    self._rootToNode(viewRoot.parentNode);
                });
            }
            else if (self.virtualPiece) {
                // Remove
                group.remove(self.virtualPiece);
                self.virtualPiece = null;
            }
        }
    }
    /**
     * @private
     */
    _initEvents() {
        this.group.off('click');
        this.group.on('click', (e) => {
            let targetFound = false;
            const viewRoot = this.seriesModel.getViewRoot();
            viewRoot.eachNode((node) => {
                if (!targetFound
                    && node.piece && node.piece === e.target) {
                    const nodeClick = node.getModel().get('nodeClick');
                    if (nodeClick === 'rootToNode') {
                        this._rootToNode(node);
                    }
                    else if (nodeClick === 'link') {
                        const itemModel = node.getModel();
                        const link = itemModel.get('link');
                        if (link) {
                            const linkTarget = itemModel.get('target', true)
                                || '_blank';
                            windowOpen(link, linkTarget);
                        }
                    }
                    targetFound = true;
                }
            });
        });
    }
    /**
     * @private
     */
    _rootToNode(node) {
        if (node !== this.seriesModel.getViewRoot()) {
            this.api.dispatchAction({
                type: ROOT_TO_NODE_ACTION,
                from: this.uid,
                seriesId: this.seriesModel.id,
                targetNode: node
            });
        }
    }
    /**
     * @implement
     */
    containPoint(point, seriesModel) {
        const treeRoot = seriesModel.getData();
        const itemLayout = treeRoot.getItemLayout(0);
        if (itemLayout) {
            const dx = point[0] - itemLayout.cx;
            const dy = point[1] - itemLayout.cy;
            const radius = Math.sqrt(dx * dx + dy * dy);
            return radius <= itemLayout.r && radius >= itemLayout.r0;
        }
    }
}
SunburstView.type = 'sunburst';
export default SunburstView;
