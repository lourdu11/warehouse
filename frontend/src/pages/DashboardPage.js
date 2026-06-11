import { useState, useEffect } from "react";
import { useAuth } from "../components/lib/auth-context";
import { Loader2, Activity } from "lucide-react";
import {
  listProducts,
  listPurchaseRequests,
  listVendors,
  listEmployees,
  listPurchaseOrders,
  listASN,
  listGRNs,
  listGRNItems,
  listStockMovements,
  listInventoryRows,
  listCustomers,
  listCPRs,
  listSalesOrders,
  listSOPayments,
} from "../services/apiService";

// Role-specific Dashboards
import AdminDashboard from "./dashboards/AdminDashboard";
import ManagerDashboard from "./dashboards/ManagerDashboard";
import SupervisorDashboard from "./dashboards/SupervisorDashboard";
import InventoryManagerDashboard from "./dashboards/InventoryManagerDashboard";
import QualityAssistantDashboard from "./dashboards/QualityAssistantDashboard";
import FinanceDirectorDashboard from "./dashboards/FinanceDirectorDashboard";
import SalesManagerDashboard from "./dashboards/SalesManagerDashboard";

// Normalise any API response shape to a plain array
const toArray = (res, knownKey = null) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (knownKey && Array.isArray(res[knownKey])) return res[knownKey];
  for (const key of ["results", "data", "items", "vendors", "products",
                      "suppliers", "employees"]) {
    if (Array.isArray(res[key])) return res[key];
  }
  return Object.values(res).find(Array.isArray) || [];
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalProducts:  0,
    pendingPRs:     0,
    pendingQC:      0,
    totalSuppliers: 0,
    totalVendors:   0,
    totalEmployees: 0,
    totalInventory: 0,
    prToday: 0,
    poToday: 0,
    grnToday: 0,
    rejectedToday: 0,
    pendingDispatch: 0,
    lowStock: 0,
    // Sales Manager stats
    totalCustomers: 0,
    pendingCPRs: 0,
    activeSalesOrders: 0,
    pendingPayments: 0,
    dispatchedOrders: 0,
    totalSalesRevenue: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState([]);
  const [trackingFlow, setTrackingFlow] = useState([]);
  const [qcData, setQcData] = useState([]);
  const [inventoryInsights, setInventoryInsights] = useState({ lowStockItems: [], fastMoving: [] });
  const [outboundStats, setOutboundStats] = useState({ pending: 0, shippedToday: 0, delayed: 0 });
  const [salesData, setSalesData] = useState({
    recentCPRs: [],
    recentSalesOrders: [],
    salesPipeline: [],
    recentPayments: [],
  });

  useEffect(() => { 
    loadDashboardData(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [
        productsRes, prsRes, vendorsRes, employeesRes,
        posRes, asnRes, grnsRes, grnItemsRes, movementsRes, inventoryRes,
        customersRes, cprsRes, salesOrdersRes, paymentsRes
      ] = await Promise.allSettled([
        listProducts(),
        listPurchaseRequests(),
        listVendors(),
        listEmployees(),
        listPurchaseOrders(),
        listASN(),
        listGRNs(),
        listGRNItems(),
        listStockMovements(),
        listInventoryRows(),
        listCustomers(),
        listCPRs(true),
        listSalesOrders(),
        listSOPayments(true),
      ]);

      const getValue = (s) => (s.status === "fulfilled" ? s.value : null);

      const productsData  = getValue(productsRes);
      const prsData       = getValue(prsRes);
      const posData       = getValue(posRes);
      const asnData       = getValue(asnRes);
      const grnsData      = getValue(grnsRes);
      const grnItemsData  = getValue(grnItemsRes);
      const movementsData = getValue(movementsRes);
      const inventoryData = getValue(inventoryRes);
      const customersData     = getValue(customersRes);
      const cprsData          = getValue(cprsRes);
      const salesOrdersData   = getValue(salesOrdersRes);
      const paymentsData      = getValue(paymentsRes);

      const productList  = toArray(productsData, "products");
      let prList       = toArray(prsData);
      let poList       = toArray(posData);
      let asnList      = toArray(asnData);
      let grnList      = toArray(grnsData);
      let grnItemsList = toArray(grnItemsData);
      let movementList = toArray(movementsData);
      let inventoryList = toArray(inventoryData);

      // Filter data for non-admin users to show only their own actions/records
      if (user && user.role !== "admin") {
        const usernameLower = (user.username || "").toLowerCase();
        const userId = user.id;

        // 1. Filter PRs: Created by this user
        prList = prList.filter(pr => 
          pr.created_by_username?.toLowerCase() === usernameLower ||
          String(pr.created_by) === String(userId)
        );

        // 2. Filter POs: Linked to this user's PRs
        const myPrIds = new Set(prList.map(pr => pr.pr_id));
        poList = poList.filter(po => 
          myPrIds.has(po.pr_id) || 
          myPrIds.has(po.pr)
        );

        // 3. Filter ASNs: Linked to this user's POs
        const myPoIds = new Set(poList.map(po => po.po_id));
        asnList = asnList.filter(asn => 
          myPoIds.has(asn.po_id) || 
          myPoIds.has(asn.po)
        );

        // 4. Filter GRNs: Received by this user (supervisor), verified by this user (QC), or linked to this user's POs (manager)
        grnList = grnList.filter(grn => 
          grn.received_by_username?.toLowerCase() === usernameLower ||
          grn.qc_verified_by_username?.toLowerCase() === usernameLower ||
          myPoIds.has(grn.po_id)
        );

        // 5. Filter GRN Items: Linked to this user's GRNs, or rejection confirmed by this user
        const myGrnIds = new Set(grnList.map(g => g.grn_id));
        grnItemsList = grnItemsList.filter(item => 
          myGrnIds.has(item.grn) || 
          myGrnIds.has(item.grn_id) ||
          item.rejection_confirmed_by_username?.toLowerCase() === usernameLower
        );

        // 6. Filter Stock Movements & Inventory based on products in their PRs or GRN Items
        const myProductIds = new Set([
          ...prList.map(pr => pr.product || pr.product_id),
          ...grnItemsList.map(item => item.product || item.product_id)
        ].filter(Boolean));

        if (myProductIds.size > 0) {
          movementList = movementList.filter(m => 
            myProductIds.has(m.product) || 
            myProductIds.has(String(m.product)) ||
            myProductIds.has(m.product_id) ||
            myProductIds.has(String(m.product_id))
          );
          inventoryList = inventoryList.filter(row => {
            const pid = row.product || row.product_id || row.product?.product_id;
            return myProductIds.has(pid) || myProductIds.has(String(pid));
          });
        }
      }

      const isToday = (dateStr) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        const today = new Date();
        return d.getDate() === today.getDate() &&
               d.getMonth() === today.getMonth() &&
               d.getFullYear() === today.getFullYear();
      };

      const stockMap = inventoryList.reduce((acc, row) => {
        const pid = row.product_id || row.product?.product_id;
        if (!pid) return acc;
        acc[pid] = (acc[pid] || 0) + (row.quantity || 0);
        return acc;
      }, {});

      const prToday = prList.filter(pr => isToday(pr.created_at));
      const poToday = poList.filter(po => isToday(po.created_at));
      const grnToday = grnList.filter(grn => isToday(grn.created_at));
      const rejectedToday = grnItemsList.filter(item => (item.rejected_quantity > 0) && isToday(item.updated_at || item.created_at));
      
      const grnPoIds = new Set(grnList.map(g => g.po_id || g.po?.po_id));
      const pendingReceipts = poList.filter(po => !grnPoIds.has(po.po_id));
      
      const lowStockItems = productList.filter(p => {
        const stock = stockMap[p.product_id] || 0;
        return stock <= (p.re_order || 10);
      });
      
      const totalInventory = Object.values(stockMap).reduce((sum, qty) => sum + Math.max(0, qty), 0);

      // ── Sales Manager metrics ──
      const customerList    = toArray(customersData);
      const cprList         = toArray(cprsData);
      const salesOrderList  = toArray(salesOrdersData);
      const paymentList     = toArray(paymentsData);

      const pendingCPRs       = cprList.filter(c => c.status === "Pending" || c.status === "pending").length;
      const activeSalesOrders = salesOrderList.filter(so =>
        !["Dispatched", "Cancelled", "Completed"].includes(so.status)
      ).length;
      const dispatchedOrders  = salesOrderList.filter(so => so.status === "Dispatched").length;
      const pendingPayments   = paymentList.filter(p =>
        p.status === "Pending" || p.status === "Awaiting Confirmation"
      ).length;
      const totalSalesRevenue = paymentList
        .filter(p => p.status === "Confirmed" || p.status === "confirmed")
        .reduce((sum, p) => sum + parseFloat(p.amount || p.total_amount || 0), 0);

      setStats({
        totalProducts:  productList.length,
        pendingPRs:     prList.filter(pr => pr.status === "Pending" || pr.status === "Finance Pending").length,
        pendingQC:      grnItemsList.filter(i => i.qc_status === "Pending").length,
        totalSuppliers: 0,
        totalVendors:   toArray(getValue(vendorsRes), "vendors").length,
        totalEmployees: toArray(getValue(employeesRes)).length,
        totalInventory,
        prToday: prToday.length,
        poToday: poToday.length,
        grnToday: grnToday.length,
        rejectedToday: rejectedToday.length,
        pendingReceipts: pendingReceipts.length,
        lowStock: lowStockItems.length,
        // Sales Manager
        totalCustomers: customerList.length,
        pendingCPRs,
        activeSalesOrders,
        dispatchedOrders,
        pendingPayments,
        totalSalesRevenue,
      });

      // Build sales-specific state
      const recentCPRs = cprList
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5);
      const recentSalesOrders = salesOrderList
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5);
      const recentPayments = paymentList
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5);

      setSalesData({
        recentCPRs,
        recentSalesOrders,
        recentPayments,
        salesPipeline: [
          { label: "CPR",       count: cprList.length,                  color: "#6366F1" },
          { label: "Sales Order", count: salesOrderList.length,          color: "#8B5CF6" },
          { label: "Dispatched",  count: dispatchedOrders,               color: "#10B981" },
          { label: "Paid",        count: paymentList.filter(p => p.status === "Confirmed" || p.status === "confirmed").length, color: "#F59E0B" },
        ],
      });

      setTrackingFlow([
        { label: "PR", count: prList.length, color: "bg-blue-500" },
        { label: "PO", count: poList.length, color: "bg-indigo-500" },
        { label: "ASN", count: asnList.length, color: "bg-purple-500" },
        { label: "GRN", count: grnList.length, color: "bg-cyan-500" },
        { label: "QC", count: grnItemsList.filter(i => i.qc_status === "Pending").length, color: "bg-amber-500" },
        { label: "Stock", count: productList.filter(p => (stockMap[p.product_id] || 0) > 0).length, color: "bg-emerald-500" },
      ]);

      const qcAccepted = grnItemsList.reduce((sum, i) => sum + (i.accepted_quantity || 0), 0);
      const qcRejected = grnItemsList.reduce((sum, i) => sum + (i.rejected_quantity || 0), 0);
      setQcData([
        { name: "Accepted", value: qcAccepted, color: "#10B981" },
        { name: "Rejected", value: qcRejected, color: "#EF4444" },
      ]);

      const fastMoving = movementList
        .filter(m => m.movement_type === "OUTBOUND")
        .reduce((acc, m) => {
          const key = m.product_name || m.product?.product_name || "Unknown Product";
          if (!acc[key]) acc[key] = 0;
          acc[key] += Math.abs(m.quantity);
          return acc;
        }, {});
      
      const fastMovingSorted = Object.entries(fastMoving)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, qty]) => ({ name, qty }));

      setInventoryInsights({
        lowStockItems: lowStockItems.slice(0, 5).map(p => ({
          product_name: p.product_name,
          current_stock: stockMap[p.product_id] || 0,
          product_id: p.product_id
        })),
        fastMoving: fastMovingSorted,
      });

      const shippedToday = movementList.filter(m => m.movement_type === "OUTBOUND" && isToday(m.created_at)).length;
      setOutboundStats({
        pending: pendingReceipts.length,
        shippedToday,
        delayed: pendingReceipts.filter(po => {
          const created = new Date(po.created_at);
          const diff = (new Date() - created) / (1000 * 60 * 60 * 24);
          return diff > 3;
        }).length,
      });

      setRecentActivity(
        prList.slice(0, 5).map((pr) => ({
          time: pr.created_at ? new Date(pr.created_at).toLocaleString() : "Recently",
          text: `PR #${pr.pr_id} — ${pr.product_name || "Product"} (${pr.status})`,
          type: pr.status === "Approved" ? "success" : pr.status === "Rejected" ? "error" : "warning",
        }))
      );
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderRoleDashboard = () => {
    const role = user?.role;
    const props = { stats, isLoading, recentActivity, trackingFlow, qcData, inventoryInsights, outboundStats };

    switch (role) {
      case "admin":
        return <AdminDashboard {...props} />;
      case "manager":
        return <ManagerDashboard {...props} />;
      case "supervisor":
        return <SupervisorDashboard {...props} />;
      case "inventory_manager":
        return <InventoryManagerDashboard {...props} />;
      case "quality_assistant":
      case "quality_checker":
        return <QualityAssistantDashboard {...props} />;
      case "finance_director":
        return <FinanceDirectorDashboard {...props} />;
      case "sales_manager":
        return <SalesManagerDashboard stats={stats} salesData={salesData} inventoryInsights={inventoryInsights} isLoading={isLoading} />;
      default:
        return <ManagerDashboard {...props} />;
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Warehouse Command Center
          </h1>
          <p className="text-sm text-slate-500">
            Welcome back, <span className="font-semibold text-indigo-600">{user?.name}</span> • <span className="capitalize">{user?.role?.replace(/_/g, ' ')}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-full flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">System Live</span>
          </div>
          <button 
            onClick={() => loadDashboardData()}
            className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
          >
            <Activity className={`w-4 h-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading && stats.totalProducts === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
          <p className="text-sm text-slate-500 font-medium">Synchronizing warehouse operations...</p>
        </div>
      ) : (
        <div className="animate-in fade-in duration-500">
          {renderRoleDashboard()}
        </div>
      )}
    </div>
  );
}