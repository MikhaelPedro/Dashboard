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
        public JsonResult Calc(List<Dashborad.Modelss.DashboardModel> data)
        {
            try
            {
                foreach (var item in data)               
                    item.Balanco = item.Recurso - item.Requisito;

                return Json(new { data = data.OrderBy(l=>l.Mes).ToList(), success = true });
            }
            catch(Exception ex)
            {
                return Json(new { sucess = false, ex });
            }
            

        }
        public JsonResult GerarMeses(string Inicio, string Fim)
        {
            try
            {
                List<string> mesesDoAno = new List<string>();
                DateTime dataInicio = DateTime.Parse(Inicio);
                DateTime dataFim = DateTime.Parse(Fim);

                while (dataInicio <= dataFim)
                {
                    mesesDoAno.Add(dataInicio.ToString("MM/yyyy"));
                    dataInicio = dataInicio.AddMonths(1);
                }

                return Json(new { data = mesesDoAno, success = true}) ;
            }
            catch (Exception ex)
            {
                return Json(new { sucess = false, ex });
            }
            //try
            //{
            //    foreach (var item in data)
            //        item.Balanco = item.Recurso - item.Requisito;

            //    return Json(new { data = data.OrderBy(l => l.Mes).ToList(), success = true });
            //}
            //catch (Exception ex)
            //{
            //    return Json(new { sucess = false, ex });
            //}


        }

        //public ActionResult About()
        //{
        //    ViewBag.Message = "Your application description page.";

        //    return View();
        //}

        //public ActionResult Contact()
        //{
        //    ViewBag.Message = "Your contact page.";

        //    return View();
        //}
    }
}