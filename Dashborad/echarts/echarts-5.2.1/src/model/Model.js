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
import env from 'zrender/src/core/env';
import { enableClassExtend, enableClassCheck } from '../util/clazz';
import { AreaStyleMixin } from './mixin/areaStyle';
import TextStyleMixin from './mixin/textStyle';
import { LineStyleMixin } from './mixin/lineStyle';
import { ItemStyleMixin } from './mixin/itemStyle';
import { mixin, clone, merge } from 'zrender/src/core/util';
class Model {
    constructor(option, parentModel, ecModel) {
        this.parentModel = parentModel;
        this.ecModel = ecModel;
        this.option = option;
        // Simple optimization
        // if (this.init) {
        //     if (arguments.length <= 4) {
        //         this.init(option, parentModel, ecModel, extraOpt);
        //     }
        //     else {
        //         this.init.apply(this, arguments);
        //     }
        // }
    }
    init(option, parentModel, ecModel, ...rest) { }
    /**
     * Merge the input option to me.
     */
    mergeOption(option, ecModel) {
        merge(this.option, option, true);
    }
    // `path` can be 'xxx.yyy.zzz', so the return value type have to be `ModelOption`
    // TODO: TYPE strict key check?
    // get(path: string | string[], ignoreParent?: boolean): ModelOption;
    get(path, ignoreParent) {
        if (path == null) {
            return this.option;
        }
        return this._doGet(this.parsePath(path), !ignoreParent && this.parentModel);
    }
    getShallow(key, ignoreParent) {
        const option = this.option;
        let val = option == null ? option : option[key];
        if (val == null && !ignoreParent) {
            const parentModel = this.parentModel;
            if (parentModel) {
                // FIXME:TS do not know how to make it works
                val = parentModel.getShallow(key);
            }
        }
        return val;
    }
    // `path` can be 'xxx.yyy.zzz', so the return value type have to be `Model<ModelOption>`
    // getModel(path: string | string[], parentModel?: Model): Model;
    // TODO 'xxx.yyy.zzz' is deprecated
    getModel(path, parentModel) {
        const hasPath = path != null;
        const pathFinal = hasPath ? this.parsePath(path) : null;
        const obj = hasPath
            ? this._doGet(pathFinal)
            : this.option;
        parentModel = parentModel || (this.parentModel
            && this.parentModel.getModel(this.resolveParentPath(pathFinal)));
        return new Model(obj, parentModel, this.ecModel);
    }
    /**
     * Squash option stack into one.
     * parentModel will be removed after squashed.
     *
     * NOTE: resolveParentPath will not be applied here for simplicity. DON'T use this function
     * if resolveParentPath is modified.
     *
     * @param deepMerge If do deep merge. Default to be false.
     */
    // squash(
    //     deepMerge?: boolean,
    //     handleCallback?: (func: () => object) => object
    // ) {
    //     const optionStack = [];
    //     let model: Model = this;
    //     while (model) {
    //         if (model.option) {
    //             optionStack.push(model.option);
    //         }
    //         model = model.parentModel;
    //     }
    //     const newOption = {} as Opt;
    //     let option;
    //     while (option = optionStack.pop()) {    // Top down merge
    //         if (isFunction(option) && handleCallback) {
    //             option = handleCallback(option);
    //         }
    //         if (deepMerge) {
    //             merge(newOption, option);
    //         }
    //         else {
    //             extend(newOption, option);
    //         }
    //     }
    //     // Remove parentModel
    //     this.option = newOption;
    //     this.parentModel = null;
    // }
    /**
     * If model has option
     */
    isEmpty() {
        return this.option == null;
    }
    restoreData() { }
    // Pending
    clone() {
        const Ctor = this.constructor;
        return new Ctor(clone(this.option));
    }
    // setReadOnly(properties): void {
    // clazzUtil.setReadOnly(this, properties);
    // }
    // If path is null/undefined, return null/undefined.
    parsePath(path) {
        if (typeof path === 'string') {
            return path.split('.');
        }
        return path;
    }
    // Resolve path for parent. Perhaps useful when parent use a different property.
    // Default to be a identity resolver.
    // Can be modified to a different resolver.
    resolveParentPath(path) {
        return path;
    }
    // FIXME:TS check whether put this method here
    isAnimationEnabled() {
        if (!env.node && this.option) {
            if (this.option.animation != null) {
                return !!this.option.animation;
            }
            else if (this.parentModel) {
                return this.parentModel.isAnimationEnabled();
            }
        }
    }
    _doGet(pathArr, parentModel) {
        let obj = this.option;
        if (!pathArr) {
            return obj;
        }
        for (let i = 0; i < pathArr.length; i++) {
            // Ignore empty
            if (!pathArr[i]) {
                continue;
            }
            // obj could be number/string/... (like 0)
            obj = (obj && typeof obj === 'object')
                ? obj[pathArr[i]] : null;
            if (obj == null) {
                break;
            }
        }
        if (obj == null && parentModel) {
            obj = parentModel._doGet(this.resolveParentPath(pathArr), parentModel.parentModel);
        }
        return obj;
    }
}
;
// Enable Model.extend.
enableClassExtend(Model);
enableClassCheck(Model);
mixin(Model, LineStyleMixin);
mixin(Model, ItemStyleMixin);
mixin(Model, AreaStyleMixin);
mixin(Model, TextStyleMixin);
export default Model;
