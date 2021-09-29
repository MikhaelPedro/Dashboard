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
import ComponentModel from '../../model/Component';
import SeriesData from '../../data/SeriesData';
import { each, isObject, clone } from 'zrender/src/core/util';
import { convertOptionIdName, getDataItemValue } from '../../util/model';
class TimelineModel extends ComponentModel {
    constructor() {
        super(...arguments);
        this.type = TimelineModel.type;
        this.layoutMode = 'box';
    }
    /**
     * @override
     */
    init(option, parentModel, ecModel) {
        this.mergeDefaultAndTheme(option, ecModel);
        this._initData();
    }
    /**
     * @override
     */
    mergeOption(option) {
        super.mergeOption.apply(this, arguments);
        this._initData();
    }
    setCurrentIndex(currentIndex) {
        if (currentIndex == null) {
            currentIndex = this.option.currentIndex;
        }
        const count = this._data.count();
        if (this.option.loop) {
            currentIndex = (currentIndex % count + count) % count;
        }
        else {
            currentIndex >= count && (currentIndex = count - 1);
            currentIndex < 0 && (currentIndex = 0);
        }
        this.option.currentIndex = currentIndex;
    }
    /**
     * @return {number} currentIndex
     */
    getCurrentIndex() {
        return this.option.currentIndex;
    }
    /**
     * @return {boolean}
     */
    isIndexMax() {
        return this.getCurrentIndex() >= this._data.count() - 1;
    }
    /**
     * @param {boolean} state true: play, false: stop
     */
    setPlayState(state) {
        this.option.autoPlay = !!state;
    }
    /**
     * @return {boolean} true: play, false: stop
     */
    getPlayState() {
        return !!this.option.autoPlay;
    }
    /**
     * @private
     */
    _initData() {
        const thisOption = this.option;
        const dataArr = thisOption.data || [];
        const axisType = thisOption.axisType;
        const names = this._names = [];
        let processedDataArr;
        if (axisType === 'category') {
            processedDataArr = [];
            each(dataArr, function (item, index) {
                const value = convertOptionIdName(getDataItemValue(item), '');
                let newItem;
                if (isObject(item)) {
                    newItem = clone(item);
                    newItem.value = index;
                }
                else {
                    newItem = index;
                }
                processedDataArr.push(newItem);
                names.push(value);
            });
        }
        else {
            processedDataArr = dataArr;
        }
        const dimType = ({
            category: 'ordinal',
            time: 'time',
            value: 'number'
        })[axisType] || 'number';
        const data = this._data = new SeriesData([{
                name: 'value', type: dimType
            }], this);
        data.initData(processedDataArr, names);
    }
    getData() {
        return this._data;
    }
    /**
     * @public
     * @return {Array.<string>} categoreis
     */
    getCategories() {
        if (this.get('axisType') === 'category') {
            return this._names.slice();
        }
    }
}
TimelineModel.type = 'timeline';
/**
 * @protected
 */
TimelineModel.defaultOption = {
    zlevel: 0,
    z: 4,
    show: true,
    axisType: 'time',
    realtime: true,
    left: '20%',
    top: null,
    right: '20%',
    bottom: 0,
    width: null,
    height: 40,
    padding: 5,
    controlPosition: 'left',
    autoPlay: false,
    rewind: false,
    loop: true,
    playInterval: 2000,
    currentIndex: 0,
    itemStyle: {},
    label: {
        color: '#000'
    },
    data: []
};
export default TimelineModel;
