/**
 * SupervisorOrderApprovalPage.js
 *
 * Supervisor dashboard:
 *   - Lists Sales Orders pending supervisor confirmation
 *   - Allows supervisor to Approve or Reject Sales Orders with notes
 */
import React, { useState, useEffect, useCallback } from "react";
import { useToast } from "../components/ui/use-toast";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import {
  ClipboardCheck, RefreshCw, Loader2, CheckCircle2, XCircle, Clock, ShieldCheck, User, Package, FileText,
} from "lucide-react";
import { listSalesOrders, supervisorActionSO } from "../services/apiService";

const toArr = (r) => {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  for (const k of ["results", "data", "items"]) if (Array.isArray(r[k])) return r[k];
  return [];
};

export default function SupervisorOrderApprovalPage() {
  const { toast } = useToast();
  const [sos, setSOs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [actionSO, setActionSO] = useState(null); // SO object
  const [actionType, setActionType] = useState(""); // "approve" or "reject"
  const [actionNotes, setActionNotes] = useState("");
  const [savingAction, setSavingAction] = useState(false);

  const loadSOs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSalesOrders();
      setSOs(toArr(data));
    } catch (err) {
      toast({ title: "Failed to load Sales Orders", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSOs();
  }, [loadSOs]);

  const handleSubmit = async () => {
    if (!actionSO || !actionType) return;
    if (actionType === "reject" && !actionNotes.trim()) {
      toast({ title: "Validation Error", description: "Please enter a reason for rejecting the Sales Order.", variant: "destructive" });
      return;
    }

    setSavingAction(true);
    try {
      await supervisorActionSO(actionSO.so_id, {
        action: actionType,
        notes: actionNotes,
      });
      toast({
        title: actionType === "approve" ? "Order Approved ✅" : "Order Rejected ❌",
        description: `Successfully processed Sales Order ${actionSO.so_id}.`,
      });
      setActionSO(null);
      setActionNotes("");
      loadSOs();
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingAction(false);
    }
  };

  const pendingSOs = sos.filter(s => s.status === "Pending Supervisor");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#1E3A8A]" /> Outbound Order Approvals
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Review and approve Sales Orders before they are sent to customers for payment</p>
        </div>
        <Button size="sm" variant="outline" className="h-9 text-xs" onClick={loadSOs}>
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-[#1E3A8A]" /> Pending Approvals
            <span className="bg-[#1E3A8A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {pendingSOs.length}
            </span>
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">SO ID</TableHead>
                <TableHead className="text-xs font-semibold">CPR ID</TableHead>
                <TableHead className="text-xs font-semibold">Customer</TableHead>
                <TableHead className="text-xs font-semibold">Product Requested</TableHead>
                <TableHead className="text-xs font-semibold text-right">Qty</TableHead>
                <TableHead className="text-xs font-semibold text-right">Unit Price (₹)</TableHead>
                <TableHead className="text-xs font-semibold text-right">Total Amount (₹)</TableHead>
                <TableHead className="text-xs font-semibold text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
              ) : pendingSOs.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-gray-400">No Sales Orders currently pending your approval.</TableCell></TableRow>
              ) : pendingSOs.map(s => (
                <TableRow key={s.so_id} className="hover:bg-muted/20">
                  <TableCell className="text-xs font-mono font-bold text-[#1E3A8A]">{s.so_id}</TableCell>
                  <TableCell className="text-xs font-mono text-gray-500">{s.cpr}</TableCell>
                  <TableCell>
                    <div className="text-xs font-semibold">{s.customer_name}</div>
                    <div className="text-[10px] text-gray-500">{s.customer_phone}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-semibold">{s.product_name}</div>
                    <div className="text-[10px] text-gray-400 font-mono">Product ID: {s.product}</div>
                  </TableCell>
                  <TableCell className="text-xs text-right font-medium tabular-nums">{s.quantity}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    ₹{parseFloat(s.unit_price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums font-bold text-[#1E3A8A]">
                    ₹{parseFloat(s.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1.5">
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => { setActionSO(s); setActionType("approve"); }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => { setActionSO(s); setActionType("reject"); }}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Action Dialog */}
      {actionSO && (
        <Dialog open onOpenChange={() => setActionSO(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className={`flex items-center gap-2 ${actionType === "approve" ? "text-emerald-700" : "text-red-700"}`}>
                {actionType === "approve" ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                {actionType === "approve" ? "Approve Sales Order" : "Reject Sales Order"}
              </DialogTitle>
              <DialogDescription>
                {actionType === "approve"
                  ? `Confirm approval for Sales Order ${actionSO.so_id}. This will notify the Sales Manager to collect payment from the customer.`
                  : `Specify why Sales Order ${actionSO.so_id} is being rejected.`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 mt-2">
              <div className="rounded-xl border bg-slate-50 p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">SO ID</span><span className="font-mono font-bold">{actionSO.so_id}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-semibold">{actionSO.customer_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Product</span><span className="font-medium">{actionSO.product_name}</span></div>
                <div className="flex justify-between border-t pt-2 font-bold"><span className="text-gray-600">Total Order Value</span><span className="text-[#1E3A8A] text-lg">₹{parseFloat(actionSO.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">Decision Notes {actionType === "reject" && "*"}</Label>
                <textarea
                  className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder={actionType === "approve" ? "e.g. Terms reviewed. Pricing is correct. Approved for outbound processing." : "e.g. Inbound supplier delay makes fulfilling this date impossible. Adjust qty or price."}
                  value={actionNotes}
                  onChange={e => setActionNotes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="mt-4 gap-2">
              <Button variant="outline" onClick={() => setActionSO(null)} disabled={savingAction}>Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={savingAction}
                className={actionType === "approve" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
              >
                {savingAction ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</>
                ) : actionType === "approve" ? (
                  <><CheckCircle2 className="w-4 h-4 mr-2" />Approve Order</>
                ) : (
                  <><XCircle className="w-4 h-4 mr-2" />Reject Order</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
