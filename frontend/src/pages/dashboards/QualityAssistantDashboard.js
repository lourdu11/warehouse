import React from "react";
import { 
  ClipboardCheck, AlertTriangle, CheckCircle, 
  Search, ArrowRight, Activity, TrendingUp
} from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export default function QualityAssistantDashboard({ stats, qcData }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* QA KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "QC Pending", value: stats.pendingQC, icon: ClipboardCheck, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Rejected Today", value: stats.rejectedToday, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
          { label: "Total Products", value: stats.totalProducts, icon: Search, color: "text-blue-600", bg: "bg-blue-50" },
        ].map((kpi, i) => (
          <Card key={i} className="shadow-sm border-slate-100">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-12 h-12 ${kpi.bg} ${kpi.color} rounded-2xl flex items-center justify-center`}>
                <kpi.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
                <p className="text-2xl font-bold text-slate-900">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* QC Performance Chart */}
        <Card className="lg:col-span-2 shadow-sm border-slate-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold text-slate-800">Quality Inspection Stats</h3>
              <Activity className="w-5 h-5 text-slate-300" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="h-64 min-h-[250px]">
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                  <PieChart>
                    <Pie
                      data={qcData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={8}
                      dataKey="value"
                    >
                      {qcData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-6">
                {qcData.map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="w-3 h-10 rounded-full" style={{ backgroundColor: item.color }} />
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{item.name}</p>
                      <p className="text-2xl font-extrabold text-slate-900">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Panel */}
        <Card className="shadow-sm border-slate-100 bg-slate-900 text-white">
          <CardContent className="p-6">
            <h3 className="text-lg font-bold mb-6">Inspection Tools</h3>
            <div className="space-y-4">
              <button 
                onClick={() => navigate("/quality-check")}
                className="w-full flex items-center justify-between p-5 bg-white/10 hover:bg-white/20 rounded-2xl transition-all group"
              >
                <div className="flex items-center gap-4">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm font-bold">Start Inspection</span>
                </div>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              
              <div className="p-5 bg-amber-500/10 rounded-2xl border border-amber-500/20 mt-6">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                  <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">QC Insight</p>
                </div>
                <p className="text-xs text-amber-100 leading-relaxed">
                  Pending items in QC queue have increased by 20% in the last 2 hours. Prompt inspection required.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
