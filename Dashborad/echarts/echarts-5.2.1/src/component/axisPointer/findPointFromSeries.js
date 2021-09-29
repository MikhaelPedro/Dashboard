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
import * as modelUtil from '../../util/model';
/**
 * @param finder contains {seriesIndex, dataIndex, dataIndexInside}
 * @param ecModel
 * @return  {point: [x, y], el: ...} point Will not be null.
 */
export default function findPointFromSeries(finder, ecModel) {
    let point = [];
    const seriesIndex = finder.seriesIndex;
    let seriesModel;
    if (seriesIndex == null || !(seriesModel = ecModel.getSeriesByIndex(seriesIndex))) {
        return {
            point: []
        };
    }
    const data = seriesModel.getData();
    const dataIndex = modelUtil.queryDataIndex(data, finder);
    if (dataIndex == null || dataIndex < 0 || zrUtil.isArray(dataIndex)) {
        return { point: [] };
    }
    const el = data.getItemGraphicEl(dataIndex);
    const coordSys = seriesModel.coordinateSystem;
    if (seriesModel.getTooltipPosition) {
        point = seriesModel.getTooltipPosition(dataIndex) || [];
    }
    else if (coordSys && coordSys.dataToPoint) {
        if (finder.isStacked) {
            const baseAxis = coordSys.getBaseAxis();
            const valueAxis = coordSys.getOtherAxis(baseAxis);
            const valueAxisDim = valueAxis.dim;
            const baseAxisDim = baseAxis.dim;
            const baseDataOffset = valueAxisDim === 'x' || valueAxisDim === 'radius' ? 1 : 0;
            const baseDim = data.mapDimension(baseAxisDim);
            const stackedData = [];
            stackedData[baseDataOffset] = data.get(baseDim, dataIndex);
            stackedData[1 - baseDataOffset] = data.get(data.getCalculationInfo('stackResultDimension'), dataIndex);
            point = coordSys.dataToPoint(stackedData) || [];
        }
        else {
            point = coordSys.dataToPoint(data.getValues(zrUtil.map(coordSys.dimensions, function (dim) {
                return data.mapDimension(dim);
            }), dataIndex)) || [];
        }
    }
    else if (el) {
        // Use graphic bounding rect
        const rect = el.getBoundingRect().clone();
        rect.applyTransform(el.transform);
        point = [
            rect.x + rect.width / 2,
            rect.y + rect.height / 2
        ];
    }
    return { point: point, el: el };
}
