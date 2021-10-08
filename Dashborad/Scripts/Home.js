/*const { List } = require("../echarts/echarts-5.2.1/dist/echarts.simple");*/
$(document).ready(function () {
    $('.periodo').mask('00/0000');
});

$("#btnGerarMeses").click(function () {
    var Inicio = $("#dtIni").val();
    var Fim = $("#dtFim").val();
    var EnviarDados = { Inicio: Inicio, Fim: Fim };
    $(".inputs").html("");
    GerarMeses(EnviarDados)
        .done(function (data) {
            $("#btnCalcular").show();
            $("#btnCalcularGeracao").show();
            (data.data || []).forEach(function (l, i) {
                var html = '<div class="col-md-2 div_Inputs"><p class="text-center nomeMes" style = "margin-top: 5px;">'+ l +'</p><input type="text" id="" class="form-group-sm form-control input_Recurso" style="margin-right:5px;" placeholder="Recurso" /><input type="text" id="" class="form-group-sm form-control input_Requisito" style="margin-right: 5px; margin-top: 5px;" placeholder="Requisito" /></div>';
                $(".inputs").append(html);
            });

            $(".input_Recurso").maskMoney({ thousands: '.', decimal: ',', allowZero: true, precision: 3 });
            $(".input_Requisito").maskMoney({ thousands: '.', decimal: ',', allowZero: true, precision: 3 });
        })
        .fail(function () { // control fail - error request in server
            alert('O intervalo das datas não é válido, favor inserir as datas em um intervalo de 2 meses a um ano');
        });
});


$("#btnCalcular").click(function () {  
    GetOperacaoDashboard("Consumo");
});

$("#btnCalcularGeracao").click(function () {
    GetOperacaoDashboard("Geracao");
});

function GetOperacaoDashboard(tipoCalculo) {
    var Lista = [];
    $(".div_Inputs").each(function (i, el) {
        var nomeMes = $(this).find(".nomeMes").text();
        var valueRecurso = $(this).find(".input_Recurso").val();
        var valueRequisito = $(this).find(".input_Requisito").val();
        Lista.push({
            Recurso: valueRecurso || '0,000',
            Requisito: valueRequisito || '0,000',
            TxMes: nomeMes,
            Mes: (i + 1),
            Tipo: tipoCalculo,

        });
    });

    // object parameter
    var data = {
        data: Lista
    }

    debugger
    // request ajax
    Calc(data)
        .done(function (result) { // control done - success request in server
            var recurso = [];
            var requisito = [];
            var balanco = [];
            var listaMeses = result.Meses;

            (result.data || []).forEach(function (l, i) {
                recurso.push(l.Recurso);
                requisito.push(l.Requisito);
                balanco.push(l.Balanco);
            });

            CriaDashboard(recurso, requisito, balanco, listaMeses);

        })
        .fail(function () { // control fail - error request in server
            alert('Deu ruim');
        });
}

function CriaDashboard(Recurso, Requisito, Balanco, MesesList) {

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
            data: MesesList
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