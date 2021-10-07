/*const { List } = require("../echarts/echarts-5.2.1/dist/echarts.simple");*/
$(document).ready(function () {
    $('.periodo').mask('00/0000');
});
$("#btnGerarMeses").click(function () {
    var Inicio = $("#dtIni").val();
    var Fim = $("#dtFim").val();
    var EnviarDados = {Inicio: Inicio, Fim:Fim}
    GerarMeses(EnviarDados)
        .done(function (data) {
            (data.data || []).forEach(function (l, i) {
                var html = '<div class="col-md-2"><p class="text-center" style = "margin-top: 5px;" > </p><input type="text" id="" class="form-group-sm form-control" style="margin-right:5px;" placeholder="Recurso" /><input type="text" id="" class="form-group-sm form-control" style="margin-right: 5px; margin-top: 5px;" placeholder="Requisito" /></div>';
                $(".inputs").append(html);
            });
        })
        .fail(function () { // control fail - error request in server
            alert('Deu ruim');
        });
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
            var recurso = [];
            var requisito = [];
            var balanco = [];

            (result.data || []).forEach(function (l, i) {
                recurso.push(l.Recurso);
                requisito.push(l.Requisito);
                balanco.push(l.Balanco);
            });

            CriaDashboard(recurso, requisito, balanco);
                       
        })
        .fail(function () { // control fail - error request in server
            alert('Deu ruim');
        });
});

function CriaDashboard(Recurso, Requisito, Balanco ) {

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
                data: Recurso,
                type: 'bar',
                name: 'Recurso'
            },
            {
                data: Requisito,
                type: 'bar',
                name: 'Requisito'
            },
            {
                data: Balanco,
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

function GerarMeses(data) {
    // post(url, parameter)
    return jQuery.post("/Home/GerarMeses", data);
}