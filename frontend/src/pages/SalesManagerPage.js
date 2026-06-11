/**
 * SalesManagerPage.js
 *
 * Three-tab dashboard for Sales Manager:
 *   1. CPR  — Create & track Customer Purchase Requests
 *   2. SO   — Create Sales Orders from confirmed CPRs
 *   3. Payment — Record customer payment (full / advance)
 */
import { useState, useEffect, useCallback } from "react";
import { useToast } from "../components/ui/use-toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import {
  ShoppingCart, Plus, RefreshCw, Loader2, FileText, CreditCard,
  CheckCircle2, XCircle, Clock, Truck, DollarSign, User, Package,
} from "lucide-react";
import { apiRequest } from "../services/apiService";
import { listProducts } from "../services/apiService";

// ── helpers ──────────────────────────────────────────────────────────────────
const toArr = (r) => {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  for (const k of ["results", "products", "data", "items"]) if (Array.isArray(r[k])) return r[k];
  return [];
};

const STATUS_COLOR = {
  "Pending":           "bg-amber-100 text-amber-800 border-amber-300",
  "Stock Confirmed":   "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Stock Rejected":    "bg-red-100 text-red-800 border-red-300",
  "SO Created":        "bg-blue-100 text-blue-800 border-blue-300",
  "Pending Supervisor":"bg-amber-100 text-amber-800 border-amber-300",
  "Supervisor Approved":"bg-emerald-100 text-emerald-800 border-emerald-300",
  "Supervisor Rejected":"bg-red-100 text-red-800 border-red-300",
  "Payment Pending":   "bg-purple-100 text-purple-800 border-purple-300",
  "Finance Confirmed": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Pick & Pack":       "bg-blue-100 text-blue-800 border-blue-300",
  "Dispatched":        "bg-teal-100 text-teal-800 border-teal-300",
};

const Pill = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_COLOR[status] || "bg-gray-100 text-gray-700 border-gray-300"}`}>
    {status === "Payment Pending" ? "Finance Review" : status}
  </span>
);

// ── CPR Create Dialog ─────────────────────────────────────────────────────────
function CreateCPRDialog({ onClose, onCreated }) {
  const { toast } = useToast();
  const [products, setProducts] = useState([]);
  const [loadingProd, setLoadingProd] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_name: "", customer_phone: "", customer_email: "",
    customer_address: "", customer_gstin: "",
    product: "", requested_quantity: "", unit_price: "", notes: "",
  });

  useEffect(() => {
    listProducts()
      .then(r => setProducts(toArr(r)))
      .catch(() => toast({ title: "Error", description: "Failed to load products.", variant: "destructive" }))
      .finally(() => setLoadingProd(false));
  }, [toast]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const totalAmount = form.unit_price && form.requested_quantity
    ? (parseFloat(form.unit_price) * parseInt(form.requested_quantity)).toFixed(2)
    : "—";

  const handleSubmit = async () => {
    if (!form.customer_name || !form.customer_phone || !form.product || !form.requested_quantity || !form.unit_price) {
      toast({ title: "Validation Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/sales/cpr/", "POST", {
        ...form,
        requested_quantity: parseInt(form.requested_quantity),
        unit_price: parseFloat(form.unit_price),
      });
      toast({ title: "CPR Created ✅", description: "Inventory Manager has been notified to check stock." });
      onCreated();
      onClose();
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#1E3A8A]">
            <ShoppingCart className="w-5 h-5" /> Create Customer Purchase Request
          </DialogTitle>
          <DialogDescription>Fill in customer and product details. The Inventory Manager will be notified to verify stock.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mt-2">
          {/* Customer Info */}
          <div className="col-span-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Customer Information</p>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Customer Name *</Label>
            <Input placeholder="Full name" value={form.customer_name} onChange={set("customer_name")} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Phone *</Label>
            <Input placeholder="+91 XXXXX XXXXX" value={form.customer_phone} onChange={set("customer_phone")} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Email</Label>
            <Input type="email" placeholder="customer@email.com" value={form.customer_email} onChange={set("customer_email")} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">GSTIN</Label>
            <Input placeholder="15-digit GSTIN (optional)" value={form.customer_gstin} onChange={set("customer_gstin")} />
          </div>
          <div className="col-span-2 grid gap-1.5">
            <Label className="text-xs">Address</Label>
            <Input placeholder="Delivery address" value={form.customer_address} onChange={set("customer_address")} />
          </div>

          {/* Product Info */}
          <div className="col-span-2 mt-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Order Details</p>
          </div>
          <div className="col-span-2 grid gap-1.5">
            <Label className="text-xs">Product *</Label>
            {loadingProd ? (
              <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
            ) : (
              <select
                value={form.product}
                onChange={set("product")}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
              >
                <option value="">— Select product —</option>
                {products.map(p => (
                  <option key={p.product_id} value={p.product_id}>
                    {p.product_name} ({p.product_id})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Quantity (units) *</Label>
            <Input type="number" min="1" placeholder="e.g. 100" value={form.requested_quantity} onChange={set("requested_quantity")} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Unit Price (₹) *</Label>
            <Input type="number" min="0" step="0.01" placeholder="e.g. 250.00" value={form.unit_price} onChange={set("unit_price")} />
          </div>

          {totalAmount !== "—" && (
            <div className="col-span-2 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-blue-800">Total Order Amount</span>
              <span className="text-2xl font-bold text-blue-900">₹{parseFloat(totalAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
          )}

          <div className="col-span-2 grid gap-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Input placeholder="Any special requirements…" value={form.notes} onChange={set("notes")} />
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-[#1E3A8A] hover:bg-[#162d6e]">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : <><Plus className="w-4 h-4 mr-2" />Create CPR</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create SO Dialog ──────────────────────────────────────────────────────────
function CreateSODialog({ cpr, onClose, onCreated }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await apiRequest("/sales/so/", "POST", {
        cpr: cpr.cpr_id,
        product: cpr.product,
        quantity: cpr.requested_quantity,
        unit_price: cpr.unit_price,
      });
      toast({ title: "Sales Order Created ✅", description: "Supervisor has been notified for approval." });
      onCreated();
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
            <FileText className="w-5 h-5" /> Create Sales Order
          </DialogTitle>
          <DialogDescription>Review the details below and confirm to send for Supervisor approval.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="rounded-xl border bg-slate-50 p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">CPR ID</span><span className="font-mono font-bold">{cpr.cpr_id}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-semibold">{cpr.customer_name}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Product</span><span className="font-semibold">{cpr.product_name}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Quantity</span><span className="font-semibold">{cpr.requested_quantity} units</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Unit Price</span><span className="font-semibold">₹{parseFloat(cpr.unit_price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="font-bold">Total Amount</span><span className="font-bold text-[#1E3A8A] text-lg">₹{parseFloat(cpr.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            After creation, the Supervisor will be notified for approval before proceeding.
          </div>
        </div>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving} className="bg-[#1E3A8A] hover:bg-[#162d6e]">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : <><FileText className="w-4 h-4 mr-2" />Create Sales Order</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function SalesManagerPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("cpr");
  const [cprs, setCPRs] = useState([]);
  const [sos, setSOss] = useState([]);
  const [loadingCPR, setLoadingCPR] = useState(true);
  const [loadingSO, setLoadingSO] = useState(true);
  const [showCreateCPR, setShowCreateCPR] = useState(false);
  const [createSOFor, setCreateSOFor] = useState(null);

  const loadCPRs = useCallback(async () => {
    setLoadingCPR(true);
    try { setCPRs(toArr(await apiRequest("/sales/cpr/", "GET"))); }
    catch { /* silent */ } finally { setLoadingCPR(false); }
  }, []);

  const loadSOs = useCallback(async () => {
    setLoadingSO(true);
    try { setSOss(toArr(await apiRequest("/sales/so/", "GET"))); }
    catch { /* silent */ } finally { setLoadingSO(false); }
  }, []);

  useEffect(() => { loadCPRs(); loadSOs(); }, [loadCPRs, loadSOs]);

  const TABS = [
    { id: "cpr", label: "Purchase Requests", icon: ShoppingCart },
    { id: "so",  label: "Sales Orders",       icon: FileText },
    { id: "pay", label: "Payments",            icon: CreditCard },
  ];

  const pendingPaymentSOs = sos.filter(s => s.status === "Supervisor Approved");
  const paymentSOs        = sos.filter(s => ["Payment Pending","Finance Confirmed","Pick & Pack","Dispatched"].includes(s.status));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-[#1E3A8A]" /> Sales Manager Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage customer orders from request to dispatch</p>
        </div>
        {tab === "cpr" && (
          <Button className="bg-[#1E3A8A] hover:bg-[#162d6e] h-9" onClick={() => setShowCreateCPR(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> New CPR
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? "bg-white text-[#1E3A8A] shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ── CPR Tab ── */}
      {tab === "cpr" && (
        <Card className="shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-[#1E3A8A]" /> Customer Purchase Requests
              <span className="bg-[#1E3A8A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{cprs.length}</span>
            </p>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadCPRs}>
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">CPR ID</TableHead>
                  <TableHead className="text-xs font-semibold">Customer</TableHead>
                  <TableHead className="text-xs font-semibold">Product</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Qty</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Total (₹)</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold">Inventory Note</TableHead>
                  <TableHead className="text-xs font-semibold">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingCPR ? (
                  <TableRow><TableCell colSpan={8} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
                ) : cprs.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-gray-400">No CPRs yet. Click "New CPR" to create one.</TableCell></TableRow>
                ) : cprs.map(c => (
                  <TableRow key={c.cpr_id} className="hover:bg-muted/20">
                    <TableCell className="text-xs font-mono font-bold text-[#1E3A8A]">{c.cpr_id}</TableCell>
                    <TableCell>
                      <div className="text-xs font-semibold">{c.customer_name}</div>
                      <div className="text-[10px] text-gray-500">{c.customer_phone}</div>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{c.product_name}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{c.requested_quantity}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums font-semibold">
                      ₹{parseFloat(c.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell><Pill status={c.status} /></TableCell>
                    <TableCell className="text-xs text-gray-500 max-w-[160px] truncate">{c.inventory_notes || "—"}</TableCell>
                    <TableCell>
                      {c.status === "Stock Confirmed" && (
                        <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => setCreateSOFor(c)}>
                          <FileText className="w-3 h-3 mr-1" /> Create SO
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ── SO Tab ── */}
      {tab === "so" && (
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
                    <TableCell className="text-xs text-gray-500 max-w-[150px] truncate">{s.supervisor_notes || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    )}

      {/* ── Payment Tab ── */}
      {tab === "pay" && (
        <div className="space-y-4">

          <Card className="shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-[#1E3A8A]" />
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Payment History</p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs font-semibold">SO ID</TableHead>
                    <TableHead className="text-xs font-semibold">Customer</TableHead>
                    <TableHead className="text-xs font-semibold">Product</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Total (₹)</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="text-xs font-semibold">Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentSOs.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-gray-400">No payment records yet.</TableCell></TableRow>
                  ) : paymentSOs.map(s => (
                    <TableRow key={s.so_id} className="hover:bg-muted/20">
                      <TableCell className="text-xs font-mono font-bold text-[#1E3A8A]">{s.so_id}</TableCell>
                      <TableCell className="text-xs font-semibold">{s.customer_name}</TableCell>
                      <TableCell className="text-xs">{s.product_name}</TableCell>
                      <TableCell className="text-xs text-right font-bold">₹{parseFloat(s.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell><Pill status={s.status} /></TableCell>
                      <TableCell>
                        {s.payment_info ? (
                          <div className="text-[10px] space-y-0.5">
                            <div className="font-semibold capitalize">{s.payment_info.payment_type}</div>
                            <div className="text-gray-500">Rcvd: ₹{parseFloat(s.payment_info.amount_received || 0).toLocaleString("en-IN")}</div>
                            {parseFloat(s.payment_info.balance_due) > 0 && (
                              <div className="text-amber-600 font-semibold">Bal: ₹{parseFloat(s.payment_info.balance_due).toLocaleString("en-IN")}</div>
                            )}
                            {s.payment_info.finance_confirmed && (
                              <span className="text-emerald-700 font-bold">✅ Finance OK</span>
                            )}
                          </div>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}

      {/* Dialogs */}
      {showCreateCPR && <CreateCPRDialog onClose={() => setShowCreateCPR(false)} onCreated={loadCPRs} />}
      {createSOFor   && <CreateSODialog cpr={createSOFor} onClose={() => setCreateSOFor(null)} onCreated={() => { loadCPRs(); loadSOs(); }} />}
    </div>
  );
}
