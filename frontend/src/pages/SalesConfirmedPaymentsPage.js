/**
 * SalesConfirmedPaymentsPage.js
 * Standalone page for Finance Director — Confirmed Payments tab
 */
import React, { useState, useEffect, useCallback } from "react";
import { useToast } from "../components/ui/use-toast";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  History, RefreshCw, Loader2, User, Calendar,
} from "lucide-react";
import { listSOPayments } from "../services/apiService";

const toArr = (r) => {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  for (const k of ["results", "data", "items"]) if (Array.isArray(r[k])) return r[k];
  return [];
};

export default function SalesConfirmedPaymentsPage() {
  const { toast } = useToast();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSOPayments(true);
      setPayments(toArr(data));
    } catch (err) {
      toast({ title: "Failed to load payments", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  const confirmedPayments = payments.filter(p => p.finance_confirmed);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <History className="w-6 h-6 text-[#1E3A8A]" /> Confirmed Payments
            <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-1">{confirmedPayments.length}</span>
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">All verified and confirmed payment records</p>
        </div>
        <Button size="sm" variant="outline" className="h-9 text-xs" onClick={loadPayments}>
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

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
    </div>
  );
}
