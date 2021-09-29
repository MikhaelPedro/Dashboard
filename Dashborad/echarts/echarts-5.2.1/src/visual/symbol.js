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
import { isFunction } from 'zrender/src/core/util';
// Encoding visual for all series include which is filtered for legend drawing
const seriesSymbolTask = {
    createOnAllSeries: true,
    // For legend.
    performRawSeries: true,
    reset: function (seriesModel, ecModel) {
        const data = seriesModel.getData();
        if (seriesModel.legendIcon) {
            data.setVisual('legendIcon', seriesModel.legendIcon);
        }
        if (!seriesModel.hasSymbolVisual) {
            return;
        }
        const symbolType = seriesModel.get('symbol');
        const symbolSize = seriesModel.get('symbolSize');
        const keepAspect = seriesModel.get('symbolKeepAspect');
        const symbolRotate = seriesModel.get('symbolRotate');
        const symbolOffset = seriesModel.get('symbolOffset');
        const hasSymbolTypeCallback = isFunction(symbolType);
        const hasSymbolSizeCallback = isFunction(symbolSize);
        const hasSymbolRotateCallback = isFunction(symbolRotate);
        const hasSymbolOffsetCallback = isFunction(symbolOffset);
        const hasCallback = hasSymbolTypeCallback
            || hasSymbolSizeCallback
            || hasSymbolRotateCallback
            || hasSymbolOffsetCallback;
        const seriesSymbol = (!hasSymbolTypeCallback && symbolType) ? symbolType : seriesModel.defaultSymbol;
        const seriesSymbolSize = !hasSymbolSizeCallback ? symbolSize : null;
        const seriesSymbolRotate = !hasSymbolRotateCallback ? symbolRotate : null;
        const seriesSymbolOffset = !hasSymbolOffsetCallback ? symbolOffset : null;
        data.setVisual({
            legendIcon: seriesModel.legendIcon || seriesSymbol,
            // If seting callback functions on `symbol` or `symbolSize`, for simplicity and avoiding
            // to bring trouble, we do not pick a reuslt from one of its calling on data item here,
            // but just use the default value. Callback on `symbol` or `symbolSize` is convenient in
            // some cases but generally it is not recommanded.
            symbol: seriesSymbol,
            symbolSize: seriesSymbolSize,
            symbolKeepAspect: keepAspect,
            symbolRotate: seriesSymbolRotate,
            symbolOffset: seriesSymbolOffset
        });
        // Only visible series has each data be visual encoded
        if (ecModel.isSeriesFiltered(seriesModel)) {
            return;
        }
        function dataEach(data, idx) {
            const rawValue = seriesModel.getRawValue(idx);
            const params = seriesModel.getDataParams(idx);
            hasSymbolTypeCallback && data.setItemVisual(idx, 'symbol', symbolType(rawValue, params));
            hasSymbolSizeCallback && data.setItemVisual(idx, 'symbolSize', symbolSize(rawValue, params));
            hasSymbolRotateCallback && data.setItemVisual(idx, 'symbolRotate', symbolRotate(rawValue, params));
            hasSymbolOffsetCallback && data.setItemVisual(idx, 'symbolOffset', symbolOffset(rawValue, params));
        }
        return { dataEach: hasCallback ? dataEach : null };
    }
};
const dataSymbolTask = {
    createOnAllSeries: true,
    // For legend.
    performRawSeries: true,
    reset: function (seriesModel, ecModel) {
        if (!seriesModel.hasSymbolVisual) {
            return;
        }
        // Only visible series has each data be visual encoded
        if (ecModel.isSeriesFiltered(seriesModel)) {
            return;
        }
        const data = seriesModel.getData();
        function dataEach(data, idx) {
            const itemModel = data.getItemModel(idx);
            const itemSymbolType = itemModel.getShallow('symbol', true);
            const itemSymbolSize = itemModel.getShallow('symbolSize', true);
            const itemSymbolRotate = itemModel.getShallow('symbolRotate', true);
            const itemSymbolOffset = itemModel.getShallow('symbolOffset', true);
            const itemSymbolKeepAspect = itemModel.getShallow('symbolKeepAspect', true);
            // If has item symbol
            if (itemSymbolType != null) {
                data.setItemVisual(idx, 'symbol', itemSymbolType);
            }
            if (itemSymbolSize != null) {
                // PENDING Transform symbolSize ?
                data.setItemVisual(idx, 'symbolSize', itemSymbolSize);
            }
            if (itemSymbolRotate != null) {
                data.setItemVisual(idx, 'symbolRotate', itemSymbolRotate);
            }
            if (itemSymbolOffset != null) {
                data.setItemVisual(idx, 'symbolOffset', itemSymbolOffset);
            }
            if (itemSymbolKeepAspect != null) {
                data.setItemVisual(idx, 'symbolKeepAspect', itemSymbolKeepAspect);
            }
        }
        return { dataEach: data.hasItemOption ? dataEach : null };
    }
};
export { seriesSymbolTask, dataSymbolTask };
