import React from "react";
import { 
  Users, Building2, Shield, Activity, 
  Settings, UserPlus, Database, Lock
} from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { useNavigate } from "react-router-dom";

export default function AdminDashboard({ stats, isLoading, recentActivity }) {
  const navigate = useNavigate();

  const adminKpis = [
    { label: "Total Users", value: stats.totalEmployees, icon: Users, color: "text-blue-600", bg: "bg-blue-50", link: "/users" },
    { label: "System Roles", value: "6 Active", icon: Shield, color: "text-indigo-600", bg: "bg-indigo-50", link: "/settings" },
    { label: "Active Vendors", value: stats.totalVendors, icon: Building2, color: "text-purple-600", bg: "bg-purple-50", link: "/vendors" },
    { label: "Database Health", value: "Optimal", icon: Database, color: "text-emerald-600", bg: "bg-emerald-50", link: "/settings" },
  ];

  return (
    <div className="space-y-6">
      {/* Admin KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {adminKpis.map((kpi, i) => (
          <Card key={i} className="shadow-sm border-slate-100 hover:shadow-md transition-all cursor-pointer" onClick={() => navigate(kpi.link)}>
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
        {/* System Management */}
        <Card className="lg:col-span-2 shadow-sm border-slate-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">System Management</h3>
              <Settings className="w-5 h-5 text-slate-400" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                onClick={() => navigate("/users")}
                className="flex items-center justify-between p-4 bg-slate-50 hover:bg-indigo-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                    <UserPlus className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800">Manage Users</p>
                    <p className="text-xs text-slate-500">Create or edit employee accounts</p>
                  </div>
                </div>
                <Activity className="w-4 h-4 text-slate-300 group-hover:text-indigo-400" />
              </button>
              
              <button 
                onClick={() => navigate("/settings")}
                className="flex items-center justify-between p-4 bg-slate-50 hover:bg-purple-50 rounded-2xl border border-slate-100 hover:border-purple-200 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                    <Lock className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800">Permissions & Roles</p>
                    <p className="text-xs text-slate-500">Configure access control levels</p>
                  </div>
                </div>
                <Activity className="w-4 h-4 text-slate-300 group-hover:text-purple-400" />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Audit Log Preview */}
        <Card className="shadow-sm border-slate-100">
          <CardContent className="p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Security Audit</h3>
            <div className="space-y-4">
              {recentActivity.map((activity, i) => (
                <div key={i} className="flex gap-3">
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    activity.type === "success" ? "bg-emerald-500" : "bg-indigo-500"
                  }`} />
                  <div>
                    <p className="text-xs font-medium text-slate-700">{activity.text}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
