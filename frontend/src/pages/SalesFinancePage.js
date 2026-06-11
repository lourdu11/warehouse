/**
 * SalesFinancePage.js
 *
 * Finance Director dashboard for Sales Order payments:
 *   1. Awaiting Initial Payment — Record initial customer payment directly
 *   2. Pending Balances — Record final balance payments for dispatched orders
 *   3. Payment History — View previously verified payments
 */
import React, { useState, useEffect, useCallback } from "react";
import { useToast } from "../components/ui/use-toast";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import {
  DollarSign, RefreshCw, Loader2, CreditCard, History, User, Calendar, Check, Wallet, Info
} from "lucide-react";
import { apiRequest, listSOPayments } from "../services/apiService";

const toArr = (r) => {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  for (const k of ["results", "products", "data", "items"]) if (Array.isArray(r[k])) return r[k];
  return [];
};

function RecordPaymentDialog({ so, onClose, onRecorded }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [paymentType, setPaymentType] = useState("");
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
      toast({ title: "Payment Recorded ✅", description: "Fulfillment flow has been unlocked for Pick & Pack." });
      onRecorded();
      onClose();
    } catch (err) {
      toast({ title: "Failed to record payment", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#1E3A8A]">
            <DollarSign className="w-5 h-5" /> Record Initial Payment — {so.so_id}
          </DialogTitle>
          <DialogDescription>Enter payment details received from customer. This will release the order to Pick & Pack.</DialogDescription>
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
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${paymentType === val ? "border-[#1E3A8A] bg-blue-50 text-[#1E3A8A]" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
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
            <Input placeholder="e.g. Bank transfer ref, Cheque no., UPI reference…" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-[#1E3A8A] hover:bg-[#162d6e]">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Recording…</> : <><Check className="w-4 h-4 mr-2" />Confirm & Release</>}
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
      toast({ title: "Balance Payment Recorded ✅", description: "Balance payment has been recorded successfully." });
      onRecorded();
      onClose();
    } catch (err) {
      toast({ title: "Failed to record balance", description: err.message, variant: "destructive" });
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
          <DialogDescription>Record final or installment balance payment received for dispatched order.</DialogDescription>
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
            <Input placeholder="e.g. Transaction ref, Cheque no…" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-[#1E3A8A] hover:bg-[#162d6e]">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Recording…</> : <><Wallet className="w-4 h-4 mr-2" />Record Payment</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SalesFinancePage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("pending");
  const [sos, setSOs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [recordPaymentFor, setRecordPaymentFor] = useState(null);
  const [recordBalanceFor, setRecordBalanceFor] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const soData = await apiRequest("/sales/so/", "GET");
      setSOs(toArr(soData));
      
      const payData = await listSOPayments(true);
      setPayments(toArr(payData));
    } catch (err) {
      toast({ title: "Failed to load data", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const pendingPaymentSOs = sos.filter(s => s.status === "Supervisor Approved");
  const pendingBalanceSOs = sos.filter(s => 
    s.status === "Dispatched" && 
    s.payment_info && 
    parseFloat(s.payment_info.balance_due) > 0
  );
  const confirmedPayments = payments.filter(p => p.finance_confirmed);

  const TABS = [
    { id: "pending", label: "Initial Payments", icon: CreditCard, count: pendingPaymentSOs.length },
    { id: "balance", label: "Pending Balances", icon: Wallet,     count: pendingBalanceSOs.length },
    { id: "history", label: "History Log",       icon: History,    count: confirmedPayments.length },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-[#1E3A8A]" /> Customer Payments & Sales Finance
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Directly record and verify customer receipts to authorize order dispatch</p>
        </div>
        <Button size="sm" variant="outline" className="h-9 text-xs" onClick={loadData}>
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? "bg-white text-[#1E3A8A] shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1 ${tab === t.id ? "bg-[#1E3A8A] text-white" : "bg-gray-200 text-gray-700"}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Initial Payments Tab ── */}
      {tab === "pending" && (
        <Card className="shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#1E3A8A]" /> Action Required — Initial Payment Setup
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">SO ID</TableHead>
                  <TableHead className="text-xs font-semibold">Customer</TableHead>
                  <TableHead className="text-xs font-semibold">Product Requested</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Order Quantity</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Order Total</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
                ) : pendingPaymentSOs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-gray-400">No sales orders awaiting initial payment recording.</TableCell></TableRow>
                ) : pendingPaymentSOs.map(s => (
                  <TableRow key={s.so_id} className="hover:bg-muted/20">
                    <TableCell className="text-xs font-mono font-bold text-[#1E3A8A]">{s.so_id}</TableCell>
                    <TableCell>
                      <div className="text-xs font-semibold">{s.customer_name}</div>
                      <div className="text-[10px] text-gray-500">{s.customer_phone}</div>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{s.product_name}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{s.quantity} units</TableCell>
                    <TableCell className="text-xs text-right font-bold tabular-nums text-slate-800">
                      ₹{parseFloat(s.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                        onClick={() => { setRecordPaymentFor(s); }}
                      >
                        <CreditCard className="w-3.5 h-3.5 mr-1" /> Record Payment
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ── Pending Balances Tab ── */}
      {tab === "balance" && (
        <Card className="shadow-sm overflow-hidden border-amber-200">
          <div className="px-4 py-3 border-b bg-amber-50">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-700" /> Action Required — Record Outstanding Balances
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-amber-50/20">
                  <TableHead className="text-xs font-semibold">SO ID</TableHead>
                  <TableHead className="text-xs font-semibold">Customer</TableHead>
                  <TableHead className="text-xs font-semibold">Product</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Order Value</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Paid Value</TableHead>
                  <TableHead className="text-xs font-semibold text-right text-amber-700">Remaining Balance</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
                ) : pendingBalanceSOs.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-gray-400">No dispatched orders with pending balance payments.</TableCell></TableRow>
                ) : pendingBalanceSOs.map(s => (
                  <TableRow key={s.so_id} className="hover:bg-amber-50/20">
                    <TableCell className="text-xs font-mono font-bold text-[#1E3A8A]">{s.so_id}</TableCell>
                    <TableCell className="text-xs font-semibold">{s.customer_name}</TableCell>
                    <TableCell className="text-xs">{s.product_name}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      ₹{parseFloat(s.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums text-emerald-700 font-medium">
                      ₹{parseFloat(s.payment_info?.amount_received || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums font-bold text-amber-700 bg-amber-50/30">
                      ₹{parseFloat(s.payment_info?.balance_due || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                        onClick={() => { setRecordBalanceFor(s); }}
                      >
                        <Wallet className="w-3.5 h-3.5 mr-1" /> Record Balance
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ── Confirmed History Tab ── */}
      {tab === "history" && (
        <Card className="shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-700" /> Payment History Log
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">Payment ID</TableHead>
                  <TableHead className="text-xs font-semibold">SO ID</TableHead>
                  <TableHead className="text-xs font-semibold">Customer</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Order Value</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Received Amount</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Balance</TableHead>
                  <TableHead className="text-xs font-semibold">Type</TableHead>
                  <TableHead className="text-xs font-semibold">Confirmed By</TableHead>
                  <TableHead className="text-xs font-semibold">Confirmed Date</TableHead>
                  <TableHead className="text-xs font-semibold">Finance Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
                ) : confirmedPayments.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-gray-400">No confirmed payment logs found.</TableCell></TableRow>
                ) : confirmedPayments.map(p => (
                  <TableRow key={p.payment_id} className="hover:bg-muted/20">
                    <TableCell className="text-xs font-mono font-bold text-gray-500">{p.payment_id}</TableCell>
                    <TableCell className="text-xs font-mono text-[#1E3A8A] font-bold">{p.so}</TableCell>
                    <TableCell className="text-xs font-medium">{p.customer_name || "—"}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      ₹{parseFloat(p.so_total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums font-bold text-emerald-800">
                      ₹{parseFloat(p.amount_received || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      ₹{parseFloat(p.balance_due || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="capitalize text-xs font-semibold">{p.payment_type}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-gray-400" />
                        {p.finance_confirmed_by_name || "Finance Director"}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {p.confirmed_at ? new Date(p.confirmed_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-gray-600 italic max-w-[150px] truncate" title={p.finance_notes}>{p.finance_notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Dialogs */}
      {recordPaymentFor && (
        <RecordPaymentDialog
          so={recordPaymentFor}
          onClose={() => setRecordPaymentFor(null)}
          onRecorded={loadData}
        />
      )}

      {recordBalanceFor && (
        <RecordBalancePaymentDialog
          so={recordBalanceFor}
          onClose={() => setRecordBalanceFor(null)}
          onRecorded={loadData}
        />
      )}
    </div>
  );
}
