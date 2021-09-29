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
import { createChart } from '../../core/utHelper';
describe('custom_series', function () {
    let chart;
    beforeEach(function () {
        chart = createChart();
    });
    afterEach(function () {
        chart.dispose();
    });
    it('visual_palette', function () {
        const colors = ['#111111', '#222222', '#333333'];
        const resultPaletteColors = [];
        function renderItem(params, api) {
            const color = api.visual('color');
            resultPaletteColors.push(color);
            return {
                type: 'circle'
            };
        }
        chart.setOption({
            color: colors,
            xAxis: { data: ['a'] },
            yAxis: {},
            series: [{
                    type: 'custom',
                    renderItem: renderItem,
                    data: [11]
                }, {
                    type: 'custom',
                    renderItem: renderItem,
                    data: [22]
                }, {
                    type: 'custom',
                    renderItem: renderItem,
                    data: [33]
                }]
        }, true);
        expect(resultPaletteColors).toEqual(colors);
    });
});
