/**
 * SalesAwaitingConfirmationPage.js
 *
 * Finance Director page for pending customer payments:
 *   1. Initial Payments Awaiting Recording (Supervisor Approved)
 *   2. Pending Balances Awaiting Recording (Dispatched with Balance Due)
 */
import React, { useState, useEffect, useCallback } from "react";
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
import {
  CreditCard, RefreshCw, Loader2, DollarSign, Wallet, Check
} from "lucide-react";
import { apiRequest } from "../services/apiService";

const toArr = (r) => {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  for (const k of ["results", "data", "items"]) if (Array.isArray(r[k])) return r[k];
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
      toast({ title: "Payment Recorded ✅", description: "Fulfillment flow has been unlocked." });
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
            <DollarSign className="w-5 h-5" /> Record Initial Payment — {so.so_id}
          </DialogTitle>
          <DialogDescription>Enter payment details. This will release the order to Pick & Pack.</DialogDescription>
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
            <Input placeholder="e.g. Transaction reference, Cheque no…" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-[#1E3A8A] hover:bg-[#162d6e]">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Recording…</> : <><Check className="w-4 h-4 mr-2" />Record Payment</>}
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
            <Input placeholder="e.g. UPI transaction ID, bank ref…" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} />
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

export default function SalesAwaitingConfirmationPage() {
  const { toast } = useToast();
  const [sos, setSOs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recordPaymentFor, setRecordPaymentFor] = useState(null);
  const [recordBalanceFor, setRecordBalanceFor] = useState(null);

  const loadSOs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/sales/so/", "GET");
      setSOs(toArr(data));
    } catch (err) {
      toast({ title: "Failed to load orders", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadSOs(); }, [loadSOs]);

  const pendingPaymentSOs = sos.filter(s => s.status === "Supervisor Approved");
  const pendingBalanceSOs = sos.filter(s =>
    s.status === "Dispatched" &&
    s.payment_info &&
    parseFloat(s.payment_info.balance_due) > 0
  );

  const [activeTab, setActiveTab] = useState("initial");

  const TABS = [
    {
      id: "initial",
      label: "Initial Payments Awaiting Recording",
      icon: CreditCard,
      count: pendingPaymentSOs.length,
      badgeColor: "bg-purple-600",
      activeClass: "border-purple-600 text-purple-700 bg-purple-50",
      inactiveClass: "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50",
    },
    {
      id: "balance",
      label: "Outstanding Balances (Dispatched Orders)",
      icon: Wallet,
      count: pendingBalanceSOs.length,
      badgeColor: "bg-amber-500",
      activeClass: "border-amber-500 text-amber-700 bg-amber-50",
      inactiveClass: "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-[#1E3A8A]" /> Awaiting Payments & Balances
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Record customer initial and balance receipts to clear orders for dispatch</p>
        </div>
        <Button size="sm" variant="outline" className="h-9 text-xs" onClick={loadSOs}>
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-3 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all shadow-sm ${
              activeTab === tab.id ? tab.activeClass : tab.inactiveClass
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white ${tab.badgeColor}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Initial Payments Tab */}
      {activeTab === "initial" && (
        <Card className="shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-purple-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-purple-800 uppercase tracking-wide flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-purple-600" /> Initial Payments Awaiting Recording
            </p>
            <span className="bg-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingPaymentSOs.length}</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">SO ID</TableHead>
                  <TableHead className="text-xs font-semibold">Customer</TableHead>
                  <TableHead className="text-xs font-semibold">Product</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Qty</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Order Total</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
                ) : pendingPaymentSOs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-gray-400">No initial payments pending.</TableCell></TableRow>
                ) : pendingPaymentSOs.map(s => (
                  <TableRow key={s.so_id} className="hover:bg-purple-50/30">
                    <TableCell className="text-xs font-mono font-bold text-[#1E3A8A]">{s.so_id}</TableCell>
                    <TableCell className="text-xs font-semibold">{s.customer_name}</TableCell>
                    <TableCell className="text-xs">{s.product_name}</TableCell>
                    <TableCell className="text-xs text-right">{s.quantity} units</TableCell>
                    <TableCell className="text-xs text-right font-bold">₹{parseFloat(s.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                        onClick={() => setRecordPaymentFor(s)}
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

      {/* Outstanding Balances Tab */}
      {activeTab === "balance" && (
        <Card className="shadow-sm overflow-hidden border-amber-200">
          <div className="px-4 py-3 border-b bg-amber-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-700" /> Outstanding Balances (Dispatched Orders)
            </p>
            <span className="bg-amber-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingBalanceSOs.length}</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-amber-50/20">
                  <TableHead className="text-xs font-semibold">SO ID</TableHead>
                  <TableHead className="text-xs font-semibold">Customer</TableHead>
                  <TableHead className="text-xs font-semibold">Product</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Order Total</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Amount Paid</TableHead>
                  <TableHead className="text-xs font-semibold text-right text-amber-700">Balance Due</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
                ) : pendingBalanceSOs.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-gray-400">No pending balances.</TableCell></TableRow>
                ) : pendingBalanceSOs.map(s => (
                  <TableRow key={s.so_id} className="hover:bg-amber-50/20">
                    <TableCell className="text-xs font-mono font-bold text-[#1E3A8A]">{s.so_id}</TableCell>
                    <TableCell className="text-xs font-semibold">{s.customer_name}</TableCell>
                    <TableCell className="text-xs">{s.product_name}</TableCell>
                    <TableCell className="text-xs text-right">₹{parseFloat(s.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-xs text-right text-emerald-700">₹{parseFloat(s.payment_info?.amount_received || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-xs text-right font-bold text-amber-700 bg-amber-50/30">₹{parseFloat(s.payment_info?.balance_due || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                        onClick={() => setRecordBalanceFor(s)}
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

      {/* Dialogs */}
      {recordPaymentFor && (
        <RecordPaymentDialog
          so={recordPaymentFor}
          onClose={() => setRecordPaymentFor(null)}
          onRecorded={loadSOs}
        />
      )}

      {recordBalanceFor && (
        <RecordBalancePaymentDialog
          so={recordBalanceFor}
          onClose={() => setRecordBalanceFor(null)}
          onRecorded={loadSOs}
        />
      )}
    </div>
  );
}
