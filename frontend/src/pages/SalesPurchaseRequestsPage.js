/**
 * SalesPurchaseRequestsPage.js
 * Standalone page for Sales Manager — Customer Purchase Requests tab
 */
import { useState, useEffect, useCallback } from "react";
import { useToast } from "../components/ui/use-toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import {
  ShoppingCart, Plus, RefreshCw, Loader2, FileText, CreditCard,
  CheckCircle2, Clock, UserCheck
} from "lucide-react";
import { apiRequest, listProducts, listCustomers } from "../services/apiService";

const toArr = (r) => {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  for (const k of ["results", "products", "data", "items"]) if (Array.isArray(r[k])) return r[k];
  return [];
};

const STATUS_COLOR = {
  "Pending":            "bg-amber-100 text-amber-800 border-amber-300",
  "Stock Confirmed":    "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Stock Rejected":     "bg-red-100 text-red-800 border-red-300",
  "SO Created":         "bg-blue-100 text-blue-800 border-blue-300",
  "Finance Confirmed":  "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Pick & Pack":        "bg-blue-100 text-blue-800 border-blue-300",
  "Dispatched":         "bg-teal-100 text-teal-800 border-teal-300",
};

const Pill = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_COLOR[status] || "bg-gray-100 text-gray-700 border-gray-300"}`}>
    {status}
  </span>
);

function CreateCPRDialog({ onClose, onCreated }) {
  const { toast } = useToast();
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loadingProd, setLoadingProd] = useState(true);
  const [loadingCust, setLoadingCust] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer: "",
    customer_name: "", customer_phone: "", customer_email: "",
    customer_address: "", customer_gstin: "",
    product: "", requested_quantity: "", unit_price: "", notes: "",
  });

  useEffect(() => {
    Promise.all([
      listProducts().then(r => setProducts(toArr(r))).catch(() => toast({ title: "Error", description: "Failed to load products.", variant: "destructive" })),
      listCustomers().then(r => setCustomers(toArr(r))).catch(() => toast({ title: "Error", description: "Failed to load customers.", variant: "destructive" }))
    ]).finally(() => {
      setLoadingProd(false);
      setLoadingCust(false);
    });
  }, [toast]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleCustomerSelect = (e) => {
    const custId = e.target.value;
    const selected = customers.find(c => c.customer_id === custId);
    if (selected) {
      setForm(f => ({
        ...f,
        customer: selected.customer_id,
        customer_name: selected.company_name || "",
        customer_phone: selected.phone || "",
        customer_email: selected.email || "",
        customer_address: selected.location || "",
        customer_gstin: selected.gstin || "",
      }));
    } else {
      setForm(f => ({
        ...f,
        customer: "",
        customer_name: "", customer_phone: "", customer_email: "",
        customer_address: "", customer_gstin: "",
      }));
    }
  };

  const totalAmount = form.unit_price && form.requested_quantity
    ? (parseFloat(form.unit_price) * parseInt(form.requested_quantity)).toFixed(2)
    : "—";

  const handleSubmit = async () => {
    if (!form.customer) {
      toast({ title: "Validation Error", description: "Please select a customer.", variant: "destructive" });
      return;
    }
    if (!form.product || !form.requested_quantity || !form.unit_price) {
      toast({ title: "Validation Error", description: "Please fill all required order fields.", variant: "destructive" });
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
          <DialogDescription>Select a customer — their details will be filled automatically. Then complete the order details below.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mt-2">

          <div className="col-span-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Customer Information</p>
          </div>

          <div className="col-span-2 grid gap-1.5 p-3 bg-slate-50 border rounded-lg">
            <Label className="text-xs text-[#1E3A8A] font-semibold flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" /> Select Customer *
            </Label>
            {loadingCust ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading customers…
              </div>
            ) : (
              <select
                value={form.customer}
                onChange={handleCustomerSelect}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
              >
                <option value="">— Select a customer —</option>
                {customers.filter(c => c.status === "Active").map(c => (
                  <option key={c.customer_id} value={c.customer_id}>
                    {c.company_name} ({c.customer_id})
                  </option>
                ))}
              </select>
            )}
          </div>

          {form.customer ? (
            <div className="col-span-2 rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Customer Details — Auto Filled
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-0.5">Name</p>
                  <p className="font-semibold text-slate-800">{form.customer_name || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-0.5">Phone</p>
                  <p className="font-semibold text-slate-800">{form.customer_phone || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-0.5">Email</p>
                  <p className="font-semibold text-slate-800">{form.customer_email || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-0.5">GSTIN</p>
                  <p className="font-semibold text-slate-800">{form.customer_gstin || "—"}</p>
                </div>
                {form.customer_address && (
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-0.5">Address</p>
                    <p className="font-semibold text-slate-800">{form.customer_address}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="col-span-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 flex flex-col items-center text-center">
              <UserCheck className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-sm text-slate-400 font-medium">Select a customer above</p>
              <p className="text-xs text-slate-300 mt-0.5">Their name, phone, email, GSTIN and address will appear here automatically.</p>
            </div>
          )}

          <div className="col-span-2 mt-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Order Details</p>
          </div>

          <div className="col-span-2 grid gap-1.5">
            <Label className="text-xs">Product *</Label>
            {loadingProd ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
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
          <Button onClick={handleSubmit} disabled={saving || !form.customer} className="bg-[#1E3A8A] hover:bg-[#162d6e]">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : <><Plus className="w-4 h-4 mr-2" />Create CPR</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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

export default function SalesPurchaseRequestsPage() {
  const { toast } = useToast();
  const [cprs, setCPRs] = useState([]);
  const [loadingCPR, setLoadingCPR] = useState(true);
  const [showCreateCPR, setShowCreateCPR] = useState(false);
  const [createSOFor, setCreateSOFor] = useState(null);

  const loadCPRs = useCallback(async () => {
    setLoadingCPR(true);
    try { setCPRs(toArr(await apiRequest("/sales/cpr/", "GET"))); }
    catch { /* silent */ } finally { setLoadingCPR(false); }
  }, []);

  useEffect(() => { loadCPRs(); }, [loadCPRs]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-[#1E3A8A]" /> Purchase Requests
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Create and track Customer Purchase Requests</p>
        </div>
        <Button className="bg-[#1E3A8A] hover:bg-[#162d6e] h-9" onClick={() => setShowCreateCPR(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> New CPR
        </Button>
      </div>

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

      {showCreateCPR && <CreateCPRDialog onClose={() => setShowCreateCPR(false)} onCreated={loadCPRs} />}
      {createSOFor && <CreateSODialog cpr={createSOFor} onClose={() => setCreateSOFor(null)} onCreated={loadCPRs} />}
    </div>
  );
}
