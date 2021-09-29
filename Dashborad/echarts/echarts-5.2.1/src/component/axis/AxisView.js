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
import * as axisPointerModelHelper from '../axisPointer/modelHelper';
import ComponentView from '../../view/Component';
const axisPointerClazz = {};
/**
 * Base class of AxisView.
 */
class AxisView extends ComponentView {
    constructor() {
        super(...arguments);
        this.type = AxisView.type;
    }
    /**
     * @override
     */
    render(axisModel, ecModel, api, payload) {
        // FIXME
        // This process should proformed after coordinate systems updated
        // (axis scale updated), and should be performed each time update.
        // So put it here temporarily, although it is not appropriate to
        // put a model-writing procedure in `view`.
        this.axisPointerClass && axisPointerModelHelper.fixValue(axisModel);
        super.render.apply(this, arguments);
        this._doUpdateAxisPointerClass(axisModel, api, true);
    }
    /**
     * Action handler.
     */
    updateAxisPointer(axisModel, ecModel, api, payload) {
        this._doUpdateAxisPointerClass(axisModel, api, false);
    }
    /**
     * @override
     */
    remove(ecModel, api) {
        const axisPointer = this._axisPointer;
        axisPointer && axisPointer.remove(api);
    }
    /**
     * @override
     */
    dispose(ecModel, api) {
        this._disposeAxisPointer(api);
        super.dispose.apply(this, arguments);
    }
    _doUpdateAxisPointerClass(axisModel, api, forceRender) {
        const Clazz = AxisView.getAxisPointerClass(this.axisPointerClass);
        if (!Clazz) {
            return;
        }
        const axisPointerModel = axisPointerModelHelper.getAxisPointerModel(axisModel);
        axisPointerModel
            ? (this._axisPointer || (this._axisPointer = new Clazz()))
                .render(axisModel, axisPointerModel, api, forceRender)
            : this._disposeAxisPointer(api);
    }
    _disposeAxisPointer(api) {
        this._axisPointer && this._axisPointer.dispose(api);
        this._axisPointer = null;
    }
    static registerAxisPointerClass(type, clazz) {
        if (__DEV__) {
            if (axisPointerClazz[type]) {
                throw new Error('axisPointer ' + type + ' exists');
            }
        }
        axisPointerClazz[type] = clazz;
    }
    ;
    static getAxisPointerClass(type) {
        return type && axisPointerClazz[type];
    }
    ;
}
AxisView.type = 'axis';
export default AxisView;
