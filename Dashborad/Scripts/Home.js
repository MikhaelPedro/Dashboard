﻿$(document).ready(function () {
    debugger
    var chartDom = document.getElementById('estrutura');
    var myChart = echarts.init(chartDom);

    var option = {
        xAxis: {
            type: 'category',
            data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        },
        yAxis: {
            type: 'value'
        },
        series: [
            {
                data: [120, 200, 150, 80, 70, 110, 130],
                type: 'bar'
            },
            {
                data: [180, 200, 150, 80, 70, 110, 130],
                type: 'bar'
            },
            {
                data: [200, 200, 150, 80, 70, 110, 130],
                type: 'bar'
            }
        ]
    };

    option && myChart.setOption(option);

});