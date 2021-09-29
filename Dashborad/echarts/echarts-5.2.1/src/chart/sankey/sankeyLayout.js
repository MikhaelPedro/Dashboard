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
import * as layout from '../../util/layout';
import * as zrUtil from 'zrender/src/core/util';
import { groupData } from '../../util/model';
export default function sankeyLayout(ecModel, api) {
    ecModel.eachSeriesByType('sankey', function (seriesModel) {
        const nodeWidth = seriesModel.get('nodeWidth');
        const nodeGap = seriesModel.get('nodeGap');
        const layoutInfo = getViewRect(seriesModel, api);
        seriesModel.layoutInfo = layoutInfo;
        const width = layoutInfo.width;
        const height = layoutInfo.height;
        const graph = seriesModel.getGraph();
        const nodes = graph.nodes;
        const edges = graph.edges;
        computeNodeValues(nodes);
        const filteredNodes = zrUtil.filter(nodes, function (node) {
            return node.getLayout().value === 0;
        });
        const iterations = filteredNodes.length !== 0 ? 0 : seriesModel.get('layoutIterations');
        const orient = seriesModel.get('orient');
        const nodeAlign = seriesModel.get('nodeAlign');
        layoutSankey(nodes, edges, nodeWidth, nodeGap, width, height, iterations, orient, nodeAlign);
    });
}
/**
 * Get the layout position of the whole view
 */
function getViewRect(seriesModel, api) {
    return layout.getLayoutRect(seriesModel.getBoxLayoutParams(), {
        width: api.getWidth(),
        height: api.getHeight()
    });
}
function layoutSankey(nodes, edges, nodeWidth, nodeGap, width, height, iterations, orient, nodeAlign) {
    computeNodeBreadths(nodes, edges, nodeWidth, width, height, orient, nodeAlign);
    computeNodeDepths(nodes, edges, height, width, nodeGap, iterations, orient);
    computeEdgeDepths(nodes, orient);
}
/**
 * Compute the value of each node by summing the associated edge's value
 */
function computeNodeValues(nodes) {
    zrUtil.each(nodes, function (node) {
        const value1 = sum(node.outEdges, getEdgeValue);
        const value2 = sum(node.inEdges, getEdgeValue);
        const nodeRawValue = node.getValue() || 0;
        const value = Math.max(value1, value2, nodeRawValue);
        node.setLayout({ value: value }, true);
    });
}
/**
 * Compute the x-position for each node.
 *
 * Here we use Kahn algorithm to detect cycle when we traverse
 * the node to computer the initial x position.
 */
function computeNodeBreadths(nodes, edges, nodeWidth, width, height, orient, nodeAlign) {
    // Used to mark whether the edge is deleted. if it is deleted,
    // the value is 0, otherwise it is 1.
    const remainEdges = [];
    // Storage each node's indegree.
    const indegreeArr = [];
    //Used to storage the node with indegree is equal to 0.
    let zeroIndegrees = [];
    let nextTargetNode = [];
    let x = 0;
    // let kx = 0;
    for (let i = 0; i < edges.length; i++) {
        remainEdges[i] = 1;
    }
    for (let i = 0; i < nodes.length; i++) {
        indegreeArr[i] = nodes[i].inEdges.length;
        if (indegreeArr[i] === 0) {
            zeroIndegrees.push(nodes[i]);
        }
    }
    let maxNodeDepth = -1;
    // Traversing nodes using topological sorting to calculate the
    // horizontal(if orient === 'horizontal') or vertical(if orient === 'vertical')
    // position of the nodes.
    while (zeroIndegrees.length) {
        for (let idx = 0; idx < zeroIndegrees.length; idx++) {
            const node = zeroIndegrees[idx];
            const item = node.hostGraph.data.getRawDataItem(node.dataIndex);
            const isItemDepth = item.depth != null && item.depth >= 0;
            if (isItemDepth && item.depth > maxNodeDepth) {
                maxNodeDepth = item.depth;
            }
            node.setLayout({ depth: isItemDepth ? item.depth : x }, true);
            orient === 'vertical'
                ? node.setLayout({ dy: nodeWidth }, true)
                : node.setLayout({ dx: nodeWidth }, true);
            for (let edgeIdx = 0; edgeIdx < node.outEdges.length; edgeIdx++) {
                const edge = node.outEdges[edgeIdx];
                const indexEdge = edges.indexOf(edge);
                remainEdges[indexEdge] = 0;
                const targetNode = edge.node2;
                const nodeIndex = nodes.indexOf(targetNode);
                if (--indegreeArr[nodeIndex] === 0 && nextTargetNode.indexOf(targetNode) < 0) {
                    nextTargetNode.push(targetNode);
                }
            }
        }
        ++x;
        zeroIndegrees = nextTargetNode;
        nextTargetNode = [];
    }
    for (let i = 0; i < remainEdges.length; i++) {
        if (remainEdges[i] === 1) {
            throw new Error('Sankey is a DAG, the original data has cycle!');
        }
    }
    const maxDepth = maxNodeDepth > x - 1 ? maxNodeDepth : x - 1;
    if (nodeAlign && nodeAlign !== 'left') {
        adjustNodeWithNodeAlign(nodes, nodeAlign, orient, maxDepth);
    }
    const kx = orient === 'vertical'
        ? (height - nodeWidth) / maxDepth
        : (width - nodeWidth) / maxDepth;
    scaleNodeBreadths(nodes, kx, orient);
}
function isNodeDepth(node) {
    const item = node.hostGraph.data.getRawDataItem(node.dataIndex);
    return item.depth != null && item.depth >= 0;
}
function adjustNodeWithNodeAlign(nodes, nodeAlign, orient, maxDepth) {
    if (nodeAlign === 'right') {
        let nextSourceNode = [];
        let remainNodes = nodes;
        let nodeHeight = 0;
        while (remainNodes.length) {
            for (let i = 0; i < remainNodes.length; i++) {
                const node = remainNodes[i];
                node.setLayout({ skNodeHeight: nodeHeight }, true);
                for (let j = 0; j < node.inEdges.length; j++) {
                    const edge = node.inEdges[j];
                    if (nextSourceNode.indexOf(edge.node1) < 0) {
                        nextSourceNode.push(edge.node1);
                    }
                }
            }
            remainNodes = nextSourceNode;
            nextSourceNode = [];
            ++nodeHeight;
        }
        zrUtil.each(nodes, function (node) {
            if (!isNodeDepth(node)) {
                node.setLayout({ depth: Math.max(0, maxDepth - node.getLayout().skNodeHeight) }, true);
            }
        });
    }
    else if (nodeAlign === 'justify') {
        moveSinksRight(nodes, maxDepth);
    }
}
/**
 * All the node without outEgdes are assigned maximum x-position and
 *     be aligned in the last column.
 *
 * @param nodes.  node of sankey view.
 * @param maxDepth.  use to assign to node without outEdges as x-position.
 */
function moveSinksRight(nodes, maxDepth) {
    zrUtil.each(nodes, function (node) {
        if (!isNodeDepth(node) && !node.outEdges.length) {
            node.setLayout({ depth: maxDepth }, true);
        }
    });
}
/**
 * Scale node x-position to the width
 *
 * @param nodes  node of sankey view
 * @param kx   multiple used to scale nodes
 */
function scaleNodeBreadths(nodes, kx, orient) {
    zrUtil.each(nodes, function (node) {
        const nodeDepth = node.getLayout().depth * kx;
        orient === 'vertical'
            ? node.setLayout({ y: nodeDepth }, true)
            : node.setLayout({ x: nodeDepth }, true);
    });
}
/**
 * Using Gauss-Seidel iterations method to compute the node depth(y-position)
 *
 * @param nodes  node of sankey view
 * @param edges  edge of sankey view
 * @param height  the whole height of the area to draw the view
 * @param nodeGap  the vertical distance between two nodes
 *     in the same column.
 * @param iterations  the number of iterations for the algorithm
 */
function computeNodeDepths(nodes, edges, height, width, nodeGap, iterations, orient) {
    const nodesByBreadth = prepareNodesByBreadth(nodes, orient);
    initializeNodeDepth(nodesByBreadth, edges, height, width, nodeGap, orient);
    resolveCollisions(nodesByBreadth, nodeGap, height, width, orient);
    for (let alpha = 1; iterations > 0; iterations--) {
        // 0.99 is a experience parameter, ensure that each iterations of
        // changes as small as possible.
        alpha *= 0.99;
        relaxRightToLeft(nodesByBreadth, alpha, orient);
        resolveCollisions(nodesByBreadth, nodeGap, height, width, orient);
        relaxLeftToRight(nodesByBreadth, alpha, orient);
        resolveCollisions(nodesByBreadth, nodeGap, height, width, orient);
    }
}
function prepareNodesByBreadth(nodes, orient) {
    const nodesByBreadth = [];
    const keyAttr = orient === 'vertical' ? 'y' : 'x';
    const groupResult = groupData(nodes, function (node) {
        return node.getLayout()[keyAttr];
    });
    groupResult.keys.sort(function (a, b) {
        return a - b;
    });
    zrUtil.each(groupResult.keys, function (key) {
        nodesByBreadth.push(groupResult.buckets.get(key));
    });
    return nodesByBreadth;
}
/**
 * Compute the original y-position for each node
 */
function initializeNodeDepth(nodesByBreadth, edges, height, width, nodeGap, orient) {
    let minKy = Infinity;
    zrUtil.each(nodesByBreadth, function (nodes) {
        const n = nodes.length;
        let sum = 0;
        zrUtil.each(nodes, function (node) {
            sum += node.getLayout().value;
        });
        const ky = orient === 'vertical'
            ? (width - (n - 1) * nodeGap) / sum
            : (height - (n - 1) * nodeGap) / sum;
        if (ky < minKy) {
            minKy = ky;
        }
    });
    zrUtil.each(nodesByBreadth, function (nodes) {
        zrUtil.each(nodes, function (node, i) {
            const nodeDy = node.getLayout().value * minKy;
            if (orient === 'vertical') {
                node.setLayout({ x: i }, true);
                node.setLayout({ dx: nodeDy }, true);
            }
            else {
                node.setLayout({ y: i }, true);
                node.setLayout({ dy: nodeDy }, true);
            }
        });
    });
    zrUtil.each(edges, function (edge) {
        const edgeDy = +edge.getValue() * minKy;
        edge.setLayout({ dy: edgeDy }, true);
    });
}
/**
 * Resolve the collision of initialized depth (y-position)
 */
function resolveCollisions(nodesByBreadth, nodeGap, height, width, orient) {
    const keyAttr = orient === 'vertical' ? 'x' : 'y';
    zrUtil.each(nodesByBreadth, function (nodes) {
        nodes.sort(function (a, b) {
            return a.getLayout()[keyAttr] - b.getLayout()[keyAttr];
        });
        let nodeX;
        let node;
        let dy;
        let y0 = 0;
        const n = nodes.length;
        const nodeDyAttr = orient === 'vertical' ? 'dx' : 'dy';
        for (let i = 0; i < n; i++) {
            node = nodes[i];
            dy = y0 - node.getLayout()[keyAttr];
            if (dy > 0) {
                nodeX = node.getLayout()[keyAttr] + dy;
                orient === 'vertical'
                    ? node.setLayout({ x: nodeX }, true)
                    : node.setLayout({ y: nodeX }, true);
            }
            y0 = node.getLayout()[keyAttr] + node.getLayout()[nodeDyAttr] + nodeGap;
        }
        const viewWidth = orient === 'vertical' ? width : height;
        // If the bottommost node goes outside the bounds, push it back up
        dy = y0 - nodeGap - viewWidth;
        if (dy > 0) {
            nodeX = node.getLayout()[keyAttr] - dy;
            orient === 'vertical'
                ? node.setLayout({ x: nodeX }, true)
                : node.setLayout({ y: nodeX }, true);
            y0 = nodeX;
            for (let i = n - 2; i >= 0; --i) {
                node = nodes[i];
                dy = node.getLayout()[keyAttr] + node.getLayout()[nodeDyAttr] + nodeGap - y0;
                if (dy > 0) {
                    nodeX = node.getLayout()[keyAttr] - dy;
                    orient === 'vertical'
                        ? node.setLayout({ x: nodeX }, true)
                        : node.setLayout({ y: nodeX }, true);
                }
                y0 = node.getLayout()[keyAttr];
            }
        }
    });
}
/**
 * Change the y-position of the nodes, except most the right side nodes
 * @param nodesByBreadth
 * @param alpha  parameter used to adjust the nodes y-position
 */
function relaxRightToLeft(nodesByBreadth, alpha, orient) {
    zrUtil.each(nodesByBreadth.slice().reverse(), function (nodes) {
        zrUtil.each(nodes, function (node) {
            if (node.outEdges.length) {
                let y = sum(node.outEdges, weightedTarget, orient)
                    / sum(node.outEdges, getEdgeValue);
                if (isNaN(y)) {
                    const len = node.outEdges.length;
                    y = len ? sum(node.outEdges, centerTarget, orient) / len : 0;
                }
                if (orient === 'vertical') {
                    const nodeX = node.getLayout().x + (y - center(node, orient)) * alpha;
                    node.setLayout({ x: nodeX }, true);
                }
                else {
                    const nodeY = node.getLayout().y + (y - center(node, orient)) * alpha;
                    node.setLayout({ y: nodeY }, true);
                }
            }
        });
    });
}
function weightedTarget(edge, orient) {
    return center(edge.node2, orient) * edge.getValue();
}
function centerTarget(edge, orient) {
    return center(edge.node2, orient);
}
function weightedSource(edge, orient) {
    return center(edge.node1, orient) * edge.getValue();
}
function centerSource(edge, orient) {
    return center(edge.node1, orient);
}
function center(node, orient) {
    return orient === 'vertical'
        ? node.getLayout().x + node.getLayout().dx / 2
        : node.getLayout().y + node.getLayout().dy / 2;
}
function getEdgeValue(edge) {
    return edge.getValue();
}
function sum(array, cb, orient) {
    let sum = 0;
    const len = array.length;
    let i = -1;
    while (++i < len) {
        const value = +cb(array[i], orient);
        if (!isNaN(value)) {
            sum += value;
        }
    }
    return sum;
}
/**
 * Change the y-position of the nodes, except most the left side nodes
 */
function relaxLeftToRight(nodesByBreadth, alpha, orient) {
    zrUtil.each(nodesByBreadth, function (nodes) {
        zrUtil.each(nodes, function (node) {
            if (node.inEdges.length) {
                let y = sum(node.inEdges, weightedSource, orient)
                    / sum(node.inEdges, getEdgeValue);
                if (isNaN(y)) {
                    const len = node.inEdges.length;
                    y = len ? sum(node.inEdges, centerSource, orient) / len : 0;
                }
                if (orient === 'vertical') {
                    const nodeX = node.getLayout().x + (y - center(node, orient)) * alpha;
                    node.setLayout({ x: nodeX }, true);
                }
                else {
                    const nodeY = node.getLayout().y + (y - center(node, orient)) * alpha;
                    node.setLayout({ y: nodeY }, true);
                }
            }
        });
    });
}
/**
 * Compute the depth(y-position) of each edge
 */
function computeEdgeDepths(nodes, orient) {
    const keyAttr = orient === 'vertical' ? 'x' : 'y';
    zrUtil.each(nodes, function (node) {
        node.outEdges.sort(function (a, b) {
            return a.node2.getLayout()[keyAttr] - b.node2.getLayout()[keyAttr];
        });
        node.inEdges.sort(function (a, b) {
            return a.node1.getLayout()[keyAttr] - b.node1.getLayout()[keyAttr];
        });
    });
    zrUtil.each(nodes, function (node) {
        let sy = 0;
        let ty = 0;
        zrUtil.each(node.outEdges, function (edge) {
            edge.setLayout({ sy: sy }, true);
            sy += edge.getLayout().dy;
        });
        zrUtil.each(node.inEdges, function (edge) {
            edge.setLayout({ ty: ty }, true);
            ty += edge.getLayout().dy;
        });
    });
}
