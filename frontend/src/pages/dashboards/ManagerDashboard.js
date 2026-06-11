import React from "react";
import { 
  FileText, ClipboardCheck, TrendingUp, 
  Package, ShoppingBag, ArrowUpRight, Activity
} from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { useNavigate } from "react-router-dom";

export default function ManagerDashboard({ stats, trackingFlow, qcData, recentActivity }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Manager Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Inventory", value: stats.totalInventory, icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Pending PRs", value: stats.pendingPRs, icon: FileText, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "POs Today", value: stats.poToday, icon: ShoppingBag, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "QC Pending", value: stats.pendingQC, icon: ClipboardCheck, color: "text-purple-600", bg: "bg-purple-50" },
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
        {/* Workflow Pipeline */}
        <Card className="lg:col-span-2 shadow-sm border-slate-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold text-slate-800">Operational Pipeline</h3>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold uppercase">
                <Activity className="w-3 h-3" /> Live
              </div>
            </div>
            
            <div className="relative flex items-center justify-between px-4">
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-100 -translate-y-1/2 z-0" />
              {trackingFlow.map((step, i) => (
                <div key={i} className="relative z-10 flex flex-col items-center">
                  <div className={`w-12 h-12 rounded-full ${step.color} text-white flex items-center justify-center shadow-lg border-4 border-white`}>
                    <span className="text-xs font-bold">{step.count}</span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 mt-3 uppercase tracking-wider">{step.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => navigate("/purchase-requests")}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all shadow-md"
              >
                Review Purchase Requests <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Insights */}
        <Card className="shadow-sm border-slate-100">
          <CardContent className="p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Daily Insights</h3>
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Pass Rate</p>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-bold text-emerald-700">94.2%</p>
                  <TrendingUp className="w-6 h-6 text-emerald-500" />
                </div>
              </div>
              <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">Avg Lead Time</p>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-bold text-indigo-700">2.4 Days</p>
                  <Activity className="w-6 h-6 text-indigo-500" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
