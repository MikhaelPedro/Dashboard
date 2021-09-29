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
import { SOURCE_FORMAT_ARRAY_ROWS, SOURCE_FORMAT_OBJECT_ROWS } from '../../util/types';
import { makePrintable, throwError } from '../../util/log';
import { each } from 'zrender/src/core/util';
import { normalizeToArray } from '../../util/model';
import { getRawValueParser, SortOrderComparator } from '../../data/helper/dataValueHelper';
let sampleLog = '';
if (__DEV__) {
    sampleLog = [
        'Valid config is like:',
        '{ dimension: "age", order: "asc" }',
        'or [{ dimension: "age", order: "asc"], { dimension: "date", order: "desc" }]'
    ].join(' ');
}
export const sortTransform = {
    type: 'echarts:sort',
    transform: function (params) {
        const upstream = params.upstream;
        const config = params.config;
        let errMsg = '';
        // Normalize
        // const orderExprList: OrderExpression[] = isArray(config[0])
        //     ? config as OrderExpression[]
        //     : [config as OrderExpression];
        const orderExprList = normalizeToArray(config);
        if (!orderExprList.length) {
            if (__DEV__) {
                errMsg = 'Empty `config` in sort transform.';
            }
            throwError(errMsg);
        }
        const orderDefList = [];
        each(orderExprList, function (orderExpr) {
            const dimLoose = orderExpr.dimension;
            const order = orderExpr.order;
            const parserName = orderExpr.parser;
            const incomparable = orderExpr.incomparable;
            if (dimLoose == null) {
                if (__DEV__) {
                    errMsg = 'Sort transform config must has "dimension" specified.' + sampleLog;
                }
                throwError(errMsg);
            }
            if (order !== 'asc' && order !== 'desc') {
                if (__DEV__) {
                    errMsg = 'Sort transform config must has "order" specified.' + sampleLog;
                }
                throwError(errMsg);
            }
            if (incomparable && (incomparable !== 'min' && incomparable !== 'max')) {
                let errMsg = '';
                if (__DEV__) {
                    errMsg = 'incomparable must be "min" or "max" rather than "' + incomparable + '".';
                }
                throwError(errMsg);
            }
            if (order !== 'asc' && order !== 'desc') {
                let errMsg = '';
                if (__DEV__) {
                    errMsg = 'order must be "asc" or "desc" rather than "' + order + '".';
                }
                throwError(errMsg);
            }
            const dimInfo = upstream.getDimensionInfo(dimLoose);
            if (!dimInfo) {
                if (__DEV__) {
                    errMsg = makePrintable('Can not find dimension info via: ' + dimLoose + '.\n', 'Existing dimensions: ', upstream.cloneAllDimensionInfo(), '.\n', 'Illegal config:', orderExpr, '.\n');
                }
                throwError(errMsg);
            }
            const parser = parserName ? getRawValueParser(parserName) : null;
            if (parserName && !parser) {
                if (__DEV__) {
                    errMsg = makePrintable('Invalid parser name ' + parserName + '.\n', 'Illegal config:', orderExpr, '.\n');
                }
                throwError(errMsg);
            }
            orderDefList.push({
                dimIdx: dimInfo.index,
                parser: parser,
                comparator: new SortOrderComparator(order, incomparable)
            });
        });
        // TODO: support it?
        const sourceFormat = upstream.sourceFormat;
        if (sourceFormat !== SOURCE_FORMAT_ARRAY_ROWS
            && sourceFormat !== SOURCE_FORMAT_OBJECT_ROWS) {
            if (__DEV__) {
                errMsg = 'sourceFormat "' + sourceFormat + '" is not supported yet';
            }
            throwError(errMsg);
        }
        // Other upstream format are all array.
        const resultData = [];
        for (let i = 0, len = upstream.count(); i < len; i++) {
            resultData.push(upstream.getRawDataItem(i));
        }
        resultData.sort(function (item0, item1) {
            for (let i = 0; i < orderDefList.length; i++) {
                const orderDef = orderDefList[i];
                let val0 = upstream.retrieveValueFromItem(item0, orderDef.dimIdx);
                let val1 = upstream.retrieveValueFromItem(item1, orderDef.dimIdx);
                if (orderDef.parser) {
                    val0 = orderDef.parser(val0);
                    val1 = orderDef.parser(val1);
                }
                const result = orderDef.comparator.evaluate(val0, val1);
                if (result !== 0) {
                    return result;
                }
            }
            return 0;
        });
        return {
            data: resultData
        };
    }
};
