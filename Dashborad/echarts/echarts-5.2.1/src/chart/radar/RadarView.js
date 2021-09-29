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
import * as graphic from '../../util/graphic';
import { setStatesStylesFromModel, enableHoverEmphasis } from '../../util/states';
import * as zrUtil from 'zrender/src/core/util';
import * as symbolUtil from '../../util/symbol';
import ChartView from '../../view/Chart';
import { setLabelStyle, getLabelStatesModels } from '../../label/labelStyle';
import ZRImage from 'zrender/src/graphic/Image';
import { saveOldStyle } from '../../animation/basicTrasition';
class RadarView extends ChartView {
    constructor() {
        super(...arguments);
        this.type = RadarView.type;
    }
    render(seriesModel, ecModel, api) {
        const polar = seriesModel.coordinateSystem;
        const group = this.group;
        const data = seriesModel.getData();
        const oldData = this._data;
        function createSymbol(data, idx) {
            const symbolType = data.getItemVisual(idx, 'symbol') || 'circle';
            if (symbolType === 'none') {
                return;
            }
            const symbolSize = symbolUtil.normalizeSymbolSize(data.getItemVisual(idx, 'symbolSize'));
            const symbolPath = symbolUtil.createSymbol(symbolType, -1, -1, 2, 2);
            const symbolRotate = data.getItemVisual(idx, 'symbolRotate') || 0;
            symbolPath.attr({
                style: {
                    strokeNoScale: true
                },
                z2: 100,
                scaleX: symbolSize[0] / 2,
                scaleY: symbolSize[1] / 2,
                rotation: symbolRotate * Math.PI / 180 || 0
            });
            return symbolPath;
        }
        function updateSymbols(oldPoints, newPoints, symbolGroup, data, idx, isInit) {
            // Simply rerender all
            symbolGroup.removeAll();
            for (let i = 0; i < newPoints.length - 1; i++) {
                const symbolPath = createSymbol(data, idx);
                if (symbolPath) {
                    symbolPath.__dimIdx = i;
                    if (oldPoints[i]) {
                        symbolPath.setPosition(oldPoints[i]);
                        graphic[isInit ? 'initProps' : 'updateProps'](symbolPath, {
                            x: newPoints[i][0],
                            y: newPoints[i][1]
                        }, seriesModel, idx);
                    }
                    else {
                        symbolPath.setPosition(newPoints[i]);
                    }
                    symbolGroup.add(symbolPath);
                }
            }
        }
        function getInitialPoints(points) {
            return zrUtil.map(points, function (pt) {
                return [polar.cx, polar.cy];
            });
        }
        data.diff(oldData)
            .add(function (idx) {
            const points = data.getItemLayout(idx);
            if (!points) {
                return;
            }
            const polygon = new graphic.Polygon();
            const polyline = new graphic.Polyline();
            const target = {
                shape: {
                    points: points
                }
            };
            polygon.shape.points = getInitialPoints(points);
            polyline.shape.points = getInitialPoints(points);
            graphic.initProps(polygon, target, seriesModel, idx);
            graphic.initProps(polyline, target, seriesModel, idx);
            const itemGroup = new graphic.Group();
            const symbolGroup = new graphic.Group();
            itemGroup.add(polyline);
            itemGroup.add(polygon);
            itemGroup.add(symbolGroup);
            updateSymbols(polyline.shape.points, points, symbolGroup, data, idx, true);
            data.setItemGraphicEl(idx, itemGroup);
        })
            .update(function (newIdx, oldIdx) {
            const itemGroup = oldData.getItemGraphicEl(oldIdx);
            const polyline = itemGroup.childAt(0);
            const polygon = itemGroup.childAt(1);
            const symbolGroup = itemGroup.childAt(2);
            const target = {
                shape: {
                    points: data.getItemLayout(newIdx)
                }
            };
            if (!target.shape.points) {
                return;
            }
            updateSymbols(polyline.shape.points, target.shape.points, symbolGroup, data, newIdx, false);
            saveOldStyle(polygon);
            saveOldStyle(polyline);
            graphic.updateProps(polyline, target, seriesModel);
            graphic.updateProps(polygon, target, seriesModel);
            data.setItemGraphicEl(newIdx, itemGroup);
        })
            .remove(function (idx) {
            group.remove(oldData.getItemGraphicEl(idx));
        })
            .execute();
        data.eachItemGraphicEl(function (itemGroup, idx) {
            const itemModel = data.getItemModel(idx);
            const polyline = itemGroup.childAt(0);
            const polygon = itemGroup.childAt(1);
            const symbolGroup = itemGroup.childAt(2);
            // Radar uses the visual encoded from itemStyle.
            const itemStyle = data.getItemVisual(idx, 'style');
            const color = itemStyle.fill;
            group.add(itemGroup);
            polyline.useStyle(zrUtil.defaults(itemModel.getModel('lineStyle').getLineStyle(), {
                fill: 'none',
                stroke: color
            }));
            setStatesStylesFromModel(polyline, itemModel, 'lineStyle');
            setStatesStylesFromModel(polygon, itemModel, 'areaStyle');
            const areaStyleModel = itemModel.getModel('areaStyle');
            const polygonIgnore = areaStyleModel.isEmpty() && areaStyleModel.parentModel.isEmpty();
            polygon.ignore = polygonIgnore;
            zrUtil.each(['emphasis', 'select', 'blur'], function (stateName) {
                const stateModel = itemModel.getModel([stateName, 'areaStyle']);
                const stateIgnore = stateModel.isEmpty() && stateModel.parentModel.isEmpty();
                // Won't be ignore if normal state is not ignore.
                polygon.ensureState(stateName).ignore = stateIgnore && polygonIgnore;
            });
            polygon.useStyle(zrUtil.defaults(areaStyleModel.getAreaStyle(), {
                fill: color,
                opacity: 0.7,
                decal: itemStyle.decal
            }));
            const emphasisModel = itemModel.getModel('emphasis');
            const itemHoverStyle = emphasisModel.getModel('itemStyle').getItemStyle();
            symbolGroup.eachChild(function (symbolPath) {
                if (symbolPath instanceof ZRImage) {
                    const pathStyle = symbolPath.style;
                    symbolPath.useStyle(zrUtil.extend({
                        // TODO other properties like x, y ?
                        image: pathStyle.image,
                        x: pathStyle.x, y: pathStyle.y,
                        width: pathStyle.width, height: pathStyle.height
                    }, itemStyle));
                }
                else {
                    symbolPath.useStyle(itemStyle);
                    symbolPath.setColor(color);
                    symbolPath.style.strokeNoScale = true;
                }
                const pathEmphasisState = symbolPath.ensureState('emphasis');
                pathEmphasisState.style = zrUtil.clone(itemHoverStyle);
                let defaultText = data.getStore().get(data.getDimensionIndex(symbolPath.__dimIdx), idx);
                (defaultText == null || isNaN(defaultText)) && (defaultText = '');
                setLabelStyle(symbolPath, getLabelStatesModels(itemModel), {
                    labelFetcher: data.hostModel,
                    labelDataIndex: idx,
                    labelDimIndex: symbolPath.__dimIdx,
                    defaultText: defaultText,
                    inheritColor: color,
                    defaultOpacity: itemStyle.opacity
                });
            });
            enableHoverEmphasis(itemGroup, emphasisModel.get('focus'), emphasisModel.get('blurScope'));
        });
        this._data = data;
    }
    remove() {
        this.group.removeAll();
        this._data = null;
    }
}
RadarView.type = 'radar';
export default RadarView;
