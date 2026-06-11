import React from "react";
import { 
  Package, TrendingDown, Truck, Building2, 
  Search, ArrowRight, AlertTriangle, Boxes
} from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { useNavigate } from "react-router-dom";

export default function InventoryManagerDashboard({ stats, inventoryInsights, outboundStats }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Inventory KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Stock Items", value: stats.totalProducts, icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Low Stock Alert", value: stats.lowStock, icon: TrendingDown, color: "text-rose-600", bg: "bg-rose-50" },
          { label: "Active Suppliers", value: stats.totalSuppliers, icon: Truck, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "Incoming Orders", value: outboundStats.pending, icon: Boxes, color: "text-purple-600", bg: "bg-purple-50" },
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
        {/* Low Stock Watchlist */}
        <Card className="lg:col-span-2 shadow-sm border-slate-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">Critical Stock Watchlist</h3>
              <button onClick={() => navigate("/inventory")} className="text-xs font-bold text-indigo-600 hover:underline">View All</button>
            </div>
            <div className="space-y-3">
              {inventoryInsights.lowStockItems.length > 0 ? (
                inventoryInsights.lowStockItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-rose-200 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-rose-600 font-bold shadow-sm border border-rose-50">
                        {item.current_stock}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{item.product_name}</p>
                        <p className="text-xs text-slate-500">Product ID: {item.product_id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 bg-rose-50 text-rose-600 text-[10px] font-bold uppercase rounded-lg">Critical</span>
                      <button 
                        onClick={() => navigate("/purchase-requests")}
                        className="p-2 bg-white rounded-lg text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-all shadow-sm"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center text-slate-400 italic text-sm">No low stock items detected.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Tools */}
        <Card className="shadow-sm border-slate-100">
          <CardContent className="p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Inventory Tools</h3>
            <div className="space-y-3">
              <button 
                onClick={() => navigate("/products/create")}
                className="w-full flex items-center justify-between p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                    <Package className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold">Add New Product</span>
                </div>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              
              <button 
                onClick={() => navigate("/vendors")}
                className="w-full flex items-center justify-between p-4 bg-slate-800 text-white rounded-2xl hover:bg-slate-900 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold">Manage Vendors</span>
                </div>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3 mt-4">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">Stock Warning</p>
                  <p className="text-xs text-amber-700 leading-relaxed">System predicts 3 more items will reach critical level by Friday.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
