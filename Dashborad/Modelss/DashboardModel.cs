using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;

namespace Dashborad.Modelss
{   //Recebe as informações da tela
    public class DashboardPostModel
    {
        public string Recurso { get; set; }
        public string Requisito { get; set; }
        public string TxMes { get; set; }
        public string Tipo { get; set; }
    }
    //Envia o resultado do calculo
    public class DashboardResultModel
    {
        public decimal Recurso { get; set; }
        public decimal Requisito { get; set; }
        public decimal Balanco { get; set; }
        public int Mes { get; set; }
    }
}