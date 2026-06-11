/**
 * InventoryStockCheckPage.js
 *
 * Dashboard for Inventory Manager:
 *   1. CPR Stock Check — Confirm or Reject stock availability for pending requests
 *      - Shows real-time available stock vs requested qty
 *      - Blocks confirmation if stock is insufficient
 */
import React, { useState, useEffect, useCallback } from "react";
import { useToast } from "../components/ui/use-toast";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import {
  CheckSquare, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle, PackageOpen,
} from "lucide-react";
import { listCPRs, inventoryActionCPR, listProducts } from "../services/apiService";

// ── helpers ──────────────────────────────────────────────────────────────────
const toArr = (r) => {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  for (const k of ["results", "data", "items", "products"]) if (Array.isArray(r[k])) return r[k];
  return [];
};

const STATUS_COLOR = {
  "Pending":           "bg-amber-100 text-amber-800 border-amber-300",
  "Stock Confirmed":   "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Stock Rejected":    "bg-red-100 text-red-800 border-red-300",
  "SO Created":        "bg-blue-100 text-blue-800 border-blue-300",
  "Finance Confirmed": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Pick & Pack":       "bg-blue-100 text-blue-800 border-blue-300",
  "Dispatched":        "bg-teal-100 text-teal-800 border-teal-300",
};

const Pill = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_COLOR[status] || "bg-gray-100 text-gray-700 border-gray-300"}`}>
    {status}
  </span>
);

/* ── Stock Availability Badge ── */
function StockBadge({ available, requested, loading }) {
  if (loading) return <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />;

  const sufficient = available >= requested;
  return (
    <div className="text-xs space-y-0.5">
      <div className={`font-bold text-sm ${sufficient ? "text-emerald-600" : "text-red-600"}`}>
        {available} units
      </div>
      <div className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-block border ${
        sufficient
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-red-50 text-red-700 border-red-200"
      }`}>
        {sufficient ? "✅ Sufficient" : "❌ Insufficient"}
      </div>
    </div>
  );
}

export default function InventoryStockCheckPage() {
  const { toast } = useToast();
  const [cprs, setCPRs] = useState([]);
  const [loadingCPR, setLoadingCPR] = useState(true);
  const [showAllCPRs, setShowAllCPRs] = useState(false);

  // Stock map: productId -> available_stock
  const [stockMap, setStockMap] = useState({});
  const [loadingStock, setLoadingStock] = useState(true);

  // Dialog state for CPR Action
  const [actionCPR, setActionCPR] = useState(null);
  const [actionType, setActionType] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [savingAction, setSavingAction] = useState(false);

  // Load all products once to build a productId -> total_stock map
  const loadStock = useCallback(async () => {
    setLoadingStock(true);
    try {
      const data = await listProducts();
      const arr = toArr(data);
      const map = {};
      arr.forEach(p => {
        // Key by product_id (e.g. "PRO001"), use total_stock = actual physical units in bins
        map[p.product_id] = p.total_stock ?? 0;
      });
      setStockMap(map);
    } catch {
      // silent — stock just won't show
    } finally {
      setLoadingStock(false);
    }
  }, []);

  const loadCPRs = useCallback(async () => {
    setLoadingCPR(true);
    try {
      const data = await listCPRs(showAllCPRs);
      setCPRs(toArr(data));
    } catch (err) {
      toast({ title: "Failed to load CPRs", description: err.message, variant: "destructive" });
    } finally {
      setLoadingCPR(false);
    }
  }, [showAllCPRs, toast]);

  useEffect(() => {
    loadCPRs();
    loadStock();
  }, [loadCPRs, loadStock]);

  const handleRefresh = () => {
    loadCPRs();
    loadStock();
  };

  const handleCPRSubmit = async () => {
    if (!actionCPR || !actionType) return;
    if (actionType === "reject" && !actionNotes.trim()) {
      toast({ title: "Validation Error", description: "Please enter a reason/note for rejection.", variant: "destructive" });
      return;
    }

    setSavingAction(true);
    try {
      await inventoryActionCPR(actionCPR.cpr_id, {
        action: actionType,
        notes: actionNotes,
      });
      toast({
        title: actionType === "confirm" ? "Stock Confirmed ✅" : "Stock Rejected ❌",
        description: `Successfully processed CPR ${actionCPR.cpr_id}.`,
      });
      setActionCPR(null);
      setActionNotes("");
      loadCPRs();
      loadStock();
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingAction(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-[#1E3A8A]" /> Stock Approvals
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Verify item availability for Customer Purchase Requests</p>
        </div>
      </div>

      {/* ── CPR Table ── */}
      <Card className="shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-[#1E3A8A]" /> Pending Customer Requests
            <span className="bg-[#1E3A8A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {cprs.filter(c => c.status === "Pending").length}
            </span>
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAllCPRs}
                onChange={e => { setShowAllCPRs(e.target.checked); }}
                className="rounded border-gray-300 text-[#1E3A8A] focus:ring-[#1E3A8A] w-3.5 h-3.5"
              />
              Show Historical CPRs
            </label>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleRefresh}>
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">CPR ID</TableHead>
                <TableHead className="text-xs font-semibold">Customer</TableHead>
                <TableHead className="text-xs font-semibold">Product Requested</TableHead>
                <TableHead className="text-xs font-semibold text-right">Requested Qty</TableHead>
                <TableHead className="text-xs font-semibold text-center">Available Stock</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold">Created By</TableHead>
                <TableHead className="text-xs font-semibold">Request Notes</TableHead>
                <TableHead className="text-xs font-semibold text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingCPR ? (
                <TableRow><TableCell colSpan={9} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
              ) : cprs.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-gray-400">No purchase requests to check at this time.</TableCell></TableRow>
              ) : cprs.map(c => {
                const available = stockMap[c.product] ?? 0;
                const sufficient = available >= c.requested_quantity;
                const isPending = c.status === "Pending";

                return (
                  <TableRow
                    key={c.cpr_id}
                    className={`hover:bg-muted/20 ${isPending && !sufficient ? "bg-red-50/30" : ""}`}
                  >
                    <TableCell className="text-xs font-mono font-bold text-[#1E3A8A]">{c.cpr_id}</TableCell>
                    <TableCell>
                      <div className="text-xs font-semibold">{c.customer_name}</div>
                      <div className="text-[10px] text-gray-500">{c.customer_phone}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-semibold">{c.product_name}</div>
                      <div className="text-[10px] font-mono text-gray-400">ID: {c.product}</div>
                    </TableCell>
                    <TableCell className="text-xs text-right font-bold tabular-nums text-[#1E3A8A]">
                      {c.requested_quantity}
                    </TableCell>
                    <TableCell className="text-center">
                      <StockBadge
                        available={available}
                        requested={c.requested_quantity}
                        loading={loadingStock}
                      />
                    </TableCell>
                    <TableCell><Pill status={c.status} /></TableCell>
                    <TableCell className="text-xs">{c.created_by_name || "Sales Manager"}</TableCell>
                    <TableCell className="text-xs text-gray-500 max-w-[160px] truncate" title={c.notes}>{c.notes || "—"}</TableCell>
                    <TableCell className="text-center">
                      {isPending ? (
                        <div className="flex flex-col items-center gap-1.5">
                          {/* Confirm — disabled if insufficient stock */}
                          <Button
                            size="sm"
                            className={`h-7 text-xs w-full ${
                              sufficient
                                ? "bg-emerald-600 hover:bg-emerald-700"
                                : "bg-gray-200 text-gray-400 cursor-not-allowed"
                            }`}
                            disabled={!sufficient || loadingStock}
                            title={!sufficient ? `Only ${available} units available. Cannot confirm ${c.requested_quantity} requested.` : ""}
                            onClick={() => { setActionCPR(c); setActionType("confirm"); }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            {sufficient ? "Confirm Stock" : "No Stock"}
                          </Button>

                          {/* Show warning if insufficient */}
                          {!sufficient && !loadingStock && (
                            <div className="flex items-center gap-1 text-[10px] text-red-600 font-semibold">
                              <AlertTriangle className="w-3 h-3" />
                              Need {c.requested_quantity - available} more
                            </div>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs w-full border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => { setActionCPR(c); setActionType("reject"); }}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 font-medium">
                          {c.inventory_notes || "Checked: No notes"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Action Confirmation Dialog ── */}
      {actionCPR && (
        <Dialog open onOpenChange={() => setActionCPR(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className={`flex items-center gap-2 ${actionType === "confirm" ? "text-emerald-700" : "text-red-700"}`}>
                {actionType === "confirm" ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                {actionType === "confirm" ? "Confirm Stock Availability" : "Reject Purchase Request"}
              </DialogTitle>
              <DialogDescription>
                {actionType === "confirm"
                  ? `You are confirming that ${actionCPR.requested_quantity} units of "${actionCPR.product_name}" are available in the warehouse and can be reserved for this customer.`
                  : `Please specify the reason why CPR ${actionCPR.cpr_id} cannot be fulfilled.`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 mt-2">
              {/* Summary */}
              <div className="rounded-xl border bg-slate-50 p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">CPR ID</span><span className="font-mono font-bold">{actionCPR.cpr_id}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Product</span><span className="font-semibold">{actionCPR.product_name}</span></div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Requested Qty</span>
                  <span className="font-bold text-[#1E3A8A]">{actionCPR.requested_quantity} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Available Stock</span>
                  <span className={`font-bold ${(stockMap[actionCPR.product] ?? 0) >= actionCPR.requested_quantity ? "text-emerald-600" : "text-red-600"}`}>
                    {stockMap[actionCPR.product] ?? 0} units
                  </span>
                </div>
                <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-medium">{actionCPR.customer_name}</span></div>
              </div>

              {/* Stock warning in dialog if confirming */}
              {actionType === "confirm" && (stockMap[actionCPR.product] ?? 0) >= actionCPR.requested_quantity && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <PackageOpen className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="text-xs text-emerald-700 font-medium">
                    Stock is sufficient. Confirming will reserve these items for this customer.
                  </p>
                </div>
              )}

              <div className="grid gap-1.5">
                <label className="text-xs font-semibold text-gray-700">
                  Notes / Remarks {actionType === "reject" && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder={
                    actionType === "confirm"
                      ? "e.g. Items verified in Zone B Bin 4. Stock checked and ready."
                      : "e.g. Insufficient stock. Next arrival expected next week."
                  }
                  value={actionNotes}
                  onChange={e => setActionNotes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="mt-4 gap-2">
              <Button variant="outline" onClick={() => setActionCPR(null)} disabled={savingAction}>Cancel</Button>
              <Button
                onClick={handleCPRSubmit}
                disabled={savingAction}
                className={actionType === "confirm" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
              >
                {savingAction ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</>
                ) : actionType === "confirm" ? (
                  <><CheckCircle2 className="w-4 h-4 mr-2" />Confirm Availability</>
                ) : (
                  <><XCircle className="w-4 h-4 mr-2" />Reject Request</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
