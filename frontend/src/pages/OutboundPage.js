import { useState, useEffect, useCallback } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import { Label } from "../components/ui/label";
import {
  Plus, Search, Loader2, PackageOpen, Truck, ShoppingBag,
  RefreshCw, CheckCircle2, AlertTriangle, X, User,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import { useToast } from "../components/ui/use-toast";
import {
  removeStockByProduct, listProducts, listStockMovements,
  listSalesOrders, pickPackSO, printSOLogsheet, listCustomers,
} from "../services/apiService";

/* ── helpers ── */
const toArray = (res, knownKey = null) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (knownKey && Array.isArray(res[knownKey])) return res[knownKey];
  for (const key of ["results", "data", "items"])
    if (Array.isArray(res[key])) return res[key];
  return Object.values(res).find(Array.isArray) || [];
};

/* ── STATUS helpers for Sales Orders ── */
const SO_STATUS_COLOR = {
  "Finance Confirmed":   "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Pick & Pack":         "bg-blue-100 text-blue-800 border-blue-300",
  "Ready for Dispatch":  "bg-orange-100 text-orange-800 border-orange-300",
  "Dispatched":          "bg-teal-100 text-teal-800 border-teal-300",
};
const SOPill = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${SO_STATUS_COLOR[status] || "bg-gray-100 text-gray-700 border-gray-300"}`}>
    {status}
  </span>
);



/* ── Print SO Logsheet (HTML PDF print ready) ── */
function openSOLogsheet(so) {
  const formattedDate = so.created_at ? new Date(so.created_at).toLocaleDateString("en-IN") : "—";
  const totalAmount = parseFloat(so.total_amount || 0).toLocaleString("en-IN");
  const amountReceived = parseFloat(so.payment_info?.amount_received || 0).toLocaleString("en-IN");
  const balanceDue = parseFloat(so.payment_info?.balance_due || 0).toLocaleString("en-IN");
  
  let soNum = 1;
  if (so.so_id) {
    const matched = so.so_id.match(/\d+/);
    if (matched) soNum = parseInt(matched[0], 10);
  }
  const paddedNum = String(soNum).padStart(2, '0');
  const barcodeVal = so.barcode || `${so.so_id}-ITM-D${paddedNum}`;

  const barcodeCell = so.barcode_image
    ? `<img src="data:image/png;base64,${so.barcode_image}" style="height:54px;width:auto;display:block;margin:0 auto;" alt="${barcodeVal}" />`
    : `<svg class="bc" data-value="${barcodeVal}" style="display:block;margin:0 auto;max-height:54px;"></svg>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>SO Logsheet — ${so.so_id}</title>
  <style>
    @media print { .no-print { display: none !important; } }
    * { box-sizing: border-box; }
    body { font-family: Calibri, Arial, sans-serif; margin: 1.2cm 1.8cm; color: #0f172a; font-size: 12px; }
    .header-bar { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2.5px solid #0D9488; padding-bottom: 10px; margin-bottom: 15px; }
    h1 { font-size: 18px; font-weight: 700; color: #0D9488; margin: 0 0 3px; }
    .meta { font-size: 11px; color: #475569; line-height: 1.6; }
    .meta strong { color: #0f172a; }
    .section-title { font-size: 12px; font-weight: 700; color: #0D9488; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-top: 15px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .grid-container { display: grid; grid-template-cols: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
    .detail-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; background: #f8fafc; }
    .detail-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px; border-bottom: 1px dashed #f1f5f9; padding-bottom: 4px; }
    .detail-row:last-child { margin-bottom: 0; border-bottom: none; }
    .detail-label { color: #64748b; font-weight: 500; }
    .detail-value { color: #0f172a; font-weight: 600; }
    .barcode-box { text-align: center; padding: 15px; border: 2px dashed #0D9488; border-radius: 6px; background: #f0fdfa; }
    .barcode-value { font-family: Courier New, monospace; font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 5px; letter-spacing: 2px; }
    .notice { background: #f0fdfa; border: 1px solid #99f6e4; padding: 8px 12px; font-size: 10px; color: #0f766e; border-radius: 4px; margin-bottom: 15px; }
    table { border-collapse: collapse; width: 100%; margin-top: 10px; }
    th { background: #0D9488; color: #fff; font-size: 11px; padding: 8px; border: 1px solid #0D9488; text-align: left; }
    td { border: 1px solid #cbd5e1; padding: 8px; font-size: 11px; vertical-align: middle; }
    .c { text-align: center; }
    .r { text-align: right; }
    .font-bold { font-weight: 700; }
    .sign-row { margin-top: 35px; display: flex; gap: 40px; font-size: 11px; color: #475569; border-top: 1px solid #e2e8f0; padding-top: 15px; }
    .sign-field { flex: 1; }
    .sign-field .line { border-bottom: 1px solid #94a3b8; height: 35px; margin-bottom: 4px; }
    .footer { margin-top: 25px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; border-top: 1px solid #f1f5f9; padding-top: 8px; }
    .print-btn { background: #0D9488; color: #fff; border: none; padding: 8px 20px; border-radius: 6px; font-size: 12px; cursor: pointer; font-family: inherit; font-weight: 600; }
    .print-btn:hover { background: #0f766e; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
</head>
<body>
  <div class="header-bar">
    <div>
      <h1>Sales Order Outbound Logsheet</h1>
      <div class="meta">
        <strong>SO ID:</strong> ${so.so_id} &nbsp;|&nbsp;
        <strong>Date Created:</strong> ${formattedDate} &nbsp;|&nbsp;
        <strong>Status:</strong> ${so.status}
      </div>
    </div>
    <button class="print-btn no-print" onclick="window.print()">Print Logsheet</button>
  </div>

  <div class="notice">
    This document serves as the outbound picking and dispatch authorization. Please verify the physical product and quantity, note the driver details below, scan this barcode in the <strong>Delivery Scan</strong> screen, and submit to confirm dispatch.
  </div>

  <div class="grid-container">
    <div class="detail-card">
      <div class="section-title" style="margin-top:0">Customer Details</div>
      <div class="detail-row"><span class="detail-label">Company Name:</span><span class="detail-value">${so.customer_name || "—"}</span></div>
      <div class="detail-row"><span class="detail-label">Phone:</span><span class="detail-value">${so.customer_phone || "—"}</span></div>
      <div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${so.customer_email || "—"}</span></div>
      <div class="detail-row"><span class="detail-label">Delivery Address:</span><span class="detail-value">${so.customer_address || "—"}</span></div>
    </div>

    <div class="detail-card">
      <div class="section-title" style="margin-top:0">Payment & Barcode</div>
      <div class="detail-row"><span class="detail-label">Payment Type:</span><span class="detail-value" style="text-transform: capitalize;">${so.payment_info?.payment_type || "—"}</span></div>
      <div class="detail-row"><span class="detail-label">Total Amount:</span><span class="detail-value">₹${totalAmount}</span></div>
      <div class="detail-row"><span class="detail-label">Paid Amount:</span><span class="detail-value">₹${amountReceived}</span></div>
      <div class="detail-row"><span class="detail-label">Balance Due:</span><span class="detail-value" style="color: ${parseFloat(balanceDue) > 0 ? '#b91c1c' : '#15803d'}">₹${balanceDue}</span></div>
    </div>
  </div>

  <div class="barcode-box">
    ${barcodeCell}
    <div class="barcode-value">${barcodeVal}</div>
  </div>

  <div class="section-title">Product & Fulfillment Details</div>
  <table>
    <thead>
      <tr>
        <th style="width: 50px;" class="c">S.No</th>
        <th>Product Name</th>
        <th style="width: 120px;" class="c">Product ID</th>
        <th style="width: 100px;" class="r">Quantity</th>
        <th style="width: 120px;" class="r">Unit Price</th>
        <th style="width: 140px;" class="r">Total</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="c font-bold">1</td>
        <td class="font-bold">${so.product_name || "—"}</td>
        <td class="c font-bold">${so.product_id_display || so.product || "—"}</td>
        <td class="r font-bold">${so.quantity}</td>
        <td class="r">₹${parseFloat(so.unit_price || 0).toLocaleString("en-IN")}</td>
        <td class="r font-bold">₹${totalAmount}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">Delivery & Dispatch Information (Hand-write during picking)</div>
  <div class="grid-container" style="margin-top: 10px;">
    <div class="detail-card" style="border: 2px solid #cbd5e1;">
      <div style="font-size: 10px; color: #475569; font-weight: 700; margin-bottom: 20px;">DRIVER DETAILS:</div>
      <div style="border-bottom: 1.5px solid #94a3b8; height: 30px; margin-bottom: 15px;"></div>
      <div style="font-size: 9px; color: #94a3b8;">Full Name & Contact Phone</div>
    </div>
    <div class="detail-card" style="border: 2px solid #cbd5e1;">
      <div style="font-size: 10px; color: #475569; font-weight: 700; margin-bottom: 20px;">VEHICLE NUMBER:</div>
      <div style="border-bottom: 1.5px solid #94a3b8; height: 30px; margin-bottom: 15px;"></div>
      <div style="font-size: 9px; color: #94a3b8;">e.g. MH-12-AB-1234</div>
    </div>
  </div>

  <div class="sign-row">
    <div class="sign-field"><div class="line"></div>Picked & Packed By</div>
    <div class="sign-field"><div class="line"></div>Security Gate Verified</div>
    <div class="sign-field"><div class="line"></div>Authorized Signature</div>
  </div>

  <div class="footer">
    <span>WMS Pro — Sales Order Logsheet</span>
    <span>Printed: ${new Date().toLocaleDateString("en-IN")}</span>
  </div>

  <script>
    window.onload = function() {
      document.querySelectorAll('svg.bc').forEach(function(el) {
        var val = el.getAttribute('data-value') || '';
        if (!val) return;
        try {
          JsBarcode(el, val, {
            format: 'CODE128', width: 1.5, height: 44,
            displayValue: false, margin: 2
          });
        } catch(e) {
          el.outerHTML = '<span style="font-size:10px;font-family:monospace;">' + val + '</span>';
        }
      });
      setTimeout(function() { window.print(); }, 400);
    };
  </script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `so-logsheet-${so.so_id}.html`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}


/* ══════ MAIN PAGE ══════ */
export default function OutboundPage() {
  const { toast } = useToast();
  
  const [search, setSearch]             = useState("");
  const [movements, setMovements]       = useState([]);
  const [movLoading, setMovLoading]     = useState(true);
  
  const [sos, setSOs]                   = useState([]);
  const [loadingSO, setLoadingSO]       = useState(true);
  const [processingSOId, setProcessingSOId] = useState(null);

  // Load Data
  const loadData = useCallback(async () => {
    setMovLoading(true);
    setLoadingSO(true);
    try {
      const [movData, soData] = await Promise.all([
        listStockMovements(),
        listSalesOrders()
      ]);
      setMovements(toArray(movData));
      
      const arr = Array.isArray(soData) ? soData : soData?.results || soData?.data || soData?.items || [];
      setSOs(arr);
    } catch (err) {
      toast({ title: "Failed to load data", description: err.message, variant: "destructive" });
    } finally {
      setMovLoading(false);
      setLoadingSO(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Handle Pick & Pack transition for SOs
  const handleStartPickPack = async (soId) => {
    setProcessingSOId(soId);
    try {
      await pickPackSO(soId);
      toast({ title: "Pick & Pack Started 📦", description: `Sales Order ${soId} is now in Pick & Pack status.` });
      loadData();
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setProcessingSOId(null);
    }
  };

  const handlePrintLogsheet = async (so) => {
    try {
      await printSOLogsheet(so.so_id);
      openSOLogsheet(so);
      toast({ title: "Logsheet Printed 🖨️", description: `Logsheet status updated for Sales Order ${so.so_id}.` });
      loadData();
    } catch (err) {
      openSOLogsheet(so);
      toast({ title: "Printed with warning", description: err.message || "Failed to save print status in backend.", variant: "destructive" });
    }
  };

  const queueSOs = sos.filter(s => ["Finance Confirmed", "Pick & Pack", "Ready for Dispatch", "Dispatched"].includes(s.status));
  const q = search.toLowerCase();
  const filteredMovements = movements.filter(m => 
    m.movement_type === "OUTBOUND" && (
      !q ||
      m.product_name?.toLowerCase().includes(q) ||
      m.bin_id?.toLowerCase().includes(q) ||
      m.batch_number?.toLowerCase().includes(q) ||
      m.vendor_name?.toLowerCase().includes(q)
    )
  );

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#1E3A8A]" /> Unified Outbound Dispatch
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage Sales Orders and manual stock dispatches efficiently with automated FIFO deductions.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-9" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh Data
          </Button>
        </div>
      </div>

      {/* ── Sales Order Dispatch Queue ── */}
      <Card className="shadow-sm overflow-hidden border-indigo-100">
        <div className="px-4 py-3 border-b bg-indigo-50/50 flex items-center justify-between">
          <p className="text-xs font-bold text-indigo-900 uppercase tracking-wide flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-indigo-700" /> Sales Order Queue
            <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
              {sos.filter(s => ["Finance Confirmed", "Pick & Pack", "Ready for Dispatch"].includes(s.status)).length} Pending
            </span>
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-white hover:bg-white">
                <TableHead className="text-xs font-semibold text-slate-500">SO ID</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Customer</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Product Details</TableHead>
                <TableHead className="text-xs font-semibold text-right text-slate-500">Qty</TableHead>
                <TableHead className="text-xs font-semibold text-right text-slate-500">Payment</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Status</TableHead>
                <TableHead className="text-xs font-semibold text-center text-slate-500 w-[160px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingSO ? (
                <TableRow><TableCell colSpan={7} className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-400" /></TableCell></TableRow>
              ) : queueSOs.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-12 text-center text-sm font-medium text-slate-400">No pending outbound Sales Orders in the queue.</TableCell></TableRow>
              ) : queueSOs.map(s => (
                <TableRow key={s.so_id} className="hover:bg-slate-50/50 transition-colors group">
                  <TableCell className="text-xs font-mono font-bold text-indigo-700">{s.so_id}</TableCell>
                  <TableCell>
                    <div className="text-xs font-bold text-slate-800">{s.customer_name}</div>
                    <div className="text-[10px] text-slate-500">{s.customer_phone}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-semibold text-slate-700">{s.product_name}</div>
                  </TableCell>
                  <TableCell className="text-xs text-right font-bold tabular-nums text-slate-700">{s.quantity}</TableCell>
                  <TableCell className="text-xs text-right">
                    {s.payment_info ? (
                      <div className="text-[10px] leading-tight text-right text-emerald-700">
                        <span className="font-bold capitalize">{s.payment_info.payment_type}</span>
                        <div>₹{parseFloat(s.payment_info.amount_received || 0).toLocaleString("en-IN")}</div>
                      </div>
                    ) : <span className="font-bold text-emerald-700 text-[10px]">Paid</span>}
                  </TableCell>
                  <TableCell><SOPill status={s.status} /></TableCell>
                  <TableCell className="text-center">
                    {s.status === "Finance Confirmed" && (
                      <Button
                        size="sm"
                        disabled={processingSOId === s.so_id}
                        className="h-8 w-full text-xs font-bold bg-[#1E3A8A] hover:bg-[#162d6e] shadow-sm transition-all group-hover:scale-105"
                        onClick={() => handleStartPickPack(s.so_id)}
                      >
                        {processingSOId === s.so_id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <PackageOpen className="w-3.5 h-3.5 mr-1.5" />}
                        Pick &amp; Pack
                      </Button>
                    )}
                    {s.status === "Pick & Pack" && (
                      <div className="flex flex-col gap-1.5">
                        <Button
                          size="sm"
                          className="h-8 w-full text-xs font-bold bg-amber-600 hover:bg-amber-700 shadow-sm transition-all group-hover:scale-105 text-white"
                          onClick={() => handlePrintLogsheet(s)}
                        >
                          Print SO Logsheet
                        </Button>
                      </div>
                    )}
                    {s.status === "Ready for Dispatch" && (
                      <div className="flex flex-col gap-1.5 items-center">
                        <span className="text-xs text-orange-700 font-bold flex items-center justify-center gap-1.5 bg-orange-50 py-1 px-3 rounded-md w-full border border-orange-200">
                          🚚 Ready for Dispatch
                        </span>
                      </div>
                    )}
                    {s.status === "Dispatched" && (
                      <div className="flex flex-col gap-1.5 items-center">
                        <span className="text-xs text-teal-700 font-bold flex items-center justify-center gap-1.5 bg-teal-50 py-1 px-3 rounded-md w-full">
                          <CheckCircle2 className="w-4 h-4 text-teal-600" /> Dispatched
                        </span>
                        {s.driver_name && (
                          <div className="text-[10px] text-slate-500 text-center leading-tight">
                            Driver: <span className="font-semibold text-slate-700">{s.driver_name}</span>
                            <div className="font-mono mt-0.5">{s.vehicle_number}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Outbound Movement History ── */}
      <Card className="shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PackageOpen className="w-4 h-4 text-[#1E3A8A]" />
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Recent Physical Stock Deductions
            </p>
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
              {filteredMovements.length}
            </span>
          </div>
          
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search history…"
              className="pl-8 h-8 text-xs bg-white"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/50 backdrop-blur-sm">
              <TableRow>
                <TableHead className="text-xs font-semibold">Product</TableHead>
                <TableHead className="text-xs font-semibold">Picked Bin</TableHead>
                <TableHead className="text-xs font-semibold">Supplier / Batch</TableHead>
                <TableHead className="text-xs font-semibold text-right">Qty Deducted</TableHead>
                <TableHead className="text-xs font-semibold text-right">Bin Stock After</TableHead>
                <TableHead className="text-xs font-semibold">Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-300" />
                  </TableCell>
                </TableRow>
              ) : filteredMovements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-slate-400 text-sm font-medium">
                    {search ? "No outbound movements match your search." : "No physical outbound movements found."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredMovements.slice(0, 100).map(m => (
                  <TableRow key={m.id ?? m.movement_id} className="hover:bg-slate-50/50">
                    <TableCell className="text-xs font-bold text-slate-800">{m.product_name}</TableCell>
                    <TableCell className="text-xs font-mono text-slate-700 bg-slate-100/50 rounded">{m.bin_id || "—"}</TableCell>
                    <TableCell>
                      <div className="text-xs text-slate-600 font-medium">{m.vendor_name || "—"}</div>
                      <div className="text-[10px] font-mono text-slate-400">Batch: {m.batch_number || "—"}</div>
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums font-bold text-rose-600">
                      -{m.quantity}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums font-semibold text-slate-600">
                      {m.new_stock}
                    </TableCell>
                    <TableCell className="text-[10px] text-slate-400 font-medium">
                      {m.created_at ? new Date(m.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </TableCell>
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