using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Web.Mvc;

namespace Dashborad.Controllers
{
    public class HomeController : Controller
    {
        [HttpGet]
        // GET: HOME
        public ActionResult Index()
        {
            return View();
        }

        [HttpPost]
        //Recebe a Lista com os dados da requisicao AJAX
        //Verifica o tipo de caculo
        //Condicao pelo tipo de calculo contido na lista
        //Faz o ADD no listaMeses do TXMes, para ficar contido no rodapé do dashboard
        public JsonResult Calc(List<Dashborad.Modelss.DashboardPostModel> data)
        {
            try
            {
                var listaMeses = new List<string>();
                var lista = new List<Dashborad.Modelss.DashboardResultModel>();
                var count = 1;
                foreach (var item in data)
                {
                    decimal recurso = decimal.Parse(item.Recurso);
                    decimal requisito = decimal.Parse(item.Requisito);

                    if (item.Tipo.Contains("Geracao"))
                    {
                        listaMeses.Add(item.TxMes);
                        lista.Add(new Modelss.DashboardResultModel() { Balanco = requisito - recurso , Mes = count, Recurso = recurso, Requisito = requisito });
                        count++;
                    }
                    else
                    {
                        listaMeses.Add(item.TxMes);
                        lista.Add(new Modelss.DashboardResultModel() { Balanco = recurso - requisito, Mes = count, Recurso = recurso, Requisito = requisito });
                        count++;
                    }
                }

                return Json(new { data = lista.OrderBy(l => l.Mes).ToList(), Meses = listaMeses, success = true });
            }
            catch (Exception ex)
            {
                return Json(new { sucess = false, ex });
            }


        }
        //Recebe do request a data incio e fim
        //Faz a adicao dos meses enquanto a verificao seja verdadeira
        //verifica de a quantidade de meses (countMeses) é maior than 2 or menor or igual 12
        public JsonResult GerarMeses(string Inicio, string Fim)
        {
            try
            {
                var countMeses = 0;
                List<string> mesesDoAno = new List<string>();
                DateTime dataInicio = DateTime.Parse(Inicio);
                DateTime dataFim = DateTime.Parse(Fim);

                while (dataInicio <= dataFim)
                {
                    countMeses++;
                    mesesDoAno.Add(dataInicio.ToString("MM/yyyy"));
                    dataInicio = dataInicio.AddMonths(1);
                }
                if(countMeses > 2 && countMeses <= 12)
                {
                    return Json(new { data = mesesDoAno, success = true });
                }
                else
                {
                    throw new Exception();
                }
            }
            catch (Exception ex)
            {
                return Json(new { sucess = false, ex });
            }
            
        }

    }
}