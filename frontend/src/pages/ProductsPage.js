/**
 * ProductsPage.js — Product Catalog (Vendor Agreement → Product Pipeline)
 *
 * ─── ARCHITECTURE ────────────────────────────────────────────────────────────
 * Products are NEVER created directly. The only pipeline is:
 *   1. Vendor exists (POST /api/vendors/vendor/create/)
 *   2. PDF uploaded  (POST /api/vendors/vendor/<id>/upload-agreement/)
 *      → PDF parsed, GSTIN + Email validated vs vendor record
 *      → New products created (or existing mapped as multi-vendor)
 *   3. Admin assigns zone (PATCH /api/products/<id>/assign-zone/)
 *
 * ─── ENDPOINTS USED ───────────────────────────────────────────────────────────
 * GET  /api/products/listall/                   → all products (Product model)
 * GET  /api/products/needs-zone/                → products without zone
 * PATCH /api/products/<id>/assign-zone/         → assign zone + package + ABC/XYZ/VED
 * PATCH /api/products/update/<id>/              → update classification/pricing/dims
 * DELETE /api/products/delete/<id>/             → soft-deactivate
 * GET  /api/vendors/agreement-products/         → all VendorAgreementProduct rows (catalog)
 * GET  /api/vendors/rejected-agreements/        → rejection audit log
 * GET  /api/inventory/zones/                    → for zone dropdown
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect, useCallback } from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import {
  Search, Loader2, RefreshCw, Package, ChevronDown, ChevronUp,
  AlertTriangle, MapPin, ShieldX, Pencil, Building2, Phone, Mail, Clock,
  FileText, CheckCircle2, XCircle, Globe, Star,
} from "lucide-react";
import { useToast } from "../components/ui/use-toast";
import { formatDateDDMMYYYY } from "../components/utils/helpers";
import { useAuth } from "../components/lib/auth-context";
import {
  listProducts,
  listProductsNeedingZone,
  assignProductZone,
  updateProduct,
  deleteProduct,
  listRejectedAgreements,
  listCategories,
  listZones,
  listVendors,
  listVendorAgreements,
  listProductVendors,
} from "../services/apiService";
import { AgreementProductsPanel } from "./VendorsPage";

/* ── helpers ─── */
const toArray = (res, key) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (key && Array.isArray(res[key])) return res[key];
  for (const k of ["results", "products", "data", "items"])
    if (Array.isArray(res[k])) return res[k];
  return Object.values(res).find(Array.isArray) || [];
};
const fmt = (v, decimals = 2) =>
  v != null ? Number(v).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : "—";
const fmtDate = (d) => formatDateDDMMYYYY(d);
const normalizeCategoryName = (value) => String(value ?? "").trim().toLowerCase();

/* ════════════════════════════════════════════════════════════
   VENDOR PANEL — lazy-loads all vendors for a product
   Handles both single and multi-vendor products.
════════════════════════════════════════════════════════════ */
function VendorPanel({ product }) {
  const [vendors, setVendors] = useState(null);   // null = not yet loaded
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listProductVendors(product.product_id)
      .then(res => { if (!cancelled) setVendors(res.vendors || []); })
      .catch(() => { if (!cancelled) setVendors(product.vendor_details ? [product.vendor_details] : []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [product.product_id, product.vendor_details]);

  if (loading) {
    return (
      <div className="py-4 flex justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-[#1E3A8A]" />
      </div>
    );
  }

  if (!vendors || vendors.length === 0) {
    return <p className="text-[11px] text-gray-400">No vendor linked</p>;
  }

  const v = vendors[activeIdx] || vendors[0];

  return (
    <div>
      {/* ── Vendor tabs (shown only for multi-vendor) ── */}
      {vendors.length > 1 && (
        <div className="flex gap-1 mb-3 flex-wrap">
          {vendors.map((vd, i) => (
            <button
              key={vd.vendor_id}
              onClick={() => setActiveIdx(i)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium transition-colors ${
                i === activeIdx
                  ? "bg-[#1E3A8A] text-white border-[#1E3A8A]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-[#1E3A8A]"
              }`}
            >
              {vd.is_primary && <Star className="w-2.5 h-2.5" />}
              {vd.vendor_name}
            </button>
          ))}
        </div>
      )}

      {/* ── Vendor details ── */}
      <div className="space-y-0.5">
        {vendors.length > 1 && v.is_primary && (
          <p className="text-[9px] font-semibold text-amber-600 uppercase tracking-wider mb-1 flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5" /> Primary Vendor
          </p>
        )}
        <F label="Vendor ID"   value={v.vendor_id} mono />
        <F label="Name"        value={v.vendor_name} />
        <F label="Contact"     value={v.contact_person} />
        <F label="GSTIN"       value={v.gstin} mono />
        <div className="flex items-start gap-1 py-0.5 border-b border-gray-50">
          <Phone className="w-2.5 h-2.5 text-gray-400 mt-0.5 shrink-0" />
          <span className="text-[11px] text-gray-700">{v.phone || "—"}</span>
        </div>
        <div className="flex items-start gap-1 py-0.5 border-b border-gray-50">
          <Mail className="w-2.5 h-2.5 text-gray-400 mt-0.5 shrink-0" />
          <span className="text-[11px] text-gray-700 break-all">{v.email || "—"}</span>
        </div>
        <div className="flex items-start gap-1 py-0.5 border-b border-gray-50">
          <Globe className="w-2.5 h-2.5 text-gray-400 mt-0.5 shrink-0" />
          <span className="text-[11px] text-gray-600">
            {[v.city, v.state, v.country].filter(Boolean).join(", ") || "—"}
          </span>
        </div>
        {v.address && (
          <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">{v.address}</p>
        )}
        <div className="flex items-start gap-1 py-0.5 mt-1 border-b border-gray-50">
          <Clock className="w-2.5 h-2.5 text-gray-400 mt-0.5 shrink-0" />
          <span className="text-[11px] text-gray-700">
            {v.lead_time != null ? `${v.lead_time} day lead time` : "—"}
          </span>
        </div>
        {/* ── Per-vendor agreement terms ── */}
        {(v.vendor_price || v.moq || v.agreement_id) && (
          <div className="mt-2 pt-1 border-t border-gray-100 space-y-0.5">
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Agreement Terms</p>
            {v.agreement_id && <F label="Agreement" value={v.agreement_id} mono />}
            {v.vendor_price != null && <F label="Vendor Price" value={`₹${fmt(v.vendor_price)}/carton`} />}
            {v.moq != null && <F label="MOQ" value={`${v.moq} carton${v.moq !== 1 ? "s" : ""}`} />}
            {v.payment_terms && <F label="Payment" value={v.payment_terms} />}
            {v.delivery_location && <F label="Delivery" value={v.delivery_location} />}
            {v.agreement_valid_until && <F label="Valid Until" value={fmtDate(v.agreement_valid_until)} />}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Classification badge ── */
const CLR = {
  A: "bg-red-100 text-red-700", B: "bg-amber-100 text-amber-700", C: "bg-green-100 text-green-700",
  V: "bg-red-100 text-red-700", E: "bg-blue-100 text-blue-700",   D: "bg-gray-100 text-gray-600",
  X: "bg-purple-100 text-purple-700", Y: "bg-indigo-100 text-indigo-700", Z: "bg-slate-100 text-slate-700",
};
const Cls = ({ v, label }) =>
  v
    ? <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${CLR[v] || "bg-gray-100 text-gray-600"}`}>
        {label ? `${label}:${v}` : v}
      </span>
    : <span className="text-gray-300 text-[10px]">—</span>;

const PkgBadge = ({ v }) => {
  if (!v) return <span className="text-gray-300 text-xs">—</span>;
  const cls = v === "POUCH" ? "bg-sky-100 text-sky-700"
            : v === "BOX"   ? "bg-amber-100 text-amber-700"
            :                 "bg-stone-100 text-stone-700";
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>{v}</span>;
};

/* ── Tab ── */
const Tab = ({ active, onClick, children, badge }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
      active ? "border-[#1E3A8A] text-[#1E3A8A]" : "border-transparent text-gray-500 hover:text-gray-700"
    }`}
  >
    {children}
    {badge > 0 && (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
        active ? "bg-[#1E3A8A] text-white" : "bg-gray-200 text-gray-600"
      }`}>{badge}</span>
    )}
  </button>
);

/* ── Field row in expandable panel ── */
const F = ({ label, value, mono }) => (
  <div className="grid grid-cols-2 gap-1 py-0.5 border-b border-gray-50 last:border-0">
    <span className="text-[10px] text-gray-400 font-medium">{label}</span>
    <span className={`text-[11px] text-gray-700 ${mono ? "font-mono" : ""} truncate`}>{value ?? "—"}</span>
  </div>
);

/* ════════════════════════════════════════════════════════════
   EDIT PRODUCT DIALOG (classification + pricing + dims)
   PATCH /api/products/update/<id>/
═══════════════════════════════════════════════════════════ */
const EDIT_INIT = {
  category: "", description: "", re_order: "",
  ABC: "", XYZ: "", VED: "", package_type: "",
  carton_price: "", gst_percent: "",
  weight_kg: "", length_cm: "", width_cm: "", height_cm: "",
};
const SEL = ({ id, label, value, options, onChange, hint }) => (
  <div className="grid gap-1.5">
    <Label htmlFor={id} className="text-xs">{label}</Label>
    <select id={id} value={value} onChange={e => onChange(e.target.value)}
      className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
      {options.map(o => <option key={o} value={o}>{o || "— none —"}</option>)}
    </select>
    {hint && <p className="text-[9px] text-gray-400">{hint}</p>}
  </div>
);

function EditDialog({ product, categories, onClose, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    ...EDIT_INIT,
    category:     product.category     ?? "",
    description:  product.description  ?? "",
    re_order:     String(product.re_order ?? ""),
    ABC:          product.ABC          ?? "",
    XYZ:          product.XYZ          ?? "",
    VED:          product.VED          ?? "",
    package_type: product.package_type ?? "",
    carton_price: String(product.carton_price ?? ""),
    gst_percent:  String(product.gst_percent  ?? ""),
    weight_kg:    String(product.weight_kg    ?? ""),
    length_cm:    String(product.length_cm    ?? ""),
    width_cm:     String(product.width_cm     ?? ""),
    height_cm:    String(product.height_cm    ?? ""),
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const matchedCategory = categories.find(cat => normalizeCategoryName(cat.name) === normalizeCategoryName(form.category));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {};
      Object.entries(form).forEach(([k, v]) => { if (v !== "") payload[k] = v; });
      await updateProduct(product.product_id, payload);
      toast({ title: "Updated", description: `${product.product_name} updated.` });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>Update Product</DialogTitle>
            <DialogDescription>
              <span className="font-medium">{product.product_name}</span>
              {" — "}<span className="font-mono text-xs">{product.product_id}</span>
              <br />
              <span className="text-[10px] text-amber-600">
                Barcode, product ID, SKU, and unit price are immutable.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {/* Category + Reorder */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="e-cat" className="text-xs">Category</Label>
                <select
                  id="e-cat"
                  value={form.category}
                  onChange={e => set("category", e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— none —</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
                {matchedCategory?.zone_type && (
                  <p className="text-[9px] text-gray-400">Mapped zone type: {matchedCategory.zone_type}</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-reorder" className="text-xs">Reorder Point</Label>
                <Input id="e-reorder" type="number" min="0" value={form.re_order}
                  onChange={e => set("re_order", e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            {/* Description */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Description</Label>
              <textarea value={form.description} onChange={e => set("description", e.target.value)}
                rows={2} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            {/* Classification */}
            <div className="grid grid-cols-4 gap-2">
              <SEL id="e-pkg" label="Package" value={form.package_type} options={["","POUCH","BOX","BAG"]}
                onChange={v => set("package_type", v)} hint="Shelf position" />
              <SEL id="e-abc" label="ABC" value={form.ABC} options={["","A","B","C"]} onChange={v => set("ABC", v)} />
              <SEL id="e-ved" label="VED" value={form.VED} options={["","V","E","D"]} onChange={v => set("VED", v)} />
              <SEL id="e-xyz" label="XYZ" value={form.XYZ} options={["","X","Y","Z"]} onChange={v => set("XYZ", v)} />
            </div>
            {/* Pricing */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Carton Price (₹)</Label>
                <Input type="number" step="0.01" min="0" value={form.carton_price}
                  onChange={e => set("carton_price", e.target.value)} className="h-8 text-sm" />
                <p className="text-[9px] text-gray-400">Unit price = carton ÷ conversion factor (auto)</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">GST %</Label>
                <Input type="number" step="0.01" min="0" max="100" value={form.gst_percent}
                  onChange={e => set("gst_percent", e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            {/* Dims */}
            <p className="text-[10px] font-semibold text-gray-500">Physical Dimensions (per base unit)</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { k: "weight_kg", lbl: "Weight (kg)" },
                { k: "length_cm", lbl: "Length (cm)" },
                { k: "width_cm",  lbl: "Width (cm)" },
                { k: "height_cm", lbl: "Height (cm)" },
              ].map(({ k, lbl }) => (
                <div key={k} className="grid gap-1.5">
                  <Label className="text-[10px]">{lbl}</Label>
                  <Input type="number" step="0.01" min="0" value={form[k]}
                    onChange={e => set(k, e.target.value)} className="h-8 text-xs" />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving} className="bg-[#1E3A8A] hover:bg-[#1E293B]">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


/* ════════════════════════════════════════════════════════════
   ZONE ASSIGN DIALOG — FIXED VERSION
   PATCH /api/products/<id>/assign-zone/
═══════════════════════════════════════════════════════════ */
function ZoneAssignDialog({ product, zones, categories, onClose, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    zone: product.zone ?? "",
    package_type: product.package_type ?? "",
    ABC: product.ABC ?? "",
    XYZ: product.XYZ ?? "",
    VED: product.VED ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const matchedCategory = categories.find(cat => normalizeCategoryName(cat.name) === normalizeCategoryName(product.category));
  const suggestedZoneType = matchedCategory?.zone_type || product.zone_type || "";
  
  // ✅ FIX: Case-insensitive zone filtering
  const filteredZones = suggestedZoneType
    ? zones.filter(z => z.zone_type?.toUpperCase() === suggestedZoneType.toUpperCase())
    : zones;

  const save = async (e) => {
    e.preventDefault();
    if (!form.zone) {
      toast({ title: "Required", description: "Please select a zone.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
  const res = await assignProductZone(product.product_id, form);

  // Guard: if the backend returned 200 but zone_id is still null, treat as failure
  if (!res.zone_id) {
    toast({
      title: "Assignment Failed",
      description: "The zone was not saved on the server. Check backend logs.",
      variant: "destructive",
    });
    return;
  }

  toast({
    title: "Zone Assigned",
    description: `${product.product_name} assigned to zone ${res.zone_id}.`,
  });
  onSaved();
  onClose();
} catch (err) {
  toast({ title: "Error", description: err.message, variant: "destructive" });
} finally {
  setSaving(false);
}
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>Assign Zone & Classification</DialogTitle>
            <DialogDescription>
              <span className="font-medium">{product.product_name}</span>
              {" — "}<span className="font-mono text-xs">{product.product_id}</span>
              <br />
              <span className="text-[10px] text-blue-600">
                This product was created via vendor agreement and needs zone assignment before it can be stored.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">Category Mapping</p>
              <p className="text-xs text-blue-900 mt-1">
                Category: <span className="font-medium">{product.category || "—"}</span>
              </p>
              <p className="text-xs text-blue-900">
                Suggested zone type: <span className="font-medium">{suggestedZoneType || "Not mapped"}</span>
              </p>
            </div>
            {/* Zone */}
            <div className="grid gap-2">
              <Label className="text-xs font-semibold">Zone *</Label>
              {zones.length === 0 ? (
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  No zones configured. Go to Inventory → Zones & Racks to add zones first.
                </div>
              ) : filteredZones.length === 0 ? (
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  No zones found for the mapped zone type <span className="font-semibold">{suggestedZoneType}</span>. Add a matching zone in Inventory or update the category mapping.
                  {suggestedZoneType && zones.length > 0 && (
                    <div className="mt-2 text-[10px] text-gray-600">
                      Available zone types in system: {[...new Set(zones.map(z => z.zone_type))].join(", ")}
                    </div>
                  )}
                </div>
              ) : (
                <select value={form.zone} onChange={e => set("zone", e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <option value="">— Select zone —</option>
                  {filteredZones.map(z => (
                    <option key={z.zone_id} value={z.zone_id}>{z.zone_id} · {z.zone_type}</option>
                  ))}
                </select>
              )}
              {suggestedZoneType && filteredZones.length > 0 && (
                <p className="text-[10px] text-gray-400">Showing zones for {suggestedZoneType} category mapping.</p>
              )}
            </div>
            {/* Package type */}
            <SEL id="za-pkg" label="Package Type *" value={form.package_type}
              options={["", "POUCH", "BOX", "BAG"]} onChange={v => set("package_type", v)}
              hint="Determines which shelf position (Bottom=BAG, Middle=BOX, Top=POUCH)" />
            {/* Classification */}
            <div className="grid grid-cols-3 gap-3">
              <SEL id="za-abc" label="ABC Class" value={form.ABC} options={["","A","B","C"]} onChange={v => set("ABC", v)} />
              <SEL id="za-ved" label="VED Class" value={form.VED} options={["","V","E","D"]} onChange={v => set("VED", v)} />
              <SEL id="za-xyz" label="XYZ Class" value={form.XYZ} options={["","X","Y","Z"]} onChange={v => set("XYZ", v)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving || filteredZones.length === 0}
              className="bg-[#1E3A8A] hover:bg-[#1E293B]">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Assign Zone
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


/* ════════════════════════════════════════════════════════════
   TAB 1 — ALL PRODUCTS
   GET /api/products/listall/
   Expandable rows: show all 28+ fields
═══════════════════════════════════════════════════════════ */
function AllProductsTab({ products, isLoading, search, canManage, onEdit, onAssignZone, onDeactivate }) {
  const [expanded, setExpanded] = useState(null);

  const q = search.toLowerCase();
  const filtered = products.filter(p =>
    [p.product_name, p.product_id, p.sku_code, p.barcode, p.brand_name, p.category,
     p.vendor_details?.vendor_name]
      .some(v => String(v ?? "").toLowerCase().includes(q))
  );

  return (
    <Card className="shadow-sm border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="w-6" />
              <TableHead className="text-xs font-semibold text-gray-600">Product</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600">Barcode</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600">Category</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600">Vendor</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600 text-center">Pkg</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600 text-center">Class</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600 text-right">Unit Price</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600">Zone</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600">Status</TableHead>
              {canManage && <TableHead className="text-xs font-semibold text-gray-600 w-16" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1E3A8A]" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-12 text-gray-400 text-sm">
                  {search ? "No products match your search." : "No products yet. Upload a vendor agreement PDF to register products."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(p => {
                const isExp  = expanded === p.product_id;
                const hasZone = !!(p.zone_id || p.zone);
                const isActive = p.is_active !== false;

                return (
                  <React.Fragment key={p.product_id}>
                    <TableRow
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${isExp ? "bg-blue-50/30" : ""} ${!isActive ? "opacity-50" : ""}`}
                      onClick={() => setExpanded(isExp ? null : p.product_id)}
                    >
                      <TableCell className="pr-0 pl-3">
                        {isExp ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                               : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium text-gray-900 leading-tight">{p.product_name}</p>
                        <p className="text-[10px] text-gray-400 font-mono">
                          {p.product_id} · {p.sku_code || "—"}
                          {p.size && <span className="ml-1 text-gray-300">({p.size})</span>}
                        </p>
                        {p.brand_name && <p className="text-[10px] text-gray-400">{p.brand_name}</p>}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-gray-500">{p.barcode || "—"}</TableCell>
                      <TableCell className="text-xs text-gray-500">{p.category || "—"}</TableCell>
                      <TableCell>
                        <p className="text-xs font-medium text-gray-700">
                          {p.vendor_details?.vendor_name || "—"}
                          {p.is_multi_vendor && (
                            <span className="ml-1 px-1 py-0.5 rounded text-[9px] bg-purple-100 text-purple-700 font-semibold">MULTI</span>
                          )}
                        </p>
                        {p.vendor_details?.gstin && (
                          <p className="text-[10px] font-mono text-gray-400">{p.vendor_details.gstin}</p>
                        )}
                        {p.vendor_details?.phone && (
                          <p className="text-[10px] text-gray-400">{p.vendor_details.phone}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-center"><PkgBadge v={p.package_type} /></TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <Cls v={p.ABC} /><Cls v={p.VED} /><Cls v={p.XYZ} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-gray-700 font-medium">
                        {p.unit_price != null ? `₹${fmt(p.unit_price)}` : "—"}
                      </TableCell>
                      <TableCell>
                        {hasZone
                          ? <span className="text-xs font-mono text-gray-600">{p.zone_id || p.zone}</span>
                          : <span className="text-xs text-amber-500 font-medium">Needs Zone</span>
                        }
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={isActive ? (hasZone ? "secondary" : "outline") : "destructive"}
                          className="text-[10px]"
                        >
                          {!isActive ? "Inactive" : hasZone ? "Active" : "Pending"}
                        </Badge>
                      </TableCell>
                      {canManage && (
                        <TableCell onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1 justify-end">
                            {!hasZone && (
                              <button
                                onClick={() => onAssignZone(p)}
                                className="p-1 rounded hover:bg-[#1E3A8A]/10 transition-colors"
                                title="Assign zone"
                              >
                                <MapPin className="w-3.5 h-3.5 text-[#1E3A8A]" />
                              </button>
                            )}
                            <button
                              onClick={() => onEdit(p)}
                              className="p-1 rounded hover:bg-gray-100 transition-colors"
                              title="Edit product"
                            >
                              <Pencil className="w-3.5 h-3.5 text-gray-500" />
                            </button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>

                    {/* ── Expanded detail panel ── */}
                    {isExp && (
                      <TableRow key={`${p.product_id}-detail`} className="bg-blue-50/10">
                        <TableCell colSpan={canManage ? 11 : 10} className="py-0">
                          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 px-6 py-4">
                            {/* Identity */}
                            <div>
                              <p className="text-[10px] font-semibold text-[#1E3A8A] uppercase tracking-wide mb-2">Identity</p>
                              <F label="Product ID"   value={p.product_id} mono />
                              <F label="Barcode"      value={p.barcode} mono />
                              <F label="SKU"          value={p.sku_code} mono />
                              <F label="Brand"        value={p.brand_name} />
                              <F label="Size"         value={p.size} />
                              <F label="Description"  value={p.description} />
                              <F label="Multi-vendor" value={p.is_multi_vendor ? "Yes" : "No"} />
                              <F label="First Vendor" value={p.is_first_vendor ? "Yes" : "No"} />
                            </div>
                            {/* Classification & Zone */}
                            <div>
                              <p className="text-[10px] font-semibold text-[#1E3A8A] uppercase tracking-wide mb-2">Classification</p>
                              <F label="ABC"          value={p.ABC} />
                              <F label="VED"          value={p.VED} />
                              <F label="XYZ"          value={p.XYZ} />
                              <F label="Package type" value={p.package_type} />
                              <F label="Zone ID"      value={p.zone_id || p.zone} />
                              <F label="Zone type"    value={p.zone_type} />
                              <F label="Reorder at"   value={p.re_order != null ? `${p.re_order} ${p.base_unit || "units"}` : null} />
                            </div>
                            {/* Pricing & Units */}
                            <div>
                              <p className="text-[10px] font-semibold text-[#1E3A8A] uppercase tracking-wide mb-2">Pricing & Units</p>
                              <F label="Carton price"  value={p.carton_price != null ? `₹${fmt(p.carton_price)}` : null} />
                              <F label="Unit price"    value={p.unit_price   != null ? `₹${fmt(p.unit_price)}` : null} />
                              <F label="GST %"         value={p.gst_percent  != null ? `${p.gst_percent}%` : null} />
                              <F label="Base unit"     value={p.base_unit} />
                              <F label="Purchase unit" value={p.purchase_unit} />
                              <F label="Conv. factor"  value={p.conversion_factor} />
                            </div>
                            {/* Physical Dimensions */}
                            <div>
                              <p className="text-[10px] font-semibold text-[#1E3A8A] uppercase tracking-wide mb-2">Physical Dims</p>
                              <F label="Weight" value={p.weight_kg  != null ? `${p.weight_kg} kg` : null} />
                              <F label="Length" value={p.length_cm  != null ? `${p.length_cm} cm` : null} />
                              <F label="Width"  value={p.width_cm   != null ? `${p.width_cm} cm` : null} />
                              <F label="Height" value={p.height_cm  != null ? `${p.height_cm} cm` : null} />
                              <F label="Volume" value={p.volume_cm3 != null ? `${fmt(p.volume_cm3, 0)} cm³` : null} />
                              <F label="Created" value={fmtDate(p.created_at)} />
                            </div>
                            {/* ── VENDOR — dynamic multi-vendor panel ── */}
                            <div className="border-l border-blue-100 pl-3">
                              <p className="text-[10px] font-semibold text-[#1E3A8A] uppercase tracking-wide mb-2 flex items-center gap-1">
                                <Building2 className="w-3 h-3" /> Vendor
                                {p.is_multi_vendor && (
                                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] bg-purple-100 text-purple-700 font-bold">MULTI</span>
                                )}
                              </p>
                              <VendorPanel product={p} />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}


/* ════════════════════════════════════════════════════════════
   TAB 2 — NEEDS ZONE
   GET /api/products/needs-zone/
   Products created via PDF that haven't been assigned a zone yet
═══════════════════════════════════════════════════════════ */
function NeedsZoneTab({ products, isLoading, zones, onAssignZone }) {
  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1E3A8A]" /></div>;
  }
  if (products.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">All products have been assigned a zone. ✓</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-xs text-amber-800">
          <span className="font-semibold">{products.length} product{products.length > 1 ? "s" : ""}</span>
          {" "}created via vendor agreement and awaiting zone assignment.
          Assign zone, package type, and classification before they can receive stock.
        </p>
      </div>

      <div className="grid gap-3">
        {products.map(p => (
          <Card key={p.product_id} className="shadow-sm border-amber-200 overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{p.product_name}</p>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                    <span className="font-mono">{p.product_id}</span>
                    <span>·</span>
                    <span>Barcode: <span className="font-mono">{p.barcode || "—"}</span></span>
                    <span>·</span>
                    <span>Vendor: {p.vendor_details?.vendor_name || "—"}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                    <span>Base unit: {p.base_unit}</span>
                    <span>·</span>
                    <span>Carton price: {p.carton_price != null ? `₹${fmt(p.carton_price)}` : "—"}</span>
                    <span>·</span>
                    <span>GST: {p.gst_percent != null ? `${p.gst_percent}%` : "—"}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => onAssignZone(p)}
                  className="bg-[#1E3A8A] hover:bg-[#1E293B] h-8 text-xs gap-1.5 shrink-0"
                >
                  <MapPin className="w-3.5 h-3.5" /> Assign Zone
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════
   TAB 3 — AGREEMENT CATALOG
   GET /api/vendors/agreement-products/
   All VendorAgreementProduct rows (vendor pricing catalog)
═══════════════════════════════════════════════════════════ */


/* ════════════════════════════════════════════════════════════
   TAB 4 — REJECTED AGREEMENTS AUDIT
   GET /api/vendors/rejected-agreements/
═══════════════════════════════════════════════════════════ */
const REASON_CLR = {
  GSTIN_MISMATCH:  "bg-orange-100 text-orange-700",
  EMAIL_MISMATCH:  "bg-red-100 text-red-700",
  BOTH_MISMATCH:   "bg-rose-100 text-rose-700",
  MISSING_GSTIN:   "bg-amber-100 text-amber-700",
  MISSING_EMAIL:   "bg-amber-100 text-amber-700",
};

function RejectedTab({ items, isLoading }) {
  return (
    <Card className="shadow-sm border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs font-semibold text-gray-600">Date</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600">Vendor ID</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600">File</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600">Reason</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600">GSTIN in PDF</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600">Email in PDF</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1E3A8A]" />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                  No rejected agreements. All uploads have passed validation.
                </TableCell>
              </TableRow>
            ) : (
              items.map(item => (
                <TableRow key={item.id} className="hover:bg-gray-50">
                  <TableCell className="text-xs text-gray-500">{fmtDate(item.rejected_at)}</TableCell>
                  <TableCell className="text-xs font-mono text-gray-600">{item.vendor_id_provided || "—"}</TableCell>
                  <TableCell className="text-xs text-gray-500 max-w-[120px] truncate" title={item.file_name}>
                    {item.file_name || "—"}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${REASON_CLR[item.reason] || "bg-gray-100 text-gray-600"}`}>
                      {item.reason}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-gray-500">{item.gstin_in_pdf || "—"}</TableCell>
                  <TableCell className="text-xs text-gray-500">{item.email_in_pdf || "—"}</TableCell>
                  <TableCell className="text-xs text-gray-400 max-w-[200px] truncate" title={item.detail}>
                    {item.detail || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}


/* ════════════════════════════════════════════════════════════
   TAB 4 — ALL AGREEMENTS
   Fetches all vendors → batch-fetches each vendor's agreements
   GET /api/vendors/vendor/list/
   GET /api/vendors/vendor/<id>/agreements/
════════════════════════════════════════════════════════════ */
function AllAgreementsTab({ isLoading: pageLoading }) {
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const vendorRes = await listVendors();
        const vendors   = toArray(vendorRes);

        // batch-fetch agreements for every vendor in parallel
        const results = await Promise.allSettled(
          vendors.map(v => listVendorAgreements(v.vendor_id).then(r => ({ vendor: v, agrs: toArray(r, "results") })))
        );

        const flat = [];
        for (const r of results) {
          if (r.status === "fulfilled") {
            const { vendor, agrs } = r.value;
            for (const agr of agrs) flat.push({ ...agr, vendor_name: vendor.vendor_name, vendor_id: vendor.vendor_id, vendor_obj: vendor });
          }
        }
        // Sort newest valid_from first
        flat.sort((a, b) => new Date(b.valid_from || 0) - new Date(a.valid_from || 0));
        setAgreements(flat);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const q = search.toLowerCase();
  const filtered = agreements.filter(a =>
    [a.agreement_id, a.vendor_name, a.vendor_id, a.payment_terms, a.delivery_location]
      .some(v => String(v ?? "").toLowerCase().includes(q))
  );

  const activeCount = agreements.filter(a => a.is_active).length;

  if (loading || pageLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1E3A8A]" /></div>;
  }

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-500">Total: <strong>{agreements.length}</strong></span>
        <span className="text-green-600 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> Active: <strong>{activeCount}</strong>
        </span>
        <span className="text-gray-400 flex items-center gap-1">
          <XCircle className="w-3.5 h-3.5" /> Expired: <strong>{agreements.length - activeCount}</strong>
        </span>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          className="flex h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Search agreements..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <Card className="shadow-sm border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-6" />
                <TableHead className="text-xs font-semibold text-gray-600">Agreement ID</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Vendor</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Valid From</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Valid Until</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Payment Terms</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Delivery Location</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-right">Products</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-gray-400 text-sm">
                    {search ? "No agreements match your search." : "No agreements found. Upload a vendor agreement PDF."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(agr => {
                  const isExp = expanded === agr.agreement_id;
                  return (
                    <React.Fragment key={agr.agreement_id}>
                      <TableRow
                        className={`cursor-pointer hover:bg-gray-50 transition-colors ${isExp ? "bg-blue-50/30" : ""}`}
                        onClick={() => setExpanded(isExp ? null : agr.agreement_id)}
                      >
                        <TableCell className="pr-0 pl-3">
                          {isExp ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                                 : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-gray-700">{agr.agreement_id}</TableCell>
                        <TableCell>
                          <p className="text-xs font-medium text-gray-900">{agr.vendor_name}</p>
                          <p className="text-[10px] font-mono text-gray-400">{agr.vendor_id}</p>
                          {agr.vendor_obj?.gstin && (
                            <p className="text-[10px] text-gray-400 font-mono">GSTIN: {agr.vendor_obj.gstin}</p>
                          )}
                          {agr.vendor_obj?.email && (
                            <p className="text-[10px] text-gray-400 flex items-center gap-0.5">
                              <Mail className="w-2.5 h-2.5" />{agr.vendor_obj.email}
                            </p>
                          )}
                          {agr.vendor_obj?.phone && (
                            <p className="text-[10px] text-gray-400 flex items-center gap-0.5">
                              <Phone className="w-2.5 h-2.5" />{agr.vendor_obj.phone}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600">{fmtDate(agr.valid_from)}</TableCell>
                        <TableCell className="text-xs text-gray-600">{fmtDate(agr.valid_until)}</TableCell>
                        <TableCell className="text-xs text-gray-500">{agr.payment_terms || "—"}</TableCell>
                        <TableCell className="text-xs text-gray-500">{agr.delivery_location || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-gray-700">{agr.product_count ?? 0}</TableCell>
                        <TableCell className="text-center">
                          {agr.is_active
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3" />Active</span>
                            : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500"><XCircle className="w-3 h-3" />Expired</span>}
                        </TableCell>
                      </TableRow>

                      {/* Expanded: agreement detail + notes */}
                      {isExp && (
                        <TableRow key={`${agr.agreement_id}-detail`} className="bg-slate-50/60">
                          <TableCell colSpan={9} className="py-0">
                            <div className="px-8 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                              {/* Agreement meta */}
                              <div>
                                <p className="text-[10px] font-semibold text-[#1E3A8A] uppercase tracking-wide mb-2">Agreement Details</p>
                                <F label="Agreement ID"    value={agr.agreement_id} mono />
                                <F label="Valid From"      value={fmtDate(agr.valid_from)} />
                                <F label="Valid Until"     value={fmtDate(agr.valid_until)} />
                                <F label="Upload Date"     value={fmtDate(agr.uploaded_at)} />
                                <F label="Payment Terms"   value={agr.payment_terms} />
                                <F label="Delivery"        value={agr.delivery_location} />
                                {agr.notes && (
                                  <div className="mt-2 pt-2 border-t border-gray-100">
                                    <p className="text-[10px] text-gray-400 font-medium">Notes</p>
                                    <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">{agr.notes}</p>
                                  </div>
                                )}
                              </div>
                              {/* Vendor full details */}
                              <div>
                                <p className="text-[10px] font-semibold text-[#1E3A8A] uppercase tracking-wide mb-2 flex items-center gap-1">
                                  <Building2 className="w-3 h-3" /> Vendor
                                </p>
                                <F label="Vendor ID"     value={agr.vendor_obj?.vendor_id} mono />
                                <F label="Name"          value={agr.vendor_obj?.vendor_name} />
                                <F label="Contact"       value={agr.vendor_obj?.contact_person} />
                                <F label="GSTIN"         value={agr.vendor_obj?.gstin} mono />
                                <div className="flex items-start gap-1 py-0.5 border-b border-gray-50">
                                  <Phone className="w-2.5 h-2.5 text-gray-400 mt-0.5 shrink-0" />
                                  <span className="text-[11px] text-gray-700">{agr.vendor_obj?.phone || "—"}</span>
                                </div>
                                <div className="flex items-start gap-1 py-0.5 border-b border-gray-50">
                                  <Mail className="w-2.5 h-2.5 text-gray-400 mt-0.5 shrink-0" />
                                  <span className="text-[11px] text-gray-700 break-all">{agr.vendor_obj?.email || "—"}</span>
                                </div>
                                <div className="flex items-start gap-1 py-0.5">
                                  <Globe className="w-2.5 h-2.5 text-gray-400 mt-0.5 shrink-0" />
                                  <span className="text-[11px] text-gray-600">
                                    {[agr.vendor_obj?.city, agr.vendor_obj?.state, agr.vendor_obj?.country].filter(Boolean).join(", ") || "—"}
                                  </span>
                                </div>
                                {agr.vendor_obj?.address && (
                                  <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">{agr.vendor_obj.address}</p>
                                )}
                              </div>
                              {/* Lead time & warehouse */}
                              <div>
                                <p className="text-[10px] font-semibold text-[#1E3A8A] uppercase tracking-wide mb-2">Terms</p>
                                <F label="Lead Time" value={agr.vendor_obj?.lead_time != null ? `${agr.vendor_obj.lead_time} days` : null} />
                                <F label="Products"  value={agr.product_count != null ? `${agr.product_count} item${agr.product_count !== 1 ? "s" : ""}` : null} />
                              </div>
                            </div>
                            
                            {/* ── ACTUAL PRODUCTS PANEL INSIDE AGREEMENT ROW ── */}
                            <div className="mx-8 mb-4 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                              <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                                <p className="text-[10px] font-semibold text-[#1E3A8A] uppercase tracking-wide">
                                  Products in Agreement {agr.agreement_id}
                                </p>
                                <span className="text-[10px] text-gray-400">
                                  {agr.product_count ?? 0} item{agr.product_count !== 1 ? "s" : ""}
                                </span>
                              </div>
                              <AgreementProductsPanel agreementId={agr.agreement_id} />
                            </div>

                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
export default function ProductsPage() {
  const { user }  = useAuth();
  const { toast } = useToast();

  const [tab, setTab]         = useState("all");  // "all" | "needs-zone" | "agreements" | "rejected"
  const [search, setSearch]   = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [products, setProducts]   = useState([]);
  const [needsZone, setNeedsZone] = useState([]);
  const [rejected, setRejected]   = useState([]);
  const [zones, setZones]         = useState([]);
  const [categories, setCategories] = useState([]);

  // Dialogs
  const [editProduct, setEditProduct] = useState(null);
  const [zoneProduct, setZoneProduct] = useState(null);

  const canManage = ["admin", "inventory_manager"].includes(user?.role);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [pRes, nzRes, rejRes, zRes, cRes] = await Promise.allSettled([
        listProducts(),
        listProductsNeedingZone(),
        listRejectedAgreements(),
        listZones(),
        listCategories(),
      ]);

      if (pRes.status  === "fulfilled") setProducts(toArray(pRes.value, "products"));
      if (nzRes.status === "fulfilled") setNeedsZone(toArray(nzRes.value, "products"));
      if (rejRes.status === "fulfilled") setRejected(toArray(rejRes.value, "results"));
      if (zRes.status  === "fulfilled") setZones(toArray(zRes.value));
      if (cRes.status  === "fulfilled") setCategories(toArray(cRes.value));
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  /* ── Summary stats ── */
  const activeCount = products.filter(p => p.is_active !== false).length;
  const multiVendor = products.filter(p => p.is_multi_vendor).length;
  const needsZoneN  = needsZone.length;
  const rejectedN   = rejected.length;

  return (
    <div className="space-y-4">

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active Products",  value: activeCount, icon: Package,   cls: "text-[#1E3A8A]" },
          { label: "Multi-vendor",     value: multiVendor, icon: Building2,  cls: "text-purple-600" },
          { label: "Needs Zone",       value: needsZoneN,  icon: MapPin,    cls: needsZoneN > 0 ? "text-amber-600" : "text-gray-400" },
          { label: "Rejected Uploads", value: rejectedN,   icon: ShieldX,   cls: rejectedN > 0 ? "text-red-600" : "text-gray-400" },
        ].map((s, i) => (
          <Card key={i} className="shadow-sm border-gray-200">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-500">{s.label}</p>
                <p className={`text-2xl font-bold ${s.cls}`}>{isLoading ? "—" : s.value}</p>
              </div>
              <s.icon className={`w-5 h-5 ${s.cls} opacity-50`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Needs zone alert ── */}
      {needsZoneN > 0 && !isLoading && (
        <div
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 cursor-pointer hover:bg-amber-100 transition-colors"
          onClick={() => setTab("needs-zone")}
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-800">
            <span className="font-semibold">{needsZoneN} product{needsZoneN > 1 ? "s" : ""}</span>
            {" "}need zone assignment before stock can be stored. → <span className="underline font-semibold">View Needs Zone tab</span>
          </p>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, barcode, SKU, vendor..."
            className="pl-9 h-9 border-gray-200"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={load}
          className="p-1.5 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
          title="Refresh all data"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-gray-200 flex gap-0 overflow-x-auto">
        <Tab active={tab === "all"}          onClick={() => setTab("all")}          badge={activeCount}>
          <Package className="w-3.5 h-3.5" /> All Products
        </Tab>
        <Tab active={tab === "needs-zone"}   onClick={() => setTab("needs-zone")}   badge={needsZoneN}>
          <MapPin className="w-3.5 h-3.5" /> Needs Zone
        </Tab>
        <Tab active={tab === "agreements"}   onClick={() => setTab("agreements")}>
          <FileText className="w-3.5 h-3.5" /> All Agreements
        </Tab>
        <Tab active={tab === "rejected"}     onClick={() => setTab("rejected")}     badge={rejectedN}>
          <ShieldX className="w-3.5 h-3.5" /> Rejected Uploads
        </Tab>
      </div>

      {/* ── Tab content ── */}
      {tab === "all" && (
        <AllProductsTab
          products={products}
          isLoading={isLoading}
          search={search}
          canManage={canManage}
          onEdit={p => setEditProduct(p)}
          onAssignZone={p => setZoneProduct(p)}
          onDeactivate={async (p) => {
            if (!window.confirm(`Deactivate "${p.product_name}"?`)) return;
            try {
              await deleteProduct(p.product_id);
              toast({ title: "Deactivated", description: `${p.product_name} deactivated.` });
              load();
            } catch (err) {
              toast({ title: "Error", description: err.message, variant: "destructive" });
            }
          }}
        />
      )}
      {tab === "needs-zone" && (
        <NeedsZoneTab
          products={needsZone}
          isLoading={isLoading}
          zones={zones}
          onAssignZone={p => setZoneProduct(p)}
        />
      )}
      {tab === "agreements" && (
        <AllAgreementsTab isLoading={isLoading} />
      )}
      {tab === "rejected" && (
        <RejectedTab items={rejected} isLoading={isLoading} />
      )}

      {/* ── Edit dialog ── */}
      {editProduct && (
        <EditDialog
          product={editProduct}
          categories={categories}
          onClose={() => setEditProduct(null)}
          onSaved={load}
        />
      )}

      {/* ── Zone assign dialog ── */}
      {zoneProduct && (
        <ZoneAssignDialog
          product={zoneProduct}
          zones={zones}
          categories={categories}
          onClose={() => setZoneProduct(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
