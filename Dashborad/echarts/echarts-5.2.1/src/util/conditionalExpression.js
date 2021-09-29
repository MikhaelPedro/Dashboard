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
import { keys, isArray, map, isObject, isString, isRegExp, isArrayLike, hasOwn } from 'zrender/src/core/util';
import { throwError, makePrintable } from './log';
import { getRawValueParser, createFilterComparator } from '../data/helper/dataValueHelper';
;
const RELATIONAL_EXPRESSION_OP_ALIAS_MAP = {
    value: 'eq',
    // PENDING: not good for literal semantic?
    '<': 'lt',
    '<=': 'lte',
    '>': 'gt',
    '>=': 'gte',
    '=': 'eq',
    '!=': 'ne',
    '<>': 'ne'
    // Might mileading for sake of the different between '==' and '===',
    // So dont support them.
    // '==': 'eq',
    // '===': 'seq',
    // '!==': 'sne'
    // PENDING: Whether support some common alias "ge", "le", "neq"?
    // ge: 'gte',
    // le: 'lte',
    // neq: 'ne',
};
// type RelationalExpressionOpEvaluate = (tarVal: unknown, condVal: unknown) => boolean;
class RegExpEvaluator {
    constructor(rVal) {
        // Support condVal: RegExp | string
        const condValue = this._condVal = isString(rVal) ? new RegExp(rVal)
            : isRegExp(rVal) ? rVal
                : null;
        if (condValue == null) {
            let errMsg = '';
            if (__DEV__) {
                errMsg = makePrintable('Illegal regexp', rVal, 'in');
            }
            throwError(errMsg);
        }
    }
    evaluate(lVal) {
        const type = typeof lVal;
        return type === 'string' ? this._condVal.test(lVal)
            : type === 'number' ? this._condVal.test(lVal + '')
                : false;
    }
}
class ConstConditionInternal {
    evaluate() {
        return this.value;
    }
}
class AndConditionInternal {
    evaluate() {
        const children = this.children;
        for (let i = 0; i < children.length; i++) {
            if (!children[i].evaluate()) {
                return false;
            }
        }
        return true;
    }
}
class OrConditionInternal {
    evaluate() {
        const children = this.children;
        for (let i = 0; i < children.length; i++) {
            if (children[i].evaluate()) {
                return true;
            }
        }
        return false;
    }
}
class NotConditionInternal {
    evaluate() {
        return !this.child.evaluate();
    }
}
class RelationalConditionInternal {
    evaluate() {
        const needParse = !!this.valueParser;
        // Call getValue with no `this`.
        const getValue = this.getValue;
        const tarValRaw = getValue(this.valueGetterParam);
        const tarValParsed = needParse ? this.valueParser(tarValRaw) : null;
        // Relational cond follow "and" logic internally.
        for (let i = 0; i < this.subCondList.length; i++) {
            if (!this.subCondList[i].evaluate(needParse ? tarValParsed : tarValRaw)) {
                return false;
            }
        }
        return true;
    }
}
function parseOption(exprOption, getters) {
    if (exprOption === true || exprOption === false) {
        const cond = new ConstConditionInternal();
        cond.value = exprOption;
        return cond;
    }
    let errMsg = '';
    if (!isObjectNotArray(exprOption)) {
        if (__DEV__) {
            errMsg = makePrintable('Illegal config. Expect a plain object but actually', exprOption);
        }
        throwError(errMsg);
    }
    if (exprOption.and) {
        return parseAndOrOption('and', exprOption, getters);
    }
    else if (exprOption.or) {
        return parseAndOrOption('or', exprOption, getters);
    }
    else if (exprOption.not) {
        return parseNotOption(exprOption, getters);
    }
    return parseRelationalOption(exprOption, getters);
}
function parseAndOrOption(op, exprOption, getters) {
    const subOptionArr = exprOption[op];
    let errMsg = '';
    if (__DEV__) {
        errMsg = makePrintable('"and"/"or" condition should only be `' + op + ': [...]` and must not be empty array.', 'Illegal condition:', exprOption);
    }
    if (!isArray(subOptionArr)) {
        throwError(errMsg);
    }
    if (!subOptionArr.length) {
        throwError(errMsg);
    }
    const cond = op === 'and' ? new AndConditionInternal() : new OrConditionInternal();
    cond.children = map(subOptionArr, subOption => parseOption(subOption, getters));
    if (!cond.children.length) {
        throwError(errMsg);
    }
    return cond;
}
function parseNotOption(exprOption, getters) {
    const subOption = exprOption.not;
    let errMsg = '';
    if (__DEV__) {
        errMsg = makePrintable('"not" condition should only be `not: {}`.', 'Illegal condition:', exprOption);
    }
    if (!isObjectNotArray(subOption)) {
        throwError(errMsg);
    }
    const cond = new NotConditionInternal();
    cond.child = parseOption(subOption, getters);
    if (!cond.child) {
        throwError(errMsg);
    }
    return cond;
}
function parseRelationalOption(exprOption, getters) {
    let errMsg = '';
    const valueGetterParam = getters.prepareGetValue(exprOption);
    const subCondList = [];
    const exprKeys = keys(exprOption);
    const parserName = exprOption.parser;
    const valueParser = parserName ? getRawValueParser(parserName) : null;
    for (let i = 0; i < exprKeys.length; i++) {
        const keyRaw = exprKeys[i];
        if (keyRaw === 'parser' || getters.valueGetterAttrMap.get(keyRaw)) {
            continue;
        }
        const op = hasOwn(RELATIONAL_EXPRESSION_OP_ALIAS_MAP, keyRaw)
            ? RELATIONAL_EXPRESSION_OP_ALIAS_MAP[keyRaw]
            : keyRaw;
        const condValueRaw = exprOption[keyRaw];
        const condValueParsed = valueParser ? valueParser(condValueRaw) : condValueRaw;
        const evaluator = createFilterComparator(op, condValueParsed)
            || (op === 'reg' && new RegExpEvaluator(condValueParsed));
        if (!evaluator) {
            if (__DEV__) {
                errMsg = makePrintable('Illegal relational operation: "' + keyRaw + '" in condition:', exprOption);
            }
            throwError(errMsg);
        }
        subCondList.push(evaluator);
    }
    if (!subCondList.length) {
        if (__DEV__) {
            errMsg = makePrintable('Relational condition must have at least one operator.', 'Illegal condition:', exprOption);
        }
        // No relational operator always disabled in case of dangers result.
        throwError(errMsg);
    }
    const cond = new RelationalConditionInternal();
    cond.valueGetterParam = valueGetterParam;
    cond.valueParser = valueParser;
    cond.getValue = getters.getValue;
    cond.subCondList = subCondList;
    return cond;
}
function isObjectNotArray(val) {
    return isObject(val) && !isArrayLike(val);
}
class ConditionalExpressionParsed {
    constructor(exprOption, getters) {
        this._cond = parseOption(exprOption, getters);
    }
    evaluate() {
        return this._cond.evaluate();
    }
}
;
export function parseConditionalExpression(exprOption, getters) {
    return new ConditionalExpressionParsed(exprOption, getters);
}
