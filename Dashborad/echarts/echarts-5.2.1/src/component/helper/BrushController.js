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
import { curry, each, map, bind, merge, clone, defaults, assert } from 'zrender/src/core/util';
import Eventful from 'zrender/src/core/Eventful';
import * as graphic from '../../util/graphic';
import * as interactionMutex from './interactionMutex';
import DataDiffer from '../../data/DataDiffer';
const BRUSH_PANEL_GLOBAL = true;
const mathMin = Math.min;
const mathMax = Math.max;
const mathPow = Math.pow;
const COVER_Z = 10000;
const UNSELECT_THRESHOLD = 6;
const MIN_RESIZE_LINE_WIDTH = 6;
const MUTEX_RESOURCE_KEY = 'globalPan';
const DIRECTION_MAP = {
    w: [0, 0],
    e: [0, 1],
    n: [1, 0],
    s: [1, 1]
};
const CURSOR_MAP = {
    w: 'ew',
    e: 'ew',
    n: 'ns',
    s: 'ns',
    ne: 'nesw',
    sw: 'nesw',
    nw: 'nwse',
    se: 'nwse'
};
const DEFAULT_BRUSH_OPT = {
    brushStyle: {
        lineWidth: 2,
        stroke: 'rgba(210,219,238,0.3)',
        fill: '#D2DBEE'
    },
    transformable: true,
    brushMode: 'single',
    removeOnClick: false
};
let baseUID = 0;
/**
 * params:
 *     areas: Array.<Array>, coord relates to container group,
 *                             If no container specified, to global.
 *     opt {
 *         isEnd: boolean,
 *         removeOnClick: boolean
 *     }
 */
class BrushController extends Eventful {
    constructor(zr) {
        super();
        /**
         * @internal
         */
        this._track = [];
        /**
         * @internal
         */
        this._covers = [];
        this._handlers = {};
        if (__DEV__) {
            assert(zr);
        }
        this._zr = zr;
        this.group = new graphic.Group();
        this._uid = 'brushController_' + baseUID++;
        each(pointerHandlers, function (handler, eventName) {
            this._handlers[eventName] = bind(handler, this);
        }, this);
    }
    /**
     * If set to `false`, select disabled.
     */
    enableBrush(brushOption) {
        if (__DEV__) {
            assert(this._mounted);
        }
        this._brushType && this._doDisableBrush();
        brushOption.brushType && this._doEnableBrush(brushOption);
        return this;
    }
    _doEnableBrush(brushOption) {
        const zr = this._zr;
        // Consider roam, which takes globalPan too.
        if (!this._enableGlobalPan) {
            interactionMutex.take(zr, MUTEX_RESOURCE_KEY, this._uid);
        }
        each(this._handlers, function (handler, eventName) {
            zr.on(eventName, handler);
        });
        this._brushType = brushOption.brushType;
        this._brushOption = merge(clone(DEFAULT_BRUSH_OPT), brushOption, true);
    }
    _doDisableBrush() {
        const zr = this._zr;
        interactionMutex.release(zr, MUTEX_RESOURCE_KEY, this._uid);
        each(this._handlers, function (handler, eventName) {
            zr.off(eventName, handler);
        });
        this._brushType = this._brushOption = null;
    }
    /**
     * @param panelOpts If not pass, it is global brush.
     */
    setPanels(panelOpts) {
        if (panelOpts && panelOpts.length) {
            const panels = this._panels = {};
            each(panelOpts, function (panelOpts) {
                panels[panelOpts.panelId] = clone(panelOpts);
            });
        }
        else {
            this._panels = null;
        }
        return this;
    }
    mount(opt) {
        opt = opt || {};
        if (__DEV__) {
            this._mounted = true; // should be at first.
        }
        this._enableGlobalPan = opt.enableGlobalPan;
        const thisGroup = this.group;
        this._zr.add(thisGroup);
        thisGroup.attr({
            x: opt.x || 0,
            y: opt.y || 0,
            rotation: opt.rotation || 0,
            scaleX: opt.scaleX || 1,
            scaleY: opt.scaleY || 1
        });
        this._transform = thisGroup.getLocalTransform();
        return this;
    }
    // eachCover(cb, context): void {
    //     each(this._covers, cb, context);
    // }
    /**
     * Update covers.
     * @param coverConfigList
     *        If coverConfigList is null/undefined, all covers removed.
     */
    updateCovers(coverConfigList) {
        if (__DEV__) {
            assert(this._mounted);
        }
        coverConfigList = map(coverConfigList, function (coverConfig) {
            return merge(clone(DEFAULT_BRUSH_OPT), coverConfig, true);
        });
        const tmpIdPrefix = '\0-brush-index-';
        const oldCovers = this._covers;
        const newCovers = this._covers = [];
        const controller = this;
        const creatingCover = this._creatingCover;
        (new DataDiffer(oldCovers, coverConfigList, oldGetKey, getKey))
            .add(addOrUpdate)
            .update(addOrUpdate)
            .remove(remove)
            .execute();
        return this;
        function getKey(brushOption, index) {
            return (brushOption.id != null ? brushOption.id : tmpIdPrefix + index)
                + '-' + brushOption.brushType;
        }
        function oldGetKey(cover, index) {
            return getKey(cover.__brushOption, index);
        }
        function addOrUpdate(newIndex, oldIndex) {
            const newBrushInternal = coverConfigList[newIndex];
            // Consider setOption in event listener of brushSelect,
            // where updating cover when creating should be forbiden.
            if (oldIndex != null && oldCovers[oldIndex] === creatingCover) {
                newCovers[newIndex] = oldCovers[oldIndex];
            }
            else {
                const cover = newCovers[newIndex] = oldIndex != null
                    ? (oldCovers[oldIndex].__brushOption = newBrushInternal,
                        oldCovers[oldIndex])
                    : endCreating(controller, createCover(controller, newBrushInternal));
                updateCoverAfterCreation(controller, cover);
            }
        }
        function remove(oldIndex) {
            if (oldCovers[oldIndex] !== creatingCover) {
                controller.group.remove(oldCovers[oldIndex]);
            }
        }
    }
    unmount() {
        if (__DEV__) {
            if (!this._mounted) {
                return;
            }
        }
        this.enableBrush(false);
        // container may 'removeAll' outside.
        clearCovers(this);
        this._zr.remove(this.group);
        if (__DEV__) {
            this._mounted = false; // should be at last.
        }
        return this;
    }
    dispose() {
        this.unmount();
        this.off();
    }
}
function createCover(controller, brushOption) {
    const cover = coverRenderers[brushOption.brushType].createCover(controller, brushOption);
    cover.__brushOption = brushOption;
    updateZ(cover, brushOption);
    controller.group.add(cover);
    return cover;
}
function endCreating(controller, creatingCover) {
    const coverRenderer = getCoverRenderer(creatingCover);
    if (coverRenderer.endCreating) {
        coverRenderer.endCreating(controller, creatingCover);
        updateZ(creatingCover, creatingCover.__brushOption);
    }
    return creatingCover;
}
function updateCoverShape(controller, cover) {
    const brushOption = cover.__brushOption;
    getCoverRenderer(cover).updateCoverShape(controller, cover, brushOption.range, brushOption);
}
function updateZ(cover, brushOption) {
    let z = brushOption.z;
    z == null && (z = COVER_Z);
    cover.traverse(function (el) {
        el.z = z;
        el.z2 = z; // Consider in given container.
    });
}
function updateCoverAfterCreation(controller, cover) {
    getCoverRenderer(cover).updateCommon(controller, cover);
    updateCoverShape(controller, cover);
}
function getCoverRenderer(cover) {
    return coverRenderers[cover.__brushOption.brushType];
}
// return target panel or `true` (means global panel)
function getPanelByPoint(controller, e, localCursorPoint) {
    const panels = controller._panels;
    if (!panels) {
        return BRUSH_PANEL_GLOBAL; // Global panel
    }
    let panel;
    const transform = controller._transform;
    each(panels, function (pn) {
        pn.isTargetByCursor(e, localCursorPoint, transform) && (panel = pn);
    });
    return panel;
}
// Return a panel or true
function getPanelByCover(controller, cover) {
    const panels = controller._panels;
    if (!panels) {
        return BRUSH_PANEL_GLOBAL; // Global panel
    }
    const panelId = cover.__brushOption.panelId;
    // User may give cover without coord sys info,
    // which is then treated as global panel.
    return panelId != null ? panels[panelId] : BRUSH_PANEL_GLOBAL;
}
function clearCovers(controller) {
    const covers = controller._covers;
    const originalLength = covers.length;
    each(covers, function (cover) {
        controller.group.remove(cover);
    }, controller);
    covers.length = 0;
    return !!originalLength;
}
function trigger(controller, opt) {
    const areas = map(controller._covers, function (cover) {
        const brushOption = cover.__brushOption;
        const range = clone(brushOption.range);
        return {
            brushType: brushOption.brushType,
            panelId: brushOption.panelId,
            range: range
        };
    });
    controller.trigger('brush', {
        areas: areas,
        isEnd: !!opt.isEnd,
        removeOnClick: !!opt.removeOnClick
    });
}
function shouldShowCover(controller) {
    const track = controller._track;
    if (!track.length) {
        return false;
    }
    const p2 = track[track.length - 1];
    const p1 = track[0];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dist = mathPow(dx * dx + dy * dy, 0.5);
    return dist > UNSELECT_THRESHOLD;
}
function getTrackEnds(track) {
    let tail = track.length - 1;
    tail < 0 && (tail = 0);
    return [track[0], track[tail]];
}
;
function createBaseRectCover(rectRangeConverter, controller, brushOption, edgeNameSequences) {
    const cover = new graphic.Group();
    cover.add(new graphic.Rect({
        name: 'main',
        style: makeStyle(brushOption),
        silent: true,
        draggable: true,
        cursor: 'move',
        drift: curry(driftRect, rectRangeConverter, controller, cover, ['n', 's', 'w', 'e']),
        ondragend: curry(trigger, controller, { isEnd: true })
    }));
    each(edgeNameSequences, function (nameSequence) {
        cover.add(new graphic.Rect({
            name: nameSequence.join(''),
            style: { opacity: 0 },
            draggable: true,
            silent: true,
            invisible: true,
            drift: curry(driftRect, rectRangeConverter, controller, cover, nameSequence),
            ondragend: curry(trigger, controller, { isEnd: true })
        }));
    });
    return cover;
}
function updateBaseRect(controller, cover, localRange, brushOption) {
    const lineWidth = brushOption.brushStyle.lineWidth || 0;
    const handleSize = mathMax(lineWidth, MIN_RESIZE_LINE_WIDTH);
    const x = localRange[0][0];
    const y = localRange[1][0];
    const xa = x - lineWidth / 2;
    const ya = y - lineWidth / 2;
    const x2 = localRange[0][1];
    const y2 = localRange[1][1];
    const x2a = x2 - handleSize + lineWidth / 2;
    const y2a = y2 - handleSize + lineWidth / 2;
    const width = x2 - x;
    const height = y2 - y;
    const widtha = width + lineWidth;
    const heighta = height + lineWidth;
    updateRectShape(controller, cover, 'main', x, y, width, height);
    if (brushOption.transformable) {
        updateRectShape(controller, cover, 'w', xa, ya, handleSize, heighta);
        updateRectShape(controller, cover, 'e', x2a, ya, handleSize, heighta);
        updateRectShape(controller, cover, 'n', xa, ya, widtha, handleSize);
        updateRectShape(controller, cover, 's', xa, y2a, widtha, handleSize);
        updateRectShape(controller, cover, 'nw', xa, ya, handleSize, handleSize);
        updateRectShape(controller, cover, 'ne', x2a, ya, handleSize, handleSize);
        updateRectShape(controller, cover, 'sw', xa, y2a, handleSize, handleSize);
        updateRectShape(controller, cover, 'se', x2a, y2a, handleSize, handleSize);
    }
}
function updateCommon(controller, cover) {
    const brushOption = cover.__brushOption;
    const transformable = brushOption.transformable;
    const mainEl = cover.childAt(0);
    mainEl.useStyle(makeStyle(brushOption));
    mainEl.attr({
        silent: !transformable,
        cursor: transformable ? 'move' : 'default'
    });
    each([['w'], ['e'], ['n'], ['s'], ['s', 'e'], ['s', 'w'], ['n', 'e'], ['n', 'w']], function (nameSequence) {
        const el = cover.childOfName(nameSequence.join(''));
        const globalDir = nameSequence.length === 1
            ? getGlobalDirection1(controller, nameSequence[0])
            : getGlobalDirection2(controller, nameSequence);
        el && el.attr({
            silent: !transformable,
            invisible: !transformable,
            cursor: transformable ? CURSOR_MAP[globalDir] + '-resize' : null
        });
    });
}
function updateRectShape(controller, cover, name, x, y, w, h) {
    const el = cover.childOfName(name);
    el && el.setShape(pointsToRect(clipByPanel(controller, cover, [[x, y], [x + w, y + h]])));
}
function makeStyle(brushOption) {
    return defaults({ strokeNoScale: true }, brushOption.brushStyle);
}
function formatRectRange(x, y, x2, y2) {
    const min = [mathMin(x, x2), mathMin(y, y2)];
    const max = [mathMax(x, x2), mathMax(y, y2)];
    return [
        [min[0], max[0]],
        [min[1], max[1]] // y range
    ];
}
function getTransform(controller) {
    return graphic.getTransform(controller.group);
}
function getGlobalDirection1(controller, localDirName) {
    const map = { w: 'left', e: 'right', n: 'top', s: 'bottom' };
    const inverseMap = { left: 'w', right: 'e', top: 'n', bottom: 's' };
    const dir = graphic.transformDirection(map[localDirName], getTransform(controller));
    return inverseMap[dir];
}
function getGlobalDirection2(controller, localDirNameSeq) {
    const globalDir = [
        getGlobalDirection1(controller, localDirNameSeq[0]),
        getGlobalDirection1(controller, localDirNameSeq[1])
    ];
    (globalDir[0] === 'e' || globalDir[0] === 'w') && globalDir.reverse();
    return globalDir.join('');
}
function driftRect(rectRangeConverter, controller, cover, dirNameSequence, dx, dy) {
    const brushOption = cover.__brushOption;
    const rectRange = rectRangeConverter.toRectRange(brushOption.range);
    const localDelta = toLocalDelta(controller, dx, dy);
    each(dirNameSequence, function (dirName) {
        const ind = DIRECTION_MAP[dirName];
        rectRange[ind[0]][ind[1]] += localDelta[ind[0]];
    });
    brushOption.range = rectRangeConverter.fromRectRange(formatRectRange(rectRange[0][0], rectRange[1][0], rectRange[0][1], rectRange[1][1]));
    updateCoverAfterCreation(controller, cover);
    trigger(controller, { isEnd: false });
}
function driftPolygon(controller, cover, dx, dy) {
    const range = cover.__brushOption.range;
    const localDelta = toLocalDelta(controller, dx, dy);
    each(range, function (point) {
        point[0] += localDelta[0];
        point[1] += localDelta[1];
    });
    updateCoverAfterCreation(controller, cover);
    trigger(controller, { isEnd: false });
}
function toLocalDelta(controller, dx, dy) {
    const thisGroup = controller.group;
    const localD = thisGroup.transformCoordToLocal(dx, dy);
    const localZero = thisGroup.transformCoordToLocal(0, 0);
    return [localD[0] - localZero[0], localD[1] - localZero[1]];
}
function clipByPanel(controller, cover, data) {
    const panel = getPanelByCover(controller, cover);
    return (panel && panel !== BRUSH_PANEL_GLOBAL)
        ? panel.clipPath(data, controller._transform)
        : clone(data);
}
function pointsToRect(points) {
    const xmin = mathMin(points[0][0], points[1][0]);
    const ymin = mathMin(points[0][1], points[1][1]);
    const xmax = mathMax(points[0][0], points[1][0]);
    const ymax = mathMax(points[0][1], points[1][1]);
    return {
        x: xmin,
        y: ymin,
        width: xmax - xmin,
        height: ymax - ymin
    };
}
function resetCursor(controller, e, localCursorPoint) {
    if (
    // Check active
    !controller._brushType
        // resetCursor should be always called when mouse is in zr area,
        // but not called when mouse is out of zr area to avoid bad influence
        // if `mousemove`, `mouseup` are triggered from `document` event.
        || isOutsideZrArea(controller, e.offsetX, e.offsetY)) {
        return;
    }
    const zr = controller._zr;
    const covers = controller._covers;
    const currPanel = getPanelByPoint(controller, e, localCursorPoint);
    // Check whether in covers.
    if (!controller._dragging) {
        for (let i = 0; i < covers.length; i++) {
            const brushOption = covers[i].__brushOption;
            if (currPanel
                && (currPanel === BRUSH_PANEL_GLOBAL || brushOption.panelId === currPanel.panelId)
                && coverRenderers[brushOption.brushType].contain(covers[i], localCursorPoint[0], localCursorPoint[1])) {
                // Use cursor style set on cover.
                return;
            }
        }
    }
    currPanel && zr.setCursorStyle('crosshair');
}
function preventDefault(e) {
    const rawE = e.event;
    rawE.preventDefault && rawE.preventDefault();
}
function mainShapeContain(cover, x, y) {
    return cover.childOfName('main').contain(x, y);
}
function updateCoverByMouse(controller, e, localCursorPoint, isEnd) {
    let creatingCover = controller._creatingCover;
    const panel = controller._creatingPanel;
    const thisBrushOption = controller._brushOption;
    let eventParams;
    controller._track.push(localCursorPoint.slice());
    if (shouldShowCover(controller) || creatingCover) {
        if (panel && !creatingCover) {
            thisBrushOption.brushMode === 'single' && clearCovers(controller);
            const brushOption = clone(thisBrushOption);
            brushOption.brushType = determineBrushType(brushOption.brushType, panel);
            brushOption.panelId = panel === BRUSH_PANEL_GLOBAL ? null : panel.panelId;
            creatingCover = controller._creatingCover = createCover(controller, brushOption);
            controller._covers.push(creatingCover);
        }
        if (creatingCover) {
            const coverRenderer = coverRenderers[determineBrushType(controller._brushType, panel)];
            const coverBrushOption = creatingCover.__brushOption;
            coverBrushOption.range = coverRenderer.getCreatingRange(clipByPanel(controller, creatingCover, controller._track));
            if (isEnd) {
                endCreating(controller, creatingCover);
                coverRenderer.updateCommon(controller, creatingCover);
            }
            updateCoverShape(controller, creatingCover);
            eventParams = { isEnd: isEnd };
        }
    }
    else if (isEnd
        && thisBrushOption.brushMode === 'single'
        && thisBrushOption.removeOnClick) {
        // Help user to remove covers easily, only by a tiny drag, in 'single' mode.
        // But a single click do not clear covers, because user may have casual
        // clicks (for example, click on other component and do not expect covers
        // disappear).
        // Only some cover removed, trigger action, but not every click trigger action.
        if (getPanelByPoint(controller, e, localCursorPoint) && clearCovers(controller)) {
            eventParams = { isEnd: isEnd, removeOnClick: true };
        }
    }
    return eventParams;
}
function determineBrushType(brushType, panel) {
    if (brushType === 'auto') {
        if (__DEV__) {
            assert(panel && panel.defaultBrushType, 'MUST have defaultBrushType when brushType is "atuo"');
        }
        return panel.defaultBrushType;
    }
    return brushType;
}
const pointerHandlers = {
    mousedown: function (e) {
        if (this._dragging) {
            // In case some browser do not support globalOut,
            // and release mouse out side the browser.
            handleDragEnd(this, e);
        }
        else if (!e.target || !e.target.draggable) {
            preventDefault(e);
            const localCursorPoint = this.group.transformCoordToLocal(e.offsetX, e.offsetY);
            this._creatingCover = null;
            const panel = this._creatingPanel = getPanelByPoint(this, e, localCursorPoint);
            if (panel) {
                this._dragging = true;
                this._track = [localCursorPoint.slice()];
            }
        }
    },
    mousemove: function (e) {
        const x = e.offsetX;
        const y = e.offsetY;
        const localCursorPoint = this.group.transformCoordToLocal(x, y);
        resetCursor(this, e, localCursorPoint);
        if (this._dragging) {
            preventDefault(e);
            const eventParams = updateCoverByMouse(this, e, localCursorPoint, false);
            eventParams && trigger(this, eventParams);
        }
    },
    mouseup: function (e) {
        handleDragEnd(this, e);
    }
};
function handleDragEnd(controller, e) {
    if (controller._dragging) {
        preventDefault(e);
        const x = e.offsetX;
        const y = e.offsetY;
        const localCursorPoint = controller.group.transformCoordToLocal(x, y);
        const eventParams = updateCoverByMouse(controller, e, localCursorPoint, true);
        controller._dragging = false;
        controller._track = [];
        controller._creatingCover = null;
        // trigger event shoule be at final, after procedure will be nested.
        eventParams && trigger(controller, eventParams);
    }
}
function isOutsideZrArea(controller, x, y) {
    const zr = controller._zr;
    return x < 0 || x > zr.getWidth() || y < 0 || y > zr.getHeight();
}
/**
 * key: brushType
 */
const coverRenderers = {
    lineX: getLineRenderer(0),
    lineY: getLineRenderer(1),
    rect: {
        createCover: function (controller, brushOption) {
            function returnInput(range) {
                return range;
            }
            return createBaseRectCover({
                toRectRange: returnInput,
                fromRectRange: returnInput
            }, controller, brushOption, [['w'], ['e'], ['n'], ['s'], ['s', 'e'], ['s', 'w'], ['n', 'e'], ['n', 'w']]);
        },
        getCreatingRange: function (localTrack) {
            const ends = getTrackEnds(localTrack);
            return formatRectRange(ends[1][0], ends[1][1], ends[0][0], ends[0][1]);
        },
        updateCoverShape: function (controller, cover, localRange, brushOption) {
            updateBaseRect(controller, cover, localRange, brushOption);
        },
        updateCommon: updateCommon,
        contain: mainShapeContain
    },
    polygon: {
        createCover: function (controller, brushOption) {
            const cover = new graphic.Group();
            // Do not use graphic.Polygon because graphic.Polyline do not close the
            // border of the shape when drawing, which is a better experience for user.
            cover.add(new graphic.Polyline({
                name: 'main',
                style: makeStyle(brushOption),
                silent: true
            }));
            return cover;
        },
        getCreatingRange: function (localTrack) {
            return localTrack;
        },
        endCreating: function (controller, cover) {
            cover.remove(cover.childAt(0));
            // Use graphic.Polygon close the shape.
            cover.add(new graphic.Polygon({
                name: 'main',
                draggable: true,
                drift: curry(driftPolygon, controller, cover),
                ondragend: curry(trigger, controller, { isEnd: true })
            }));
        },
        updateCoverShape: function (controller, cover, localRange, brushOption) {
            cover.childAt(0).setShape({
                points: clipByPanel(controller, cover, localRange)
            });
        },
        updateCommon: updateCommon,
        contain: mainShapeContain
    }
};
function getLineRenderer(xyIndex) {
    return {
        createCover: function (controller, brushOption) {
            return createBaseRectCover({
                toRectRange: function (range) {
                    const rectRange = [range, [0, 100]];
                    xyIndex && rectRange.reverse();
                    return rectRange;
                },
                fromRectRange: function (rectRange) {
                    return rectRange[xyIndex];
                }
            }, controller, brushOption, [[['w'], ['e']], [['n'], ['s']]][xyIndex]);
        },
        getCreatingRange: function (localTrack) {
            const ends = getTrackEnds(localTrack);
            const min = mathMin(ends[0][xyIndex], ends[1][xyIndex]);
            const max = mathMax(ends[0][xyIndex], ends[1][xyIndex]);
            return [min, max];
        },
        updateCoverShape: function (controller, cover, localRange, brushOption) {
            let otherExtent;
            // If brushWidth not specified, fit the panel.
            const panel = getPanelByCover(controller, cover);
            if (panel !== BRUSH_PANEL_GLOBAL && panel.getLinearBrushOtherExtent) {
                otherExtent = panel.getLinearBrushOtherExtent(xyIndex);
            }
            else {
                const zr = controller._zr;
                otherExtent = [0, [zr.getWidth(), zr.getHeight()][1 - xyIndex]];
            }
            const rectRange = [localRange, otherExtent];
            xyIndex && rectRange.reverse();
            updateBaseRect(controller, cover, rectRange, brushOption);
        },
        updateCommon: updateCommon,
        contain: mainShapeContain
    };
}
export default BrushController;
