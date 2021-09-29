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
import { makeInner } from '../../util/model';
const each = zrUtil.each;
const inner = makeInner();
/**
 * @param ecModel
 * @param newSnapshot key is dataZoomId
 */
export function push(ecModel, newSnapshot) {
    const storedSnapshots = getStoreSnapshots(ecModel);
    // If previous dataZoom can not be found,
    // complete an range with current range.
    each(newSnapshot, function (batchItem, dataZoomId) {
        let i = storedSnapshots.length - 1;
        for (; i >= 0; i--) {
            const snapshot = storedSnapshots[i];
            if (snapshot[dataZoomId]) {
                break;
            }
        }
        if (i < 0) {
            // No origin range set, create one by current range.
            const dataZoomModel = ecModel.queryComponents({ mainType: 'dataZoom', subType: 'select', id: dataZoomId })[0];
            if (dataZoomModel) {
                const percentRange = dataZoomModel.getPercentRange();
                storedSnapshots[0][dataZoomId] = {
                    dataZoomId: dataZoomId,
                    start: percentRange[0],
                    end: percentRange[1]
                };
            }
        }
    });
    storedSnapshots.push(newSnapshot);
}
export function pop(ecModel) {
    const storedSnapshots = getStoreSnapshots(ecModel);
    const head = storedSnapshots[storedSnapshots.length - 1];
    storedSnapshots.length > 1 && storedSnapshots.pop();
    // Find top for all dataZoom.
    const snapshot = {};
    each(head, function (batchItem, dataZoomId) {
        for (let i = storedSnapshots.length - 1; i >= 0; i--) {
            batchItem = storedSnapshots[i][dataZoomId];
            if (batchItem) {
                snapshot[dataZoomId] = batchItem;
                break;
            }
        }
    });
    return snapshot;
}
export function clear(ecModel) {
    inner(ecModel).snapshots = null;
}
export function count(ecModel) {
    return getStoreSnapshots(ecModel).length;
}
/**
 * History length of each dataZoom may be different.
 * this._history[0] is used to store origin range.
 */
function getStoreSnapshots(ecModel) {
    const store = inner(ecModel);
    if (!store.snapshots) {
        store.snapshots = [{}];
    }
    return store.snapshots;
}
