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
import * as polygonContain from 'zrender/src/contain/polygon';
import BoundingRect from 'zrender/src/core/BoundingRect';
import { linePolygonIntersect } from '../../util/graphic';
export function makeBrushCommonSelectorForSeries(area) {
    const brushType = area.brushType;
    // Do not use function binding or curry for performance.
    const selectors = {
        point(itemLayout) {
            return selector[brushType].point(itemLayout, selectors, area);
        },
        rect(itemLayout) {
            return selector[brushType].rect(itemLayout, selectors, area);
        }
    };
    return selectors;
}
const selector = {
    lineX: getLineSelectors(0),
    lineY: getLineSelectors(1),
    rect: {
        point: function (itemLayout, selectors, area) {
            return itemLayout && area.boundingRect.contain(itemLayout[0], itemLayout[1]);
        },
        rect: function (itemLayout, selectors, area) {
            return itemLayout && area.boundingRect.intersect(itemLayout);
        }
    },
    polygon: {
        point: function (itemLayout, selectors, area) {
            return itemLayout
                && area.boundingRect.contain(itemLayout[0], itemLayout[1])
                && polygonContain.contain(area.range, itemLayout[0], itemLayout[1]);
        },
        rect: function (itemLayout, selectors, area) {
            const points = area.range;
            if (!itemLayout || points.length <= 1) {
                return false;
            }
            const x = itemLayout.x;
            const y = itemLayout.y;
            const width = itemLayout.width;
            const height = itemLayout.height;
            const p = points[0];
            if (polygonContain.contain(points, x, y)
                || polygonContain.contain(points, x + width, y)
                || polygonContain.contain(points, x, y + height)
                || polygonContain.contain(points, x + width, y + height)
                || BoundingRect.create(itemLayout).contain(p[0], p[1])
                || linePolygonIntersect(x, y, x + width, y, points)
                || linePolygonIntersect(x, y, x, y + height, points)
                || linePolygonIntersect(x + width, y, x + width, y + height, points)
                || linePolygonIntersect(x, y + height, x + width, y + height, points)) {
                return true;
            }
        }
    }
};
function getLineSelectors(xyIndex) {
    const xy = ['x', 'y'];
    const wh = ['width', 'height'];
    return {
        point: function (itemLayout, selectors, area) {
            if (itemLayout) {
                const range = area.range;
                const p = itemLayout[xyIndex];
                return inLineRange(p, range);
            }
        },
        rect: function (itemLayout, selectors, area) {
            if (itemLayout) {
                const range = area.range;
                const layoutRange = [
                    itemLayout[xy[xyIndex]],
                    itemLayout[xy[xyIndex]] + itemLayout[wh[xyIndex]]
                ];
                layoutRange[1] < layoutRange[0] && layoutRange.reverse();
                return inLineRange(layoutRange[0], range)
                    || inLineRange(layoutRange[1], range)
                    || inLineRange(range[0], layoutRange)
                    || inLineRange(range[1], layoutRange);
            }
        }
    };
}
function inLineRange(p, range) {
    return range[0] <= p && p <= range[1];
}
export default selector;
