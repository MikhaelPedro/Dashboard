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
import BaseAxisPointer from './BaseAxisPointer';
import * as viewHelper from './viewHelper';
import * as cartesianAxisHelper from '../../coord/cartesian/cartesianAxisHelper';
class CartesianAxisPointer extends BaseAxisPointer {
    /**
     * @override
     */
    makeElOption(elOption, value, axisModel, axisPointerModel, api) {
        const axis = axisModel.axis;
        const grid = axis.grid;
        const axisPointerType = axisPointerModel.get('type');
        const otherExtent = getCartesian(grid, axis).getOtherAxis(axis).getGlobalExtent();
        const pixelValue = axis.toGlobalCoord(axis.dataToCoord(value, true));
        if (axisPointerType && axisPointerType !== 'none') {
            const elStyle = viewHelper.buildElStyle(axisPointerModel);
            const pointerOption = pointerShapeBuilder[axisPointerType](axis, pixelValue, otherExtent);
            pointerOption.style = elStyle;
            elOption.graphicKey = pointerOption.type;
            elOption.pointer = pointerOption;
        }
        const layoutInfo = cartesianAxisHelper.layout(grid.model, axisModel);
        viewHelper.buildCartesianSingleLabelElOption(
        // @ts-ignore
        value, elOption, layoutInfo, axisModel, axisPointerModel, api);
    }
    /**
     * @override
     */
    getHandleTransform(value, axisModel, axisPointerModel) {
        const layoutInfo = cartesianAxisHelper.layout(axisModel.axis.grid.model, axisModel, {
            labelInside: false
        });
        // @ts-ignore
        layoutInfo.labelMargin = axisPointerModel.get(['handle', 'margin']);
        const pos = viewHelper.getTransformedPosition(axisModel.axis, value, layoutInfo);
        return {
            x: pos[0],
            y: pos[1],
            rotation: layoutInfo.rotation + (layoutInfo.labelDirection < 0 ? Math.PI : 0)
        };
    }
    /**
     * @override
     */
    updateHandleTransform(transform, delta, axisModel, axisPointerModel) {
        const axis = axisModel.axis;
        const grid = axis.grid;
        const axisExtent = axis.getGlobalExtent(true);
        const otherExtent = getCartesian(grid, axis).getOtherAxis(axis).getGlobalExtent();
        const dimIndex = axis.dim === 'x' ? 0 : 1;
        const currPosition = [transform.x, transform.y];
        currPosition[dimIndex] += delta[dimIndex];
        currPosition[dimIndex] = Math.min(axisExtent[1], currPosition[dimIndex]);
        currPosition[dimIndex] = Math.max(axisExtent[0], currPosition[dimIndex]);
        const cursorOtherValue = (otherExtent[1] + otherExtent[0]) / 2;
        const cursorPoint = [cursorOtherValue, cursorOtherValue];
        cursorPoint[dimIndex] = currPosition[dimIndex];
        // Make tooltip do not overlap axisPointer and in the middle of the grid.
        const tooltipOptions = [
            { verticalAlign: 'middle' },
            { align: 'center' }
        ];
        return {
            x: currPosition[0],
            y: currPosition[1],
            rotation: transform.rotation,
            cursorPoint: cursorPoint,
            tooltipOption: tooltipOptions[dimIndex]
        };
    }
}
function getCartesian(grid, axis) {
    const opt = {};
    opt[axis.dim + 'AxisIndex'] = axis.index;
    return grid.getCartesian(opt);
}
const pointerShapeBuilder = {
    line: function (axis, pixelValue, otherExtent) {
        const targetShape = viewHelper.makeLineShape([pixelValue, otherExtent[0]], [pixelValue, otherExtent[1]], getAxisDimIndex(axis));
        return {
            type: 'Line',
            subPixelOptimize: true,
            shape: targetShape
        };
    },
    shadow: function (axis, pixelValue, otherExtent) {
        const bandWidth = Math.max(1, axis.getBandWidth());
        const span = otherExtent[1] - otherExtent[0];
        return {
            type: 'Rect',
            shape: viewHelper.makeRectShape([pixelValue - bandWidth / 2, otherExtent[0]], [bandWidth, span], getAxisDimIndex(axis))
        };
    }
};
function getAxisDimIndex(axis) {
    return axis.dim === 'x' ? 0 : 1;
}
export default CartesianAxisPointer;
