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
import { isArray, each } from 'zrender/src/core/util';
import * as vector from 'zrender/src/core/vector';
import * as symbolUtil from '../../util/symbol';
import ECLinePath from './LinePath';
import * as graphic from '../../util/graphic';
import { enableHoverEmphasis, enterEmphasis, leaveEmphasis, SPECIAL_STATES } from '../../util/states';
import { getLabelStatesModels, setLabelStyle } from '../../label/labelStyle';
import { round } from '../../util/number';
const SYMBOL_CATEGORIES = ['fromSymbol', 'toSymbol'];
function makeSymbolTypeKey(symbolCategory) {
    return '_' + symbolCategory + 'Type';
}
/**
 * @inner
 */
function createSymbol(name, lineData, idx) {
    const symbolType = lineData.getItemVisual(idx, name);
    if (!symbolType || symbolType === 'none') {
        return;
    }
    const symbolSize = lineData.getItemVisual(idx, name + 'Size');
    const symbolRotate = lineData.getItemVisual(idx, name + 'Rotate');
    const symbolOffset = lineData.getItemVisual(idx, name + 'Offset');
    const symbolKeepAspect = lineData.getItemVisual(idx, name + 'KeepAspect');
    const symbolSizeArr = symbolUtil.normalizeSymbolSize(symbolSize);
    const symbolOffsetArr = symbolUtil.normalizeSymbolOffset(symbolOffset || 0, symbolSizeArr);
    const symbolPath = symbolUtil.createSymbol(symbolType, -symbolSizeArr[0] / 2 + symbolOffsetArr[0], -symbolSizeArr[1] / 2 + symbolOffsetArr[1], symbolSizeArr[0], symbolSizeArr[1], null, symbolKeepAspect);
    symbolPath.__specifiedRotation = symbolRotate == null || isNaN(symbolRotate)
        ? void 0
        : +symbolRotate * Math.PI / 180 || 0;
    symbolPath.name = name;
    return symbolPath;
}
function createLine(points) {
    const line = new ECLinePath({
        name: 'line',
        subPixelOptimize: true
    });
    setLinePoints(line.shape, points);
    return line;
}
function setLinePoints(targetShape, points) {
    targetShape.x1 = points[0][0];
    targetShape.y1 = points[0][1];
    targetShape.x2 = points[1][0];
    targetShape.y2 = points[1][1];
    targetShape.percent = 1;
    const cp1 = points[2];
    if (cp1) {
        targetShape.cpx1 = cp1[0];
        targetShape.cpy1 = cp1[1];
    }
    else {
        targetShape.cpx1 = NaN;
        targetShape.cpy1 = NaN;
    }
}
class Line extends graphic.Group {
    constructor(lineData, idx, seriesScope) {
        super();
        this._createLine(lineData, idx, seriesScope);
    }
    _createLine(lineData, idx, seriesScope) {
        const seriesModel = lineData.hostModel;
        const linePoints = lineData.getItemLayout(idx);
        const line = createLine(linePoints);
        line.shape.percent = 0;
        graphic.initProps(line, {
            shape: {
                percent: 1
            }
        }, seriesModel, idx);
        this.add(line);
        each(SYMBOL_CATEGORIES, function (symbolCategory) {
            const symbol = createSymbol(symbolCategory, lineData, idx);
            // symbols must added after line to make sure
            // it will be updated after line#update.
            // Or symbol position and rotation update in line#beforeUpdate will be one frame slow
            this.add(symbol);
            this[makeSymbolTypeKey(symbolCategory)] = lineData.getItemVisual(idx, symbolCategory);
        }, this);
        this._updateCommonStl(lineData, idx, seriesScope);
    }
    // TODO More strict on the List type in parameters?
    updateData(lineData, idx, seriesScope) {
        const seriesModel = lineData.hostModel;
        const line = this.childOfName('line');
        const linePoints = lineData.getItemLayout(idx);
        const target = {
            shape: {}
        };
        setLinePoints(target.shape, linePoints);
        graphic.updateProps(line, target, seriesModel, idx);
        each(SYMBOL_CATEGORIES, function (symbolCategory) {
            const symbolType = lineData.getItemVisual(idx, symbolCategory);
            const key = makeSymbolTypeKey(symbolCategory);
            // Symbol changed
            if (this[key] !== symbolType) {
                this.remove(this.childOfName(symbolCategory));
                const symbol = createSymbol(symbolCategory, lineData, idx);
                this.add(symbol);
            }
            this[key] = symbolType;
        }, this);
        this._updateCommonStl(lineData, idx, seriesScope);
    }
    ;
    getLinePath() {
        return this.childAt(0);
    }
    _updateCommonStl(lineData, idx, seriesScope) {
        const seriesModel = lineData.hostModel;
        const line = this.childOfName('line');
        let emphasisLineStyle = seriesScope && seriesScope.emphasisLineStyle;
        let blurLineStyle = seriesScope && seriesScope.blurLineStyle;
        let selectLineStyle = seriesScope && seriesScope.selectLineStyle;
        let labelStatesModels = seriesScope && seriesScope.labelStatesModels;
        // Optimization for large dataset
        if (!seriesScope || lineData.hasItemOption) {
            const itemModel = lineData.getItemModel(idx);
            emphasisLineStyle = itemModel.getModel(['emphasis', 'lineStyle']).getLineStyle();
            blurLineStyle = itemModel.getModel(['blur', 'lineStyle']).getLineStyle();
            selectLineStyle = itemModel.getModel(['select', 'lineStyle']).getLineStyle();
            labelStatesModels = getLabelStatesModels(itemModel);
        }
        const lineStyle = lineData.getItemVisual(idx, 'style');
        const visualColor = lineStyle.stroke;
        line.useStyle(lineStyle);
        line.style.fill = null;
        line.style.strokeNoScale = true;
        line.ensureState('emphasis').style = emphasisLineStyle;
        line.ensureState('blur').style = blurLineStyle;
        line.ensureState('select').style = selectLineStyle;
        // Update symbol
        each(SYMBOL_CATEGORIES, function (symbolCategory) {
            const symbol = this.childOfName(symbolCategory);
            if (symbol) {
                // Share opacity and color with line.
                symbol.setColor(visualColor);
                symbol.style.opacity = lineStyle.opacity;
                for (let i = 0; i < SPECIAL_STATES.length; i++) {
                    const stateName = SPECIAL_STATES[i];
                    const lineState = line.getState(stateName);
                    if (lineState) {
                        const lineStateStyle = lineState.style || {};
                        const state = symbol.ensureState(stateName);
                        const stateStyle = state.style || (state.style = {});
                        if (lineStateStyle.stroke != null) {
                            stateStyle[symbol.__isEmptyBrush ? 'stroke' : 'fill'] = lineStateStyle.stroke;
                        }
                        if (lineStateStyle.opacity != null) {
                            stateStyle.opacity = lineStateStyle.opacity;
                        }
                    }
                }
                symbol.markRedraw();
            }
        }, this);
        const rawVal = seriesModel.getRawValue(idx);
        setLabelStyle(this, labelStatesModels, {
            labelDataIndex: idx,
            labelFetcher: {
                getFormattedLabel(dataIndex, stateName) {
                    return seriesModel.getFormattedLabel(dataIndex, stateName, lineData.dataType);
                }
            },
            inheritColor: visualColor || '#000',
            defaultOpacity: lineStyle.opacity,
            defaultText: (rawVal == null
                ? lineData.getName(idx)
                : isFinite(rawVal)
                    ? round(rawVal)
                    : rawVal) + ''
        });
        const label = this.getTextContent();
        // Always set `textStyle` even if `normalStyle.text` is null, because default
        // values have to be set on `normalStyle`.
        if (label) {
            const labelNormalModel = labelStatesModels.normal;
            label.__align = label.style.align;
            label.__verticalAlign = label.style.verticalAlign;
            // 'start', 'middle', 'end'
            label.__position = labelNormalModel.get('position') || 'middle';
            let distance = labelNormalModel.get('distance');
            if (!isArray(distance)) {
                distance = [distance, distance];
            }
            label.__labelDistance = distance;
        }
        this.setTextConfig({
            position: null,
            local: true,
            inside: false // Can't be inside for stroke element.
        });
        enableHoverEmphasis(this);
    }
    highlight() {
        enterEmphasis(this);
    }
    downplay() {
        leaveEmphasis(this);
    }
    updateLayout(lineData, idx) {
        this.setLinePoints(lineData.getItemLayout(idx));
    }
    setLinePoints(points) {
        const linePath = this.childOfName('line');
        setLinePoints(linePath.shape, points);
        linePath.dirty();
    }
    beforeUpdate() {
        const lineGroup = this;
        const symbolFrom = lineGroup.childOfName('fromSymbol');
        const symbolTo = lineGroup.childOfName('toSymbol');
        const label = lineGroup.getTextContent();
        // Quick reject
        if (!symbolFrom && !symbolTo && (!label || label.ignore)) {
            return;
        }
        let invScale = 1;
        let parentNode = this.parent;
        while (parentNode) {
            if (parentNode.scaleX) {
                invScale /= parentNode.scaleX;
            }
            parentNode = parentNode.parent;
        }
        const line = lineGroup.childOfName('line');
        // If line not changed
        // FIXME Parent scale changed
        if (!this.__dirty && !line.__dirty) {
            return;
        }
        const percent = line.shape.percent;
        const fromPos = line.pointAt(0);
        const toPos = line.pointAt(percent);
        const d = vector.sub([], toPos, fromPos);
        vector.normalize(d, d);
        function setSymbolRotation(symbol, percent) {
            // Fix #12388
            // when symbol is set to be 'arrow' in markLine,
            // symbolRotate value will be ignored, and compulsively use tangent angle.
            // rotate by default if symbol rotation is not specified
            const specifiedRotation = symbol.__specifiedRotation;
            if (specifiedRotation == null) {
                const tangent = line.tangentAt(percent);
                symbol.attr('rotation', (percent === 1 ? -1 : 1) * Math.PI / 2 - Math.atan2(tangent[1], tangent[0]));
            }
            else {
                symbol.attr('rotation', specifiedRotation);
            }
        }
        if (symbolFrom) {
            symbolFrom.setPosition(fromPos);
            setSymbolRotation(symbolFrom, 0);
            symbolFrom.scaleX = symbolFrom.scaleY = invScale * percent;
            symbolFrom.markRedraw();
        }
        if (symbolTo) {
            symbolTo.setPosition(toPos);
            setSymbolRotation(symbolTo, 1);
            symbolTo.scaleX = symbolTo.scaleY = invScale * percent;
            symbolTo.markRedraw();
        }
        if (label && !label.ignore) {
            label.x = label.y = 0;
            label.originX = label.originY = 0;
            let textAlign;
            let textVerticalAlign;
            const distance = label.__labelDistance;
            const distanceX = distance[0] * invScale;
            const distanceY = distance[1] * invScale;
            const halfPercent = percent / 2;
            const tangent = line.tangentAt(halfPercent);
            const n = [tangent[1], -tangent[0]];
            const cp = line.pointAt(halfPercent);
            if (n[1] > 0) {
                n[0] = -n[0];
                n[1] = -n[1];
            }
            const dir = tangent[0] < 0 ? -1 : 1;
            if (label.__position !== 'start' && label.__position !== 'end') {
                let rotation = -Math.atan2(tangent[1], tangent[0]);
                if (toPos[0] < fromPos[0]) {
                    rotation = Math.PI + rotation;
                }
                label.rotation = rotation;
            }
            let dy;
            switch (label.__position) {
                case 'insideStartTop':
                case 'insideMiddleTop':
                case 'insideEndTop':
                case 'middle':
                    dy = -distanceY;
                    textVerticalAlign = 'bottom';
                    break;
                case 'insideStartBottom':
                case 'insideMiddleBottom':
                case 'insideEndBottom':
                    dy = distanceY;
                    textVerticalAlign = 'top';
                    break;
                default:
                    dy = 0;
                    textVerticalAlign = 'middle';
            }
            switch (label.__position) {
                case 'end':
                    label.x = d[0] * distanceX + toPos[0];
                    label.y = d[1] * distanceY + toPos[1];
                    textAlign = d[0] > 0.8 ? 'left' : (d[0] < -0.8 ? 'right' : 'center');
                    textVerticalAlign = d[1] > 0.8 ? 'top' : (d[1] < -0.8 ? 'bottom' : 'middle');
                    break;
                case 'start':
                    label.x = -d[0] * distanceX + fromPos[0];
                    label.y = -d[1] * distanceY + fromPos[1];
                    textAlign = d[0] > 0.8 ? 'right' : (d[0] < -0.8 ? 'left' : 'center');
                    textVerticalAlign = d[1] > 0.8 ? 'bottom' : (d[1] < -0.8 ? 'top' : 'middle');
                    break;
                case 'insideStartTop':
                case 'insideStart':
                case 'insideStartBottom':
                    label.x = distanceX * dir + fromPos[0];
                    label.y = fromPos[1] + dy;
                    textAlign = tangent[0] < 0 ? 'right' : 'left';
                    label.originX = -distanceX * dir;
                    label.originY = -dy;
                    break;
                case 'insideMiddleTop':
                case 'insideMiddle':
                case 'insideMiddleBottom':
                case 'middle':
                    label.x = cp[0];
                    label.y = cp[1] + dy;
                    textAlign = 'center';
                    label.originY = -dy;
                    break;
                case 'insideEndTop':
                case 'insideEnd':
                case 'insideEndBottom':
                    label.x = -distanceX * dir + toPos[0];
                    label.y = toPos[1] + dy;
                    textAlign = tangent[0] >= 0 ? 'right' : 'left';
                    label.originX = distanceX * dir;
                    label.originY = -dy;
                    break;
            }
            label.scaleX = label.scaleY = invScale;
            label.setStyle({
                // Use the user specified text align and baseline first
                verticalAlign: label.__verticalAlign || textVerticalAlign,
                align: label.__align || textAlign
            });
        }
    }
}
export default Line;
