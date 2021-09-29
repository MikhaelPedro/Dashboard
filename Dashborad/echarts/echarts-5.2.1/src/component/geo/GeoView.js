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
import MapDraw from '../helper/MapDraw';
import ComponentView from '../../view/Component';
import { getECData } from '../../util/innerStore';
import { findEventDispatcher } from '../../util/event';
class GeoView extends ComponentView {
    constructor() {
        super(...arguments);
        this.type = GeoView.type;
        this.focusBlurEnabled = true;
    }
    init(ecModel, api) {
        this._api = api;
    }
    render(geoModel, ecModel, api, payload) {
        this._model = geoModel;
        if (!geoModel.get('show')) {
            this._mapDraw && this._mapDraw.remove();
            this._mapDraw = null;
            return;
        }
        if (!this._mapDraw) {
            this._mapDraw = new MapDraw(api);
        }
        const mapDraw = this._mapDraw;
        mapDraw.draw(geoModel, ecModel, api, this, payload);
        mapDraw.group.on('click', this._handleRegionClick, this);
        mapDraw.group.silent = geoModel.get('silent');
        this.group.add(mapDraw.group);
        this.updateSelectStatus(geoModel, ecModel, api);
    }
    _handleRegionClick(e) {
        let eventData;
        findEventDispatcher(e.target, current => {
            return (eventData = getECData(current).eventData) != null;
        }, true);
        if (eventData) {
            this._api.dispatchAction({
                type: 'geoToggleSelect',
                geoId: this._model.id,
                name: eventData.name
            });
        }
    }
    updateSelectStatus(model, ecModel, api) {
        this._mapDraw.group.traverse((node) => {
            const eventData = getECData(node).eventData;
            if (eventData) {
                this._model.isSelected(eventData.name)
                    ? api.enterSelect(node) : api.leaveSelect(node);
                // No need to traverse children.
                return true;
            }
        });
    }
    findHighDownDispatchers(name) {
        return this._mapDraw && this._mapDraw.findHighDownDispatchers(name, this._model);
    }
    dispose() {
        this._mapDraw && this._mapDraw.remove();
    }
}
GeoView.type = 'geo';
export default GeoView;
