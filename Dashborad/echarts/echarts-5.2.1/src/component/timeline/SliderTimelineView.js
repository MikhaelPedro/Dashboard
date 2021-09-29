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
import BoundingRect from 'zrender/src/core/BoundingRect';
import * as matrix from 'zrender/src/core/matrix';
import * as graphic from '../../util/graphic';
import { createTextStyle } from '../../label/labelStyle';
import * as layout from '../../util/layout';
import TimelineView from './TimelineView';
import TimelineAxis from './TimelineAxis';
import { createSymbol, normalizeSymbolOffset, normalizeSymbolSize } from '../../util/symbol';
import * as numberUtil from '../../util/number';
import { merge, each, extend, isString, bind, defaults, retrieve2 } from 'zrender/src/core/util';
import OrdinalScale from '../../scale/Ordinal';
import TimeScale from '../../scale/Time';
import IntervalScale from '../../scale/Interval';
import { parsePercent } from 'zrender/src/contain/text';
import { makeInner } from '../../util/model';
import { getECData } from '../../util/innerStore';
import { enableHoverEmphasis } from '../../util/states';
import { createTooltipMarkup } from '../tooltip/tooltipMarkup';
const PI = Math.PI;
const labelDataIndexStore = makeInner();
class SliderTimelineView extends TimelineView {
    constructor() {
        super(...arguments);
        this.type = SliderTimelineView.type;
    }
    init(ecModel, api) {
        this.api = api;
    }
    /**
     * @override
     */
    render(timelineModel, ecModel, api) {
        this.model = timelineModel;
        this.api = api;
        this.ecModel = ecModel;
        this.group.removeAll();
        if (timelineModel.get('show', true)) {
            const layoutInfo = this._layout(timelineModel, api);
            const mainGroup = this._createGroup('_mainGroup');
            const labelGroup = this._createGroup('_labelGroup');
            const axis = this._axis = this._createAxis(layoutInfo, timelineModel);
            timelineModel.formatTooltip = function (dataIndex) {
                const name = axis.scale.getLabel({ value: dataIndex });
                return createTooltipMarkup('nameValue', { noName: true, value: name });
            };
            each(['AxisLine', 'AxisTick', 'Control', 'CurrentPointer'], function (name) {
                this['_render' + name](layoutInfo, mainGroup, axis, timelineModel);
            }, this);
            this._renderAxisLabel(layoutInfo, labelGroup, axis, timelineModel);
            this._position(layoutInfo, timelineModel);
        }
        this._doPlayStop();
        this._updateTicksStatus();
    }
    /**
     * @override
     */
    remove() {
        this._clearTimer();
        this.group.removeAll();
    }
    /**
     * @override
     */
    dispose() {
        this._clearTimer();
    }
    _layout(timelineModel, api) {
        const labelPosOpt = timelineModel.get(['label', 'position']);
        const orient = timelineModel.get('orient');
        const viewRect = getViewRect(timelineModel, api);
        let parsedLabelPos;
        // Auto label offset.
        if (labelPosOpt == null || labelPosOpt === 'auto') {
            parsedLabelPos = orient === 'horizontal'
                ? ((viewRect.y + viewRect.height / 2) < api.getHeight() / 2 ? '-' : '+')
                : ((viewRect.x + viewRect.width / 2) < api.getWidth() / 2 ? '+' : '-');
        }
        else if (isString(labelPosOpt)) {
            parsedLabelPos = {
                horizontal: { top: '-', bottom: '+' },
                vertical: { left: '-', right: '+' }
            }[orient][labelPosOpt];
        }
        else {
            // is number
            parsedLabelPos = labelPosOpt;
        }
        const labelAlignMap = {
            horizontal: 'center',
            vertical: (parsedLabelPos >= 0 || parsedLabelPos === '+') ? 'left' : 'right'
        };
        const labelBaselineMap = {
            horizontal: (parsedLabelPos >= 0 || parsedLabelPos === '+') ? 'top' : 'bottom',
            vertical: 'middle'
        };
        const rotationMap = {
            horizontal: 0,
            vertical: PI / 2
        };
        // Position
        const mainLength = orient === 'vertical' ? viewRect.height : viewRect.width;
        const controlModel = timelineModel.getModel('controlStyle');
        const showControl = controlModel.get('show', true);
        const controlSize = showControl ? controlModel.get('itemSize') : 0;
        const controlGap = showControl ? controlModel.get('itemGap') : 0;
        const sizePlusGap = controlSize + controlGap;
        // Special label rotate.
        let labelRotation = timelineModel.get(['label', 'rotate']) || 0;
        labelRotation = labelRotation * PI / 180; // To radian.
        let playPosition;
        let prevBtnPosition;
        let nextBtnPosition;
        const controlPosition = controlModel.get('position', true);
        const showPlayBtn = showControl && controlModel.get('showPlayBtn', true);
        const showPrevBtn = showControl && controlModel.get('showPrevBtn', true);
        const showNextBtn = showControl && controlModel.get('showNextBtn', true);
        let xLeft = 0;
        let xRight = mainLength;
        // position[0] means left, position[1] means middle.
        if (controlPosition === 'left' || controlPosition === 'bottom') {
            showPlayBtn && (playPosition = [0, 0], xLeft += sizePlusGap);
            showPrevBtn && (prevBtnPosition = [xLeft, 0], xLeft += sizePlusGap);
            showNextBtn && (nextBtnPosition = [xRight - controlSize, 0], xRight -= sizePlusGap);
        }
        else { // 'top' 'right'
            showPlayBtn && (playPosition = [xRight - controlSize, 0], xRight -= sizePlusGap);
            showPrevBtn && (prevBtnPosition = [0, 0], xLeft += sizePlusGap);
            showNextBtn && (nextBtnPosition = [xRight - controlSize, 0], xRight -= sizePlusGap);
        }
        const axisExtent = [xLeft, xRight];
        if (timelineModel.get('inverse')) {
            axisExtent.reverse();
        }
        return {
            viewRect: viewRect,
            mainLength: mainLength,
            orient: orient,
            rotation: rotationMap[orient],
            labelRotation: labelRotation,
            labelPosOpt: parsedLabelPos,
            labelAlign: timelineModel.get(['label', 'align']) || labelAlignMap[orient],
            labelBaseline: timelineModel.get(['label', 'verticalAlign'])
                || timelineModel.get(['label', 'baseline'])
                || labelBaselineMap[orient],
            // Based on mainGroup.
            playPosition: playPosition,
            prevBtnPosition: prevBtnPosition,
            nextBtnPosition: nextBtnPosition,
            axisExtent: axisExtent,
            controlSize: controlSize,
            controlGap: controlGap
        };
    }
    _position(layoutInfo, timelineModel) {
        // Position is be called finally, because bounding rect is needed for
        // adapt content to fill viewRect (auto adapt offset).
        // Timeline may be not all in the viewRect when 'offset' is specified
        // as a number, because it is more appropriate that label aligns at
        // 'offset' but not the other edge defined by viewRect.
        const mainGroup = this._mainGroup;
        const labelGroup = this._labelGroup;
        let viewRect = layoutInfo.viewRect;
        if (layoutInfo.orient === 'vertical') {
            // transform to horizontal, inverse rotate by left-top point.
            const m = matrix.create();
            const rotateOriginX = viewRect.x;
            const rotateOriginY = viewRect.y + viewRect.height;
            matrix.translate(m, m, [-rotateOriginX, -rotateOriginY]);
            matrix.rotate(m, m, -PI / 2);
            matrix.translate(m, m, [rotateOriginX, rotateOriginY]);
            viewRect = viewRect.clone();
            viewRect.applyTransform(m);
        }
        const viewBound = getBound(viewRect);
        const mainBound = getBound(mainGroup.getBoundingRect());
        const labelBound = getBound(labelGroup.getBoundingRect());
        const mainPosition = [mainGroup.x, mainGroup.y];
        const labelsPosition = [labelGroup.x, labelGroup.y];
        labelsPosition[0] = mainPosition[0] = viewBound[0][0];
        const labelPosOpt = layoutInfo.labelPosOpt;
        if (labelPosOpt == null || isString(labelPosOpt)) { // '+' or '-'
            const mainBoundIdx = labelPosOpt === '+' ? 0 : 1;
            toBound(mainPosition, mainBound, viewBound, 1, mainBoundIdx);
            toBound(labelsPosition, labelBound, viewBound, 1, 1 - mainBoundIdx);
        }
        else {
            const mainBoundIdx = labelPosOpt >= 0 ? 0 : 1;
            toBound(mainPosition, mainBound, viewBound, 1, mainBoundIdx);
            labelsPosition[1] = mainPosition[1] + labelPosOpt;
        }
        mainGroup.setPosition(mainPosition);
        labelGroup.setPosition(labelsPosition);
        mainGroup.rotation = labelGroup.rotation = layoutInfo.rotation;
        setOrigin(mainGroup);
        setOrigin(labelGroup);
        function setOrigin(targetGroup) {
            targetGroup.originX = viewBound[0][0] - targetGroup.x;
            targetGroup.originY = viewBound[1][0] - targetGroup.y;
        }
        function getBound(rect) {
            // [[xmin, xmax], [ymin, ymax]]
            return [
                [rect.x, rect.x + rect.width],
                [rect.y, rect.y + rect.height]
            ];
        }
        function toBound(fromPos, from, to, dimIdx, boundIdx) {
            fromPos[dimIdx] += to[dimIdx][boundIdx] - from[dimIdx][boundIdx];
        }
    }
    _createAxis(layoutInfo, timelineModel) {
        const data = timelineModel.getData();
        const axisType = timelineModel.get('axisType');
        const scale = createScaleByModel(timelineModel, axisType);
        // Customize scale. The `tickValue` is `dataIndex`.
        scale.getTicks = function () {
            return data.mapArray(['value'], function (value) {
                return { value };
            });
        };
        const dataExtent = data.getDataExtent('value');
        scale.setExtent(dataExtent[0], dataExtent[1]);
        scale.niceTicks();
        const axis = new TimelineAxis('value', scale, layoutInfo.axisExtent, axisType);
        axis.model = timelineModel;
        return axis;
    }
    _createGroup(key) {
        const newGroup = this[key] = new graphic.Group();
        this.group.add(newGroup);
        return newGroup;
    }
    _renderAxisLine(layoutInfo, group, axis, timelineModel) {
        const axisExtent = axis.getExtent();
        if (!timelineModel.get(['lineStyle', 'show'])) {
            return;
        }
        const line = new graphic.Line({
            shape: {
                x1: axisExtent[0], y1: 0,
                x2: axisExtent[1], y2: 0
            },
            style: extend({ lineCap: 'round' }, timelineModel.getModel('lineStyle').getLineStyle()),
            silent: true,
            z2: 1
        });
        group.add(line);
        const progressLine = this._progressLine = new graphic.Line({
            shape: {
                x1: axisExtent[0],
                x2: this._currentPointer
                    ? this._currentPointer.x : axisExtent[0],
                y1: 0, y2: 0
            },
            style: defaults({ lineCap: 'round', lineWidth: line.style.lineWidth }, timelineModel.getModel(['progress', 'lineStyle']).getLineStyle()),
            silent: true,
            z2: 1
        });
        group.add(progressLine);
    }
    _renderAxisTick(layoutInfo, group, axis, timelineModel) {
        const data = timelineModel.getData();
        // Show all ticks, despite ignoring strategy.
        const ticks = axis.scale.getTicks();
        this._tickSymbols = [];
        // The value is dataIndex, see the costomized scale.
        each(ticks, (tick) => {
            const tickCoord = axis.dataToCoord(tick.value);
            const itemModel = data.getItemModel(tick.value);
            const itemStyleModel = itemModel.getModel('itemStyle');
            const hoverStyleModel = itemModel.getModel(['emphasis', 'itemStyle']);
            const progressStyleModel = itemModel.getModel(['progress', 'itemStyle']);
            const symbolOpt = {
                x: tickCoord,
                y: 0,
                onclick: bind(this._changeTimeline, this, tick.value)
            };
            const el = giveSymbol(itemModel, itemStyleModel, group, symbolOpt);
            el.ensureState('emphasis').style = hoverStyleModel.getItemStyle();
            el.ensureState('progress').style = progressStyleModel.getItemStyle();
            enableHoverEmphasis(el);
            const ecData = getECData(el);
            if (itemModel.get('tooltip')) {
                ecData.dataIndex = tick.value;
                ecData.dataModel = timelineModel;
            }
            else {
                ecData.dataIndex = ecData.dataModel = null;
            }
            this._tickSymbols.push(el);
        });
    }
    _renderAxisLabel(layoutInfo, group, axis, timelineModel) {
        const labelModel = axis.getLabelModel();
        if (!labelModel.get('show')) {
            return;
        }
        const data = timelineModel.getData();
        const labels = axis.getViewLabels();
        this._tickLabels = [];
        each(labels, (labelItem) => {
            // The tickValue is dataIndex, see the costomized scale.
            const dataIndex = labelItem.tickValue;
            const itemModel = data.getItemModel(dataIndex);
            const normalLabelModel = itemModel.getModel('label');
            const hoverLabelModel = itemModel.getModel(['emphasis', 'label']);
            const progressLabelModel = itemModel.getModel(['progress', 'label']);
            const tickCoord = axis.dataToCoord(labelItem.tickValue);
            const textEl = new graphic.Text({
                x: tickCoord,
                y: 0,
                rotation: layoutInfo.labelRotation - layoutInfo.rotation,
                onclick: bind(this._changeTimeline, this, dataIndex),
                silent: false,
                style: createTextStyle(normalLabelModel, {
                    text: labelItem.formattedLabel,
                    align: layoutInfo.labelAlign,
                    verticalAlign: layoutInfo.labelBaseline
                })
            });
            textEl.ensureState('emphasis').style = createTextStyle(hoverLabelModel);
            textEl.ensureState('progress').style = createTextStyle(progressLabelModel);
            group.add(textEl);
            enableHoverEmphasis(textEl);
            labelDataIndexStore(textEl).dataIndex = dataIndex;
            this._tickLabels.push(textEl);
        });
    }
    _renderControl(layoutInfo, group, axis, timelineModel) {
        const controlSize = layoutInfo.controlSize;
        const rotation = layoutInfo.rotation;
        const itemStyle = timelineModel.getModel('controlStyle').getItemStyle();
        const hoverStyle = timelineModel.getModel(['emphasis', 'controlStyle']).getItemStyle();
        const playState = timelineModel.getPlayState();
        const inverse = timelineModel.get('inverse', true);
        makeBtn(layoutInfo.nextBtnPosition, 'next', bind(this._changeTimeline, this, inverse ? '-' : '+'));
        makeBtn(layoutInfo.prevBtnPosition, 'prev', bind(this._changeTimeline, this, inverse ? '+' : '-'));
        makeBtn(layoutInfo.playPosition, (playState ? 'stop' : 'play'), bind(this._handlePlayClick, this, !playState), true);
        function makeBtn(position, iconName, onclick, willRotate) {
            if (!position) {
                return;
            }
            const iconSize = parsePercent(retrieve2(timelineModel.get(['controlStyle', iconName + 'BtnSize']), controlSize), controlSize);
            const rect = [0, -iconSize / 2, iconSize, iconSize];
            const btn = makeControlIcon(timelineModel, iconName + 'Icon', rect, {
                x: position[0],
                y: position[1],
                originX: controlSize / 2,
                originY: 0,
                rotation: willRotate ? -rotation : 0,
                rectHover: true,
                style: itemStyle,
                onclick: onclick
            });
            btn.ensureState('emphasis').style = hoverStyle;
            group.add(btn);
            enableHoverEmphasis(btn);
        }
    }
    _renderCurrentPointer(layoutInfo, group, axis, timelineModel) {
        const data = timelineModel.getData();
        const currentIndex = timelineModel.getCurrentIndex();
        const pointerModel = data.getItemModel(currentIndex)
            .getModel('checkpointStyle');
        const me = this;
        const callback = {
            onCreate(pointer) {
                pointer.draggable = true;
                pointer.drift = bind(me._handlePointerDrag, me);
                pointer.ondragend = bind(me._handlePointerDragend, me);
                pointerMoveTo(pointer, me._progressLine, currentIndex, axis, timelineModel, true);
            },
            onUpdate(pointer) {
                pointerMoveTo(pointer, me._progressLine, currentIndex, axis, timelineModel);
            }
        };
        // Reuse when exists, for animation and drag.
        this._currentPointer = giveSymbol(pointerModel, pointerModel, this._mainGroup, {}, this._currentPointer, callback);
    }
    _handlePlayClick(nextState) {
        this._clearTimer();
        this.api.dispatchAction({
            type: 'timelinePlayChange',
            playState: nextState,
            from: this.uid
        });
    }
    _handlePointerDrag(dx, dy, e) {
        this._clearTimer();
        this._pointerChangeTimeline([e.offsetX, e.offsetY]);
    }
    _handlePointerDragend(e) {
        this._pointerChangeTimeline([e.offsetX, e.offsetY], true);
    }
    _pointerChangeTimeline(mousePos, trigger) {
        let toCoord = this._toAxisCoord(mousePos)[0];
        const axis = this._axis;
        const axisExtent = numberUtil.asc(axis.getExtent().slice());
        toCoord > axisExtent[1] && (toCoord = axisExtent[1]);
        toCoord < axisExtent[0] && (toCoord = axisExtent[0]);
        this._currentPointer.x = toCoord;
        this._currentPointer.markRedraw();
        this._progressLine.shape.x2 = toCoord;
        this._progressLine.dirty();
        const targetDataIndex = this._findNearestTick(toCoord);
        const timelineModel = this.model;
        if (trigger || (targetDataIndex !== timelineModel.getCurrentIndex()
            && timelineModel.get('realtime'))) {
            this._changeTimeline(targetDataIndex);
        }
    }
    _doPlayStop() {
        this._clearTimer();
        if (this.model.getPlayState()) {
            this._timer = setTimeout(() => {
                // Do not cache
                const timelineModel = this.model;
                this._changeTimeline(timelineModel.getCurrentIndex()
                    + (timelineModel.get('rewind', true) ? -1 : 1));
            }, this.model.get('playInterval'));
        }
    }
    _toAxisCoord(vertex) {
        const trans = this._mainGroup.getLocalTransform();
        return graphic.applyTransform(vertex, trans, true);
    }
    _findNearestTick(axisCoord) {
        const data = this.model.getData();
        let dist = Infinity;
        let targetDataIndex;
        const axis = this._axis;
        data.each(['value'], function (value, dataIndex) {
            const coord = axis.dataToCoord(value);
            const d = Math.abs(coord - axisCoord);
            if (d < dist) {
                dist = d;
                targetDataIndex = dataIndex;
            }
        });
        return targetDataIndex;
    }
    _clearTimer() {
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
    }
    _changeTimeline(nextIndex) {
        const currentIndex = this.model.getCurrentIndex();
        if (nextIndex === '+') {
            nextIndex = currentIndex + 1;
        }
        else if (nextIndex === '-') {
            nextIndex = currentIndex - 1;
        }
        this.api.dispatchAction({
            type: 'timelineChange',
            currentIndex: nextIndex,
            from: this.uid
        });
    }
    _updateTicksStatus() {
        const currentIndex = this.model.getCurrentIndex();
        const tickSymbols = this._tickSymbols;
        const tickLabels = this._tickLabels;
        if (tickSymbols) {
            for (let i = 0; i < tickSymbols.length; i++) {
                tickSymbols && tickSymbols[i]
                    && tickSymbols[i].toggleState('progress', i < currentIndex);
            }
        }
        if (tickLabels) {
            for (let i = 0; i < tickLabels.length; i++) {
                tickLabels && tickLabels[i]
                    && tickLabels[i].toggleState('progress', labelDataIndexStore(tickLabels[i]).dataIndex <= currentIndex);
            }
        }
    }
}
SliderTimelineView.type = 'timeline.slider';
function createScaleByModel(model, axisType) {
    axisType = axisType || model.get('type');
    if (axisType) {
        switch (axisType) {
            // Buildin scale
            case 'category':
                return new OrdinalScale({
                    ordinalMeta: model.getCategories(),
                    extent: [Infinity, -Infinity]
                });
            case 'time':
                return new TimeScale({
                    locale: model.ecModel.getLocaleModel(),
                    useUTC: model.ecModel.get('useUTC')
                });
            default:
                // default to be value
                return new IntervalScale();
        }
    }
}
function getViewRect(model, api) {
    return layout.getLayoutRect(model.getBoxLayoutParams(), {
        width: api.getWidth(),
        height: api.getHeight()
    }, model.get('padding'));
}
function makeControlIcon(timelineModel, objPath, rect, opts) {
    const style = opts.style;
    const icon = graphic.createIcon(timelineModel.get(['controlStyle', objPath]), opts || {}, new BoundingRect(rect[0], rect[1], rect[2], rect[3]));
    // TODO createIcon won't use style in opt.
    if (style) {
        icon.setStyle(style);
    }
    return icon;
}
/**
 * Create symbol or update symbol
 * opt: basic position and event handlers
 */
function giveSymbol(hostModel, itemStyleModel, group, opt, symbol, callback) {
    const color = itemStyleModel.get('color');
    if (!symbol) {
        const symbolType = hostModel.get('symbol');
        symbol = createSymbol(symbolType, -1, -1, 2, 2, color);
        symbol.setStyle('strokeNoScale', true);
        group.add(symbol);
        callback && callback.onCreate(symbol);
    }
    else {
        symbol.setColor(color);
        group.add(symbol); // Group may be new, also need to add.
        callback && callback.onUpdate(symbol);
    }
    // Style
    const itemStyle = itemStyleModel.getItemStyle(['color']);
    symbol.setStyle(itemStyle);
    // Transform and events.
    opt = merge({
        rectHover: true,
        z2: 100
    }, opt, true);
    const symbolSize = normalizeSymbolSize(hostModel.get('symbolSize'));
    opt.scaleX = symbolSize[0] / 2;
    opt.scaleY = symbolSize[1] / 2;
    const symbolOffset = normalizeSymbolOffset(hostModel.get('symbolOffset'), symbolSize);
    if (symbolOffset) {
        opt.x = (opt.x || 0) + symbolOffset[0];
        opt.y = (opt.y || 0) + symbolOffset[1];
    }
    const symbolRotate = hostModel.get('symbolRotate');
    opt.rotation = (symbolRotate || 0) * Math.PI / 180 || 0;
    symbol.attr(opt);
    // FIXME
    // (1) When symbol.style.strokeNoScale is true and updateTransform is not performed,
    // getBoundingRect will return wrong result.
    // (This is supposed to be resolved in zrender, but it is a little difficult to
    // leverage performance and auto updateTransform)
    // (2) All of ancesters of symbol do not scale, so we can just updateTransform symbol.
    symbol.updateTransform();
    return symbol;
}
function pointerMoveTo(pointer, progressLine, dataIndex, axis, timelineModel, noAnimation) {
    if (pointer.dragging) {
        return;
    }
    const pointerModel = timelineModel.getModel('checkpointStyle');
    const toCoord = axis.dataToCoord(timelineModel.getData().get('value', dataIndex));
    if (noAnimation || !pointerModel.get('animation', true)) {
        pointer.attr({
            x: toCoord,
            y: 0
        });
        progressLine && progressLine.attr({
            shape: { x2: toCoord }
        });
    }
    else {
        const animationCfg = {
            duration: pointerModel.get('animationDuration', true),
            easing: pointerModel.get('animationEasing', true)
        };
        pointer.stopAnimation(null, true);
        pointer.animateTo({
            x: toCoord,
            y: 0
        }, animationCfg);
        progressLine && progressLine.animateTo({
            shape: { x2: toCoord }
        }, animationCfg);
    }
}
export default SliderTimelineView;
