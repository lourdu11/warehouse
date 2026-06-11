/**
 * SalesPaymentsPage.js
 * Standalone page for Sales Manager — Payments tab (now merged with Pending Balances)
 */
import { useState, useEffect, useCallback } from "react";
import { useToast } from "../components/ui/use-toast";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  CreditCard, RefreshCw, Loader2, DollarSign, Wallet
} from "lucide-react";
import { apiRequest } from "../services/apiService";

const toArr = (r) => {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  for (const k of ["results", "products", "data", "items"]) if (Array.isArray(r[k])) return r[k];
  return [];
};

const STATUS_META = {
  "Finance Review":    { bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200",  dot: "bg-purple-500"  },
  "Balance Pending":   { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-500"   },
  "Payment Completed": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  "Finance Confirmed": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  "Pick & Pack":       { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-500"    },
  "Dispatched":        { bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200",    dot: "bg-teal-500"    },
};

const Pill = ({ status, so }) => {
  let displayStatus = status;

  if (displayStatus === "Payment Pending") {
    displayStatus = "Finance Review";
  }

  if (so && so.status === "Finance Confirmed") {
    const hasBalance = so.payment_info && parseFloat(so.payment_info.balance_due) > 0;
    displayStatus = hasBalance ? "Balance Pending" : "Payment Completed";
  }

  const m = STATUS_META[displayStatus] || { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${m.bg} ${m.text} ${m.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {displayStatus}
    </span>
  );
};
function RecordPaymentDialog({ so, onClose, onRecorded }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [paymentType, setPaymentType] = useState(""); // Starts empty so user must select manually
  const [amountReceived, setAmountReceived] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const totalAmount = parseFloat(so.total_amount) || 0;
  const received = parseFloat(amountReceived) || 0;
  const balanceDue = (totalAmount - received).toFixed(2);

  const handleSubmit = async () => {
    if (!paymentType) {
      toast({ title: "Validation Error", description: "Please select a payment type.", variant: "destructive" });
      return;
    }
    if (!amountReceived || received <= 0) {
      toast({ title: "Validation Error", description: "Enter the amount received.", variant: "destructive" });
      return;
    }
    if (received > totalAmount) {
      toast({ title: "Validation Error", description: "Amount cannot exceed total order value.", variant: "destructive" });
      return;
    }
    if (paymentType === "full" && Math.abs(received - totalAmount) > 0.01) {
      toast({ title: "Validation Error", description: "Full payment must be exactly equal to the total order amount.", variant: "destructive" });
      return;
    }
    if (paymentType === "advance" && received >= totalAmount - 0.01) {
      toast({ title: "Validation Error", description: "Advance payment must be less than the total order amount.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/sales/so/${so.so_id}/payment/`, "POST", {
        payment_type: paymentType,
        amount_received: received,
        payment_notes: paymentNotes,
      });
      toast({ title: "Payment Recorded ✅", description: "Finance Director has been notified." });
      onRecorded();
      onClose();
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#1E3A8A]">
            <DollarSign className="w-5 h-5" /> Record Payment — {so.so_id}
          </DialogTitle>
          <DialogDescription>Enter payment details. Finance Director will confirm receipt.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="rounded-xl border bg-slate-50 p-3 text-sm flex justify-between items-center">
            <span className="text-gray-500">Total Order Amount</span>
            <span className="font-bold text-lg text-[#1E3A8A]">₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">Payment Type *</Label>
            <div className="flex gap-3">
              {[["full", "Full Payment", "💰"], ["advance", "Advance Payment", "💳"]].map(([val, label, icon]) => (
                <button
                  key={val}
                  onClick={() => { 
                    setPaymentType(val); 
                    if (val === "full") {
                      setAmountReceived(String(totalAmount)); 
                    } else {
                      setAmountReceived("");
                    }
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    paymentType === val 
                      ? "border-[#1E3A8A] bg-blue-50 text-[#1E3A8A]" 
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">Amount Received (₹) *</Label>
            <Input
              type="number" min="0" step="0.01"
              placeholder={`Max: ₹${totalAmount.toLocaleString("en-IN")}`}
              value={amountReceived}
              onChange={e => setAmountReceived(e.target.value)}
            />
          </div>
          {amountReceived && received > 0 && (
            <div className={`rounded-lg px-3 py-2 text-sm font-semibold flex justify-between ${parseFloat(balanceDue) > 0 ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"}`}>
              <span>Balance Due</span>
              <span>₹{parseFloat(balanceDue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Input placeholder="e.g. Cheque no., UPI reference…" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-[#1E3A8A] hover:bg-[#162d6e]">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Recording…</> : <><CreditCard className="w-4 h-4 mr-2" />Record Payment</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordBalancePaymentDialog({ so, onClose, onRecorded }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [amountReceived, setAmountReceived] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const balanceDue = parseFloat(so.payment_info?.balance_due) || 0;
  const received = parseFloat(amountReceived) || 0;
  const newBalanceDue = (balanceDue - received).toFixed(2);

  const handleSubmit = async () => {
    if (!amountReceived || received <= 0) {
      toast({ title: "Validation Error", description: "Enter the amount received.", variant: "destructive" });
      return;
    }
    if (received > balanceDue) {
      toast({ title: "Validation Error", description: "Amount cannot exceed balance due.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/sales/so/${so.so_id}/balance-payment/`, "POST", {
        amount: received,
        notes: paymentNotes,
      });
      toast({ title: "Balance Payment Recorded ✅", description: "Payment has been updated." });
      onRecorded();
      onClose();
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#1E3A8A]">
            <Wallet className="w-5 h-5" /> Record Balance Payment — {so.so_id}
          </DialogTitle>
          <DialogDescription>Record additional payment received from customer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="rounded-xl border bg-slate-50 p-3 text-sm flex justify-between items-center">
            <span className="text-gray-500">Current Balance Due</span>
            <span className="font-bold text-lg text-amber-600">₹{balanceDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">Amount Received (₹) *</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min="0" step="0.01"
                placeholder={`Max: ₹${balanceDue.toLocaleString("en-IN")}`}
                value={amountReceived}
                onChange={e => setAmountReceived(e.target.value)}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setAmountReceived(String(balanceDue))}>
                Full Balance
              </Button>
            </div>
          </div>
          
          {amountReceived && received > 0 && (
            <div className={`rounded-lg px-3 py-2 text-sm font-semibold flex justify-between ${parseFloat(newBalanceDue) > 0 ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"}`}>
              <span>New Balance Due</span>
              <span>₹{parseFloat(newBalanceDue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          
          <div className="grid gap-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Input placeholder="e.g. Cheque no., UPI reference…" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-[#1E3A8A] hover:bg-[#162d6e]">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Recording…</> : <><CreditCard className="w-4 h-4 mr-2" />Record Payment</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SalesPaymentsPage() {
  const { toast } = useToast();
  const [sos, setSOss] = useState([]);
  const [loadingSO, setLoadingSO] = useState(true);

  const loadSOs = useCallback(async () => {
    setLoadingSO(true);
    try {
      setSOss(toArr(await apiRequest("/sales/so/", "GET")));
    } catch {
      /* silent */
    } finally {
      setLoadingSO(false);
    }
  }, []);

  useEffect(() => {
    loadSOs();
  }, [loadSOs]);

  const paymentSOs = sos.filter(s =>
    ["Payment Pending", "Finance Confirmed", "Pick & Pack", "Dispatched"].includes(s.status)
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-[#1E3A8A]" /> Payments Ledger
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Track and view payment statuses of customer orders</p>
        </div>
        <Button size="sm" variant="outline" className="h-9 text-xs" onClick={loadSOs}>
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      <Card className="border border-slate-200/80 shadow-sm overflow-hidden rounded-xl bg-white">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-50 text-blue-700 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Order Payment History</h3>
              <p className="text-xs text-slate-500">Overview of all orders and their financial/fulfillment statuses</p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/75 hover:bg-slate-50/75 border-b border-slate-100">
                <TableHead className="text-xs font-semibold text-slate-600 px-5 py-3.5">SO ID</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 px-5 py-3.5">Customer</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 px-5 py-3.5">Product</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 px-5 py-3.5 text-right">Total Amount</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 px-5 py-3.5">Fulfillment Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 px-5 py-3.5">Payment Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingSO ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                    <span className="text-xs text-slate-400 mt-2 block">Loading payment history...</span>
                  </TableCell>
                </TableRow>
              ) : paymentSOs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    No payment records yet.
                  </TableCell>
                </TableRow>
              ) : (
                paymentSOs.map(s => (
                  <TableRow key={s.so_id} className="hover:bg-slate-50/50 border-b border-slate-100/80 transition-colors">
                    <TableCell className="px-5 py-4">
                      <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50/60 px-2 py-1 rounded-md border border-blue-100/50">
                        {s.so_id}
                      </span>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <div className="font-medium text-slate-800 text-xs">{s.customer_name}</div>
                    </TableCell>
                    <TableCell className="px-5 py-4 max-w-[240px] truncate">
                      <span className="text-slate-600 text-xs" title={s.product_name}>
                        {s.product_name}
                      </span>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-right">
                      <span className="text-xs font-bold text-slate-900">
                        ₹{parseFloat(s.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <Pill status={s.status} so={s} />
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      {s.payment_info ? (
                        <div className="inline-flex flex-col gap-1.5 p-2 rounded-lg bg-slate-50 border border-slate-100 min-w-[150px]">
                          <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-1">
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              s.payment_info.payment_type === "full" 
                                ? "bg-blue-100/80 text-blue-700" 
                                : "bg-amber-100/80 text-amber-700"
                            }`}>
                              {s.payment_info.payment_type}
                            </span>
                            {s.payment_info.finance_confirmed && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1 py-0.25 rounded">
                                ✓ Finance OK
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] space-y-0.5 text-slate-600">
                            <div className="flex justify-between">
                              <span>Received:</span>
                              <span className="font-semibold text-slate-800">₹{parseFloat(s.payment_info.amount_received || 0).toLocaleString("en-IN")}</span>
                            </div>
                            {parseFloat(s.payment_info.balance_due) > 0 && (
                              <div className="flex justify-between text-amber-600 font-semibold border-t border-dashed border-slate-200 pt-0.5 mt-0.5">
                                <span>Balance:</span>
                                <span>₹{parseFloat(s.payment_info.balance_due).toLocaleString("en-IN")}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
