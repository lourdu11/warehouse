/**
 * SalesOrdersPage.js
 * Standalone page for Sales Manager — Sales Orders tab
 */
import { useState, useEffect, useCallback } from "react";
import { useToast } from "../components/ui/use-toast";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import {
  FileText, RefreshCw, Loader2, CreditCard, Clock, DollarSign,
} from "lucide-react";
import { apiRequest } from "../services/apiService";

const toArr = (r) => {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  for (const k of ["results", "products", "data", "items"]) if (Array.isArray(r[k])) return r[k];
  return [];
};

const STATUS_COLOR = {
  "Pending":             "bg-amber-100 text-amber-800 border-amber-300",
  "Stock Confirmed":     "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Stock Rejected":      "bg-red-100 text-red-800 border-red-300",
  "SO Created":          "bg-blue-100 text-blue-800 border-blue-300",
  "Pending Supervisor":  "bg-amber-100 text-amber-800 border-amber-300",
  "Supervisor Approved": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Supervisor Rejected": "bg-red-100 text-red-800 border-red-300",
  "Payment Pending":     "bg-purple-100 text-purple-800 border-purple-300",
  "Finance Confirmed":   "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Pick & Pack":         "bg-blue-100 text-blue-800 border-blue-300",
  "Dispatched":          "bg-teal-100 text-teal-800 border-teal-300",
};

const Pill = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_COLOR[status] || "bg-gray-100 text-gray-700 border-gray-300"}`}>
    {status === "Payment Pending" ? "Finance Review" : status}
  </span>
);



export default function SalesOrdersPage() {
  const { toast } = useToast();
  const [sos, setSOss] = useState([]);
  const [loadingSO, setLoadingSO] = useState(true);

  const loadSOs = useCallback(async () => {
    setLoadingSO(true);
    try { setSOss(toArr(await apiRequest("/sales/so/", "GET"))); }
    catch { /* silent */ } finally { setLoadingSO(false); }
  }, []);

  useEffect(() => { loadSOs(); }, [loadSOs]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#1E3A8A]" /> Sales Orders
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">View and manage all Sales Orders</p>
        </div>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#1E3A8A]" /> Sales Orders
            <span className="bg-[#1E3A8A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{sos.length}</span>
          </p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadSOs}>
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">SO ID</TableHead>
                <TableHead className="text-xs font-semibold">Customer</TableHead>
                <TableHead className="text-xs font-semibold">Product</TableHead>
                <TableHead className="text-xs font-semibold text-right">Qty</TableHead>
                <TableHead className="text-xs font-semibold text-right">Total (₹)</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold">Supervisor Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingSO ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
              ) : sos.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-gray-400">No Sales Orders yet.</TableCell></TableRow>
              ) : sos.map(s => (
                <TableRow key={s.so_id} className="hover:bg-muted/20">
                  <TableCell className="text-xs font-mono font-bold text-[#1E3A8A]">{s.so_id}</TableCell>
                  <TableCell>
                    <div className="text-xs font-semibold">{s.customer_name}</div>
                    <div className="text-[10px] text-gray-500">{s.customer_phone}</div>
                  </TableCell>
                  <TableCell className="text-xs font-medium">{s.product_name}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{s.quantity}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums font-semibold">
                    ₹{parseFloat(s.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell><Pill status={s.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
