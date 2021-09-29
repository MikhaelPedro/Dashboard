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
import ComponentModel from '../../model/Component';
import { getLayoutParams, sizeCalculable, mergeLayoutParam } from '../../util/layout';
class CalendarModel extends ComponentModel {
    constructor() {
        super(...arguments);
        this.type = CalendarModel.type;
    }
    /**
     * @override
     */
    init(option, parentModel, ecModel) {
        const inputPositionParams = getLayoutParams(option);
        super.init.apply(this, arguments);
        mergeAndNormalizeLayoutParams(option, inputPositionParams);
    }
    /**
     * @override
     */
    mergeOption(option) {
        super.mergeOption.apply(this, arguments);
        mergeAndNormalizeLayoutParams(this.option, option);
    }
    getCellSize() {
        // Has been normalized
        return this.option.cellSize;
    }
}
CalendarModel.type = 'calendar';
CalendarModel.defaultOption = {
    zlevel: 0,
    z: 2,
    left: 80,
    top: 60,
    cellSize: 20,
    // horizontal vertical
    orient: 'horizontal',
    // month separate line style
    splitLine: {
        show: true,
        lineStyle: {
            color: '#000',
            width: 1,
            type: 'solid'
        }
    },
    // rect style  temporarily unused emphasis
    itemStyle: {
        color: '#fff',
        borderWidth: 1,
        borderColor: '#ccc'
    },
    // week text style
    dayLabel: {
        show: true,
        firstDay: 0,
        // start end
        position: 'start',
        margin: '50%',
        nameMap: 'en',
        color: '#000'
    },
    // month text style
    monthLabel: {
        show: true,
        // start end
        position: 'start',
        margin: 5,
        // center or left
        align: 'center',
        // cn en []
        nameMap: 'en',
        formatter: null,
        color: '#000'
    },
    // year text style
    yearLabel: {
        show: true,
        // top bottom left right
        position: null,
        margin: 30,
        formatter: null,
        color: '#ccc',
        fontFamily: 'sans-serif',
        fontWeight: 'bolder',
        fontSize: 20
    }
};
function mergeAndNormalizeLayoutParams(target, raw) {
    // Normalize cellSize
    const cellSize = target.cellSize;
    let cellSizeArr;
    if (!zrUtil.isArray(cellSize)) {
        cellSizeArr = target.cellSize = [cellSize, cellSize];
    }
    else {
        cellSizeArr = cellSize;
    }
    if (cellSizeArr.length === 1) {
        cellSizeArr[1] = cellSizeArr[0];
    }
    const ignoreSize = zrUtil.map([0, 1], function (hvIdx) {
        // If user have set `width` or both `left` and `right`, cellSizeArr
        // will be automatically set to 'auto', otherwise the default
        // setting of cellSizeArr will make `width` setting not work.
        if (sizeCalculable(raw, hvIdx)) {
            cellSizeArr[hvIdx] = 'auto';
        }
        return cellSizeArr[hvIdx] != null && cellSizeArr[hvIdx] !== 'auto';
    });
    mergeLayoutParam(target, raw, {
        type: 'box', ignoreSize: ignoreSize
    });
}
export default CalendarModel;
