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
/**
 * This module is imported by echarts directly.
 *
 * Notice:
 * Always keep this file exists for backward compatibility.
 * Because before 4.1.0, dataset is an optional component,
 * some users may import this module manually.
 */
import ComponentModel from '../../model/Component';
import ComponentView from '../../view/Component';
import { SERIES_LAYOUT_BY_COLUMN } from '../../util/types';
import { disableTransformOptionMerge, SourceManager } from '../../data/helper/sourceManager';
export class DatasetModel extends ComponentModel {
    constructor() {
        super(...arguments);
        this.type = 'dataset';
    }
    init(option, parentModel, ecModel) {
        super.init(option, parentModel, ecModel);
        this._sourceManager = new SourceManager(this);
        disableTransformOptionMerge(this);
    }
    mergeOption(newOption, ecModel) {
        super.mergeOption(newOption, ecModel);
        disableTransformOptionMerge(this);
    }
    optionUpdated() {
        this._sourceManager.dirty();
    }
    getSourceManager() {
        return this._sourceManager;
    }
}
DatasetModel.type = 'dataset';
DatasetModel.defaultOption = {
    seriesLayoutBy: SERIES_LAYOUT_BY_COLUMN
};
class DatasetView extends ComponentView {
    constructor() {
        super(...arguments);
        this.type = 'dataset';
    }
}
DatasetView.type = 'dataset';
export function install(registers) {
    registers.registerComponentModel(DatasetModel);
    registers.registerComponentView(DatasetView);
}
