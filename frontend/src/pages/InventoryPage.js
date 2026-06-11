/**
 * InventoryPage.js — Full Warehouse Inventory Management
 *
 * ─── BACKEND ANALYSIS ────────────────────────────────────────────────────────
 * Warehouse Structure (read hierarchy):
 *   Zone → Rack (auto-creates Shelves & Bins) → Shelf → Bin
 *
 * ENDPOINTS USED:
 * ┌─ Structure ─────────────────────────────────────────────────────────────────
 * │ GET  /inventory/zones/                        → all zones (zone_id, zone_type, rack_count, total_volume_cm3, total_weight_kg)
 * │ POST /inventory/zones/create/                 → create zone (zone_id, zone_type)
 * │ GET  /inventory/racks/                        → all racks (rack_id, zone, zone_type, max_weight_kg)
 * │ POST /inventory/racks/create/                 → create rack + auto shelves + bins
 * │ GET  /inventory/shelves/                      → all shelves (shelf_id, rack_id, zone_id, position, max_weight_kg, volume_cm3)
 * │ GET  /inventory/bins/                         → all bins (bin_id, shelf_id, rack_id, zone_id, capacity, current_load, available_units, ...)
 * │ GET  /inventory/bins/available/               → bins with available space
 * │ GET  /inventory/bins/<bin_id>/contents/       → what's in a specific bin
 * ├─ Inventory ─────────────────────────────────────────────────────────────────
 * │ GET  /inventory/inventory/                    → all inventory rows (product+vendor+batch+bin, qty, abc/xyz/ved)
 * │ GET  /inventory/product/<id>/stock/           → total stock for a product
 * │ GET  /inventory/product/<id>/by-vendor/       → stock split by vendor→batch→bin
 * ├─ Batches ────────────────────────────────────────────────────────────────────
 * │ GET  /inventory/batches/                      → all batches (batch_id, vendor_name, product_name, batch_number, mfg_date, expiry)
 * ├─ Stock Movements ────────────────────────────────────────────────────────────
 * │ GET  /inventory/stock-movements/              → last 100 movements (INBOUND/OUTBOUND, qty, prev_stock, new_stock)
 * └─ Vendor Scores ──────────────────────────────────────────────────────────────
 *   GET  /inventory/vendor-scores/<product_id>/   → vendor scores for a product
 *
 * Stock is ONLY created via GRN → QC → PutawayPlan confirm workflow.
 * This page is READ-ONLY for stock. Admin can CREATE zones and racks.
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
  Search, Loader2, RefreshCw, ChevronDown, ChevronUp,
  Package, Warehouse, ArrowUpCircle, ArrowDownCircle,
  Plus, AlertTriangle, Box, Grid3X3, BarChart3,
} from "lucide-react";
import { useToast } from "../components/ui/use-toast";
import { useAuth } from "../components/lib/auth-context";
import {
  listInventoryRows, listZones, createZone,
  listRacks, createRack,
  listStockMovements,
  listBatches,
  listProducts,
} from "../services/apiService";
import { formatDateDDMMYYYY } from "../components/utils/helpers";

/* ── helpers ── */
const toArr = (res, key) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (key && Array.isArray(res[key])) return res[key];
  for (const k of ["results", "data", "items", "zones", "racks", "batches"])
    if (Array.isArray(res[k])) return res[k];
  return Object.values(res).find(Array.isArray) || [];
};

const fmt      = (n, d = 0) => n != null ? Number(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
const fmtDate  = (d) => formatDateDDMMYYYY(d);
const fmtDt    = (d) => d ? new Date(d).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—";

/* ── Classification badge ── */
const CLR = {
  A: "bg-red-100 text-red-700", B: "bg-amber-100 text-amber-700", C: "bg-green-100 text-green-700",
  V: "bg-red-100 text-red-700", E: "bg-blue-100 text-blue-700",  D: "bg-gray-100 text-gray-600",
  X: "bg-purple-100 text-purple-700", Y: "bg-indigo-100 text-indigo-700", Z: "bg-slate-100 text-slate-700",
};
const Cls = ({ v }) =>
  v ? <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${CLR[v] || "bg-gray-100 text-gray-600"}`}>{v}</span>
    : <span className="text-gray-300 text-[10px]">—</span>;

/* ── Stock badge ── */
const StockBadge = ({ qty, reorder }) => {
  if (qty <= 0)       return <Badge variant="destructive" className="text-[10px]">Out</Badge>;
  if (qty <= reorder) return <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">Low</Badge>;
  return               <Badge variant="secondary" className="text-[10px]">OK</Badge>;
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
    {badge != null && badge > 0 && (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
        active ? "bg-[#1E3A8A] text-white" : "bg-gray-200 text-gray-600"
      }`}>{badge}</span>
    )}
  </button>
);



/* ════════════════════════════════════════════════════════════
   TAB 1 — STOCK LEVELS
   GET /inventory/inventory/ + GET /products/listall/
   One aggregated row per product; click → vendor→batch→bin breakdown
═══════════════════════════════════════════════════════════ */
function StockTab({ inventoryRows, products, isLoading, search }) {
  const [expanded, setExpanded] = useState(null);

  /* Aggregate: one row per product_id, with child rows for detail */
  const productRef = {};
  for (const p of products) productRef[p.product_id] = p;

  const productMap = {};
  for (const row of inventoryRows) {
    const pid = row.product;
    if (!productMap[pid]) {
      productMap[pid] = {
        product_id:   pid,
        product_name: row.product_name,
        abc: row.abc, ved: row.ved, xyz: row.xyz,
        total: 0,
        rows: [],
      };
    }
    productMap[pid].total += row.quantity;
    productMap[pid].rows.push(row);
  }

  const aggregated = Object.values(productMap).map(pm => ({
    ...pm,
    ...(productRef[pm.product_id] || {}),
    total: pm.total,
    abc: pm.abc || productRef[pm.product_id]?.ABC || "",
    ved: pm.ved || productRef[pm.product_id]?.VED || "",
    xyz: pm.xyz || productRef[pm.product_id]?.XYZ || "",
    rows: pm.rows,
  }));

  /* Fallback: no inventory yet → show product catalogue with 0 stock */
  const list =
    inventoryRows.length > 0
      ? aggregated
      : products.map(p => ({ ...p, total: 0, rows: [], abc: p.ABC, ved: p.VED, xyz: p.XYZ }));

  const q = search.toLowerCase();
  const filtered = list.filter(p =>
    [p.product_name, p.product_id, p.sku_code, p.barcode, p.category,
     p.vendor_details?.vendor_name]
      .some(v => String(v ?? "").toLowerCase().includes(q))
  );

  const lowCount = filtered.filter(p => p.total > 0 && p.total <= (p.re_order ?? 0)).length;
  const outCount = filtered.filter(p => p.total === 0).length;

  return (
    <div className="space-y-3">
      {/* Alert banner */}
      {(lowCount > 0 || outCount > 0) && !isLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-800">
            {outCount > 0 && <><span className="font-semibold">{outCount} product{outCount > 1 ? "s" : ""} out of stock</span>. </>}
            {lowCount > 0 && <><span className="font-semibold">{lowCount} product{lowCount > 1 ? "s" : ""} below reorder point</span>.</>}
            {" "}Stock is restocked via GRN → QC → Putaway workflow.
          </p>
        </div>
      )}

      {/* No inventory yet info */}
      {inventoryRows.length === 0 && !isLoading && products.length > 0 && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-xs text-blue-700">
          No inventory records yet. Stock is created after: ASN → GRN (Supervisor) → QC Approval → Putaway Confirmation.
          Showing product catalogue with 0 stock.
        </div>
      )}

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
                <TableHead className="text-xs font-semibold text-gray-600 text-center">Class</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-right">Stock</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-right">Cartons</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-right">Reorder</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1E3A8A]" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-gray-400 text-sm">
                    No products match your search.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(p => {
                  const isExp   = expanded === p.product_id;
                  const reorder = p.re_order ?? 0;
                  const cf      = Number(p.conversion_factor) || 1;
                  const cartons = p.total > 0 ? (p.total / cf).toFixed(1) : 0;

                  return (
                    <React.Fragment key={p.product_id}>
                      <TableRow
                        className={`cursor-pointer hover:bg-gray-50 transition-colors ${isExp ? "bg-blue-50/30" : ""}`}
                        onClick={() => setExpanded(isExp ? null : p.product_id)}
                      >
                        <TableCell className="pr-0 pl-3">
                          {isExp ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                                 : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium text-gray-900">{p.product_name}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{p.product_id} · {p.sku_code || "—"}</p>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-gray-500">{p.barcode || "—"}</TableCell>
                        <TableCell className="text-xs text-gray-500">{p.category || "—"}</TableCell>
                        <TableCell className="text-xs text-gray-600">
                          {p.vendor_details?.vendor_name || p.vendor_name || "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <Cls v={p.abc || p.ABC} />
                            <Cls v={p.ved || p.VED} />
                            <Cls v={p.xyz || p.XYZ} />
                          </div>
                        </TableCell>
                        <TableCell className={`text-right tabular-nums text-sm font-semibold ${
                          p.total === 0 ? "text-red-500" : p.total <= reorder ? "text-amber-600" : "text-gray-900"
                        }`}>
                          {fmt(p.total)} <span className="text-gray-400 text-[10px] font-normal">{p.base_unit || "pcs"}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-gray-500">
                          {p.total > 0 ? `${fmt(cartons, 1)} ${p.purchase_unit || "cartons"}` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-gray-500">
                          {reorder > 0 ? `${fmt(reorder)}` : "—"}
                        </TableCell>
                        <TableCell>
                          <StockBadge qty={p.total} reorder={reorder} />
                        </TableCell>
                      </TableRow>

                      {/* Expanded: bin-level breakdown */}
                      {isExp && (
                        <TableRow key={`${p.product_id}-exp`} className="bg-blue-50/10">
                          <TableCell colSpan={10} className="py-0">
                            {p.rows.length === 0 ? (
                              <p className="text-xs text-gray-400 px-8 py-3">
                                No inventory records — stock arrives after GRN → QC → Putaway is confirmed.
                              </p>
                            ) : (
                              <div className="px-6 py-3 overflow-x-auto">
                                {/* Group by vendor */}
                                {(() => {
                                  const byVendor = {};
                                  for (const row of p.rows) {
                                    const vname = row.vendor_name || row.vendor || "Unknown";
                                    if (!byVendor[vname]) byVendor[vname] = { total: 0, rows: [] };
                                    byVendor[vname].total += row.quantity;
                                    byVendor[vname].rows.push(row);
                                  }
                                  return Object.entries(byVendor).map(([vname, vdata]) => (
                                    <div key={vname} className="mb-3 last:mb-0">
                                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                        Vendor: {vname} — {fmt(vdata.total)} {p.base_unit || "pcs"}
                                      </p>
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="text-gray-400 border-b border-gray-100">
                                            <th className="text-left py-1 font-semibold">Bin</th>
                                            <th className="text-left py-1 font-semibold">Shelf</th>
                                            <th className="text-left py-1 font-semibold">Rack</th>
                                            <th className="text-left py-1 font-semibold">Zone</th>
                                            <th className="text-left py-1 font-semibold">Batch</th>
                                            <th className="text-right py-1 font-semibold">Qty</th>
                                            <th className="text-right py-1 font-semibold">Last Update</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {vdata.rows.map(row => (
                                            <tr key={row.inventory_id} className="border-b border-gray-50 hover:bg-blue-50/30">
                                              <td className="py-1 font-mono text-gray-600">{row.bin_id}</td>
                                              <td className="py-1 text-gray-500">{row.shelf_id}</td>
                                              <td className="py-1 text-gray-500">{row.rack_id}</td>
                                              <td className="py-1 text-gray-500">{row.zone_id}</td>
                                              <td className="py-1 font-mono text-gray-500">{row.batch_number || "—"}</td>
                                              <td className="py-1 text-right font-semibold text-gray-900">{fmt(row.quantity)}</td>
                                              <td className="py-1 text-right text-gray-400">{fmtDate(row.last_update)}</td>
                                            </tr>
                                          ))}
                                          <tr className="font-semibold text-[#1E3A8A]">
                                            <td colSpan={5} className="pt-1.5 text-xs">Subtotal</td>
                                            <td className="pt-1.5 text-right text-sm">{fmt(vdata.total)}</td>
                                            <td />
                                          </tr>
                                        </tbody>
                                      </table>
                                    </div>
                                  ));
                                })()}
                              </div>
                            )}
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
   TAB 2 — ZONES & RACKS
   GET /inventory/zones/   GET /inventory/racks/   GET /inventory/shelves/
   POST /inventory/zones/create/   POST /inventory/racks/create/
═══════════════════════════════════════════════════════════ */

/* Create Zone Dialog */
function CreateZoneDialog({ onClose, onCreated }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ zone_id: "", zone_type: "DRY" });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.zone_id.trim()) {
      toast({ title: "Required", description: "Zone ID is required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createZone(form);
      toast({ title: "Created", description: `Zone ${form.zone_id} created.` });
      onCreated();
      onClose();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[360px]">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Create Zone</DialogTitle>
            <DialogDescription>
              Zones are the top-level warehouse areas (DRY, COLD, FROZEN, etc.)
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="z-id" className="text-xs">Zone ID *</Label>
              <Input id="z-id" placeholder="e.g. ZONE-A" value={form.zone_id}
                onChange={e => setForm(f => ({ ...f, zone_id: e.target.value.toUpperCase() }))} className="h-8 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="z-type" className="text-xs">Zone Type *</Label>
              <select id="z-type" value={form.zone_type}
                onChange={e => setForm(f => ({ ...f, zone_type: e.target.value }))}
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                {["DRY","COLD","FROZEN","HAZMAT","BULK","RETURNS","AMBIENT"].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving} className="bg-[#1E3A8A] hover:bg-[#1E293B]">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create Zone
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* Create Rack Dialog */
function CreateRackDialog({ zones, onClose, onCreated }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    rack_id: "",
    zone: zones[0]?.zone_id || "",
    max_weight_kg: "",
    shelf_count: "6",
    bin_count_per_shelf: "10",
    bin_capacity: "50",
    bin_max_weight_kg: "",
    bin_volume_cm3: "",
    distance_from_dispatch: "0",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.rack_id.trim()) {
      toast({ title: "Required", description: "Rack ID is required.", variant: "destructive" });
      return;
    }
    const sc = parseInt(form.shelf_count);
    if (sc % 3 !== 0) {
      toast({ title: "Validation", description: "Shelf count must be divisible by 3 (Bottom/Middle/Top positions).", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== "").map(([k, v]) => [k, isNaN(v) ? v : Number(v)])
      );
      const res = await createRack(payload);
      toast({
        title: "Rack Created",
        description: `${res.rack_id} — ${res.shelves_created} shelves, ${res.bins_created} bins created.`,
      });
      onCreated();
      onClose();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Create Rack</DialogTitle>
            <DialogDescription>
              Creating a rack auto-generates all shelves (Bottom/Middle/Top) and bins.
              Shelf count must be divisible by 3.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">

            {/* Rack ID */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Rack ID *</Label>
              <Input
                placeholder="e.g. RACK-A1"
                value={form.rack_id}
                onChange={e => set("rack_id", e.target.value.toUpperCase())}
                className="h-8 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Zone *</Label>
                <select value={form.zone} onChange={e => set("zone", e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {zones.map(z => <option key={z.zone_id} value={z.zone_id}>{z.zone_id} ({z.zone_type})</option>)}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Max Weight (kg)</Label>
                <Input type="number" min="0" value={form.max_weight_kg} onChange={e => set("max_weight_kg", e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Shelf Configuration</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Shelf Count * (÷3)</Label>
                <Input type="number" min="3" step="3" value={form.shelf_count} onChange={e => set("shelf_count", e.target.value)} className="h-8 text-sm" />
                <p className="text-[9px] text-gray-400">Shelves 1-{Math.floor(parseInt(form.shelf_count||3)/3)*1} = Bottom, etc.</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Bins per Shelf *</Label>
                <Input type="number" min="1" value={form.bin_count_per_shelf} onChange={e => set("bin_count_per_shelf", e.target.value)} className="h-8 text-sm" />
                <p className="text-[9px] text-gray-400">Total bins = {parseInt(form.shelf_count||0) * parseInt(form.bin_count_per_shelf||0)}</p>
              </div>
            </div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Bin Dimensions (applies to all bins)</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Bin Capacity (units)</Label>
                <Input type="number" min="1" value={form.bin_capacity} onChange={e => set("bin_capacity", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Bin Max Weight (kg)</Label>
                <Input type="number" min="0" step="0.1" value={form.bin_max_weight_kg} onChange={e => set("bin_max_weight_kg", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Bin Volume (cm³)</Label>
                <Input type="number" min="0" value={form.bin_volume_cm3} onChange={e => set("bin_volume_cm3", e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Distance from Dispatch (m)</Label>
              <Input type="number" min="0" step="0.1" value={form.distance_from_dispatch} onChange={e => set("distance_from_dispatch", e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving || zones.length === 0} className="bg-[#1E3A8A] hover:bg-[#1E293B]">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create Rack
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ZonesRacksTab({ zones, racks, isLoading, canManage, onRefresh }) {
  const [expandedZone, setExpandedZone] = useState(null);
  const [showZoneDialog, setShowZoneDialog] = useState(false);
  const [showRackDialog, setShowRackDialog] = useState(false);

  /* Group racks by zone */
  const racksByZone = {};
  for (const r of racks) {
    const zid = r.zone || r.zone_id;
    if (!racksByZone[zid]) racksByZone[zid] = [];
    racksByZone[zid].push(r);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {canManage && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowZoneDialog(true)} className="h-8 bg-[#1E3A8A] hover:bg-[#1E293B] gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Zone
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowRackDialog(true)} disabled={zones.length === 0} className="h-8 gap-1.5">
            <Grid3X3 className="w-3.5 h-3.5" /> Add Rack
          </Button>
          {zones.length === 0 && (
            <p className="text-xs text-gray-400">Create a zone first before adding racks.</p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1E3A8A]" /></div>
      ) : zones.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Warehouse className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No zones configured yet.</p>
          {canManage && <p className="text-xs mt-1">Click "Add Zone" to set up your warehouse structure.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {zones.map(zone => {
            const zRacks = racksByZone[zone.zone_id] || [];
            const isExp  = expandedZone === zone.zone_id;

            return (
              <Card key={zone.zone_id} className="shadow-sm border-gray-200 overflow-hidden">
                {/* Zone header */}
                <div
                  className={`flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${isExp ? "bg-blue-50/20" : ""}`}
                  onClick={() => setExpandedZone(isExp ? null : zone.zone_id)}
                >
                  {isExp ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                         : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}

                  {/* Zone type badge */}
                  <div className="flex items-center gap-2 flex-1">
                    <span className="px-2 py-1 rounded text-xs font-bold bg-[#1E3A8A] text-white">{zone.zone_type}</span>
                    <span className="text-sm font-semibold text-gray-800">{zone.zone_id}</span>
                  </div>

                  {/* Zone stats */}
                  <div className="hidden sm:flex items-center gap-6 text-xs text-gray-500">
                    <span><span className="font-semibold text-gray-700">{zone.rack_count ?? zRacks.length}</span> racks</span>
                    {zone.total_volume_cm3 != null && (
                      <span><span className="font-semibold text-gray-700">{fmt(zone.total_volume_cm3 / 1e6, 1)}</span> m³ capacity</span>
                    )}
                    {zone.total_weight_kg != null && (
                      <span><span className="font-semibold text-gray-700">{fmt(zone.total_weight_kg)}</span> kg max</span>
                    )}
                  </div>
                </div>

                {/* Expanded: rack list */}
                {isExp && (
                  <div className="border-t border-gray-100">
                    {zRacks.length === 0 ? (
                      <p className="text-xs text-gray-400 px-6 py-4">No racks in this zone yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                              <th className="text-left px-6 py-2 font-semibold">Rack ID</th>
                              <th className="text-left px-4 py-2 font-semibold">Zone Type</th>
                              <th className="text-right px-4 py-2 font-semibold">Max Weight (kg)</th>
                              <th className="text-left px-4 py-2 font-semibold">Created</th>
                            </tr>
                          </thead>
                          <tbody>
                            {zRacks.map(r => (
                              <tr key={r.rack_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                <td className="px-6 py-2 font-mono text-gray-700 font-medium">{r.rack_id}</td>
                                <td className="px-4 py-2 text-gray-500">{r.zone_type || "—"}</td>
                                <td className="px-4 py-2 text-right text-gray-600 tabular-nums">{r.max_weight_kg ? fmt(r.max_weight_kg, 0) : "—"}</td>
                                <td className="px-4 py-2 text-gray-400">{fmtDate(r.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {showZoneDialog && <CreateZoneDialog onClose={() => setShowZoneDialog(false)} onCreated={onRefresh} />}
      {showRackDialog && <CreateRackDialog zones={zones} onClose={() => setShowRackDialog(false)} onCreated={onRefresh} />}
    </div>
  );
}


/* ════════════════════════════════════════════════════════════
   TAB 3 — BATCHES
   GET /inventory/batches/
   batch_id, vendor_name, product_name, batch_number, mfg_date, expiry_date
═══════════════════════════════════════════════════════════ */
function BatchesTab({ batches, isLoading, search }) {
  const q = search.toLowerCase();
  const filtered = batches.filter(b =>
    [b.batch_id, b.batch_number, b.vendor_name, b.product_name]
      .some(v => String(v ?? "").toLowerCase().includes(q))
  );

  const now = new Date();
  const expiredCount = batches.filter(b => b.expiry_date && new Date(b.expiry_date) < now).length;
  const expiringSoon = batches.filter(b => {
    if (!b.expiry_date) return false;
    const d = new Date(b.expiry_date);
    return d >= now && (d - now) / (1000 * 86400) <= 30;
  }).length;

  return (
    <div className="space-y-3">
      {/* Alert */}
      {(expiredCount > 0 || expiringSoon > 0) && !isLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-xs text-red-800">
            {expiredCount > 0 && <><span className="font-semibold">{expiredCount} batch{expiredCount > 1 ? "es" : ""} expired</span>. </>}
            {expiringSoon > 0 && <><span className="font-semibold">{expiringSoon} batch{expiringSoon > 1 ? "es" : ""} expiring within 30 days</span>.</>}
          </p>
        </div>
      )}

      <Card className="shadow-sm border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs font-semibold text-gray-600">Batch ID</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Batch Number</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Product</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Vendor</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Mfg Date</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Expiry Date</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1E3A8A]" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                    {search ? "No batches match your search." : "No batches yet. Batches are created during GRN processing."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(b => {
                  const isExpired = b.expiry_date && new Date(b.expiry_date) < now;
                  const daysLeft  = b.expiry_date
                    ? Math.ceil((new Date(b.expiry_date) - now) / (1000 * 86400))
                    : null;
                  const soonExpiring = daysLeft != null && daysLeft >= 0 && daysLeft <= 30;

                  return (
                    <TableRow key={b.batch_id} className="hover:bg-gray-50 transition-colors">
                      <TableCell className="text-xs font-mono text-gray-600">{b.batch_id}</TableCell>
                      <TableCell className="text-xs font-mono font-semibold text-gray-800">{b.batch_number}</TableCell>
                      <TableCell className="text-xs text-gray-700">{b.product_name}</TableCell>
                      <TableCell className="text-xs text-gray-500">{b.vendor_name}</TableCell>
                      <TableCell className="text-xs text-gray-500">{fmtDate(b.manufactured_date)}</TableCell>
                      <TableCell className={`text-xs font-medium ${isExpired ? "text-red-600" : soonExpiring ? "text-amber-600" : "text-gray-600"}`}>
                        {fmtDate(b.expiry_date)}
                        {daysLeft != null && !isExpired && (
                          <span className="ml-1 text-[10px] text-gray-400">({daysLeft}d left)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {isExpired
                          ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">Expired</span>
                          : soonExpiring
                          ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">Expiring Soon</span>
                          : <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">Valid</span>}
                      </TableCell>
                    </TableRow>
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
   TAB 4 — STOCK MOVEMENTS
   GET /inventory/stock-movements/
   Returns last 100: id, product_name, vendor_name, batch_number,
   bin_id, movement_type (INBOUND/OUTBOUND), quantity,
   previous_stock, new_stock, created_at
═══════════════════════════════════════════════════════════ */
function MovementsTab({ movements, isLoading, search }) {
  const q = search.toLowerCase();
  const filtered = movements.filter(m =>
    [m.product_name, m.vendor_name, m.bin_id, m.batch_number, m.movement_type]
      .some(v => String(v ?? "").toLowerCase().includes(q))
  );

  const inboundTotal  = movements.filter(m => m.movement_type === "INBOUND").reduce((s, m) => s + m.quantity, 0);
  const outboundTotal = movements.filter(m => m.movement_type === "OUTBOUND").reduce((s, m) => s + m.quantity, 0);

  return (
    <div className="space-y-3">
      {/* Summary mini-cards */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-100">
          <ArrowUpCircle className="w-4 h-4 text-green-600" />
          <div>
            <p className="text-[10px] text-green-600">Inbound (recent 100)</p>
            <p className="text-sm font-bold text-green-700">{fmt(inboundTotal)} units</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
          <ArrowDownCircle className="w-4 h-4 text-red-500" />
          <div>
            <p className="text-[10px] text-red-500">Outbound (recent 100)</p>
            <p className="text-sm font-bold text-red-600">{fmt(outboundTotal)} units</p>
          </div>
        </div>
      </div>

      <Card className="shadow-sm border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs font-semibold text-gray-600">Type</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Product</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Vendor</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Batch</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Bin</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-right">Qty</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-right">Prev Stock</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-right">New Stock</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Date/Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1E3A8A]" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-gray-400 text-sm">
                    {search ? "No movements match your search." : "No stock movements recorded yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(m => (
                  <TableRow key={m.id} className="hover:bg-gray-50 transition-colors">
                    <TableCell>
                      {m.movement_type === "INBOUND"
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                            <ArrowUpCircle className="w-2.5 h-2.5" /> IN
                          </span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600">
                            <ArrowDownCircle className="w-2.5 h-2.5" /> OUT
                          </span>}
                    </TableCell>
                    <TableCell className="text-xs font-medium text-gray-800">{m.product_name}</TableCell>
                    <TableCell className="text-xs text-gray-500">{m.vendor_name || "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-gray-500">{m.batch_number || "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-gray-500">{m.bin_id || "—"}</TableCell>
                    <TableCell className={`text-right tabular-nums text-sm font-bold ${
                      m.movement_type === "INBOUND" ? "text-green-600" : "text-red-500"
                    }`}>
                      {m.movement_type === "OUTBOUND" ? "-" : "+"}{fmt(m.quantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-gray-500">{fmt(m.previous_stock)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-gray-700 font-medium">{fmt(m.new_stock)}</TableCell>
                    <TableCell className="text-xs text-gray-400">{fmtDt(m.created_at)}</TableCell>
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


/* ════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
export default function InventoryPage() {
  const { user }  = useAuth();
  const { toast } = useToast();

  const [tab, setTab]     = useState("stock");  // "stock" | "zones" | "batches" | "movements"
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [inventoryRows, setInventoryRows] = useState([]);
  const [products, setProducts]           = useState([]);
  const [zones, setZones]                 = useState([]);
  const [racks, setRacks]                 = useState([]);
  const [batches, setBatches]             = useState([]);
  const [movements, setMovements]         = useState([]);

  const canManage = ["admin", "inventory_manager"].includes(user?.role);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [invRes, prodRes, zRes, rRes, bRes, mRes] = await Promise.allSettled([
        listInventoryRows(),
        listProducts(),
        listZones(),
        listRacks(),
        listBatches(),
        listStockMovements(),
      ]);

      if (invRes.status  === "fulfilled") setInventoryRows(toArr(invRes.value));
      if (prodRes.status === "fulfilled") setProducts(toArr(prodRes.value, "products"));
      if (zRes.status    === "fulfilled") setZones(toArr(zRes.value));
      if (rRes.status    === "fulfilled") setRacks(toArr(rRes.value));
      if (bRes.status    === "fulfilled") setBatches(toArr(bRes.value));
      if (mRes.status    === "fulfilled") setMovements(toArr(mRes.value));
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  /* ── Summary stats ── */
  const totalProducts  = products.length;
  // totalBins would need bins endpoint — zones/racks give full structure
  const recentMovements = movements.length;

  return (
    <div className="space-y-4">

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Products Tracked", value: totalProducts, icon: Package,    cls: "text-[#1E3A8A]" },
          { label: "Zones",            value: zones.length,  icon: Warehouse,  cls: "text-purple-600" },
          { label: "Racks",            value: racks.length,  icon: Grid3X3,    cls: "text-indigo-600" },
          { label: "Recent Movements", value: recentMovements, icon: BarChart3, cls: "text-gray-600" },
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder={tab === "zones" ? "Zones & racks..." : tab === "batches" ? "Search batches..." : "Search products, vendors..."}
            className="pl-9 h-9 border-gray-200"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={load} className="p-1.5 rounded border border-gray-200 hover:bg-gray-50 transition-colors" title="Refresh">
          <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-gray-200 flex gap-0 overflow-x-auto">
        <Tab active={tab === "stock"}     onClick={() => setTab("stock")}     badge={inventoryRows.length > 0 ? products.length : 0}>
          <Package className="w-3.5 h-3.5" /> Stock Levels
        </Tab>
        <Tab active={tab === "zones"}     onClick={() => setTab("zones")}     badge={zones.length}>
          <Warehouse className="w-3.5 h-3.5" /> Zones & Racks
        </Tab>
        <Tab active={tab === "batches"}   onClick={() => setTab("batches")}   badge={batches.length}>
          <Box className="w-3.5 h-3.5" /> Batches
        </Tab>
        <Tab active={tab === "movements"} onClick={() => setTab("movements")} badge={movements.length}>
          <BarChart3 className="w-3.5 h-3.5" /> Stock Movements
        </Tab>
      </div>

      {/* ── Tab content ── */}
      {tab === "stock" && (
        <StockTab
          inventoryRows={inventoryRows}
          products={products}
          isLoading={isLoading}
          search={search}
        />
      )}
      {tab === "zones" && (
        <ZonesRacksTab
          zones={zones}
          racks={racks}
          isLoading={isLoading}
          canManage={canManage}
          onRefresh={load}
        />
      )}
      {tab === "batches" && (
        <BatchesTab
          batches={batches}
          isLoading={isLoading}
          search={search}
        />
      )}
      {tab === "movements" && (
        <MovementsTab
          movements={movements}
          isLoading={isLoading}
          search={search}
        />
      )}
    </div>
  );
}