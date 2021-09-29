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
const TYPE_DELIMITER = '.';
const IS_CONTAINER = '___EC__COMPONENT__CONTAINER___';
const IS_EXTENDED_CLASS = '___EC__EXTENDED_CLASS___';
/**
 * Notice, parseClassType('') should returns {main: '', sub: ''}
 * @public
 */
export function parseClassType(componentType) {
    const ret = { main: '', sub: '' };
    if (componentType) {
        const typeArr = componentType.split(TYPE_DELIMITER);
        ret.main = typeArr[0] || '';
        ret.sub = typeArr[1] || '';
    }
    return ret;
}
/**
 * @public
 */
function checkClassType(componentType) {
    zrUtil.assert(/^[a-zA-Z0-9_]+([.][a-zA-Z0-9_]+)?$/.test(componentType), 'componentType "' + componentType + '" illegal');
}
export function isExtendedClass(clz) {
    return !!(clz && clz[IS_EXTENDED_CLASS]);
}
/**
 * Implements `ExtendableConstructor` for `rootClz`.
 *
 * @usage
 * ```ts
 * class Xxx {}
 * type XxxConstructor = typeof Xxx & ExtendableConstructor
 * enableClassExtend(Xxx as XxxConstructor);
 * ```
 */
export function enableClassExtend(rootClz, mandatoryMethods) {
    rootClz.$constructor = rootClz; // FIXME: not necessary?
    rootClz.extend = function (proto) {
        if (__DEV__) {
            zrUtil.each(mandatoryMethods, function (method) {
                if (!proto[method]) {
                    console.warn('Method `' + method + '` should be implemented'
                        + (proto.type ? ' in ' + proto.type : '') + '.');
                }
            });
        }
        const superClass = this;
        // For backward compat, we both support ts class inheritance and this
        // "extend" approach.
        // The constructor should keep the same behavior as ts class inheritance:
        // If this constructor/$constructor is not declared, auto invoke the super
        // constructor.
        // If this constructor/$constructor is declared, it is responsible for
        // calling the super constructor.
        function ExtendedClass(...args) {
            if (!proto.$constructor) {
                if (!isESClass(superClass)) {
                    // Will throw error if superClass is an es6 native class.
                    superClass.apply(this, arguments);
                }
                else {
                    const ins = zrUtil.createObject(
                    // @ts-ignore
                    ExtendedClass.prototype, new superClass(...args));
                    return ins;
                }
            }
            else {
                proto.$constructor.apply(this, arguments);
            }
        }
        ExtendedClass[IS_EXTENDED_CLASS] = true;
        zrUtil.extend(ExtendedClass.prototype, proto);
        ExtendedClass.extend = this.extend;
        ExtendedClass.superCall = superCall;
        ExtendedClass.superApply = superApply;
        zrUtil.inherits(ExtendedClass, this);
        ExtendedClass.superClass = superClass;
        return ExtendedClass;
    };
}
function isESClass(fn) {
    return typeof fn === 'function'
        && /^class\s/.test(Function.prototype.toString.call(fn));
}
/**
 * A work around to both support ts extend and this extend mechanism.
 * on sub-class.
 * @usage
 * ```ts
 * class Component { ... }
 * classUtil.enableClassExtend(Component);
 * classUtil.enableClassManagement(Component, {registerWhenExtend: true});
 *
 * class Series extends Component { ... }
 * // Without calling `markExtend`, `registerWhenExtend` will not work.
 * Component.markExtend(Series);
 * ```
 */
export function mountExtend(SubClz, SupperClz) {
    SubClz.extend = SupperClz.extend;
}
// A random offset.
let classBase = Math.round(Math.random() * 10);
/**
 * Implements `CheckableConstructor` for `target`.
 * Can not use instanceof, consider different scope by
 * cross domain or es module import in ec extensions.
 * Mount a method "isInstance()" to Clz.
 *
 * @usage
 * ```ts
 * class Xxx {}
 * type XxxConstructor = typeof Xxx & CheckableConstructor;
 * enableClassCheck(Xxx as XxxConstructor)
 * ```
 */
export function enableClassCheck(target) {
    const classAttr = ['__\0is_clz', classBase++].join('_');
    target.prototype[classAttr] = true;
    if (__DEV__) {
        zrUtil.assert(!target.isInstance, 'The method "is" can not be defined.');
    }
    target.isInstance = function (obj) {
        return !!(obj && obj[classAttr]);
    };
}
// superCall should have class info, which can not be fetch from 'this'.
// Consider this case:
// class A has method f,
// class B inherits class A, overrides method f, f call superApply('f'),
// class C inherits class B, do not overrides method f,
// then when method of class C is called, dead loop occured.
function superCall(context, methodName, ...args) {
    return this.superClass.prototype[methodName].apply(context, args);
}
function superApply(context, methodName, args) {
    return this.superClass.prototype[methodName].apply(context, args);
}
/**
 * Implements `ClassManager` for `target`
 *
 * @usage
 * ```ts
 * class Xxx {}
 * type XxxConstructor = typeof Xxx & ClassManager
 * enableClassManagement(Xxx as XxxConstructor);
 * ```
 */
export function enableClassManagement(target) {
    /**
     * Component model classes
     * key: componentType,
     * value:
     *     componentClass, when componentType is 'xxx'
     *     or Object.<subKey, componentClass>, when componentType is 'xxx.yy'
     */
    const storage = {};
    target.registerClass = function (clz) {
        // `type` should not be a "instance memeber".
        // If using TS class, should better declared as `static type = 'series.pie'`.
        // otherwise users have to mount `type` on prototype manually.
        // For backward compat and enable instance visit type via `this.type`,
        // we stil support fetch `type` from prototype.
        const componentFullType = clz.type || clz.prototype.type;
        if (componentFullType) {
            checkClassType(componentFullType);
            // If only static type declared, we assign it to prototype mandatorily.
            clz.prototype.type = componentFullType;
            const componentTypeInfo = parseClassType(componentFullType);
            if (!componentTypeInfo.sub) {
                if (__DEV__) {
                    if (storage[componentTypeInfo.main]) {
                        console.warn(componentTypeInfo.main + ' exists.');
                    }
                }
                storage[componentTypeInfo.main] = clz;
            }
            else if (componentTypeInfo.sub !== IS_CONTAINER) {
                const container = makeContainer(componentTypeInfo);
                container[componentTypeInfo.sub] = clz;
            }
        }
        return clz;
    };
    target.getClass = function (mainType, subType, throwWhenNotFound) {
        let clz = storage[mainType];
        if (clz && clz[IS_CONTAINER]) {
            clz = subType ? clz[subType] : null;
        }
        if (throwWhenNotFound && !clz) {
            throw new Error(!subType
                ? mainType + '.' + 'type should be specified.'
                : 'Component ' + mainType + '.' + (subType || '') + ' is used but not imported.');
        }
        return clz;
    };
    target.getClassesByMainType = function (componentType) {
        const componentTypeInfo = parseClassType(componentType);
        const result = [];
        const obj = storage[componentTypeInfo.main];
        if (obj && obj[IS_CONTAINER]) {
            zrUtil.each(obj, function (o, type) {
                type !== IS_CONTAINER && result.push(o);
            });
        }
        else {
            result.push(obj);
        }
        return result;
    };
    target.hasClass = function (componentType) {
        // Just consider componentType.main.
        const componentTypeInfo = parseClassType(componentType);
        return !!storage[componentTypeInfo.main];
    };
    /**
     * @return Like ['aa', 'bb'], but can not be ['aa.xx']
     */
    target.getAllClassMainTypes = function () {
        const types = [];
        zrUtil.each(storage, function (obj, type) {
            types.push(type);
        });
        return types;
    };
    /**
     * If a main type is container and has sub types
     */
    target.hasSubTypes = function (componentType) {
        const componentTypeInfo = parseClassType(componentType);
        const obj = storage[componentTypeInfo.main];
        return obj && obj[IS_CONTAINER];
    };
    function makeContainer(componentTypeInfo) {
        let container = storage[componentTypeInfo.main];
        if (!container || !container[IS_CONTAINER]) {
            container = storage[componentTypeInfo.main] = {};
            container[IS_CONTAINER] = true;
        }
        return container;
    }
}
// /**
//  * @param {string|Array.<string>} properties
//  */
// export function setReadOnly(obj, properties) {
// FIXME It seems broken in IE8 simulation of IE11
// if (!zrUtil.isArray(properties)) {
//     properties = properties != null ? [properties] : [];
// }
// zrUtil.each(properties, function (prop) {
//     let value = obj[prop];
//     Object.defineProperty
//         && Object.defineProperty(obj, prop, {
//             value: value, writable: false
//         });
//     zrUtil.isArray(obj[prop])
//         && Object.freeze
//         && Object.freeze(obj[prop]);
// });
// }
