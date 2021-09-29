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
import Eventful from 'zrender/src/core/Eventful';
import * as eventTool from 'zrender/src/core/event';
import * as interactionMutex from './interactionMutex';
import { isString, bind, defaults, clone } from 'zrender/src/core/util';
;
class RoamController extends Eventful {
    constructor(zr) {
        super();
        this._zr = zr;
        // Avoid two roamController bind the same handler
        const mousedownHandler = bind(this._mousedownHandler, this);
        const mousemoveHandler = bind(this._mousemoveHandler, this);
        const mouseupHandler = bind(this._mouseupHandler, this);
        const mousewheelHandler = bind(this._mousewheelHandler, this);
        const pinchHandler = bind(this._pinchHandler, this);
        /**
         * Notice: only enable needed types. For example, if 'zoom'
         * is not needed, 'zoom' should not be enabled, otherwise
         * default mousewheel behaviour (scroll page) will be disabled.
         */
        this.enable = function (controlType, opt) {
            // Disable previous first
            this.disable();
            this._opt = defaults(clone(opt) || {}, {
                zoomOnMouseWheel: true,
                moveOnMouseMove: true,
                // By default, wheel do not trigger move.
                moveOnMouseWheel: false,
                preventDefaultMouseMove: true
            });
            if (controlType == null) {
                controlType = true;
            }
            if (controlType === true || (controlType === 'move' || controlType === 'pan')) {
                zr.on('mousedown', mousedownHandler);
                zr.on('mousemove', mousemoveHandler);
                zr.on('mouseup', mouseupHandler);
            }
            if (controlType === true || (controlType === 'scale' || controlType === 'zoom')) {
                zr.on('mousewheel', mousewheelHandler);
                zr.on('pinch', pinchHandler);
            }
        };
        this.disable = function () {
            zr.off('mousedown', mousedownHandler);
            zr.off('mousemove', mousemoveHandler);
            zr.off('mouseup', mouseupHandler);
            zr.off('mousewheel', mousewheelHandler);
            zr.off('pinch', pinchHandler);
        };
    }
    isDragging() {
        return this._dragging;
    }
    isPinching() {
        return this._pinching;
    }
    setPointerChecker(pointerChecker) {
        this.pointerChecker = pointerChecker;
    }
    dispose() {
        this.disable();
    }
    _mousedownHandler(e) {
        if (eventTool.isMiddleOrRightButtonOnMouseUpDown(e)
            || (e.target && e.target.draggable)) {
            return;
        }
        const x = e.offsetX;
        const y = e.offsetY;
        // Only check on mosedown, but not mousemove.
        // Mouse can be out of target when mouse moving.
        if (this.pointerChecker && this.pointerChecker(e, x, y)) {
            this._x = x;
            this._y = y;
            this._dragging = true;
        }
    }
    _mousemoveHandler(e) {
        if (!this._dragging
            || !isAvailableBehavior('moveOnMouseMove', e, this._opt)
            || e.gestureEvent === 'pinch'
            || interactionMutex.isTaken(this._zr, 'globalPan')) {
            return;
        }
        const x = e.offsetX;
        const y = e.offsetY;
        const oldX = this._x;
        const oldY = this._y;
        const dx = x - oldX;
        const dy = y - oldY;
        this._x = x;
        this._y = y;
        this._opt.preventDefaultMouseMove && eventTool.stop(e.event);
        trigger(this, 'pan', 'moveOnMouseMove', e, {
            dx: dx, dy: dy, oldX: oldX, oldY: oldY, newX: x, newY: y, isAvailableBehavior: null
        });
    }
    _mouseupHandler(e) {
        if (!eventTool.isMiddleOrRightButtonOnMouseUpDown(e)) {
            this._dragging = false;
        }
    }
    _mousewheelHandler(e) {
        const shouldZoom = isAvailableBehavior('zoomOnMouseWheel', e, this._opt);
        const shouldMove = isAvailableBehavior('moveOnMouseWheel', e, this._opt);
        const wheelDelta = e.wheelDelta;
        const absWheelDeltaDelta = Math.abs(wheelDelta);
        const originX = e.offsetX;
        const originY = e.offsetY;
        // wheelDelta maybe -0 in chrome mac.
        if (wheelDelta === 0 || (!shouldZoom && !shouldMove)) {
            return;
        }
        // If both `shouldZoom` and `shouldMove` is true, trigger
        // their event both, and the final behavior is determined
        // by event listener themselves.
        if (shouldZoom) {
            // Convenience:
            // Mac and VM Windows on Mac: scroll up: zoom out.
            // Windows: scroll up: zoom in.
            // FIXME: Should do more test in different environment.
            // wheelDelta is too complicated in difference nvironment
            // (https://developer.mozilla.org/en-US/docs/Web/Events/mousewheel),
            // although it has been normallized by zrender.
            // wheelDelta of mouse wheel is bigger than touch pad.
            const factor = absWheelDeltaDelta > 3 ? 1.4 : absWheelDeltaDelta > 1 ? 1.2 : 1.1;
            const scale = wheelDelta > 0 ? factor : 1 / factor;
            checkPointerAndTrigger(this, 'zoom', 'zoomOnMouseWheel', e, {
                scale: scale, originX: originX, originY: originY, isAvailableBehavior: null
            });
        }
        if (shouldMove) {
            // FIXME: Should do more test in different environment.
            const absDelta = Math.abs(wheelDelta);
            // wheelDelta of mouse wheel is bigger than touch pad.
            const scrollDelta = (wheelDelta > 0 ? 1 : -1) * (absDelta > 3 ? 0.4 : absDelta > 1 ? 0.15 : 0.05);
            checkPointerAndTrigger(this, 'scrollMove', 'moveOnMouseWheel', e, {
                scrollDelta: scrollDelta, originX: originX, originY: originY, isAvailableBehavior: null
            });
        }
    }
    _pinchHandler(e) {
        if (interactionMutex.isTaken(this._zr, 'globalPan')) {
            return;
        }
        const scale = e.pinchScale > 1 ? 1.1 : 1 / 1.1;
        checkPointerAndTrigger(this, 'zoom', null, e, {
            scale: scale, originX: e.pinchX, originY: e.pinchY, isAvailableBehavior: null
        });
    }
}
function checkPointerAndTrigger(controller, eventName, behaviorToCheck, e, contollerEvent) {
    if (controller.pointerChecker
        && controller.pointerChecker(e, contollerEvent.originX, contollerEvent.originY)) {
        // When mouse is out of roamController rect,
        // default befavoius should not be be disabled, otherwise
        // page sliding is disabled, contrary to expectation.
        eventTool.stop(e.event);
        trigger(controller, eventName, behaviorToCheck, e, contollerEvent);
    }
}
function trigger(controller, eventName, behaviorToCheck, e, contollerEvent) {
    // Also provide behavior checker for event listener, for some case that
    // multiple components share one listener.
    contollerEvent.isAvailableBehavior = bind(isAvailableBehavior, null, behaviorToCheck, e);
    // TODO should not have type issue.
    controller.trigger(eventName, contollerEvent);
}
// settings: {
//     zoomOnMouseWheel
//     moveOnMouseMove
//     moveOnMouseWheel
// }
// The value can be: true / false / 'shift' / 'ctrl' / 'alt'.
function isAvailableBehavior(behaviorToCheck, e, settings) {
    const setting = settings[behaviorToCheck];
    return !behaviorToCheck || (setting && (!isString(setting) || e.event[setting + 'Key']));
}
export default RoamController;
