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
import env from 'zrender/src/core/env';
import TooltipHTMLContent from './TooltipHTMLContent';
import TooltipRichContent from './TooltipRichContent';
import * as formatUtil from '../../util/format';
import * as numberUtil from '../../util/number';
import * as graphic from '../../util/graphic';
import findPointFromSeries from '../axisPointer/findPointFromSeries';
import * as layoutUtil from '../../util/layout';
import Model from '../../model/Model';
import * as globalListener from '../axisPointer/globalListener';
import * as axisHelper from '../../coord/axisHelper';
import * as axisPointerViewHelper from '../axisPointer/viewHelper';
import { getTooltipRenderMode, preParseFinder, queryReferringComponents } from '../../util/model';
import ComponentView from '../../view/Component';
import { format as timeFormat } from '../../util/time';
// import { isDimensionStacked } from '../../data/helper/dataStackHelper';
import { getECData } from '../../util/innerStore';
import { shouldTooltipConfine } from './helper';
import { normalizeTooltipFormatResult } from '../../model/mixin/dataFormat';
import { createTooltipMarkup, buildTooltipMarkup, TooltipMarkupStyleCreator } from './tooltipMarkup';
import { findEventDispatcher } from '../../util/event';
import { throttle } from '../../util/throttle';
const bind = zrUtil.bind;
const each = zrUtil.each;
const parsePercent = numberUtil.parsePercent;
const proxyRect = new graphic.Rect({
    shape: { x: -1, y: -1, width: 2, height: 2 }
});
class TooltipView extends ComponentView {
    constructor() {
        super(...arguments);
        this.type = TooltipView.type;
    }
    init(ecModel, api) {
        if (env.node) {
            return;
        }
        const tooltipModel = ecModel.getComponent('tooltip');
        const renderMode = tooltipModel.get('renderMode');
        this._renderMode = getTooltipRenderMode(renderMode);
        this._tooltipContent = this._renderMode === 'richText'
            ? new TooltipRichContent(api)
            : new TooltipHTMLContent(api.getDom(), api, {
                appendToBody: tooltipModel.get('appendToBody', true)
            });
    }
    render(tooltipModel, ecModel, api) {
        if (env.node) {
            return;
        }
        // Reset
        this.group.removeAll();
        this._tooltipModel = tooltipModel;
        this._ecModel = ecModel;
        this._api = api;
        /**
         * @private
         * @type {boolean}
         */
        this._alwaysShowContent = tooltipModel.get('alwaysShowContent');
        const tooltipContent = this._tooltipContent;
        tooltipContent.update(tooltipModel);
        tooltipContent.setEnterable(tooltipModel.get('enterable'));
        this._initGlobalListener();
        this._keepShow();
        // PENDING
        // `mousemove` event will be triggered very frequently when the mouse moves fast,
        // which causes that the updatePosition was also called very frequently.
        // In Chrome with devtools open and Firefox, tooltip looks lagged and shaked around. See #14695.
        // To avoid the frequent triggering,
        // consider throttling it in 50ms. (the tested result may need to validate)
        this._updatePosition =
            this._renderMode === 'html'
                ? throttle(bind(this._doUpdatePosition, this), 50)
                : this._doUpdatePosition;
    }
    _initGlobalListener() {
        const tooltipModel = this._tooltipModel;
        const triggerOn = tooltipModel.get('triggerOn');
        globalListener.register('itemTooltip', this._api, bind(function (currTrigger, e, dispatchAction) {
            // If 'none', it is not controlled by mouse totally.
            if (triggerOn !== 'none') {
                if (triggerOn.indexOf(currTrigger) >= 0) {
                    this._tryShow(e, dispatchAction);
                }
                else if (currTrigger === 'leave') {
                    this._hide(dispatchAction);
                }
            }
        }, this));
    }
    _keepShow() {
        const tooltipModel = this._tooltipModel;
        const ecModel = this._ecModel;
        const api = this._api;
        // Try to keep the tooltip show when refreshing
        if (this._lastX != null
            && this._lastY != null
            // When user is willing to control tooltip totally using API,
            // self.manuallyShowTip({x, y}) might cause tooltip hide,
            // which is not expected.
            && tooltipModel.get('triggerOn') !== 'none') {
            const self = this;
            clearTimeout(this._refreshUpdateTimeout);
            this._refreshUpdateTimeout = setTimeout(function () {
                // Show tip next tick after other charts are rendered
                // In case highlight action has wrong result
                // FIXME
                !api.isDisposed() && self.manuallyShowTip(tooltipModel, ecModel, api, {
                    x: self._lastX,
                    y: self._lastY,
                    dataByCoordSys: self._lastDataByCoordSys
                });
            });
        }
    }
    /**
     * Show tip manually by
     * dispatchAction({
     *     type: 'showTip',
     *     x: 10,
     *     y: 10
     * });
     * Or
     * dispatchAction({
     *      type: 'showTip',
     *      seriesIndex: 0,
     *      dataIndex or dataIndexInside or name
     * });
     *
     *  TODO Batch
     */
    manuallyShowTip(tooltipModel, ecModel, api, payload) {
        if (payload.from === this.uid || env.node) {
            return;
        }
        const dispatchAction = makeDispatchAction(payload, api);
        // Reset ticket
        this._ticket = '';
        // When triggered from axisPointer.
        const dataByCoordSys = payload.dataByCoordSys;
        const cmptRef = findComponentReference(payload, ecModel, api);
        if (cmptRef) {
            const rect = cmptRef.el.getBoundingRect().clone();
            rect.applyTransform(cmptRef.el.transform);
            this._tryShow({
                offsetX: rect.x + rect.width / 2,
                offsetY: rect.y + rect.height / 2,
                target: cmptRef.el,
                position: payload.position,
                // When manully trigger, the mouse is not on the el, so we'd better to
                // position tooltip on the bottom of the el and display arrow is possible.
                positionDefault: 'bottom'
            }, dispatchAction);
        }
        else if (payload.tooltip && payload.x != null && payload.y != null) {
            const el = proxyRect;
            el.x = payload.x;
            el.y = payload.y;
            el.update();
            getECData(el).tooltipConfig = {
                name: null,
                option: payload.tooltip
            };
            // Manually show tooltip while view is not using zrender elements.
            this._tryShow({
                offsetX: payload.x,
                offsetY: payload.y,
                target: el
            }, dispatchAction);
        }
        else if (dataByCoordSys) {
            this._tryShow({
                offsetX: payload.x,
                offsetY: payload.y,
                position: payload.position,
                dataByCoordSys: dataByCoordSys,
                tooltipOption: payload.tooltipOption
            }, dispatchAction);
        }
        else if (payload.seriesIndex != null) {
            if (this._manuallyAxisShowTip(tooltipModel, ecModel, api, payload)) {
                return;
            }
            const pointInfo = findPointFromSeries(payload, ecModel);
            const cx = pointInfo.point[0];
            const cy = pointInfo.point[1];
            if (cx != null && cy != null) {
                this._tryShow({
                    offsetX: cx,
                    offsetY: cy,
                    target: pointInfo.el,
                    position: payload.position,
                    // When manully trigger, the mouse is not on the el, so we'd better to
                    // position tooltip on the bottom of the el and display arrow is possible.
                    positionDefault: 'bottom'
                }, dispatchAction);
            }
        }
        else if (payload.x != null && payload.y != null) {
            // FIXME
            // should wrap dispatchAction like `axisPointer/globalListener` ?
            api.dispatchAction({
                type: 'updateAxisPointer',
                x: payload.x,
                y: payload.y
            });
            this._tryShow({
                offsetX: payload.x,
                offsetY: payload.y,
                position: payload.position,
                target: api.getZr().findHover(payload.x, payload.y).target
            }, dispatchAction);
        }
    }
    manuallyHideTip(tooltipModel, ecModel, api, payload) {
        const tooltipContent = this._tooltipContent;
        if (!this._alwaysShowContent && this._tooltipModel) {
            tooltipContent.hideLater(this._tooltipModel.get('hideDelay'));
        }
        this._lastX = this._lastY = this._lastDataByCoordSys = null;
        if (payload.from !== this.uid) {
            this._hide(makeDispatchAction(payload, api));
        }
    }
    // Be compatible with previous design, that is, when tooltip.type is 'axis' and
    // dispatchAction 'showTip' with seriesIndex and dataIndex will trigger axis pointer
    // and tooltip.
    _manuallyAxisShowTip(tooltipModel, ecModel, api, payload) {
        const seriesIndex = payload.seriesIndex;
        const dataIndex = payload.dataIndex;
        // @ts-ignore
        const coordSysAxesInfo = ecModel.getComponent('axisPointer').coordSysAxesInfo;
        if (seriesIndex == null || dataIndex == null || coordSysAxesInfo == null) {
            return;
        }
        const seriesModel = ecModel.getSeriesByIndex(seriesIndex);
        if (!seriesModel) {
            return;
        }
        const data = seriesModel.getData();
        const tooltipCascadedModel = buildTooltipModel([
            data.getItemModel(dataIndex),
            seriesModel,
            (seriesModel.coordinateSystem || {}).model
        ], this._tooltipModel);
        if (tooltipCascadedModel.get('trigger') !== 'axis') {
            return;
        }
        api.dispatchAction({
            type: 'updateAxisPointer',
            seriesIndex: seriesIndex,
            dataIndex: dataIndex,
            position: payload.position
        });
        return true;
    }
    _tryShow(e, dispatchAction) {
        const el = e.target;
        const tooltipModel = this._tooltipModel;
        if (!tooltipModel) {
            return;
        }
        // Save mouse x, mouse y. So we can try to keep showing the tip if chart is refreshed
        this._lastX = e.offsetX;
        this._lastY = e.offsetY;
        const dataByCoordSys = e.dataByCoordSys;
        if (dataByCoordSys && dataByCoordSys.length) {
            this._showAxisTooltip(dataByCoordSys, e);
        }
        else if (el) {
            this._lastDataByCoordSys = null;
            let seriesDispatcher;
            let cmptDispatcher;
            findEventDispatcher(el, (target) => {
                // Always show item tooltip if mouse is on the element with dataIndex
                if (getECData(target).dataIndex != null) {
                    seriesDispatcher = target;
                    return true;
                }
                // Tooltip provided directly. Like legend.
                if (getECData(target).tooltipConfig != null) {
                    cmptDispatcher = target;
                    return true;
                }
            }, true);
            if (seriesDispatcher) {
                this._showSeriesItemTooltip(e, seriesDispatcher, dispatchAction);
            }
            else if (cmptDispatcher) {
                this._showComponentItemTooltip(e, cmptDispatcher, dispatchAction);
            }
            else {
                this._hide(dispatchAction);
            }
        }
        else {
            this._lastDataByCoordSys = null;
            this._hide(dispatchAction);
        }
    }
    _showOrMove(tooltipModel, cb) {
        // showDelay is used in this case: tooltip.enterable is set
        // as true. User intent to move mouse into tooltip and click
        // something. `showDelay` makes it easier to enter the content
        // but tooltip do not move immediately.
        const delay = tooltipModel.get('showDelay');
        cb = zrUtil.bind(cb, this);
        clearTimeout(this._showTimout);
        delay > 0
            ? (this._showTimout = setTimeout(cb, delay))
            : cb();
    }
    _showAxisTooltip(dataByCoordSys, e) {
        const ecModel = this._ecModel;
        const globalTooltipModel = this._tooltipModel;
        const point = [e.offsetX, e.offsetY];
        const singleTooltipModel = buildTooltipModel([e.tooltipOption], globalTooltipModel);
        const renderMode = this._renderMode;
        const cbParamsList = [];
        const articleMarkup = createTooltipMarkup('section', {
            blocks: [],
            noHeader: true
        });
        // Only for legacy: `Serise['formatTooltip']` returns a string.
        const markupTextArrLegacy = [];
        const markupStyleCreator = new TooltipMarkupStyleCreator();
        each(dataByCoordSys, function (itemCoordSys) {
            each(itemCoordSys.dataByAxis, function (axisItem) {
                const axisModel = ecModel.getComponent(axisItem.axisDim + 'Axis', axisItem.axisIndex);
                const axisValue = axisItem.value;
                if (!axisModel || axisValue == null) {
                    return;
                }
                const axisValueLabel = axisPointerViewHelper.getValueLabel(axisValue, axisModel.axis, ecModel, axisItem.seriesDataIndices, axisItem.valueLabelOpt);
                const axisSectionMarkup = createTooltipMarkup('section', {
                    header: axisValueLabel,
                    noHeader: !zrUtil.trim(axisValueLabel),
                    sortBlocks: true,
                    blocks: []
                });
                articleMarkup.blocks.push(axisSectionMarkup);
                zrUtil.each(axisItem.seriesDataIndices, function (idxItem) {
                    const series = ecModel.getSeriesByIndex(idxItem.seriesIndex);
                    const dataIndex = idxItem.dataIndexInside;
                    const cbParams = series.getDataParams(dataIndex);
                    // Can't find data.
                    if (cbParams.dataIndex < 0) {
                        return;
                    }
                    cbParams.axisDim = axisItem.axisDim;
                    cbParams.axisIndex = axisItem.axisIndex;
                    cbParams.axisType = axisItem.axisType;
                    cbParams.axisId = axisItem.axisId;
                    cbParams.axisValue = axisHelper.getAxisRawValue(axisModel.axis, { value: axisValue });
                    cbParams.axisValueLabel = axisValueLabel;
                    // Pre-create marker style for makers. Users can assemble richText
                    // text in `formatter` callback and use those markers style.
                    cbParams.marker = markupStyleCreator.makeTooltipMarker('item', formatUtil.convertToColorString(cbParams.color), renderMode);
                    const seriesTooltipResult = normalizeTooltipFormatResult(series.formatTooltip(dataIndex, true, null));
                    if (seriesTooltipResult.markupFragment) {
                        axisSectionMarkup.blocks.push(seriesTooltipResult.markupFragment);
                    }
                    if (seriesTooltipResult.markupText) {
                        markupTextArrLegacy.push(seriesTooltipResult.markupText);
                    }
                    cbParamsList.push(cbParams);
                });
            });
        });
        // In most cases, the second axis is displays upper on the first one.
        // So we reverse it to look better.
        articleMarkup.blocks.reverse();
        markupTextArrLegacy.reverse();
        const positionExpr = e.position;
        const orderMode = singleTooltipModel.get('order');
        const builtMarkupText = buildTooltipMarkup(articleMarkup, markupStyleCreator, renderMode, orderMode, ecModel.get('useUTC'), singleTooltipModel.get('textStyle'));
        builtMarkupText && markupTextArrLegacy.unshift(builtMarkupText);
        const blockBreak = renderMode === 'richText' ? '\n\n' : '<br/>';
        const allMarkupText = markupTextArrLegacy.join(blockBreak);
        this._showOrMove(singleTooltipModel, function () {
            if (this._updateContentNotChangedOnAxis(dataByCoordSys, cbParamsList)) {
                this._updatePosition(singleTooltipModel, positionExpr, point[0], point[1], this._tooltipContent, cbParamsList);
            }
            else {
                this._showTooltipContent(singleTooltipModel, allMarkupText, cbParamsList, Math.random() + '', point[0], point[1], positionExpr, null, markupStyleCreator);
            }
        });
        // Do not trigger events here, because this branch only be entered
        // from dispatchAction.
    }
    _showSeriesItemTooltip(e, dispatcher, dispatchAction) {
        const ecModel = this._ecModel;
        const ecData = getECData(dispatcher);
        // Use dataModel in element if possible
        // Used when mouseover on a element like markPoint or edge
        // In which case, the data is not main data in series.
        const seriesIndex = ecData.seriesIndex;
        const seriesModel = ecModel.getSeriesByIndex(seriesIndex);
        // For example, graph link.
        const dataModel = ecData.dataModel || seriesModel;
        const dataIndex = ecData.dataIndex;
        const dataType = ecData.dataType;
        const data = dataModel.getData(dataType);
        const renderMode = this._renderMode;
        const positionDefault = e.positionDefault;
        const tooltipModel = buildTooltipModel([
            data.getItemModel(dataIndex),
            dataModel,
            seriesModel && (seriesModel.coordinateSystem || {}).model
        ], this._tooltipModel, positionDefault ? { position: positionDefault } : null);
        const tooltipTrigger = tooltipModel.get('trigger');
        if (tooltipTrigger != null && tooltipTrigger !== 'item') {
            return;
        }
        const params = dataModel.getDataParams(dataIndex, dataType);
        const markupStyleCreator = new TooltipMarkupStyleCreator();
        // Pre-create marker style for makers. Users can assemble richText
        // text in `formatter` callback and use those markers style.
        params.marker = markupStyleCreator.makeTooltipMarker('item', formatUtil.convertToColorString(params.color), renderMode);
        const seriesTooltipResult = normalizeTooltipFormatResult(dataModel.formatTooltip(dataIndex, false, dataType));
        const orderMode = tooltipModel.get('order');
        const markupText = seriesTooltipResult.markupFragment
            ? buildTooltipMarkup(seriesTooltipResult.markupFragment, markupStyleCreator, renderMode, orderMode, ecModel.get('useUTC'), tooltipModel.get('textStyle'))
            : seriesTooltipResult.markupText;
        const asyncTicket = 'item_' + dataModel.name + '_' + dataIndex;
        this._showOrMove(tooltipModel, function () {
            this._showTooltipContent(tooltipModel, markupText, params, asyncTicket, e.offsetX, e.offsetY, e.position, e.target, markupStyleCreator);
        });
        // FIXME
        // duplicated showtip if manuallyShowTip is called from dispatchAction.
        dispatchAction({
            type: 'showTip',
            dataIndexInside: dataIndex,
            dataIndex: data.getRawIndex(dataIndex),
            seriesIndex: seriesIndex,
            from: this.uid
        });
    }
    _showComponentItemTooltip(e, el, dispatchAction) {
        const ecData = getECData(el);
        const tooltipConfig = ecData.tooltipConfig;
        let tooltipOpt = tooltipConfig.option || {};
        if (zrUtil.isString(tooltipOpt)) {
            const content = tooltipOpt;
            tooltipOpt = {
                content: content,
                // Fixed formatter
                formatter: content
            };
        }
        const tooltipModelCascade = [tooltipOpt];
        const cmpt = this._ecModel.getComponent(ecData.componentMainType, ecData.componentIndex);
        if (cmpt) {
            tooltipModelCascade.push(cmpt);
        }
        // In most cases, component tooltip formatter has different params with series tooltip formatter,
        // so that they can not share the same formatter. Since the global tooltip formatter is used for series
        // by convension, we do not use it as the default formatter for component.
        tooltipModelCascade.push({ formatter: tooltipOpt.content });
        const positionDefault = e.positionDefault;
        const subTooltipModel = buildTooltipModel(tooltipModelCascade, this._tooltipModel, positionDefault ? { position: positionDefault } : null);
        const defaultHtml = subTooltipModel.get('content');
        const asyncTicket = Math.random() + '';
        // PENDING: this case do not support richText style yet.
        const markupStyleCreator = new TooltipMarkupStyleCreator();
        // Do not check whether `trigger` is 'none' here, because `trigger`
        // only works on coordinate system. In fact, we have not found case
        // that requires setting `trigger` nothing on component yet.
        this._showOrMove(subTooltipModel, function () {
            // Use formatterParams from element defined in component
            // Avoid users modify it.
            const formatterParams = zrUtil.clone(subTooltipModel.get('formatterParams') || {});
            this._showTooltipContent(subTooltipModel, defaultHtml, formatterParams, asyncTicket, e.offsetX, e.offsetY, e.position, el, markupStyleCreator);
        });
        // If not dispatch showTip, tip may be hide triggered by axis.
        dispatchAction({
            type: 'showTip',
            from: this.uid
        });
    }
    _showTooltipContent(
    // Use Model<TooltipOption> insteadof TooltipModel because this model may be from series or other options.
    // Instead of top level tooltip.
    tooltipModel, defaultHtml, params, asyncTicket, x, y, positionExpr, el, markupStyleCreator) {
        // Reset ticket
        this._ticket = '';
        if (!tooltipModel.get('showContent') || !tooltipModel.get('show')) {
            return;
        }
        const tooltipContent = this._tooltipContent;
        const formatter = tooltipModel.get('formatter');
        positionExpr = positionExpr || tooltipModel.get('position');
        let html = defaultHtml;
        const nearPoint = this._getNearestPoint([x, y], params, tooltipModel.get('trigger'), tooltipModel.get('borderColor'));
        const nearPointColor = nearPoint.color;
        if (formatter) {
            if (zrUtil.isString(formatter)) {
                const useUTC = tooltipModel.ecModel.get('useUTC');
                const params0 = zrUtil.isArray(params) ? params[0] : params;
                const isTimeAxis = params0 && params0.axisType && params0.axisType.indexOf('time') >= 0;
                html = formatter;
                if (isTimeAxis) {
                    html = timeFormat(params0.axisValue, html, useUTC);
                }
                html = formatUtil.formatTpl(html, params, true);
            }
            else if (zrUtil.isFunction(formatter)) {
                const callback = bind(function (cbTicket, html) {
                    if (cbTicket === this._ticket) {
                        tooltipContent.setContent(html, markupStyleCreator, tooltipModel, nearPointColor, positionExpr);
                        this._updatePosition(tooltipModel, positionExpr, x, y, tooltipContent, params, el);
                    }
                }, this);
                this._ticket = asyncTicket;
                html = formatter(params, asyncTicket, callback);
            }
            else {
                html = formatter;
            }
        }
        tooltipContent.setContent(html, markupStyleCreator, tooltipModel, nearPointColor, positionExpr);
        tooltipContent.show(tooltipModel, nearPointColor);
        this._updatePosition(tooltipModel, positionExpr, x, y, tooltipContent, params, el);
    }
    _getNearestPoint(point, tooltipDataParams, trigger, borderColor) {
        if (trigger === 'axis' || zrUtil.isArray(tooltipDataParams)) {
            return {
                color: borderColor || (this._renderMode === 'html' ? '#fff' : 'none')
            };
        }
        if (!zrUtil.isArray(tooltipDataParams)) {
            return {
                color: borderColor || tooltipDataParams.color || tooltipDataParams.borderColor
            };
        }
    }
    _doUpdatePosition(tooltipModel, positionExpr, x, // Mouse x
    y, // Mouse y
    content, params, el) {
        const viewWidth = this._api.getWidth();
        const viewHeight = this._api.getHeight();
        positionExpr = positionExpr || tooltipModel.get('position');
        const contentSize = content.getSize();
        let align = tooltipModel.get('align');
        let vAlign = tooltipModel.get('verticalAlign');
        const rect = el && el.getBoundingRect().clone();
        el && rect.applyTransform(el.transform);
        if (zrUtil.isFunction(positionExpr)) {
            // Callback of position can be an array or a string specify the position
            positionExpr = positionExpr([x, y], params, content.el, rect, {
                viewSize: [viewWidth, viewHeight],
                contentSize: contentSize.slice()
            });
        }
        if (zrUtil.isArray(positionExpr)) {
            x = parsePercent(positionExpr[0], viewWidth);
            y = parsePercent(positionExpr[1], viewHeight);
        }
        else if (zrUtil.isObject(positionExpr)) {
            const boxLayoutPosition = positionExpr;
            boxLayoutPosition.width = contentSize[0];
            boxLayoutPosition.height = contentSize[1];
            const layoutRect = layoutUtil.getLayoutRect(boxLayoutPosition, { width: viewWidth, height: viewHeight });
            x = layoutRect.x;
            y = layoutRect.y;
            align = null;
            // When positionExpr is left/top/right/bottom,
            // align and verticalAlign will not work.
            vAlign = null;
        }
        // Specify tooltip position by string 'top' 'bottom' 'left' 'right' around graphic element
        else if (zrUtil.isString(positionExpr) && el) {
            const pos = calcTooltipPosition(positionExpr, rect, contentSize, tooltipModel.get('borderWidth'));
            x = pos[0];
            y = pos[1];
        }
        else {
            const pos = refixTooltipPosition(x, y, content, viewWidth, viewHeight, align ? null : 20, vAlign ? null : 20);
            x = pos[0];
            y = pos[1];
        }
        align && (x -= isCenterAlign(align) ? contentSize[0] / 2 : align === 'right' ? contentSize[0] : 0);
        vAlign && (y -= isCenterAlign(vAlign) ? contentSize[1] / 2 : vAlign === 'bottom' ? contentSize[1] : 0);
        if (shouldTooltipConfine(tooltipModel)) {
            const pos = confineTooltipPosition(x, y, content, viewWidth, viewHeight);
            x = pos[0];
            y = pos[1];
        }
        content.moveTo(x, y);
    }
    // FIXME
    // Should we remove this but leave this to user?
    _updateContentNotChangedOnAxis(dataByCoordSys, cbParamsList) {
        const lastCoordSys = this._lastDataByCoordSys;
        const lastCbParamsList = this._cbParamsList;
        let contentNotChanged = !!lastCoordSys
            && lastCoordSys.length === dataByCoordSys.length;
        contentNotChanged && each(lastCoordSys, (lastItemCoordSys, indexCoordSys) => {
            const lastDataByAxis = lastItemCoordSys.dataByAxis || [];
            const thisItemCoordSys = dataByCoordSys[indexCoordSys] || {};
            const thisDataByAxis = thisItemCoordSys.dataByAxis || [];
            contentNotChanged = contentNotChanged && lastDataByAxis.length === thisDataByAxis.length;
            contentNotChanged && each(lastDataByAxis, (lastItem, indexAxis) => {
                const thisItem = thisDataByAxis[indexAxis] || {};
                const lastIndices = lastItem.seriesDataIndices || [];
                const newIndices = thisItem.seriesDataIndices || [];
                contentNotChanged = contentNotChanged
                    && lastItem.value === thisItem.value
                    && lastItem.axisType === thisItem.axisType
                    && lastItem.axisId === thisItem.axisId
                    && lastIndices.length === newIndices.length;
                contentNotChanged && each(lastIndices, (lastIdxItem, j) => {
                    const newIdxItem = newIndices[j];
                    contentNotChanged = contentNotChanged
                        && lastIdxItem.seriesIndex === newIdxItem.seriesIndex
                        && lastIdxItem.dataIndex === newIdxItem.dataIndex;
                });
                // check is cbParams data value changed
                lastCbParamsList && zrUtil.each(lastItem.seriesDataIndices, (idxItem) => {
                    const seriesIdx = idxItem.seriesIndex;
                    const cbParams = cbParamsList[seriesIdx];
                    const lastCbParams = lastCbParamsList[seriesIdx];
                    if (cbParams && lastCbParams && lastCbParams.data !== cbParams.data) {
                        contentNotChanged = false;
                    }
                });
            });
        });
        this._lastDataByCoordSys = dataByCoordSys;
        this._cbParamsList = cbParamsList;
        return !!contentNotChanged;
    }
    _hide(dispatchAction) {
        // Do not directly hideLater here, because this behavior may be prevented
        // in dispatchAction when showTip is dispatched.
        // FIXME
        // duplicated hideTip if manuallyHideTip is called from dispatchAction.
        this._lastDataByCoordSys = null;
        dispatchAction({
            type: 'hideTip',
            from: this.uid
        });
    }
    dispose(ecModel, api) {
        if (env.node) {
            return;
        }
        this._tooltipContent.dispose();
        globalListener.unregister('itemTooltip', api);
    }
}
TooltipView.type = 'tooltip';
/**
 * From top to bottom. (the last one should be globalTooltipModel);
 */
function buildTooltipModel(modelCascade, globalTooltipModel, defaultTooltipOption) {
    // Last is always tooltip model.
    const ecModel = globalTooltipModel.ecModel;
    let resultModel;
    if (defaultTooltipOption) {
        resultModel = new Model(defaultTooltipOption, ecModel, ecModel);
        resultModel = new Model(globalTooltipModel.option, resultModel, ecModel);
    }
    else {
        resultModel = globalTooltipModel;
    }
    for (let i = modelCascade.length - 1; i >= 0; i--) {
        let tooltipOpt = modelCascade[i];
        if (tooltipOpt) {
            if (tooltipOpt instanceof Model) {
                tooltipOpt = tooltipOpt.get('tooltip', true);
            }
            // In each data item tooltip can be simply write:
            // {
            //  value: 10,
            //  tooltip: 'Something you need to know'
            // }
            if (zrUtil.isString(tooltipOpt)) {
                tooltipOpt = {
                    formatter: tooltipOpt
                };
            }
            if (tooltipOpt) {
                resultModel = new Model(tooltipOpt, resultModel, ecModel);
            }
        }
    }
    return resultModel;
}
function makeDispatchAction(payload, api) {
    return payload.dispatchAction || zrUtil.bind(api.dispatchAction, api);
}
function refixTooltipPosition(x, y, content, viewWidth, viewHeight, gapH, gapV) {
    const size = content.getSize();
    const width = size[0];
    const height = size[1];
    if (gapH != null) {
        // Add extra 2 pixels for this case:
        // At present the "values" in defaut tooltip are using CSS `float: right`.
        // When the right edge of the tooltip box is on the right side of the
        // viewport, the `float` layout might push the "values" to the second line.
        if (x + width + gapH + 2 > viewWidth) {
            x -= width + gapH;
        }
        else {
            x += gapH;
        }
    }
    if (gapV != null) {
        if (y + height + gapV > viewHeight) {
            y -= height + gapV;
        }
        else {
            y += gapV;
        }
    }
    return [x, y];
}
function confineTooltipPosition(x, y, content, viewWidth, viewHeight) {
    const size = content.getSize();
    const width = size[0];
    const height = size[1];
    x = Math.min(x + width, viewWidth) - width;
    y = Math.min(y + height, viewHeight) - height;
    x = Math.max(x, 0);
    y = Math.max(y, 0);
    return [x, y];
}
function calcTooltipPosition(position, rect, contentSize, borderWidth) {
    const domWidth = contentSize[0];
    const domHeight = contentSize[1];
    const offset = Math.ceil(Math.SQRT2 * borderWidth) + 8;
    let x = 0;
    let y = 0;
    const rectWidth = rect.width;
    const rectHeight = rect.height;
    switch (position) {
        case 'inside':
            x = rect.x + rectWidth / 2 - domWidth / 2;
            y = rect.y + rectHeight / 2 - domHeight / 2;
            break;
        case 'top':
            x = rect.x + rectWidth / 2 - domWidth / 2;
            y = rect.y - domHeight - offset;
            break;
        case 'bottom':
            x = rect.x + rectWidth / 2 - domWidth / 2;
            y = rect.y + rectHeight + offset;
            break;
        case 'left':
            x = rect.x - domWidth - offset;
            y = rect.y + rectHeight / 2 - domHeight / 2;
            break;
        case 'right':
            x = rect.x + rectWidth + offset;
            y = rect.y + rectHeight / 2 - domHeight / 2;
    }
    return [x, y];
}
function isCenterAlign(align) {
    return align === 'center' || align === 'middle';
}
/**
 * Find target component by payload like:
 * ```js
 * { legendId: 'some_id', name: 'xxx' }
 * { toolboxIndex: 1, name: 'xxx' }
 * { geoName: 'some_name', name: 'xxx' }
 * ```
 * PENDING: at present only
 *
 * If not found, return null/undefined.
 */
function findComponentReference(payload, ecModel, api) {
    const { queryOptionMap } = preParseFinder(payload);
    const componentMainType = queryOptionMap.keys()[0];
    if (!componentMainType || componentMainType === 'series') {
        return;
    }
    const queryResult = queryReferringComponents(ecModel, componentMainType, queryOptionMap.get(componentMainType), { useDefault: false, enableAll: false, enableNone: false });
    const model = queryResult.models[0];
    if (!model) {
        return;
    }
    const view = api.getViewOfComponentModel(model);
    let el;
    view.group.traverse((subEl) => {
        const tooltipConfig = getECData(subEl).tooltipConfig;
        if (tooltipConfig && tooltipConfig.name === payload.name) {
            el = subEl;
            return true; // stop
        }
    });
    if (el) {
        return {
            componentMainType,
            componentIndex: model.componentIndex,
            el
        };
    }
}
export default TooltipView;
