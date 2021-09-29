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
import VisualMapping from '../../visual/VisualMapping';
export default function sankeyVisual(ecModel) {
    ecModel.eachSeriesByType('sankey', function (seriesModel) {
        const graph = seriesModel.getGraph();
        const nodes = graph.nodes;
        if (nodes.length) {
            let minValue = Infinity;
            let maxValue = -Infinity;
            zrUtil.each(nodes, function (node) {
                const nodeValue = node.getLayout().value;
                if (nodeValue < minValue) {
                    minValue = nodeValue;
                }
                if (nodeValue > maxValue) {
                    maxValue = nodeValue;
                }
            });
            zrUtil.each(nodes, function (node) {
                const mapping = new VisualMapping({
                    type: 'color',
                    mappingMethod: 'linear',
                    dataExtent: [minValue, maxValue],
                    visual: seriesModel.get('color')
                });
                const mapValueToColor = mapping.mapValueToVisual(node.getLayout().value);
                const customColor = node.getModel().get(['itemStyle', 'color']);
                if (customColor != null) {
                    node.setVisual('color', customColor);
                    node.setVisual('style', { fill: customColor });
                }
                else {
                    node.setVisual('color', mapValueToColor);
                    node.setVisual('style', { fill: mapValueToColor });
                }
            });
        }
    });
}
