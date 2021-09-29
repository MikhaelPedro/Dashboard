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
// Symbol factory
import { each, isArray, retrieve2 } from 'zrender/src/core/util';
import * as graphic from './graphic';
import BoundingRect from 'zrender/src/core/BoundingRect';
import { calculateTextPosition } from 'zrender/src/contain/text';
import { parsePercent } from './number';
/**
 * Triangle shape
 * @inner
 */
const Triangle = graphic.Path.extend({
    type: 'triangle',
    shape: {
        cx: 0,
        cy: 0,
        width: 0,
        height: 0
    },
    buildPath: function (path, shape) {
        const cx = shape.cx;
        const cy = shape.cy;
        const width = shape.width / 2;
        const height = shape.height / 2;
        path.moveTo(cx, cy - height);
        path.lineTo(cx + width, cy + height);
        path.lineTo(cx - width, cy + height);
        path.closePath();
    }
});
/**
 * Diamond shape
 * @inner
 */
const Diamond = graphic.Path.extend({
    type: 'diamond',
    shape: {
        cx: 0,
        cy: 0,
        width: 0,
        height: 0
    },
    buildPath: function (path, shape) {
        const cx = shape.cx;
        const cy = shape.cy;
        const width = shape.width / 2;
        const height = shape.height / 2;
        path.moveTo(cx, cy - height);
        path.lineTo(cx + width, cy);
        path.lineTo(cx, cy + height);
        path.lineTo(cx - width, cy);
        path.closePath();
    }
});
/**
 * Pin shape
 * @inner
 */
const Pin = graphic.Path.extend({
    type: 'pin',
    shape: {
        // x, y on the cusp
        x: 0,
        y: 0,
        width: 0,
        height: 0
    },
    buildPath: function (path, shape) {
        const x = shape.x;
        const y = shape.y;
        const w = shape.width / 5 * 3;
        // Height must be larger than width
        const h = Math.max(w, shape.height);
        const r = w / 2;
        // Dist on y with tangent point and circle center
        const dy = r * r / (h - r);
        const cy = y - h + r + dy;
        const angle = Math.asin(dy / r);
        // Dist on x with tangent point and circle center
        const dx = Math.cos(angle) * r;
        const tanX = Math.sin(angle);
        const tanY = Math.cos(angle);
        const cpLen = r * 0.6;
        const cpLen2 = r * 0.7;
        path.moveTo(x - dx, cy + dy);
        path.arc(x, cy, r, Math.PI - angle, Math.PI * 2 + angle);
        path.bezierCurveTo(x + dx - tanX * cpLen, cy + dy + tanY * cpLen, x, y - cpLen2, x, y);
        path.bezierCurveTo(x, y - cpLen2, x - dx + tanX * cpLen, cy + dy + tanY * cpLen, x - dx, cy + dy);
        path.closePath();
    }
});
/**
 * Arrow shape
 * @inner
 */
const Arrow = graphic.Path.extend({
    type: 'arrow',
    shape: {
        x: 0,
        y: 0,
        width: 0,
        height: 0
    },
    buildPath: function (ctx, shape) {
        const height = shape.height;
        const width = shape.width;
        const x = shape.x;
        const y = shape.y;
        const dx = width / 3 * 2;
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx, y + height);
        ctx.lineTo(x, y + height / 4 * 3);
        ctx.lineTo(x - dx, y + height);
        ctx.lineTo(x, y);
        ctx.closePath();
    }
});
/**
 * Map of path contructors
 */
// TODO Use function to build symbol path.
const symbolCtors = {
    line: graphic.Line,
    rect: graphic.Rect,
    roundRect: graphic.Rect,
    square: graphic.Rect,
    circle: graphic.Circle,
    diamond: Diamond,
    pin: Pin,
    arrow: Arrow,
    triangle: Triangle
};
const symbolShapeMakers = {
    line: function (x, y, w, h, shape) {
        shape.x1 = x;
        shape.y1 = y + h / 2;
        shape.x2 = x + w;
        shape.y2 = y + h / 2;
    },
    rect: function (x, y, w, h, shape) {
        shape.x = x;
        shape.y = y;
        shape.width = w;
        shape.height = h;
    },
    roundRect: function (x, y, w, h, shape) {
        shape.x = x;
        shape.y = y;
        shape.width = w;
        shape.height = h;
        shape.r = Math.min(w, h) / 4;
    },
    square: function (x, y, w, h, shape) {
        const size = Math.min(w, h);
        shape.x = x;
        shape.y = y;
        shape.width = size;
        shape.height = size;
    },
    circle: function (x, y, w, h, shape) {
        // Put circle in the center of square
        shape.cx = x + w / 2;
        shape.cy = y + h / 2;
        shape.r = Math.min(w, h) / 2;
    },
    diamond: function (x, y, w, h, shape) {
        shape.cx = x + w / 2;
        shape.cy = y + h / 2;
        shape.width = w;
        shape.height = h;
    },
    pin: function (x, y, w, h, shape) {
        shape.x = x + w / 2;
        shape.y = y + h / 2;
        shape.width = w;
        shape.height = h;
    },
    arrow: function (x, y, w, h, shape) {
        shape.x = x + w / 2;
        shape.y = y + h / 2;
        shape.width = w;
        shape.height = h;
    },
    triangle: function (x, y, w, h, shape) {
        shape.cx = x + w / 2;
        shape.cy = y + h / 2;
        shape.width = w;
        shape.height = h;
    }
};
export const symbolBuildProxies = {};
each(symbolCtors, function (Ctor, name) {
    symbolBuildProxies[name] = new Ctor();
});
const SymbolClz = graphic.Path.extend({
    type: 'symbol',
    shape: {
        symbolType: '',
        x: 0,
        y: 0,
        width: 0,
        height: 0
    },
    calculateTextPosition(out, config, rect) {
        const res = calculateTextPosition(out, config, rect);
        const shape = this.shape;
        if (shape && shape.symbolType === 'pin' && config.position === 'inside') {
            res.y = rect.y + rect.height * 0.4;
        }
        return res;
    },
    buildPath(ctx, shape, inBundle) {
        let symbolType = shape.symbolType;
        if (symbolType !== 'none') {
            let proxySymbol = symbolBuildProxies[symbolType];
            if (!proxySymbol) {
                // Default rect
                symbolType = 'rect';
                proxySymbol = symbolBuildProxies[symbolType];
            }
            symbolShapeMakers[symbolType](shape.x, shape.y, shape.width, shape.height, proxySymbol.shape);
            proxySymbol.buildPath(ctx, proxySymbol.shape, inBundle);
        }
    }
});
// Provide setColor helper method to avoid determine if set the fill or stroke outside
function symbolPathSetColor(color, innerColor) {
    if (this.type !== 'image') {
        const symbolStyle = this.style;
        if (this.__isEmptyBrush) {
            symbolStyle.stroke = color;
            symbolStyle.fill = innerColor || '#fff';
            // TODO Same width with lineStyle in LineView
            symbolStyle.lineWidth = 2;
        }
        else if (this.shape.symbolType === 'line') {
            symbolStyle.stroke = color;
        }
        else {
            symbolStyle.fill = color;
        }
        this.markRedraw();
    }
}
/**
 * Create a symbol element with given symbol configuration: shape, x, y, width, height, color
 */
export function createSymbol(symbolType, x, y, w, h, color, 
// whether to keep the ratio of w/h,
keepAspect) {
    // TODO Support image object, DynamicImage.
    const isEmpty = symbolType.indexOf('empty') === 0;
    if (isEmpty) {
        symbolType = symbolType.substr(5, 1).toLowerCase() + symbolType.substr(6);
    }
    let symbolPath;
    if (symbolType.indexOf('image://') === 0) {
        symbolPath = graphic.makeImage(symbolType.slice(8), new BoundingRect(x, y, w, h), keepAspect ? 'center' : 'cover');
    }
    else if (symbolType.indexOf('path://') === 0) {
        symbolPath = graphic.makePath(symbolType.slice(7), {}, new BoundingRect(x, y, w, h), keepAspect ? 'center' : 'cover');
    }
    else {
        symbolPath = new SymbolClz({
            shape: {
                symbolType: symbolType,
                x: x,
                y: y,
                width: w,
                height: h
            }
        });
    }
    symbolPath.__isEmptyBrush = isEmpty;
    // TODO Should deprecate setColor
    symbolPath.setColor = symbolPathSetColor;
    if (color) {
        symbolPath.setColor(color);
    }
    return symbolPath;
}
export function normalizeSymbolSize(symbolSize) {
    if (!isArray(symbolSize)) {
        symbolSize = [+symbolSize, +symbolSize];
    }
    return [symbolSize[0] || 0, symbolSize[1] || 0];
}
export function normalizeSymbolOffset(symbolOffset, symbolSize) {
    if (symbolOffset == null) {
        return;
    }
    if (!isArray(symbolOffset)) {
        symbolOffset = [symbolOffset, symbolOffset];
    }
    return [
        parsePercent(symbolOffset[0], symbolSize[0]) || 0,
        parsePercent(retrieve2(symbolOffset[1], symbolOffset[0]), symbolSize[1]) || 0
    ];
}
