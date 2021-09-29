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
import ComponentView from '../../view/Component';
import GridModel from '../../coord/cartesian/GridModel';
import { Rect } from '../../util/graphic';
import { defaults } from 'zrender/src/core/util';
import { CartesianAxisModel } from '../../coord/cartesian/AxisModel';
import axisModelCreator from '../../coord/axisModelCreator';
import Grid from '../../coord/cartesian/Grid';
import { CartesianXAxisView, CartesianYAxisView } from '../axis/CartesianAxisView';
// Grid view
class GridView extends ComponentView {
    constructor() {
        super(...arguments);
        this.type = 'grid';
    }
    render(gridModel, ecModel) {
        this.group.removeAll();
        if (gridModel.get('show')) {
            this.group.add(new Rect({
                shape: gridModel.coordinateSystem.getRect(),
                style: defaults({
                    fill: gridModel.get('backgroundColor')
                }, gridModel.getItemStyle()),
                silent: true,
                z2: -1
            }));
        }
    }
}
GridView.type = 'grid';
const extraOption = {
    // gridIndex: 0,
    // gridId: '',
    offset: 0
};
export function install(registers) {
    registers.registerComponentView(GridView);
    registers.registerComponentModel(GridModel);
    registers.registerCoordinateSystem('cartesian2d', Grid);
    axisModelCreator(registers, 'x', CartesianAxisModel, extraOption);
    axisModelCreator(registers, 'y', CartesianAxisModel, extraOption);
    registers.registerComponentView(CartesianXAxisView);
    registers.registerComponentView(CartesianYAxisView);
    registers.registerPreprocessor(function (option) {
        // Only create grid when need
        if (option.xAxis && option.yAxis && !option.grid) {
            option.grid = {};
        }
    });
}
