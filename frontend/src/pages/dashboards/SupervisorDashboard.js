import React from "react";
import { 
  ClipboardCheck, Truck, Package, Activity, 
  ChevronRight, ArrowRight, ListChecks, Clock
} from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { useNavigate } from "react-router-dom";

export default function SupervisorDashboard({ stats, outboundStats, recentActivity }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Supervisor KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "QC Awaiting", value: stats.pendingQC, icon: ClipboardCheck, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Incoming Orders", value: outboundStats.pending, icon: Truck, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "GRNs Today", value: stats.grnToday, icon: ListChecks, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Shipped Today", value: outboundStats.shippedToday, icon: Package, color: "text-purple-600", bg: "bg-purple-50" },
        ].map((kpi, i) => (
          <Card key={i} className="shadow-sm border-slate-100">
            <CardContent className="p-5">
              <div className={`w-10 h-10 ${kpi.bg} ${kpi.color} rounded-xl flex items-center justify-center mb-3`}>
                <kpi.icon className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Operations Overview */}
        <Card className="lg:col-span-2 shadow-sm border-slate-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold text-slate-800">Operational Oversight</h3>
              <Activity className="w-5 h-5 text-slate-300" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Inbound Queue</h4>
                <button 
                  onClick={() => navigate("/grn")}
                  className="w-full flex items-center justify-between p-5 bg-white border border-slate-100 rounded-2xl hover:border-emerald-200 hover:bg-emerald-50/30 transition-all group shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                      <ListChecks className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-slate-800">Process GRNs</p>
                      <p className="text-xs text-slate-500">Incoming stock verification</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-all" />
                </button>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Outbound Queue</h4>
                <button 
                  onClick={() => navigate("/outbound")}
                  className="w-full flex items-center justify-between p-5 bg-white border border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 transition-all group shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-slate-800">Incoming Orders</p>
                      <p className="text-xs text-slate-500">View POs awaiting receipt</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-all" />
                </button>
              </div>
            </div>

            <div className="mt-8 p-4 bg-slate-50 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-indigo-500" />
                <p className="text-sm font-medium text-slate-700">Average processing time is down 12% today.</p>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 uppercase">Improving</span>
            </div>
          </CardContent>
        </Card>

        {/* Recent Operation Logs */}
        <Card className="shadow-sm border-slate-100">
          <CardContent className="p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Operations Log</h3>
            <div className="space-y-4">
              {recentActivity.map((log, i) => (
                <div key={i} className="flex gap-4 group">
                  <div className="w-1 h-10 bg-slate-100 rounded-full group-hover:bg-indigo-400 transition-colors" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700 leading-tight">{log.text}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{log.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <button 
              onClick={() => navigate("/inventory")}
              className="w-full mt-6 flex items-center justify-center gap-2 py-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
            >
              Full Inventory Report <ArrowRight className="w-3 h-3" />
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
