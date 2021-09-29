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
import * as visualSolution from '../../visual/visualSolution';
import Model from '../../model/Model';
import ComponentModel from '../../model/Component';
const DEFAULT_OUT_OF_BRUSH_COLOR = '#ddd';
class BrushModel extends ComponentModel {
    constructor() {
        super(...arguments);
        this.type = BrushModel.type;
        /**
         * @readOnly
         */
        this.areas = [];
        /**
         * Current brush painting area settings.
         * @readOnly
         */
        this.brushOption = {};
    }
    optionUpdated(newOption, isInit) {
        const thisOption = this.option;
        !isInit && visualSolution.replaceVisualOption(thisOption, newOption, ['inBrush', 'outOfBrush']);
        const inBrush = thisOption.inBrush = thisOption.inBrush || {};
        // Always give default visual, consider setOption at the second time.
        thisOption.outOfBrush = thisOption.outOfBrush || { color: DEFAULT_OUT_OF_BRUSH_COLOR };
        if (!inBrush.hasOwnProperty('liftZ')) {
            // Bigger than the highlight z lift, otherwise it will
            // be effected by the highlight z when brush.
            inBrush.liftZ = 5;
        }
    }
    /**
     * If `areas` is null/undefined, range state remain.
     */
    setAreas(areas) {
        if (__DEV__) {
            zrUtil.assert(zrUtil.isArray(areas));
            zrUtil.each(areas, function (area) {
                zrUtil.assert(area.brushType, 'Illegal areas');
            });
        }
        // If areas is null/undefined, range state remain.
        // This helps user to dispatchAction({type: 'brush'}) with no areas
        // set but just want to get the current brush select info from a `brush` event.
        if (!areas) {
            return;
        }
        this.areas = zrUtil.map(areas, function (area) {
            return generateBrushOption(this.option, area);
        }, this);
    }
    /**
     * Set the current painting brush option.
     */
    setBrushOption(brushOption) {
        this.brushOption = generateBrushOption(this.option, brushOption);
        this.brushType = this.brushOption.brushType;
    }
}
BrushModel.type = 'brush';
BrushModel.dependencies = ['geo', 'grid', 'xAxis', 'yAxis', 'parallel', 'series'];
BrushModel.defaultOption = {
    seriesIndex: 'all',
    brushType: 'rect',
    brushMode: 'single',
    transformable: true,
    brushStyle: {
        borderWidth: 1,
        color: 'rgba(210,219,238,0.3)',
        borderColor: '#D2DBEE'
    },
    throttleType: 'fixRate',
    throttleDelay: 0,
    removeOnClick: true,
    z: 10000
};
function generateBrushOption(option, brushOption) {
    return zrUtil.merge({
        brushType: option.brushType,
        brushMode: option.brushMode,
        transformable: option.transformable,
        brushStyle: new Model(option.brushStyle).getItemStyle(),
        removeOnClick: option.removeOnClick,
        z: option.z
    }, brushOption, true);
}
export default BrushModel;
