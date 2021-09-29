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
import { registerPreprocessor, registerProcessor, registerPostInit, registerPostUpdate, registerAction, registerCoordinateSystem, registerLayout, registerVisual, registerTransform, registerLoading, registerMap, registerUpdateLifecycle, PRIORITY } from './core/echarts';
import ComponentView from './view/Component';
import ChartView from './view/Chart';
import ComponentModel from './model/Component';
import SeriesModel from './model/Series';
import { isFunction, indexOf, isArray, each } from 'zrender/src/core/util';
import { registerPainter } from 'zrender/src/zrender';
const extensions = [];
const extensionRegisters = {
    registerPreprocessor,
    registerProcessor,
    registerPostInit,
    registerPostUpdate,
    registerUpdateLifecycle,
    registerAction,
    registerCoordinateSystem,
    registerLayout,
    registerVisual,
    registerTransform,
    registerLoading,
    registerMap,
    PRIORITY,
    ComponentModel,
    ComponentView,
    SeriesModel,
    ChartView,
    // TODO Use ComponentModel and SeriesModel instead of Constructor
    registerComponentModel(ComponentModelClass) {
        ComponentModel.registerClass(ComponentModelClass);
    },
    registerComponentView(ComponentViewClass) {
        ComponentView.registerClass(ComponentViewClass);
    },
    registerSeriesModel(SeriesModelClass) {
        SeriesModel.registerClass(SeriesModelClass);
    },
    registerChartView(ChartViewClass) {
        ChartView.registerClass(ChartViewClass);
    },
    registerSubTypeDefaulter(componentType, defaulter) {
        ComponentModel.registerSubTypeDefaulter(componentType, defaulter);
    },
    registerPainter(painterType, PainterCtor) {
        registerPainter(painterType, PainterCtor);
    }
};
export function use(ext) {
    if (isArray(ext)) {
        // use([ChartLine, ChartBar]);
        each(ext, (singleExt) => {
            use(singleExt);
        });
        return;
    }
    if (indexOf(extensions, ext) >= 0) {
        return;
    }
    extensions.push(ext);
    if (isFunction(ext)) {
        ext = {
            install: ext
        };
    }
    ext.install(extensionRegisters);
}
