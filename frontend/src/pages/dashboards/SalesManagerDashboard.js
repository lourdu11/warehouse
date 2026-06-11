import React from "react";
import {
  Users,
  ShoppingCart,
  FileText,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  CheckCircle,
  Clock,
  Truck,
  Package,
  CreditCard,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { useNavigate } from "react-router-dom";

/* ── Tiny helpers ── */
const StatusBadge = ({ status }) => {
  const map = {
    Pending:                { bg: "bg-amber-100",  text: "text-amber-700"  },
    pending:                { bg: "bg-amber-100",  text: "text-amber-700"  },
    "Awaiting Confirmation":{ bg: "bg-blue-100",   text: "text-blue-700"   },
    Confirmed:              { bg: "bg-emerald-100",text: "text-emerald-700" },
    confirmed:              { bg: "bg-emerald-100",text: "text-emerald-700" },
    Approved:               { bg: "bg-emerald-100",text: "text-emerald-700" },
    approved:               { bg: "bg-emerald-100",text: "text-emerald-700" },
    Dispatched:             { bg: "bg-purple-100", text: "text-purple-700"  },
    Cancelled:              { bg: "bg-red-100",    text: "text-red-700"     },
    Completed:              { bg: "bg-slate-100",  text: "text-slate-600"   },
    Processing:             { bg: "bg-indigo-100", text: "text-indigo-700"  },
    "Stock Allocated":      { bg: "bg-cyan-100",   text: "text-cyan-700"    },
  };
  const style = map[status] || { bg: "bg-slate-100", text: "text-slate-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${style.bg} ${style.text}`}>
      {status || "Unknown"}
    </span>
  );
};

const fmt = (n) =>
  n >= 100000
    ? `₹${(n / 100000).toFixed(1)}L`
    : n >= 1000
    ? `₹${(n / 1000).toFixed(1)}K`
    : `₹${n.toFixed(0)}`;

export default function SalesManagerDashboard({ stats, salesData, inventoryInsights }) {
  const navigate = useNavigate();
  const { recentCPRs = [], recentSalesOrders = [], salesPipeline = [], recentPayments = [] } = salesData || {};

  /* ── KPI cards ── */
  const kpis = [
    {
      id: "kpi-customers",
      label: "Total Customers",
      value: stats.totalCustomers,
      icon: Users,
      gradient: "from-indigo-500 to-blue-600",
      bg: "bg-indigo-50",
      color: "text-indigo-600",
      action: () => navigate("/customers"),
      trend: "+2 this month",
    },
    {
      id: "kpi-pending-cprs",
      label: "Pending CPRs",
      value: stats.pendingCPRs,
      icon: ShoppingCart,
      gradient: "from-amber-400 to-orange-500",
      bg: "bg-amber-50",
      color: "text-amber-600",
      action: () => navigate("/sales/purchase-requests"),
      trend: "Awaiting action",
      urgent: stats.pendingCPRs > 0,
    },
    {
      id: "kpi-active-orders",
      label: "Active Sales Orders",
      value: stats.activeSalesOrders,
      icon: FileText,
      gradient: "from-emerald-400 to-teal-500",
      bg: "bg-emerald-50",
      color: "text-emerald-600",
      action: () => navigate("/sales/orders"),
      trend: `${stats.dispatchedOrders} dispatched`,
    },
    {
      id: "kpi-pending-payments",
      label: "Pending Payments",
      value: stats.pendingPayments,
      icon: DollarSign,
      gradient: "from-purple-500 to-violet-600",
      bg: "bg-purple-50",
      color: "text-purple-600",
      action: () => navigate("/sales/payments"),
      trend: `${fmt(stats.totalSalesRevenue)} confirmed`,
      urgent: stats.pendingPayments > 0,
    },
  ];

  return (
    <div className="space-y-6">

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.id}
            id={kpi.id}
            onClick={kpi.action}
            className="text-left group relative overflow-hidden bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
          >
            {kpi.urgent && (
              <span className="absolute top-3 right-3 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
              </span>
            )}
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${kpi.gradient}`} />
            <div className="p-5">
              <div className={`w-10 h-10 ${kpi.bg} ${kpi.color} rounded-xl flex items-center justify-center mb-4`}>
                <kpi.icon className="w-5 h-5" />
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{kpi.label}</p>
              <p className="text-3xl font-extrabold text-slate-900 tabular-nums">{kpi.value}</p>
              <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> {kpi.trend}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* ── Sales Pipeline + Fast Moving Products ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Sales Pipeline Tracker */}
        <Card className="lg:col-span-2 shadow-sm border-slate-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold text-slate-800">Sales Pipeline</h3>
              <button
                id="btn-view-all-orders"
                onClick={() => navigate("/sales/orders")}
                className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1"
              >
                All Orders <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>

            {/* Pipeline Bar */}
            {salesPipeline.length > 0 && salesPipeline.some(s => s.count > 0) ? (
              <>
                <div className="flex rounded-full overflow-hidden h-3 mb-5 bg-slate-100">
                  {salesPipeline.map((stage, i) => {
                    const total = salesPipeline.reduce((s, x) => s + x.count, 0) || 1;
                    const pct = (stage.count / total) * 100;
                    return pct > 0 ? (
                      <div
                        key={i}
                        style={{ width: `${pct}%`, backgroundColor: stage.color }}
                        className="h-full transition-all"
                        title={`${stage.label}: ${stage.count}`}
                      />
                    ) : null;
                  })}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {salesPipeline.map((stage, i) => {
                    const icons = [ShoppingCart, FileText, Truck, CreditCard];
                    const Icon = icons[i] || FileText;
                    return (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: stage.color + "22", color: stage.color }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">
                            {stage.label}
                          </p>
                          <p className="text-lg font-extrabold text-slate-900 leading-none">{stage.count}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                  <ShoppingCart className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No sales pipeline data yet</p>
                <p className="text-xs text-slate-400 mt-1">Create a Customer Purchase Request to get started</p>
                <button
                  onClick={() => navigate("/sales/purchase-requests")}
                  className="mt-4 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all"
                >
                  New CPR
                </button>
              </div>
            )}

            {/* Recent Sales Orders */}
            {recentSalesOrders.length > 0 && (
              <div className="mt-6">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Recent Sales Orders</h4>
                <div className="space-y-2">
                  {recentSalesOrders.map((so, i) => (
                    <div
                      key={so.so_id || i}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            SO #{so.so_id || so.id}
                          </p>
                          <p className="text-xs text-slate-400">
                            {so.customer_name || so.customer || "Customer"} •{" "}
                            {so.created_at ? new Date(so.created_at).toLocaleDateString() : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {so.total_amount && (
                          <p className="text-sm font-bold text-slate-700">{fmt(parseFloat(so.total_amount))}</p>
                        )}
                        <StatusBadge status={so.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column: Fast Moving Products + Recent Payments */}
        <div className="space-y-5">

          {/* Fast Moving Products */}
          <Card className="shadow-sm border-slate-100">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800">Top Selling Products</h3>
                <Package className="w-4 h-4 text-slate-300" />
              </div>
              {inventoryInsights?.fastMoving?.length > 0 ? (
                <div className="space-y-3">
                  {inventoryInsights.fastMoving.map((item, i) => {
                    const max = inventoryInsights.fastMoving[0]?.qty || 1;
                    const pct = Math.round((item.qty / max) * 100);
                    const colors = ["bg-indigo-500", "bg-purple-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold text-slate-700 truncate max-w-[70%]">{item.name}</p>
                          <p className="text-xs font-bold text-slate-500">{item.qty} units</p>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div
                            className={`${colors[i % colors.length]} h-1.5 rounded-full transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-4">No outbound movement data available</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Payments */}
          <Card className="shadow-sm border-slate-100">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800">Recent Payments</h3>
                <button
                  id="btn-view-payments"
                  onClick={() => navigate("/sales/payments")}
                  className="text-xs font-bold text-indigo-600 hover:underline"
                >
                  View all
                </button>
              </div>
              {recentPayments.length > 0 ? (
                <div className="space-y-2">
                  {recentPayments.map((pay, i) => (
                    <div
                      key={pay.id || i}
                      className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center
                          ${pay.status === "Confirmed" || pay.status === "confirmed"
                            ? "bg-emerald-100 text-emerald-600"
                            : "bg-amber-100 text-amber-600"}`}
                        >
                          {pay.status === "Confirmed" || pay.status === "confirmed"
                            ? <CheckCircle className="w-3.5 h-3.5" />
                            : <Clock className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">
                            {pay.customer_name || `SO #${pay.so_id || pay.sales_order}`}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {pay.created_at ? new Date(pay.created_at).toLocaleDateString() : ""}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-slate-800">
                          {fmt(parseFloat(pay.amount || pay.total_amount || 0))}
                        </p>
                        <StatusBadge status={pay.status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-5 text-center">
                  <CreditCard className="w-8 h-8 text-slate-200 mb-2" />
                  <p className="text-xs text-slate-400">No payments recorded yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Recent Customer Purchase Requests ── */}
      <Card className="shadow-sm border-slate-100">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-slate-800">Customer Purchase Requests</h3>
              <p className="text-xs text-slate-400 mt-0.5">Latest CPRs from your customers</p>
            </div>
            <button
              id="btn-view-all-cprs"
              onClick={() => navigate("/sales/purchase-requests")}
              className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-1.5"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Manage CPRs
            </button>
          </div>

          {recentCPRs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">CPR ID</th>
                    <th className="pb-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer</th>
                    <th className="pb-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product</th>
                    <th className="pb-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Qty</th>
                    <th className="pb-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="pb-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentCPRs.map((cpr, i) => (
                    <tr key={cpr.cpr_id || i} className="group hover:bg-slate-50 transition-colors">
                      <td className="py-3 font-semibold text-indigo-600">
                        #{cpr.cpr_id || cpr.id}
                      </td>
                      <td className="py-3 text-slate-700">
                        {cpr.customer_name || cpr.customer || "—"}
                      </td>
                      <td className="py-3 text-slate-600 truncate max-w-[200px]">
                        {cpr.product_name || cpr.product || "—"}
                      </td>
                      <td className="py-3 text-slate-700 font-medium">
                        {cpr.quantity || "—"}
                      </td>
                      <td className="py-3">
                        <StatusBadge status={cpr.status} />
                      </td>
                      <td className="py-3 text-slate-400 text-xs">
                        {cpr.created_at ? new Date(cpr.created_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                <AlertCircle className="w-7 h-7 text-indigo-300" />
              </div>
              <h4 className="text-sm font-semibold text-slate-600 mb-1">No Customer Purchase Requests</h4>
              <p className="text-xs text-slate-400 max-w-xs">
                When customers raise purchase requests, they will appear here for you to process.
              </p>
              <button
                onClick={() => navigate("/sales/purchase-requests")}
                className="mt-4 px-5 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-black transition-all"
              >
                Go to CPRs
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
