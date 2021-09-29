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
class PolarModel extends ComponentModel {
    constructor() {
        super(...arguments);
        this.type = PolarModel.type;
    }
    findAxisModel(axisType) {
        let foundAxisModel;
        const ecModel = this.ecModel;
        ecModel.eachComponent(axisType, function (axisModel) {
            if (axisModel.getCoordSysModel() === this) {
                foundAxisModel = axisModel;
            }
        }, this);
        return foundAxisModel;
    }
}
PolarModel.type = 'polar';
PolarModel.dependencies = ['radiusAxis', 'angleAxis'];
PolarModel.defaultOption = {
    zlevel: 0,
    z: 0,
    center: ['50%', '50%'],
    radius: '80%'
};
export default PolarModel;
