import { useState, useCallback, useEffect } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Search, CheckCircle, Loader2, RefreshCw, ChevronDown, ChevronRight,
  AlertTriangle, Package, Printer, Camera, X
} from "lucide-react";
import { useToast } from "../components/ui/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import {
  getQCPendingGRNs,
  getGRNItems,
  qcUpdateGRNItem,
  approveGRN,
  getGRNSummary,
} from "../services/apiService";
import { formatDateDDMMYYYY } from "../components/utils/helpers";

// ─── helpers ──────────────────────────────────────────────────────────────
const toArr = (res) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  for (const k of ["data", "results", "items", "grns"])
    if (Array.isArray(res[k])) return res[k];
  return Object.values(res).find(Array.isArray) || [];
};

const fmtDate = (d) => formatDateDDMMYYYY(d);

// ─── Print sheet builder ──────────────────────────────────────────────────
// Opens a new browser window with a clean, print-ready barcode log sheet.
// Called automatically right after approveGRN() succeeds so the inventory
// logger can print without navigating anywhere else.
function openPrintSheet(grn, items) {
  const accepted = items.filter(
    (i) => i.qc_status === "Completed" && (i.accepted_quantity ?? 0) > 0
  );

  const rows = accepted
    .map((item, idx) => {
      const barcodeCell = item.barcode_image
        ? `<img src="data:image/png;base64,${item.barcode_image}"
               style="height:48px;width:auto;display:block;margin:0 auto;" />`
        : `<span style="font-family:Courier New,monospace;font-size:10px;color:#64748b;">
             ${item.grn_item_id}
           </span>`;

      return `
        <tr>
          <td class="c">${idx + 1}</td>
          <td class="c">${barcodeCell}</td>
          <td class="m">${item.grn_item_id}</td>
          <td>${item.snapshot_product_name || item.product_name || "—"}</td>
          <td class="m">${item.snapshot_barcode || "—"}</td>
          <td class="c g">${item.accepted_quantity ?? 0}</td>
          <td class="w"></td>
          <td class="w"></td>
        </tr>`;
    })
    .join("");

  const printedOn = fmtDate(new Date());

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>GRN Log — ${grn.grn_id}</title>
  <style>
    @media print { .no-print { display: none !important; } }
    * { box-sizing: border-box; }
    body {
      font-family: Calibri, Arial, sans-serif;
      margin: 1.2cm 1.8cm;
      color: #0f172a;
      font-size: 12px;
    }
    .header-bar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 2.5px solid #1E3A8A;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    h1 { font-size: 18px; font-weight: 700; color: #1E3A8A; margin: 0 0 3px; }
    .meta { font-size: 11px; color: #475569; line-height: 1.6; }
    .meta strong { color: #0f172a; }
    .notice {
      background: #fef9c3;
      border: 1px solid #fde047;
      padding: 6px 10px;
      font-size: 10px;
      color: #854d0e;
      border-radius: 3px;
      margin-bottom: 12px;
    }
    table { border-collapse: collapse; width: 100%; margin-top: 4px; }
    th {
      background: #1E3A8A;
      color: #fff;
      font-size: 11px;
      padding: 7px 8px;
      border: 1px solid #1E3A8A;
      text-align: left;
      white-space: nowrap;
    }
    td {
      border: 1px solid #cbd5e1;
      padding: 5px 8px;
      font-size: 11px;
      vertical-align: middle;
    }
    .c { text-align: center; }
    .m { font-family: Courier New, monospace; font-size: 10px; }
    .g { color: #16a34a; font-weight: 700; font-size: 13px; }
    .w { min-height: 28px; }
    tr:nth-child(even) td { background: #f8fafc; }
    .sign-row {
      margin-top: 24px;
      display: flex;
      gap: 48px;
      font-size: 11px;
      color: #475569;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
    }
    .sign-field { flex: 1; }
    .sign-field .line {
      border-bottom: 1px solid #94a3b8;
      height: 28px;
      margin-bottom: 4px;
    }
    .footer {
      margin-top: 10px;
      font-size: 9px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }
    .print-btn {
      background: #1E3A8A;
      color: #fff;
      border: none;
      padding: 8px 20px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
    }
    .print-btn:hover { background: #162d6e; }
  </style>
</head>
<body>
  <div class="header-bar">
    <div>
      <h1>GRN Inventory Log Sheet</h1>
      <div class="meta">
        <strong>GRN:</strong> ${grn.grn_id} &nbsp;|&nbsp;
        <strong>Number:</strong> ${grn.grn_number || "—"} &nbsp;|&nbsp;
        <strong>PO:</strong> ${grn.po_id || "—"} &nbsp;|&nbsp;
        <strong>Receipt:</strong> ${fmtDate(grn.receipt_date)} &nbsp;|&nbsp;
        <strong>Items:</strong> ${accepted.length} &nbsp;|&nbsp;
        <strong>Printed:</strong> ${printedOn}
      </div>
    </div>
    <button class="print-btn no-print" onclick="window.print()">Print</button>
  </div>

  <div class="notice">
    Scan each item barcode during putaway and record the physical count in the
    <em>Phys. Count</em> column. QC-accepted quantities are pre-filled for reference.
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:32px">S.No</th>
        <th style="width:90px">Item Barcode</th>
        <th style="width:120px">Item ID</th>
        <th>Product Name</th>
        <th style="width:110px">Product Barcode</th>
        <th style="width:68px;text-align:center">QC Accepted</th>
        <th style="width:76px">Phys. Count</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="sign-row">
    <div class="sign-field">
      <div class="line"></div>
      Counted By
    </div>
    <div class="sign-field">
      <div class="line"></div>
      Verified By
    </div>
    <div class="sign-field">
      <div class="line"></div>
      Date
    </div>
  </div>

  <div class="footer">
    <span>WMS Pro — Confidential</span>
    <span>${printedOn} &nbsp;|&nbsp; GRN: ${grn.grn_id}</span>
  </div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) {
    // Popup blocked — fall back to blob download
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grn-log-${grn.grn_id}.html`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  win.document.write(html);
  win.document.close();
  // Auto-trigger print dialog after a short delay so images render first
  win.addEventListener("load", () => {
    setTimeout(() => win.print(), 600);
  });
}

// ─── Inline QC item row ───────────────────────────────────────────────────
function InlineQCRow({ item, onSaved }) {
  const { toast } = useToast();
  const [accepted, setAccepted] = useState(item.accepted_quantity ?? 0);
  const [rejected, setRejected] = useState(item.rejected_quantity ?? 0);
  const [rejectionReason, setRejectionReason] = useState(item.rejection_reason || "Defect");
  const [rejectionNotes, setRejectionNotes] = useState(item.rejection_notes || "");
  const [rejectionImages, setRejectionImages] = useState(item.rejection_images || []);
  const [saving, setSaving] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  const received = item.received_quantity ?? 0;
  const total = Number(accepted) + Number(rejected);
  const isOver = total > received;
  const isCompleted = item.qc_status === "Completed";

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (rejectionImages.length + files.length > 5) {
      toast({ title: "Limit reached", description: "Maximum 5 images allowed.", variant: "destructive" });
      return;
    }

    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setRejectionImages(prev => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index) => {
    setRejectionImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (isOver || (Number(accepted) === 0 && Number(rejected) === 0)) return;
    setSaving(true);
    try {
      const payload = {
        accepted_quantity: Number(accepted),
        rejected_quantity: Number(rejected),
      };

      if (Number(rejected) > 0) {
        payload.rejection_reason = rejectionReason;
        payload.rejection_notes = rejectionNotes;
        payload.rejection_images = rejectionImages;
      }

      await qcUpdateGRNItem(item.grn_item_id, payload);
      toast({
        title: "Saved",
        description: `${item.product_name || item.snapshot_product_name} QC recorded.`,
      });
      await onSaved();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`border-b border-gray-50 last:border-0 px-5 py-4 ${isCompleted ? "bg-emerald-50/40" : "bg-white"}`}>
      <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        {/* left — product info */}
        <div className="min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {item.snapshot_product_name || item.product_name || "—"}
            </p>
            {isCompleted && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-semibold shrink-0">
                <CheckCircle className="w-2.5 h-2.5" /> QC Done
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-4 mt-1.5 text-xs">
            <span className="text-gray-500">
              Barcode: <span className="font-mono text-gray-700">{item.snapshot_barcode || "—"}</span>
            </span>
            <span className="text-gray-500">
              Item ID: <span className="font-mono text-gray-600">{item.grn_item_id}</span>
            </span>
            <span className="text-gray-500">
              Received: <span className="font-semibold text-gray-800 tabular-nums">{received}</span>
            </span>
            {isCompleted && (
              <>
                <span className="text-emerald-600">
                  Accepted: <span className="font-semibold tabular-nums">{item.accepted_quantity}</span>
                </span>
                <span className="text-red-500">
                  Rejected: <span className="font-semibold tabular-nums">{item.rejected_quantity}</span>
                </span>
              </>
            )}
          </div>
          {isOver && (
            <p className="text-[10px] text-red-500 font-medium mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Accepted + Rejected exceeds received ({received})
            </p>
          )}
        </div>

        {/* right — input controls */}
        {isCompleted ? (
          <div className="flex items-center justify-end">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          </div>
        ) : (
          <div className="flex items-end gap-2 shrink-0">
            <div className="grid gap-1">
              <Label className="text-[10px] text-gray-400 text-center font-medium">Accept</Label>
              <Input
                type="number" min="0" max={received}
                value={accepted}
                onChange={(e) => setAccepted(e.target.value)}
                className={`w-20 h-8 text-sm text-center tabular-nums border-gray-300 ${isOver ? "border-red-400 bg-red-50" : ""}`}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-[10px] text-gray-400 text-center font-medium">Reject</Label>
              <Input
                type="number" min="0" max={received}
                value={rejected}
                onChange={(e) => setRejected(e.target.value)}
                className={`w-20 h-8 text-sm text-center tabular-nums border-gray-300 ${isOver ? "border-red-400 bg-red-50" : ""}`}
              />
            </div>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || isOver || (Number(accepted) + Number(rejected) === 0)}
              className="h-8 w-16 bg-[#1E3A8A] hover:bg-[#162d6e] text-xs shrink-0"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
        )}
      </div>

      {/* Rejection Details Section */}
      {!isCompleted && Number(rejected) > 0 && (
        <div className="mt-4 p-4 border border-red-100 bg-red-50/30 rounded-lg animate-in fade-in slide-in-from-top-2">
          <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-3">Rejection Details</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label className="text-[10px] text-gray-600">Primary Reason</Label>
                <Select value={rejectionReason} onValueChange={setRejectionReason}>
                  <SelectTrigger className="h-8 text-xs bg-white border-gray-200">
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Defect">Defect</SelectItem>
                    <SelectItem value="Damaged">Damaged</SelectItem>
                    <SelectItem value="Expired">Expired</SelectItem>
                    <SelectItem value="Wrong Item">Wrong Item</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid gap-1.5">
                <Label className="text-[10px] text-gray-600">Internal Notes</Label>
                <Textarea 
                  placeholder="Describe the issue in detail..."
                  className="text-xs bg-white border-gray-200 min-h-[70px]"
                  value={rejectionNotes}
                  onChange={e => setRejectionNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] text-gray-600">Photo Evidence ({rejectionImages.length}/5)</Label>
              <div className="grid grid-cols-3 gap-2">
                {rejectionImages.map((img, idx) => (
                  <div key={idx} className="relative aspect-square rounded-md overflow-hidden border border-gray-200 bg-white group">
                    <img src={img} alt="Evidence" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {rejectionImages.length < 5 && (
                  <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-md bg-white hover:bg-gray-50 cursor-pointer transition-colors">
                    <Camera className="w-4 h-4 text-gray-400 mb-1" />
                    <span className="text-[9px] text-gray-400 font-medium">Add Photo</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple 
                      className="hidden" 
                      onChange={handleImageUpload}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Display Saved Rejection Details for Completed Items */}
      {isCompleted && item.rejected_quantity > 0 && (
        <div className="mt-3 p-3 bg-gray-50 border border-gray-100 rounded-md">
          <div className="flex flex-col gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[9px] font-bold uppercase">
                {item.rejection_reason || "Rejected"}
              </span>
            </div>
            {item.rejection_notes && (
              <div className="mt-1">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">Internal Notes:</span>
                <p className="text-[11px] text-gray-700 bg-white p-2 rounded border border-gray-200">
                  {item.rejection_notes}
                </p>
              </div>
            )}
          </div>
          {item.rejection_images && item.rejection_images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {item.rejection_images.map((img, idx) => (
                <div key={idx} className="shrink-0 w-10 h-10 rounded border border-gray-200 overflow-hidden bg-white">
                  <img 
                    src={img} 
                    alt="Rejection evidence" 
                    className="w-full h-full object-cover cursor-zoom-in"
                    onClick={() => setSelectedImage(img)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Image Zoom Dialog */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex items-center justify-center">
            <img 
              src={selectedImage} 
              alt="Zoomed evidence" 
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300"
            />
            <button 
              className="absolute -top-10 right-0 p-2 text-white hover:text-gray-300 transition-colors"
              onClick={() => setSelectedImage(null)}
            >
              <X className="w-8 h-8" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GRN expandable card (inline QC) ─────────────────────────────────────
function GRNQCCard({ grn, defaultExpanded = false, onApproved }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(defaultExpanded);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, sumRes] = await Promise.all([
        getGRNItems(grn.grn_id),
        getGRNSummary(grn.grn_id),
      ]);
      setItems(toArr(itemsRes));
      setSummary(sumRes);
      setLoaded(true);
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [grn.grn_id, toast]);

  const handleToggle = () => {
    if (!open && !loaded) loadData();
    setOpen((o) => !o);
  };

  const refreshItems = async () => {
    const [itemsRes, sumRes] = await Promise.all([
      getGRNItems(grn.grn_id),
      getGRNSummary(grn.grn_id),
    ]);
    setItems(toArr(itemsRes));
    setSummary(sumRes);
  };

  // ── KEY CHANGE: after approveGRN, fetch fresh items (which now have
  //    barcode_image populated by the backend) then open the print sheet.
  const handleApprove = async () => {
    setApproving(true);
    try {
      await approveGRN(grn.grn_id);

      // Re-fetch items so barcode_image fields are present
      let freshItems = items;
      try {
        const res = await getGRNItems(grn.grn_id);
        freshItems = toArr(res);
      } catch {
        // If re-fetch fails, use stale items — print sheet will show item IDs
        // instead of barcode images, which is still usable
      }

      toast({
        title: "GRN Approved",
        description: "Item barcodes generated. Opening print sheet for inventory logger.",
      });

      // Open print sheet in new tab — inventory logger prints directly
      openPrintSheet(grn, freshItems);

      onApproved();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setApproving(false);
    }
  };

  // Manual reprint — for when logger needs another copy
  const handleReprint = async () => {
    let printItems = items;
    if (!loaded) {
      try {
        const res = await getGRNItems(grn.grn_id);
        printItems = toArr(res);
      } catch {
        toast({
          title: "Error",
          description: "Could not load items for reprint.",
          variant: "destructive",
        });
        return;
      }
    }
    openPrintSheet(grn, printItems);
  };

  const allDone =
    items.length > 0 && items.every((i) => i.qc_status === "Completed");
  const pending = items.filter((i) => i.qc_status !== "Completed").length;

  return (
    <Card
      className={`shadow-sm overflow-hidden transition-all ${
        open ? "border-[#1E3A8A]/30" : "border-gray-200"
      }`}
    >
      {/* ── card header (always visible) ─────────────────────────── */}
      <div
        className={`flex items-center justify-between px-5 py-3.5 cursor-pointer transition-colors
          ${open ? "bg-[#1E3A8A]/5" : "bg-white hover:bg-gray-50"}`}
        onClick={handleToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          {open ? (
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-[#1E3A8A] font-mono">
                {grn.grn_id}
              </p>
              <span className="px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 text-[10px] font-semibold uppercase">
                Awaiting QC
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {grn.grn_number || "—"} · PO: {grn.po_id || "—"} ·{" "}
              {fmtDate(grn.receipt_date)}
            </p>
          </div>
        </div>

        <div
          className="flex items-center gap-3 shrink-0 ml-4"
          onClick={(e) => e.stopPropagation()}
        >
          {loaded && (
            <span className="text-[10px] text-gray-400">
              {items.length - pending}/{items.length} items done
            </span>
          )}

          {/* Reprint button — visible once card is loaded */}
          {loaded && items.length > 0 && (
            <button
              onClick={handleReprint}
              title="Reprint log sheet"
              className="flex items-center gap-1 px-2 py-1 rounded border border-gray-200 text-[10px] text-gray-500 hover:bg-gray-50 hover:text-[#1E3A8A] transition-colors"
            >
              <Printer className="w-3 h-3" /> Reprint
            </button>
          )}

          {allDone && (
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={approving}
              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold"
            >
              {approving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{" "}
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Approve &amp;
                  Print Sheet
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* ── expanded QC content ───────────────────────────────────── */}
      {open && (
        <div>
          {/* summary strip */}
          {summary && (
            <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 bg-gray-50">
              {[
                {
                  label: "Received",
                  value: summary.received ?? 0,
                  cls: "text-gray-900",
                },
                {
                  label: "Accepted",
                  value: summary.accepted ?? 0,
                  cls: "text-emerald-600",
                },
                {
                  label: "Rejected",
                  value: summary.rejected ?? 0,
                  cls: "text-red-500",
                },
              ].map((s) => (
                <div key={s.label} className="px-5 py-2.5">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                    {s.label}
                  </p>
                  <p className={`text-xl font-bold tabular-nums ${s.cls}`}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* hint when not all done */}
          {loaded && !allDone && (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 border-t border-amber-100 border-b border-amber-100">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-700">
                {pending} item{pending !== 1 ? "s" : ""} still pending. Save
                all items to enable final approval.
              </p>
            </div>
          )}

          {/* all-done confirm bar */}
          {allDone && (
            <div className="flex items-center justify-between px-5 py-2.5 bg-emerald-50 border-t border-emerald-100 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                <p className="text-xs text-emerald-700 font-medium">
                  All items QC completed. Approve to generate per-item barcodes
                  and open the print sheet for the inventory logger.
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={approving}
                className="h-8 bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold shrink-0"
              >
                {approving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  "Approve & Print Sheet"
                )}
              </Button>
            </div>
          )}

          {/* items */}
          {loading ? (
            <div className="py-10 flex justify-center border-t border-gray-100">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : items.length === 0 && loaded ? (
            <div className="py-10 text-center border-t border-gray-100">
              <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                No items found for this GRN.
              </p>
            </div>
          ) : (
            <div className="border-t border-gray-100">
              {/* column header */}
              <div className="grid grid-cols-[1fr_auto] gap-x-4 px-5 py-2 bg-gray-50 border-b border-gray-100">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Product / Item
                </p>
                <div className="flex items-center gap-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  <span className="w-20 text-center">Accept</span>
                  <span className="w-20 text-center">Reject</span>
                  <span className="w-16 text-center">Action</span>
                </div>
              </div>
              {items.map((item) => (
                <InlineQCRow
                  key={item.grn_item_id + item.qc_status}
                  item={item}
                  onSaved={refreshItems}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════
// MAIN QUALITY CHECK PAGE
// ════════════════════════════════════════════════════════════════════════
export default function QualityCheckPage() {
  const { toast } = useToast();
  const [grns, setGrns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getQCPendingGRNs();
      setGrns(toArr(res));
    } catch (err) {
      setError(err.message || "Failed to load pending GRNs.");
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const q = search.toLowerCase();
  const filtered = grns.filter((grn) =>
    [grn.grn_id, grn.po_id, grn.grn_number, grn.received_by_username].some(
      (v) => String(v ?? "").toLowerCase().includes(q)
    )
  );

  return (
    <div className="space-y-4">
      {/* ── header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Quality Check</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Inspect received goods — enter accepted and rejected quantities per
            item, then approve. A print sheet opens automatically for the
            inventory logger.
          </p>
        </div>
        <button
          onClick={load}
          disabled={isLoading}
          className="p-1.5 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
          title="Refresh"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-gray-500 ${
              isLoading ? "animate-spin" : ""
            }`}
          />
        </button>
      </div>

      {/* ── stat strip ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">
            Pending QC
          </p>
          <p className="text-2xl font-bold tabular-nums text-amber-600">
            {grns.length}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">
            Showing
          </p>
          <p className="text-2xl font-bold tabular-nums text-[#1E3A8A]">
            {filtered.length}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">
            Workflow
          </p>
          <p className="text-xs font-medium text-gray-600 mt-1">
            GRN → QC → Approve → Print → Putaway
          </p>
        </div>
      </div>

      {/* ── search ───────────────────────────────────────────────── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search GRN, PO, number..."
          className="pl-9 h-9 border-gray-200"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── content ──────────────────────────────────────────────── */}
      {isLoading && grns.length === 0 ? (
        <Card className="p-10 text-center border-gray-200 shadow-sm">
          <Loader2 className="w-7 h-7 animate-spin mx-auto text-[#1E3A8A]" />
          <p className="text-sm text-gray-400 mt-3">
            Loading pending GRNs...
          </p>
        </Card>
      ) : error ? (
        <Card className="p-10 text-center border-red-200 shadow-sm">
          <AlertTriangle className="w-7 h-7 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-600">{error}</p>
          <Button size="sm" onClick={load} className="mt-3 h-8">
            Retry
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center border-gray-200 shadow-sm">
          <CheckCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-500">
            {search
              ? "No GRNs match your search."
              : "No GRNs pending QC."}
          </p>
          {!search && (
            <p className="text-xs text-gray-400 mt-1">
              New GRNs appear here after a supervisor adds all items.
            </p>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((grn, idx) => (
            <GRNQCCard
              key={grn.grn_id}
              grn={grn}
              defaultExpanded={idx === 0 && filtered.length === 1}
              onApproved={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}