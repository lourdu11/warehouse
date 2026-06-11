/**
 * ASNPage.js — List & View ASNs
 *
 * Key fixes:
 * 1. ASN model has NO status field — derive display status from GRN linkage:
 *    - Has completed GRN → "Received"
 *    - Has any GRN (RECEIVED / QC_PENDING / PUTAWAY) → "In Transit"
 *    - No GRN → "Pending" (shipment not yet received)
 * 2. Create modal removed → "New ASN" navigates to /asn/create dedicated page
 * 3. Proper color-coded status badges for all states
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button }  from "../components/ui/button";
import { Input }   from "../components/ui/input";
import { Card }    from "../components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import { Plus, Search, Eye, Loader2, RefreshCw, Truck, X, Printer } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import { useAuth } from "../components/lib/auth-context";
import { listASN, getASN } from "../services/apiService";
import { useToast } from "../components/ui/use-toast";
import { formatDateDDMMYYYY } from "../components/utils/helpers";

/* ── helpers ── */
const toArray = (res, knownKey = null) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (knownKey && Array.isArray(res[knownKey])) return res[knownKey];
  for (const key of ["results", "data", "items"])
    if (Array.isArray(res[key])) return res[key];
  return Object.values(res).find(Array.isArray) || [];
};

const matchesSearch = (value, query) =>
  String(value ?? "").toLowerCase().includes(query);

/**
 * Map backend-returned status strings to display config.
 * Backend get_status() returns exactly: "Pending" | "In Transit" | "Received"
 */
const STATUS_CFG = {
  "Pending":    { color: "bg-slate-100 text-slate-700 border-slate-200"     },
  "In Transit": { color: "bg-blue-100 text-blue-700 border-blue-200"        },
  "Received":   { color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  "Cancelled":  { color: "bg-red-100 text-red-700 border-red-200"           },
};

function StatusBadge({ asn }) {
  const label = asn.status || "Pending";
  const cfg   = STATUS_CFG[label] ?? { color: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.color}`}>
      {label}
    </span>
  );
}


/* ── ASN Print Sheet ── */
function printASN(asn) {
  const items = asn.items ?? [];
  const itemRows = items.map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${it.product_name ?? "—"}</td>
      <td style="text-align:right">${it.expected_quantity ?? 0}</td>
      <td style="text-align:right">${it.shipped_quantity ?? 0}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>ASN — ${asn.asn_id}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; padding: 24px; color: #111; }
    h1 { font-size: 16px; margin-bottom: 4px; }
    .sub { color: #555; font-size: 11px; margin-bottom: 16px; }
    .barcode-wrap { text-align: center; margin-bottom: 20px; }
    .barcode-wrap svg { display: inline-block; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
    .field label { font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: #777; }
    .field p { font-weight: 600; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #f0f0f0; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; }
    td { padding: 6px 8px; border-bottom: 1px solid #eee; }
    .footer { margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px;
              font-size: 9px; color: #888; text-align: center; }
  </style>
</head><body>
  <h1>Advanced Shipping Notice</h1>
  <div class="sub">${asn.vendor_name ?? ""} &nbsp;|&nbsp; Status: ${asn.status ?? "Pending"}</div>

  <div class="barcode-wrap">
    <svg class="bc" data-value="${asn.asn_id}"></svg>
  </div>

  <div class="grid">
    <div class="field"><label>ASN ID</label><p>${asn.asn_id}</p></div>
    <div class="field"><label>ASN Number</label><p>${asn.asn_number ?? "—"}</p></div>
    <div class="field"><label>Purchase Order</label><p>${asn.po_id ?? asn.po ?? "—"}</p></div>
    <div class="field"><label>Vendor</label><p>${asn.vendor_name ?? "—"}</p></div>
    <div class="field"><label>Shipment Date</label><p>${formatDateDDMMYYYY(asn.shipment_date)}</p></div>
    <div class="field"><label>Expected Arrival</label><p>${formatDateDDMMYYYY(asn.expected_arrival_date)}</p></div>
    <div class="field"><label>Vehicle No.</label><p>${asn.vehicle_num ?? "—"}</p></div>
    <div class="field"><label>Driver Name</label><p>${asn.driver_name ?? "—"}</p></div>
    <div class="field"><label>Driver Phone</label><p>${asn.driver_phone ?? "—"}</p></div>
  </div>

  ${items.length > 0 ? `
  <table>
    <thead><tr><th>#</th><th>Product</th><th style="text-align:right">Expected Qty</th><th style="text-align:right">Shipped Qty</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>` : "<p style='color:#888'>No items attached.</p>"}

  <div class="footer">Printed ${new Date().toLocaleString()} &nbsp;|&nbsp; WMS Pro</div>

  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/barcodes/JsBarcode.code128.min.js"></script>
  <script>
    window.onload = function() {
      document.querySelectorAll('svg.bc').forEach(function(el) {
        try {
          JsBarcode(el, el.dataset.value, {
            format: 'CODE128', width: 2, height: 50,
            displayValue: true, fontSize: 11, margin: 6
          });
        } catch(e) { el.parentNode.innerHTML = '<p style="font-family:monospace">' + el.dataset.value + '</p>'; }
      });
      setTimeout(function(){ window.print(); }, 700);
    };
  </script>
</body></html>`;

  const win = window.open("", "_blank", "width=800,height=700");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/* ── View Details Dialog ── */
function ViewASNDialog({ asn, onClose }) {
  if (!asn) return null;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-[#1E3A8A]" />
            ASN — {asn.asn_id}
          </DialogTitle>
          <DialogDescription>{asn.vendor_name ?? "—"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Status */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-36">Status</span>
            <StatusBadge asn={asn} />
          </div>

          {/* Core fields */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {[
              ["ASN Number",       asn.asn_number],
              ["PO",               asn.po_id ?? asn.po],
              ["Vendor",           asn.vendor_name],
              ["Shipment Date",    formatDateDDMMYYYY(asn.shipment_date)],
              ["Expected Arrival", formatDateDDMMYYYY(asn.expected_arrival_date)],
              ["Vehicle No.",      asn.vehicle_num ?? "—"],
              ["Driver Name",      asn.driver_name ?? "—"],
              ["Driver Phone",     asn.driver_phone ?? "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                <p className="font-medium text-gray-900 mt-0.5">{value || "—"}</p>
              </div>
            ))}
          </div>

          {/* Items */}
          {(asn.items?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 pt-2 border-t">
                Items ({asn.items.length})
              </p>
              <div className="space-y-1.5">
                {asn.items.map((item, i) => (
                  <div key={i} className="rounded-md bg-muted/30 px-3 py-2 text-xs">
                    <p className="font-medium text-gray-800">{item.product_name ?? `Item ${i + 1}`}</p>
                    <div className="flex gap-4 mt-0.5 text-muted-foreground">
                      <span>Expected: <strong>{item.expected_quantity ?? 0}</strong></span>
                      <span>Shipped: <strong>{item.shipped_quantity ?? 0}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => printASN(asn)}>
            <Printer className="w-4 h-4 mr-1.5" /> Print / Barcode
          </Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════════════════════════════════════════ */
export default function ASNPage() {
  const { user }   = useAuth();
  const { toast: showToast } = useToast();
  const navigate   = useNavigate();

  const [search,    setSearch]   = useState("");
  const [asnData,   setAsnData]  = useState([]);
  const [isLoading, setLoading]  = useState(true);
  const [viewASN,   setViewASN]  = useState(null);

  const loadASNs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listASN();
      const parsed = toArray(data);
      // Sort in opposite order (descending / newest first) by asn_id
      parsed.sort((a, b) => b.asn_id.localeCompare(a.asn_id));
      setAsnData(parsed);
    } catch {
      showToast({ title: "Error", description: "Failed to load ASNs.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadASNs(); }, [loadASNs]);

  const handleView = useCallback(async (asnId) => {
    try {
      const asn = await getASN(asnId);
      setViewASN(asn);
    } catch {
      showToast({ title: "Error", description: "Failed to load ASN details.", variant: "destructive" });
    }
  }, [showToast]);

  const q        = search.toLowerCase();
  const filtered = asnData.filter(a =>
    matchesSearch(a.asn_id, q) ||
    matchesSearch(a.asn_number, q) ||
    matchesSearch(a.vendor_name, q) ||
    matchesSearch(a.po_id ?? a.po, q)
  );

  return (
    <div className="space-y-4">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by ASN ID, number, vendor, PO…"
            className="pl-9 h-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-9" onClick={loadASNs}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          {user?.role !== "manager" && (
            <Button
              id="new-asn-btn"
              size="sm"
              className="h-9 bg-[#1E3A8A] hover:bg-[#162d6e]"
              onClick={() => navigate("/asn/create")}
            >
              <Plus className="w-4 h-4 mr-1.5" /> New ASN
            </Button>
          )}
        </div>
      </div>


      {/* ── Table ── */}
      <Card className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">ASN ID</TableHead>
                <TableHead className="text-xs font-semibold">ASN Number</TableHead>
                <TableHead className="text-xs font-semibold">PO</TableHead>
                <TableHead className="text-xs font-semibold">Vendor</TableHead>
                <TableHead className="text-xs font-semibold text-right">Items</TableHead>
                <TableHead className="text-xs font-semibold">Shipment Date</TableHead>
                <TableHead className="text-xs font-semibold">ETA</TableHead>
                <TableHead className="text-xs font-semibold">Driver</TableHead>
                <TableHead className="text-xs font-semibold">Vehicle No.</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold text-right w-[60px]">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-10 text-muted-foreground text-sm">
                    {search ? "No ASNs match your search." : "No ASNs found. Create one to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(asn => (
                  <TableRow key={asn.asn_id} className="hover:bg-muted/20">
                    <TableCell className="text-xs font-mono font-semibold">{asn.asn_id}</TableCell>
                    <TableCell className="text-xs font-mono">{asn.asn_number || "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{asn.po_id ?? asn.po ?? "—"}</TableCell>
                    <TableCell className="text-sm">{asn.vendor_name || "—"}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{asn.items?.length ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateDDMMYYYY(asn.shipment_date)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateDDMMYYYY(asn.expected_arrival_date)}
                    </TableCell>
                    <TableCell className="text-xs">{asn.driver_name || "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{asn.vehicle_num || "—"}</TableCell>
                    <TableCell><StatusBadge asn={asn} /></TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => handleView(asn.asn_id)}
                        className="p-1.5 rounded hover:bg-muted transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Count */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Showing {filtered.length} of {asnData.length} ASNs
        </p>
      )}

      {/* View Dialog */}
      {viewASN && <ViewASNDialog asn={viewASN} onClose={() => setViewASN(null)} />}
    </div>
  );
}