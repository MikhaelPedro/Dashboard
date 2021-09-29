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
import { parsePercent } from '../../util/number';
const each = zrUtil.each;
export default function boxplotLayout(ecModel) {
    const groupResult = groupSeriesByAxis(ecModel);
    each(groupResult, function (groupItem) {
        const seriesModels = groupItem.seriesModels;
        if (!seriesModels.length) {
            return;
        }
        calculateBase(groupItem);
        each(seriesModels, function (seriesModel, idx) {
            layoutSingleSeries(seriesModel, groupItem.boxOffsetList[idx], groupItem.boxWidthList[idx]);
        });
    });
}
/**
 * Group series by axis.
 */
function groupSeriesByAxis(ecModel) {
    const result = [];
    const axisList = [];
    ecModel.eachSeriesByType('boxplot', function (seriesModel) {
        const baseAxis = seriesModel.getBaseAxis();
        let idx = zrUtil.indexOf(axisList, baseAxis);
        if (idx < 0) {
            idx = axisList.length;
            axisList[idx] = baseAxis;
            result[idx] = {
                axis: baseAxis,
                seriesModels: []
            };
        }
        result[idx].seriesModels.push(seriesModel);
    });
    return result;
}
/**
 * Calculate offset and box width for each series.
 */
function calculateBase(groupItem) {
    let extent;
    const baseAxis = groupItem.axis;
    const seriesModels = groupItem.seriesModels;
    const seriesCount = seriesModels.length;
    const boxWidthList = groupItem.boxWidthList = [];
    const boxOffsetList = groupItem.boxOffsetList = [];
    const boundList = [];
    let bandWidth;
    if (baseAxis.type === 'category') {
        bandWidth = baseAxis.getBandWidth();
    }
    else {
        let maxDataCount = 0;
        each(seriesModels, function (seriesModel) {
            maxDataCount = Math.max(maxDataCount, seriesModel.getData().count());
        });
        extent = baseAxis.getExtent(),
            Math.abs(extent[1] - extent[0]) / maxDataCount;
    }
    each(seriesModels, function (seriesModel) {
        let boxWidthBound = seriesModel.get('boxWidth');
        if (!zrUtil.isArray(boxWidthBound)) {
            boxWidthBound = [boxWidthBound, boxWidthBound];
        }
        boundList.push([
            parsePercent(boxWidthBound[0], bandWidth) || 0,
            parsePercent(boxWidthBound[1], bandWidth) || 0
        ]);
    });
    const availableWidth = bandWidth * 0.8 - 2;
    const boxGap = availableWidth / seriesCount * 0.3;
    const boxWidth = (availableWidth - boxGap * (seriesCount - 1)) / seriesCount;
    let base = boxWidth / 2 - availableWidth / 2;
    each(seriesModels, function (seriesModel, idx) {
        boxOffsetList.push(base);
        base += boxGap + boxWidth;
        boxWidthList.push(Math.min(Math.max(boxWidth, boundList[idx][0]), boundList[idx][1]));
    });
}
/**
 * Calculate points location for each series.
 */
function layoutSingleSeries(seriesModel, offset, boxWidth) {
    const coordSys = seriesModel.coordinateSystem;
    const data = seriesModel.getData();
    const halfWidth = boxWidth / 2;
    const cDimIdx = seriesModel.get('layout') === 'horizontal' ? 0 : 1;
    const vDimIdx = 1 - cDimIdx;
    const coordDims = ['x', 'y'];
    const cDim = data.mapDimension(coordDims[cDimIdx]);
    const vDims = data.mapDimensionsAll(coordDims[vDimIdx]);
    if (cDim == null || vDims.length < 5) {
        return;
    }
    for (let dataIndex = 0; dataIndex < data.count(); dataIndex++) {
        const axisDimVal = data.get(cDim, dataIndex);
        const median = getPoint(axisDimVal, vDims[2], dataIndex);
        const end1 = getPoint(axisDimVal, vDims[0], dataIndex);
        const end2 = getPoint(axisDimVal, vDims[1], dataIndex);
        const end4 = getPoint(axisDimVal, vDims[3], dataIndex);
        const end5 = getPoint(axisDimVal, vDims[4], dataIndex);
        const ends = [];
        addBodyEnd(ends, end2, false);
        addBodyEnd(ends, end4, true);
        ends.push(end1, end2, end5, end4);
        layEndLine(ends, end1);
        layEndLine(ends, end5);
        layEndLine(ends, median);
        data.setItemLayout(dataIndex, {
            initBaseline: median[vDimIdx],
            ends: ends
        });
    }
    function getPoint(axisDimVal, dim, dataIndex) {
        const val = data.get(dim, dataIndex);
        const p = [];
        p[cDimIdx] = axisDimVal;
        p[vDimIdx] = val;
        let point;
        if (isNaN(axisDimVal) || isNaN(val)) {
            point = [NaN, NaN];
        }
        else {
            point = coordSys.dataToPoint(p);
            point[cDimIdx] += offset;
        }
        return point;
    }
    function addBodyEnd(ends, point, start) {
        const point1 = point.slice();
        const point2 = point.slice();
        point1[cDimIdx] += halfWidth;
        point2[cDimIdx] -= halfWidth;
        start
            ? ends.push(point1, point2)
            : ends.push(point2, point1);
    }
    function layEndLine(ends, endCenter) {
        const from = endCenter.slice();
        const to = endCenter.slice();
        from[cDimIdx] -= halfWidth;
        to[cDimIdx] += halfWidth;
        ends.push(from, to);
    }
}
