using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;

namespace Dashborad.Modelss
{
    public class DashboardModel
    {
        public decimal Recurso { get; set; }
        public decimal Requisito { get; set; }
        public decimal Balanco { get; set; }
        public int Mes { get; set; }
    }
}