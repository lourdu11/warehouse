import React from "react";
import { 
  DollarSign, FileText, Building2, TrendingUp, 
  ArrowUpRight, PieChart as PieIcon, Activity, CheckCircle
} from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { useNavigate } from "react-router-dom";

export default function FinanceDirectorDashboard({ stats, recentActivity }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Finance KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "PRs Pending Approval", value: stats.pendingPRs, icon: FileText, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Active Vendors", value: stats.totalVendors, icon: Building2, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Approved (MTD)", value: "₹45.2L", icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Monthly Budget", value: "₹80L", icon: PieIcon, color: "text-purple-600", bg: "bg-purple-50" },
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
        {/* Pending Approvals */}
        <Card className="lg:col-span-2 shadow-sm border-slate-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold text-slate-800">Pending Financial Clearances</h3>
              <button 
                onClick={() => navigate("/finance")}
                className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1"
              >
                Go to Finance Center <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-4">
              {stats.pendingPRs > 0 ? (
                <div className="p-8 bg-amber-50 rounded-3xl border-2 border-dashed border-amber-200 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                    <FileText className="w-8 h-8" />
                  </div>
                  <h4 className="text-xl font-bold text-slate-800 mb-1">{stats.pendingPRs} Purchase Requests Awaiting Approval</h4>
                  <p className="text-sm text-slate-500 max-w-sm mb-6">
                    Multiple high-value procurement requests require your financial clearance to proceed to Purchase Orders.
                  </p>
                  <button 
                    onClick={() => navigate("/finance")}
                    className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-black transition-all shadow-lg"
                  >
                    Launch Approval Console
                  </button>
                </div>
              ) : (
                <div className="p-8 bg-emerald-50 rounded-3xl border-2 border-dashed border-emerald-200 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <h4 className="text-xl font-bold text-slate-800 mb-1">Financial Pipeline Clear</h4>
                  <p className="text-sm text-slate-500">No pending purchase requests require immediate attention.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Financial Insights */}
        <Card className="shadow-sm border-slate-100">
          <CardContent className="p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Finance Monitor</h3>
            <div className="space-y-4">
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Spending Efficiency</p>
                </div>
                <p className="text-2xl font-bold text-slate-900">+14.2%</p>
                <p className="text-xs text-slate-500 mt-1">Cost savings achieved this month through vendor negotiation.</p>
              </div>

              <div className="p-5 bg-indigo-50 rounded-2xl border border-indigo-100">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-indigo-500" />
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vendor Compliance</p>
                </div>
                <p className="text-2xl font-bold text-slate-900">98%</p>
                <p className="text-xs text-slate-500 mt-1">High compliance rate in delivery and pricing accuracy.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
