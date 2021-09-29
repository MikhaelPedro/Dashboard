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
import { createHashMap } from 'zrender/src/core/util';
import { Dictionary } from 'zrender/src/core/types';
// ---------------------------
// Common types and constants
// ---------------------------
export { Dictionary };
;
;
;
export const VISUAL_DIMENSIONS = createHashMap([
    'tooltip', 'label', 'itemName', 'itemId', 'itemGroupId', 'seriesName'
]);
export const SOURCE_FORMAT_ORIGINAL = 'original';
export const SOURCE_FORMAT_ARRAY_ROWS = 'arrayRows';
export const SOURCE_FORMAT_OBJECT_ROWS = 'objectRows';
export const SOURCE_FORMAT_KEYED_COLUMNS = 'keyedColumns';
export const SOURCE_FORMAT_TYPED_ARRAY = 'typedArray';
export const SOURCE_FORMAT_UNKNOWN = 'unknown';
export const SERIES_LAYOUT_BY_COLUMN = 'column';
export const SERIES_LAYOUT_BY_ROW = 'row';
;
;
;
;
