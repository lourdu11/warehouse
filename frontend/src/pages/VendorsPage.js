/**
 * VendorsPage.js — Vendor List + Agreement Data
 *
 * ─── ENDPOINTS USED ──────────────────────────────────────────────────────────
 * GET  /api/vendors/vendor/list/                       → all vendors
 * GET  /api/vendors/vendor/<vendor_id>/agreements/     → agreements per vendor
 * GET  /api/vendors/agreements/<agreement_id>/products/→ products per agreement
 * DELETE /api/vendors/vendor/delete/<vendor_id>/       → delete vendor
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Layout:
 *   • Table of vendors (ID, name, GSTIN, email, phone, lead time, city, status)
 *   • Click a row → expands to show that vendor's agreements
 *   • Click an agreement → inline product list (barcode, name, price, MOQ, etc.)
 *   • Actions: Edit vendor | Upload agreement | Delete vendor
 */
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import {
  Plus, Search, Pencil, Trash2, Loader2, FileUp, RefreshCw,
  ChevronDown, ChevronUp, FileText, Package, Building2,
  Phone, Mail, Clock, MapPin, CheckCircle2, XCircle,
} from "lucide-react";
import { useToast } from "../components/ui/use-toast";
import { formatDateDDMMYYYY } from "../components/utils/helpers";
import {
  listVendors,
  deleteVendor,
  listVendorAgreements,
  listAgreementProducts,
} from "../services/apiService";

/* ── helpers ── */
const toArr = (res, key) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (key && Array.isArray(res[key])) return res[key];
  for (const k of ["results", "products", "data", "items"])
    if (Array.isArray(res[k])) return res[k];
  return Object.values(res).find(Array.isArray) || [];
};

const fmtDate = (d) => formatDateDDMMYYYY(d);

const fmtMoney = (v) =>
  v != null ? `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

/* ── Vendor info pill ── */
const InfoPill = ({ icon: Icon, children }) =>
  children ? (
    <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
      <Icon className="w-2.5 h-2.5 shrink-0" />
      {children}
    </span>
  ) : null;

/* ── Agreement status badge ── */
const AgreementBadge = ({ isActive }) =>
  isActive
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" /> Active
      </span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
        <XCircle className="w-3 h-3" /> Expired
      </span>;

/* ════════════════════════════════════════════════════════════
   AGREEMENT PRODUCTS PANEL
   GET /api/vendors/agreements/<agreement_id>/products/
═══════════════════════════════════════════════════════════ */
export function AgreementProductsPanel({ agreementId }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    listAgreementProducts(agreementId)
      .then(res => setProducts(toArr(res, "products")))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [agreementId]);

  if (loading) {
    return <div className="py-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-[#1E3A8A]" /></div>;
  }
  if (products.length === 0) {
    return <p className="text-[11px] text-gray-400 py-3 px-4">No products in this agreement yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-white border-b border-gray-200 text-gray-500">
            <th className="text-left py-2 px-3 font-semibold">Product</th>
            <th className="text-left py-2 px-3 font-semibold">Barcode</th>
            <th className="text-right py-2 px-3 font-semibold">Vendor Price</th>
            <th className="text-right py-2 px-3 font-semibold">Unit Price</th>
            <th className="text-right py-2 px-3 font-semibold">MOQ</th>
            <th className="text-right py-2 px-3 font-semibold">Lead</th>
            <th className="text-left py-2 px-3 font-semibold">Units</th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => (
            <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
              <td className="py-1.5 px-3">
                <p className="font-medium text-gray-800">{p.product_name}</p>
                {p.mapped_product_name && p.mapped_product_name !== p.product_name && (
                  <p className="text-[10px] text-blue-500 mt-0.5">↳ mapped: {p.mapped_product_name}</p>
                )}
              </td>
              <td className="py-1.5 px-3 font-mono text-gray-500">{p.barcode || "—"}</td>
              <td className="py-1.5 px-3 text-right tabular-nums font-medium text-gray-800">
                {fmtMoney(p.vendor_price)}
                <span className="text-[10px] text-gray-400 ml-0.5">/{p.purchase_unit || "carton"}</span>
              </td>
              <td className="py-1.5 px-3 text-right tabular-nums text-gray-600">
                {fmtMoney(p.price_per_base_unit)}
                <span className="text-[10px] text-gray-400 ml-0.5">/{p.base_unit || "unit"}</span>
              </td>
              <td className="py-1.5 px-3 text-right tabular-nums text-gray-600">{p.moq ?? "—"}</td>
              <td className="py-1.5 px-3 text-right text-gray-500">
                {p.lead_time != null ? `${p.lead_time}d` : "—"}
              </td>
              <td className="py-1.5 px-3 text-gray-500">
                {p.conversion_factor && p.base_unit && p.purchase_unit
                  ? `${p.conversion_factor} ${p.base_unit}/${p.purchase_unit}`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   AGREEMENTS PANEL (per vendor)
   GET /api/vendors/vendor/<vendor_id>/agreements/
═══════════════════════════════════════════════════════════ */
function AgreementsPanel({ vendorId, navigate }) {
  const [agreements, setAgreements]         = useState([]);
  const [loading, setLoading]               = useState(true);
  const [expandedAgreement, setExpandedAgreement] = useState(null);

  useEffect(() => {
    setLoading(true);
    listVendorAgreements(vendorId)
      .then(res => setAgreements(toArr(res, "results")))
      .catch(() => setAgreements([]))
      .finally(() => setLoading(false));
  }, [vendorId]);

  if (loading) {
    return <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-[#1E3A8A]" /></div>;
  }

  return (
    <div className="border-t border-gray-100 bg-slate-50/60">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-gray-100">
        <p className="text-[11px] font-semibold text-gray-600 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-[#1E3A8A]" />
          Agreements ({agreements.length})
        </p>
        <button
          onClick={() => navigate(`/vendors/${vendorId}/upload-agreement`)}
          className="flex items-center gap-1 text-[10px] font-semibold text-[#1E3A8A] hover:underline"
        >
          <FileUp className="w-3 h-3" /> Upload New Agreement
        </button>
      </div>

      {agreements.length === 0 ? (
        <div className="px-6 py-4 text-xs text-gray-400">
          No agreements yet. Upload a vendor agreement PDF to register products.
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {agreements.map(agr => {
            const isExp = expandedAgreement === agr.agreement_id;
            return (
              <div key={agr.agreement_id}>
                {/* ── Agreement row ── */}
                <div
                  className={`px-6 py-3 flex items-start gap-4 cursor-pointer hover:bg-white/70 transition-colors ${isExp ? "bg-white/80" : ""}`}
                  onClick={() => setExpandedAgreement(isExp ? null : agr.agreement_id)}
                >
                  {/* Chevron */}
                  <div className="pt-0.5 shrink-0">
                    {isExp
                      ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                      : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                  </div>

                  {/* Agreement info */}
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-1 min-w-0">
                    <div className="sm:col-span-1">
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Agreement ID</p>
                      <p className="text-xs font-mono text-gray-700">{agr.agreement_id}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Valid From</p>
                      <p className="text-xs text-gray-700">{fmtDate(agr.valid_from)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Valid Until</p>
                      <p className="text-xs text-gray-700">{fmtDate(agr.valid_until)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Payment Terms</p>
                      <p className="text-xs text-gray-600">{agr.payment_terms || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Delivery Location</p>
                      <p className="text-xs text-gray-600">{agr.delivery_location || "—"}</p>
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <AgreementBadge isActive={agr.is_active} />
                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                      <Package className="w-2.5 h-2.5" />
                      {agr.product_count ?? 0} product{agr.product_count !== 1 ? "s" : ""}
                    </span>
                    {agr.uploaded_at && (
                      <span className="text-[10px] text-gray-300">
                        Uploaded {fmtDate(agr.uploaded_at)}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Notes row (if any) ── */}
                {agr.notes && (
                  <div className="px-12 py-1 text-[10px] text-gray-400 italic border-t border-gray-50">
                    Note: {agr.notes}
                  </div>
                )}

                {/* ── Expanded: products ── */}
                {isExp && (
                  <div className="ml-8 mr-4 mb-3 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
export default function VendorsPage() {
  const navigate      = useNavigate();
  const { toast }     = useToast();
  const [search, setSearch]         = useState("");
  const [vendors, setVendors]       = useState([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [expanded, setExpanded]     = useState(null); // vendor_id whose agreements are shown
  const [deleteDialog, setDeleteDialog] = useState({ open: false, vendor: null });
  const [isDeleting, setIsDeleting]     = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listVendors();
      setVendors(toArr(data));
    } catch {
      toast({ title: "Error", description: "Failed to load vendors.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteVendor(deleteDialog.vendor.vendor_id);
      toast({ title: "Deleted", description: `${deleteDialog.vendor.vendor_name} removed.` });
      setDeleteDialog({ open: false, vendor: null });
      load();
    } catch (err) {
      toast({ title: "Error", description: err.message || "Failed to delete.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const q = search.toLowerCase();
  const filtered = vendors.filter(v =>
    [v.vendor_name, v.vendor_id, v.contact_person, v.email, v.gstin, v.city, v.phone]
      .some(f => String(f ?? "").toLowerCase().includes(q))
  );

  const activeCount  = vendors.filter(v => v.is_active !== false).length;
  const inactiveCount = vendors.length - activeCount;

  return (
    <div className="space-y-4">

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Total Vendors",    value: vendors.length, icon: Building2, cls: "text-[#1E3A8A]" },
          { label: "Active",           value: activeCount,    icon: CheckCircle2, cls: "text-green-600" },
          { label: "Inactive",         value: inactiveCount,  icon: XCircle,   cls: inactiveCount > 0 ? "text-red-500" : "text-gray-400" },
        ].map((s, i) => (
          <Card key={i} className="shadow-sm border-gray-200">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-500">{s.label}</p>
                <p className={`text-2xl font-bold ${s.cls}`}>{isLoading ? "—" : s.value}</p>
              </div>
              <s.icon className={`w-5 h-5 ${s.cls} opacity-40`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, ID, GSTIN, email, city..."
            className="pl-9 h-9 border-gray-200"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-1.5 rounded border border-gray-200 hover:bg-gray-50 transition-colors" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <Button size="sm" className="h-9 bg-[#1E3A8A] hover:bg-[#1E293B] gap-1.5" onClick={() => navigate("/vendors/create")}>
            <Plus className="w-4 h-4" /> Add Vendor
          </Button>
        </div>
      </div>

      {/* ── Main table ── */}
      <Card className="shadow-sm border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-6" />
                <TableHead className="text-xs font-semibold text-gray-600">Vendor</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">GSTIN</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Contact</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Location</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Lead Time</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Status</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-right w-[110px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1E3A8A]" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                    {search ? "No vendors match your search." : "No vendors yet. Add your first vendor."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(v => {
                  const isExp = expanded === v.vendor_id;
                  return (
                    <React.Fragment key={v.vendor_id}>
                      {/* ── Vendor row ── */}
                      <TableRow
                        className={`cursor-pointer hover:bg-gray-50 transition-colors ${isExp ? "bg-blue-50/30" : ""}`}
                        onClick={() => setExpanded(isExp ? null : v.vendor_id)}
                      >
                        <TableCell className="pr-0 pl-3">
                          {isExp
                            ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                            : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-semibold text-gray-900">{v.vendor_name}</p>
                          <p className="text-[10px] font-mono text-gray-400">{v.vendor_id}</p>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-gray-500">{v.gstin || "—"}</TableCell>
                        <TableCell>
                          <p className="text-xs text-gray-700">{v.contact_person || "—"}</p>
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            <InfoPill icon={Mail}>{v.email}</InfoPill>
                            <InfoPill icon={Phone}>{v.phone}</InfoPill>
                          </div>
                        </TableCell>
                        <TableCell>
                          <InfoPill icon={MapPin}>
                            {[v.city, v.state, v.country].filter(Boolean).join(", ") || "—"}
                          </InfoPill>
                          {v.address && (
                            <p className="text-[10px] text-gray-400 mt-0.5 max-w-[160px] truncate" title={v.address}>
                              {v.address}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <InfoPill icon={Clock}>
                            {v.lead_time != null ? `${v.lead_time} days` : null}
                          </InfoPill>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={v.is_active !== false ? "secondary" : "destructive"}
                            className="text-[10px]"
                          >
                            {v.is_active !== false ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => navigate(`/vendors/${v.vendor_id}/upload-agreement`)}
                              className="p-1.5 rounded hover:bg-[#1E3A8A]/10 transition-colors"
                              title="Upload Agreement"
                            >
                              <FileUp className="w-3.5 h-3.5 text-[#1E3A8A]" />
                            </button>
                            <button
                              onClick={() => navigate(`/vendors/edit/${v.vendor_id}`)}
                              className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5 text-gray-500" />
                            </button>
                            <button
                              onClick={() => setDeleteDialog({ open: true, vendor: v })}
                              className="p-1.5 rounded hover:bg-red-50 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500 transition-colors" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* ── Expanded: agreements + products ── */}
                      {isExp && (
                        <TableRow key={`${v.vendor_id}-agreements`}>
                          <TableCell colSpan={8} className="p-0">
                            <AgreementsPanel vendorId={v.vendor_id} navigate={navigate} />
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

      {/* ── Delete Confirmation ── */}
      <Dialog open={deleteDialog.open} onOpenChange={open => setDeleteDialog(p => ({ ...p, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Vendor</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">{deleteDialog.vendor?.vendor_name}</span>?
              {" "}This will also remove all linked agreements and products.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, vendor: null })}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete Vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}