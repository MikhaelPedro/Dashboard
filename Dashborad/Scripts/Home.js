/*const { List } = require("../echarts/echarts-5.2.1/dist/echarts.simple");*/

$(document).ready(function () {
    /*debugger*/
    
});

$("#btnCalcular").click(function () {
    var JanR = $("#1R").val();
    var Jan = $("#1").val();
    var FevR = $("#2R").val();
    var Fev = $("#2").val();
    var MarR = $("#3R").val();
    var Mar = $("#3").val();
    var AbrR = $("#4R").val();
    var Abr = $("#4").val();
    var MaiR = $("#5R").val();
    var Mai = $("#5").val();
    var JunR = $("#6R").val();
    var Jun = $("#6").val();
    var JulR = $("#7R").val();
    var Jul = $("#7").val();
    var AgoR = $("#8R").val();
    var Ago = $("#8").val();
    var SetR = $("#9R").val();
    var Set = $("#9").val();
    var OutR = $("#10R").val();
    var Out = $("#10").val();
    var NovR = $("#11R").val();
    var Nov = $("#11").val();
    var DezR = $("#12R").val();
    var Dez = $("#12").val();
    
    // object parameter
    var data2 = [
        {
            Mes: 1,
            Recurso: JanR,
            Requisito: Jan,
            Balanco: 0
        },
        {
            Mes: 2,
            Recurso: FevR,
            Requisito: Fev,
            Balanco: 0
        },
        {
            Mes: 3,
            Recurso: MarR,
            Requisito: Mar,
            Balanco: 0
        },
        {
            Mes: 4,
            Recurso: AbrR,
            Requisito: Abr,
            Balanco: 0
        },
        {
            Mes: 5,
            Recurso: MaiR,
            Requisito: Mai,
            Balanco: 0
        },
        {
            Mes: 6,
            Recurso: JunR,
            Requisito: Jun,
            Balanco: 0
        },
        {
            Mes: 7,
            Recurso: JulR,
            Requisito: Jul,
            Balanco: 0
        },
        {
            Mes: 8,
            Recurso: AgoR,
            Requisito: Ago,
            Balanco: 0
        },
        {
            Mes: 9,
            Recurso: SetR,
            Requisito: Set,
            Balanco: 0
        },
        {
            Mes: 10,
            Recurso: OutR,
            Requisito: Out,
            Balanco: 0
        },
        {
            Mes: 11,
            Recurso: NovR,
            Requisito: Nov,
            Balanco: 0
        },
        {
            Mes: 12,
            Recurso: DezR,
            Requisito: Dez,
            Balanco: 0
        },

    ];

    var data = {
        data: data2
    }

    // request ajax
    Calc(data)
        .done(function (result) { // control done - success request in server

            CriaDashboard(result.data);
                       
        })
        .fail(function () { // control fail - error request in server
            alert('Deu ruim');
        });
});

function CriaDashboard(ListMeses) {

    var chartDom = document.getElementById('estrutura');
    var myChart = echarts.init(chartDom);

    var option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'shadow'
            }
        },
        xAxis: {
            type: 'category',
            data: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
        },
        yAxis: {
            type: 'value'
        },
        series: [
            {
                data: [ListMeses[0].Recurso, ListMeses[1].Recurso, ListMeses[2].Recurso, ListMeses[3].Recurso, ListMeses[4].Recurso, ListMeses[5].Recurso, ListMeses[6].Recurso, ListMeses[7].Recurso, ListMeses[8].Recurso, ListMeses[9].Recurso, ListMeses[10].Recurso, ListMeses[11].Recurso],
                type: 'bar',
                name: 'Recurso'
            },
            {
                data: [ListMeses[0].Requisito, ListMeses[1].Requisito, ListMeses[2].Requisito, ListMeses[3].Requisito, ListMeses[4].Requisito, ListMeses[5].Requisito, ListMeses[6].Requisito, ListMeses[7].Requisito, ListMeses[8].Requisito, ListMeses[9].Requisito, ListMeses[10].Requisito, ListMeses[11].Requisito],
                type: 'bar',
                name: 'Requisito'
            },
            {
                data: [ListMeses[0].Balanco, ListMeses[1].Balanco, ListMeses[2].Balanco, ListMeses[3].Balanco, ListMeses[4].Balanco, ListMeses[5].Balanco, ListMeses[6].Balanco, ListMeses[7].Balanco, ListMeses[8].Balanco, ListMeses[9].Balanco, ListMeses[10].Balanco, ListMeses[11].Balanco],
                type: 'bar',
                name: 'Balanço'
            }
        ]
    };

    option && myChart.setOption(option);

}


// request
function Calc(data) {
    // post(url, parameter)
    return jQuery.post("/Home/Calc", data);
}
