import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import {
  Search, Loader2, RefreshCw, Plus, ScanLine, ChevronDown, ChevronUp,
  CheckCircle, Package, Camera, X
} from "lucide-react";
import { useAuth } from "../components/lib/auth-context";
import { useToast } from "../components/ui/use-toast";
import {
  listGRNs,
  getGRN,
  getGRNItems,
  qcUpdateGRNItem,
  approveGRN,
  getQCPendingGRNs,
  getMyGRNs,
  getGRNSummary,
  listASN,
  listPurchaseOrders,
  createGRNBySupervisor,
  supervisorScanBarcode,
  supervisorAddGRNItem,
} from "../services/apiService";
import { formatDateDDMMYYYY } from "../components/utils/helpers";

// ─── helpers ──────────────────────────────────────────────────────────────
const toArr = (res, key) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (key && Array.isArray(res[key])) return res[key];
  for (const k of ["results", "data", "items", "grns"])
    if (Array.isArray(res[k])) return res[k];
  return Object.values(res).find(Array.isArray) || [];
};

const fmtDate = (d) => formatDateDDMMYYYY(d);

const STATUS_META = {
  RECEIVED:        { label: "Received",         cls: "bg-blue-100 text-blue-700 border-blue-200" },
  QC_PENDING:      { label: "Awaiting QC",      cls: "bg-amber-100 text-amber-700 border-amber-200" },
  PUTAWAY_PENDING: { label: "Putaway Pending",  cls: "bg-purple-100 text-purple-700 border-purple-200" },
  COMPLETED:       { label: "Completed",        cls: "bg-green-100 text-green-700 border-green-200" },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, cls: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${m.cls}`}>
      {m.label}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, cls = "text-[#1E3A8A]" }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-0.5 ${cls}`}>{value ?? "—"}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────
function SectionHead({ title, right }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{title}</p>
      {right}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// SUPERVISOR PANEL — Create GRN + Add items by barcode scan
// No popups — all inline using vertical grid layout
// ════════════════════════════════════════════════════════════════════════
function SupervisorPanel({ poList, asnList, existingGRNs, onGRNCreated }) {
  const { toast } = useToast();

  // ── Create GRN form ──
  const [grnForm, setGrnForm] = useState({ grn_number: "", po: "", asn: "", receipt_date: "" });
  const [creating, setCreating] = useState(false);
  const [activeGRN, setActiveGRN] = useState(null); // GRN just created / selected
  const [grnItems, setGrnItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // ── Scan item form ──
  const [scanBarcode, setScanBarcode] = useState("");
  const [scanData, setScanData] = useState(null);   // product preview after scan
  const [scanLooking, setScanLooking] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [cartons, setCartons] = useState("1");
  const [batchNumber, setBatchNumber] = useState("");
  const [mfgDate, setMfgDate] = useState("");
  const [expDate, setExpDate] = useState("");
  const scanRef = useRef(null);

  const refreshItems = useCallback(async (grnId) => {
    setLoadingItems(true);
    try {
      const res = await getGRNItems(grnId);
      setGrnItems(toArr(res));
    } catch {
      setGrnItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  // Default receipt date to today
  useEffect(() => {
    if (!grnForm.receipt_date) {
      setGrnForm(f => ({ ...f, receipt_date: new Date().toISOString().split("T")[0] }));
    }
  }, [grnForm.receipt_date]);

  const generateGRN = (poId) => {
    if (!poId) return "";
    const date = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const prefix = `GRN-${poId}-${date}-`;
    
    // Look for highest existing suffix
    const existing = (existingGRNs || [])
      .filter(g => (g.grn_number || "").startsWith(prefix))
      .map(g => {
        const parts = g.grn_number.split("-");
        const last = parseInt(parts[parts.length - 1]);
        return isNaN(last) ? 0 : last;
      });
    
    const nextSeq = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    return `${prefix}${String(nextSeq).padStart(3, "0")}`;
  };

  // Create GRN
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!grnForm.grn_number || !grnForm.po || !grnForm.receipt_date) {
      toast({ title: "Required fields missing", description: "GRN Number, PO, and Receipt Date are required.", variant: "destructive" });
      return;
    }
    setCreating(true);
    const selectedPO = poList.find(p => p.po_id === grnForm.po);
    const payload = {
      grn_number:   grnForm.grn_number,
      po:           grnForm.po,
      receipt_date: grnForm.receipt_date,
    };
    if (grnForm.asn) payload.asn = grnForm.asn;
    if (selectedPO?.vendor) payload.vendor = selectedPO.vendor;
    else if (selectedPO?.vendor_id) payload.vendor = selectedPO.vendor_id;

    try {
      const res = await createGRNBySupervisor(payload);
      toast({ title: "GRN Created", description: `${res.grn_id || "GRN"} created. Scan items below.` });
      // fetch full GRN
      const created = await getGRN(res.grn_id || grnForm.grn_number);
      setActiveGRN(created);
      setGrnForm({ grn_number: "", po: "", asn: "", receipt_date: "" });
      onGRNCreated();
      setTimeout(() => scanRef.current?.focus(), 200);
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // Scan barcode → preview product
  const handleScan = async () => {
    const bc = scanBarcode.trim();
    if (!bc) return;
    setScanLooking(true);
    setScanData(null);
    try {
      const res = await supervisorScanBarcode(activeGRN.grn_id, { barcode: bc });
      setScanData(res);
    } catch (err) {
      toast({ title: "Barcode not found", description: err.message, variant: "destructive" });
    } finally {
      setScanLooking(false);
    }
  };

  // Add scanned item to GRN
  const handleAddItem = async () => {
    if (!scanData || !batchNumber || !cartons) {
      toast({ title: "Missing fields", description: "Batch number and cartons are required.", variant: "destructive" });
      return;
    }
    setAddingItem(true);
    try {
      await supervisorAddGRNItem(activeGRN.grn_id, {
        barcode:          scanData.barcode || scanBarcode.trim(),
        batch_number:     batchNumber,
        received_cartons: parseInt(cartons),
        manufactured_date: mfgDate || undefined,
        expiry_date:       expDate || undefined,
      });
      toast({ title: "Item Added", description: `${scanData.product_name} — ${cartons} carton(s) added.` });
      setScanBarcode(""); setScanData(null); setCartons("1");
      setBatchNumber(""); setMfgDate(""); setExpDate("");
      await refreshItems(activeGRN.grn_id);
      scanRef.current?.focus();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAddingItem(false);
    }
  };

  // Done adding — mark for QC (status changes to QC_PENDING via backend on next step;
  // supervisor simply navigates away — QC staff picks it up)
  const doneAdding = () => {
    toast({ title: "Items saved", description: "This GRN is now awaiting QC review." });
    setActiveGRN(null);
    setGrnItems([]);
    setScanData(null);
    setScanBarcode("");
  };

  return (
    <div className="grid grid-cols-1 gap-4">

      {/* ── Step 1: Create GRN ─────────────────────────────────────── */}
      {!activeGRN && (
        <Card className="shadow-sm border-gray-200">
          <CardContent className="p-5">
            <SectionHead title="Step 1 — Create New GRN" />
            <form onSubmit={handleCreate}>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-gray-600">GRN Number *</Label>
                    <button 
                      type="button"
                      onClick={() => setGrnForm(f => ({ ...f, grn_number: generateGRN(f.po) }))}
                      disabled={!grnForm.po}
                      className="text-[10px] text-[#1E3A8A] hover:underline disabled:opacity-50"
                    >
                      Regenerate
                    </button>
                  </div>
                  <Input
                    placeholder="Auto-generated on PO selection"
                    value={grnForm.grn_number}
                    disabled
                    className="h-9 text-sm bg-gray-100 text-gray-600 font-mono cursor-not-allowed border-gray-300"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-medium text-gray-600">Receipt Date *</Label>
                  <Input
                    type="date"
                    value={grnForm.receipt_date}
                    onChange={e => setGrnForm(f => ({ ...f, receipt_date: e.target.value }))}
                    className="h-9 text-sm border-gray-300"
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-medium text-gray-600">Purchase Order *</Label>
                  <Select value={grnForm.po} onValueChange={v => setGrnForm(f => {
                    const next = { ...f, po: v, grn_number: f.grn_number || generateGRN(v) };
                    // Clear ASN if it doesn't belong to the new PO
                    const asnObj = asnList.find(a => a.asn_id === f.asn);
                    if (asnObj && String(asnObj.po || asnObj.po_id) !== String(v)) {
                      next.asn = "";
                    }
                    return next;
                  })}>
                    <SelectTrigger className="h-9 text-sm border-gray-300">
                      <SelectValue placeholder="Select PO" />
                    </SelectTrigger>
                    <SelectContent>
                      {poList.map(po => (
                        <SelectItem key={po.po_id} value={po.po_id}>
                          {po.po_id} — ₹{Number(po.total_amount).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-medium text-gray-600">ASN (Optional)</Label>
                  <Select 
                    value={grnForm.asn} 
                    onValueChange={v => setGrnForm(f => ({ ...f, asn: v }))}
                    disabled={!grnForm.po}
                  >
                    <SelectTrigger className="h-9 text-sm border-gray-300">
                      <SelectValue placeholder={grnForm.po ? "Select ASN (Optional)" : "Select PO first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {asnList
                        .filter(asn => String(asn.po) === String(grnForm.po) || String(asn.po_id) === String(grnForm.po))
                        .map(asn => (
                        <SelectItem key={asn.asn_id} value={asn.asn_id}>
                          {asn.asn_id} — {asn.vendor_name || asn.vendor || ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                type="submit"
                disabled={creating}
                className="h-9 bg-[#1E3A8A] hover:bg-[#162d6e] text-sm font-semibold"
              >
                {creating
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</>
                  : <><Plus className="w-4 h-4 mr-2" /> Create GRN</>}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Scan & Add Items ───────────────────────────────── */}
      {activeGRN && (
        <div className="grid grid-cols-1 gap-4">

          {/* active GRN info bar */}
          <div className="flex items-center justify-between bg-[#1E3A8A] text-white rounded-lg px-5 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">Active GRN</p>
              <p className="text-lg font-bold">{activeGRN.grn_id}</p>
              <p className="text-xs opacity-70">PO: {activeGRN.po_id} · {fmtDate(activeGRN.receipt_date)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs opacity-70">{grnItems.length} item{grnItems.length !== 1 ? "s" : ""} added</span>
              <Button
                size="sm"
                onClick={doneAdding}
                disabled={grnItems.length === 0}
                className="h-8 bg-white text-[#1E3A8A] hover:bg-gray-100 text-xs font-semibold"
              >
                Done — Submit for QC
              </Button>
            </div>
          </div>

          {/* scan row */}
          <Card className="shadow-sm border-gray-200">
            <CardContent className="p-5">
              <SectionHead title="Step 2 — Scan Item Barcode" />
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    ref={scanRef}
                    value={scanBarcode}
                    onChange={e => { setScanBarcode(e.target.value); setScanData(null); }}
                    onKeyDown={e => e.key === "Enter" && handleScan()}
                    placeholder="Scan barcode or type and press Enter..."
                    className="h-9 pl-9 font-mono text-sm border-gray-300"
                    autoFocus
                  />
                </div>
                <Button
                  onClick={handleScan}
                  disabled={scanLooking || !scanBarcode.trim()}
                  className="h-9 bg-[#1E3A8A] hover:bg-[#162d6e] text-sm"
                >
                  {scanLooking ? <Loader2 className="w-4 h-4 animate-spin" /> : "Lookup"}
                </Button>
              </div>

              {/* product preview + add form */}
              {scanData && (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{scanData.product_name}</p>
                      <p className="text-xs font-mono text-gray-500 mt-0.5">{scanData.barcode || scanBarcode}</p>
                      <div className="flex gap-2 mt-1.5">
                        {scanData.size && (
                          <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-600 text-[10px] font-medium">{scanData.size}</span>
                        )}
                        {scanData.base_unit && (
                          <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-600 text-[10px] font-medium">{scanData.base_unit}</span>
                        )}
                      </div>
                    </div>
                    <Package className="w-8 h-8 text-gray-300" />
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs font-medium text-gray-600">Batch Number *</Label>
                      <Input
                        value={batchNumber}
                        onChange={e => setBatchNumber(e.target.value)}
                        placeholder="From carton label"
                        className="h-8 text-sm border-gray-300"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs font-medium text-gray-600">Received Cartons *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={cartons}
                        onChange={e => setCartons(e.target.value)}
                        className="h-8 text-sm border-gray-300"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs font-medium text-gray-600">Mfg Date (optional)</Label>
                      <Input
                        type="date"
                        value={mfgDate}
                        onChange={e => setMfgDate(e.target.value)}
                        className="h-8 text-sm border-gray-300"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs font-medium text-gray-600">Expiry Date (optional)</Label>
                      <Input
                        type="date"
                        value={expDate}
                        onChange={e => setExpDate(e.target.value)}
                        className="h-8 text-sm border-gray-300"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleAddItem}
                      disabled={addingItem || !batchNumber || !cartons}
                      className="h-8 bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold"
                    >
                      {addingItem
                        ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Adding...</>
                        : <><Plus className="w-3.5 h-3.5 mr-2" /> Add to GRN</>}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setScanData(null); setScanBarcode(""); scanRef.current?.focus(); }}
                      className="h-8 text-sm border-gray-300"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* items added so far */}
          <Card className="shadow-sm border-gray-200">
            <CardContent className="p-0">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Items Added
                  {grnItems.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-[#1E3A8A] text-white text-[10px] font-bold">
                      {grnItems.length}
                    </span>
                  )}
                </p>
              </div>
              {loadingItems ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : grnItems.length === 0 ? (
                <div className="py-10 text-center text-gray-400">
                  <ScanLine className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No items yet — scan a barcode above</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-xs font-semibold text-gray-500">Product</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-500">Batch</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-500 text-right">Cartons</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-500 text-right">Qty (units)</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-500">QC</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grnItems.map(item => (
                      <TableRow key={item.grn_item_id} className="hover:bg-gray-50">
                        <TableCell>
                          <p className="text-xs font-semibold text-gray-800">{item.snapshot_product_name || item.product_name}</p>
                          <p className="text-[10px] font-mono text-gray-400">{item.grn_item_id}</p>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-gray-600">
                          {item.batch?.batch_number || "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-gray-700">
                          {item.received_cartons}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums font-semibold text-gray-900">
                          {item.received_quantity}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                            item.qc_status === "Completed"
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}>
                            {item.qc_status === "Completed" ? "QC Done" : "Pending"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// QC PANEL — inline per-item accept/reject, no popups
// ════════════════════════════════════════════════════════════════════════
function QCPanel({ grns, onRefresh }) {
  const { toast } = useToast();
  const [activeGRN, setActiveGRN]   = useState(null);
  const [grnItems, setGrnItems]     = useState([]);
  const [summary, setSummary]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [approving, setApproving]   = useState(false);

  const loadGRN = async (grn) => {
    setActiveGRN(grn);
    setLoading(true);
    try {
      const [items, sum] = await Promise.all([
        getGRNItems(grn.grn_id),
        getGRNSummary(grn.grn_id),
      ]);
      setGrnItems(toArr(items));
      setSummary(sum);
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const refreshItems = async () => {
    if (!activeGRN) return;
    try {
      const [items, sum] = await Promise.all([
        getGRNItems(activeGRN.grn_id),
        getGRNSummary(activeGRN.grn_id),
      ]);
      setGrnItems(toArr(items));
      setSummary(sum);
    } catch { /* silent */ }
  };

  const handleApproveGRN = async () => {
    setApproving(true);
    try {
      await approveGRN(activeGRN.grn_id);
      toast({ title: "GRN Approved", description: "Putaway plan generated. Items ready for stocking." });
      setActiveGRN(null);
      setGrnItems([]);
      setSummary(null);
      onRefresh();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setApproving(false);
    }
  };

  const allDone   = grnItems.length > 0 && grnItems.every(i => i.qc_status === "Completed");
  const pending   = grnItems.filter(i => i.qc_status !== "Completed").length;

  return (
    <div className="grid grid-cols-1 gap-4">

      {/* GRN selector list */}
      {!activeGRN && (
        <Card className="shadow-sm border-gray-200">
          <CardContent className="p-0">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                GRNs Awaiting QC
                <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                  {grns.length}
                </span>
              </p>
            </div>
            {grns.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No GRNs pending QC</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {grns.map(grn => (
                  <div
                    key={grn.grn_id}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => loadGRN(grn)}
                  >
                    <div>
                      <p className="text-sm font-bold text-[#1E3A8A] font-mono">{grn.grn_id}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        PO: {grn.po_id || "—"} · {grn.grn_number || "—"} · {fmtDate(grn.receipt_date)}
                      </p>
                      <p className="text-[10px] text-gray-400">Received by: {grn.received_by_username || "—"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={grn.status} />
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active GRN QC view */}
      {activeGRN && (
        <div className="grid grid-cols-1 gap-4">

          {/* header bar */}
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-5 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600">QC Inspection</p>
              <p className="text-lg font-bold text-gray-900">{activeGRN.grn_id}</p>
              <p className="text-xs text-gray-500">PO: {activeGRN.po_id} · {fmtDate(activeGRN.receipt_date)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setActiveGRN(null); setGrnItems([]); setSummary(null); }}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Back to list
              </button>
              <Button
                onClick={handleApproveGRN}
                disabled={approving || !allDone}
                className={`h-9 text-sm font-semibold ${allDone ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-300 cursor-not-allowed"}`}
              >
                {approving
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Approving...</>
                  : allDone
                  ? "Final Approve — Generate Barcodes"
                  : `${pending} item${pending !== 1 ? "s" : ""} pending`}
              </Button>
            </div>
          </div>

          {/* summary strip */}
          {summary && (
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Total Received" value={summary.received ?? 0} cls="text-gray-900" />
              <StatCard label="Accepted"       value={summary.accepted ?? 0} cls="text-emerald-600" />
              <StatCard label="Rejected"       value={summary.rejected ?? 0} cls="text-red-500" />
            </div>
          )}

          {/* per-item QC rows */}
          <Card className="shadow-sm border-gray-200">
            <CardContent className="p-0">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Items ({grnItems.length})
                </p>
                {allDone && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <CheckCircle className="w-3.5 h-3.5" /> All items QC completed
                  </span>
                )}
              </div>
              {loading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : grnItems.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">No items found for this GRN.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {grnItems.map(item => (
                    <QCItemRow
                      key={item.grn_item_id + item.qc_status}
                      item={item}
                      grnId={activeGRN.grn_id}
                      onSaved={refreshItems}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
}

// ─── Inline QC row (no popup) ─────────────────────────────────────────────
function QCItemRow({ item, grnId, onSaved }) {
  const { toast } = useToast();
  const [accepted, setAccepted] = useState(item.accepted_quantity || 0);
  const [rejected, setRejected] = useState(item.rejected_quantity || 0);
  const [rejectionReason, setRejectionReason] = useState(item.rejection_reason || "Defect");
  const [rejectionNotes, setRejectionNotes] = useState(item.rejection_notes || "");
  const [rejectionImages, setRejectionImages] = useState(item.rejection_images || []);
  const [saving, setSaving]     = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  const received    = item.received_quantity || 0;
  const total       = accepted + rejected;
  const isOver      = total > received;
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
    if (isOver) return;
    setSaving(true);
    try {
      const payload = {
        accepted_quantity: accepted,
        rejected_quantity: rejected,
      };

      if (rejected > 0) {
        payload.rejection_reason = rejectionReason;
        payload.rejection_notes = rejectionNotes;
        payload.rejection_images = rejectionImages;
      }

      await qcUpdateGRNItem(item.grn_item_id, payload);
      toast({ title: "Saved", description: `${item.product_name || item.snapshot_product_name} — QC recorded.` });
      await onSaved();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`px-5 py-4 ${isCompleted ? "bg-green-50/40" : ""}`}>
      <div className="grid grid-cols-[1fr_auto] gap-4">
        {/* product info */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-gray-800 truncate">
              {item.snapshot_product_name || item.product_name}
            </p>
            {isCompleted && (
              <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-semibold">
                <CheckCircle className="w-3 h-3" /> Done
              </span>
            )}
          </div>
          <p className="text-[10px] font-mono text-gray-400">{item.grn_item_id}</p>
          <div className="flex gap-4 mt-2">
            <span className="text-xs text-gray-500">
              Received: <span className="font-semibold text-gray-800">{received}</span>
            </span>
            {isCompleted && (
              <>
                <span className="text-xs text-emerald-600">
                  Accepted: <span className="font-semibold">{item.accepted_quantity}</span>
                </span>
                <span className="text-xs text-red-500">
                  Rejected: <span className="font-semibold">{item.rejected_quantity}</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* QC inputs */}
        {!isCompleted ? (
          <div className="flex items-start gap-2 shrink-0">
            <div className="grid gap-1">
              <Label className="text-[10px] text-gray-400 text-center">Accept</Label>
              <Input
                type="number" min="0" max={received}
                value={accepted}
                onChange={e => setAccepted(parseInt(e.target.value) || 0)}
                className={`w-20 h-8 text-sm text-center tabular-nums border-gray-300 ${isOver ? "border-red-400" : ""}`}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-[10px] text-gray-400 text-center">Reject</Label>
              <Input
                type="number" min="0" max={received}
                value={rejected}
                onChange={e => setRejected(parseInt(e.target.value) || 0)}
                className={`w-20 h-8 text-sm text-center tabular-nums border-gray-300 ${isOver ? "border-red-400" : ""}`}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-[10px] text-transparent">-</Label>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || isOver || (accepted + rejected === 0)}
                className="h-8 w-16 bg-[#1E3A8A] hover:bg-[#162d6e] text-xs"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>
            {isOver && (
              <div className="grid gap-1">
                <Label className="text-[10px] text-transparent">-</Label>
                <p className="h-8 flex items-center text-[10px] text-red-500 font-medium">Exceeds {received}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          </div>
        )}
      </div>

      {/* Rejection Details Section */}
      {!isCompleted && rejected > 0 && (
        <div className="mt-4 p-4 border border-red-100 bg-red-50/30 rounded-lg animate-in fade-in slide-in-from-top-2">
          <p className="text-xs font-bold text-red-700 uppercase tracking-wider mb-3">Rejection Details</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-gray-600">Primary Reason</Label>
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
                <Label className="text-xs text-gray-600">Internal Notes</Label>
                <Textarea 
                  placeholder="Describe the issue in detail..."
                  className="text-xs bg-white border-gray-200 min-h-[80px]"
                  value={rejectionNotes}
                  onChange={e => setRejectionNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs text-gray-600">Photo Evidence ({rejectionImages.length}/5)</Label>
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
                    <Camera className="w-5 h-5 text-gray-400 mb-1" />
                    <span className="text-[10px] text-gray-400 font-medium">Add Photo</span>
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
                <div key={idx} className="shrink-0 w-12 h-12 rounded border border-gray-200 overflow-hidden bg-white">
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

// ════════════════════════════════════════════════════════════════════════
// MAIN GRN PAGE
// ════════════════════════════════════════════════════════════════════════
export default function GRNPage() {
  const { user }  = useAuth();
  const { toast } = useToast();

  const [tab, setTab]         = useState("list"); // "list" | "create" | "qc"
  const [search, setSearch]   = useState("");
  const [grns, setGrns]       = useState([]);
  const [qcGRNs, setQcGRNs]   = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedGRN, setExpandedGRN] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});
  const [loadingItems, setLoadingItems]   = useState({});
  const [poList, setPoList]   = useState([]);
  const [asnList, setAsnList] = useState([]);

  const isSupervisor = ["supervisor", "admin"].includes(user?.role);
  const isQC         = ["quality_checker", "quality_assistant", "admin"].includes(user?.role);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [grnRes, poRes, asnRes] = await Promise.allSettled([
        isSupervisor ? getMyGRNs() : listGRNs(),
        listPurchaseOrders(),
        listASN(),
      ]);

      if (grnRes.status === "fulfilled") {
        const raw = grnRes.value;
        setGrns(toArr(raw.data || raw));
      }
      if (poRes.status  === "fulfilled") setPoList(toArr(poRes.value));
      if (asnRes.status === "fulfilled") setAsnList(toArr(asnRes.value));

      // also load QC pending
      if (isQC) {
        try {
          const qcRes = await getQCPendingGRNs();
          setQcGRNs(toArr(qcRes));
        } catch { setQcGRNs([]); }
      }
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [isSupervisor, isQC, toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggleGRN = async (grnId) => {
    if (expandedGRN === grnId) { setExpandedGRN(null); return; }
    setExpandedGRN(grnId);
    if (!expandedItems[grnId]) {
      setLoadingItems(prev => ({ ...prev, [grnId]: true }));
      try {
        const [items, sum] = await Promise.all([getGRNItems(grnId), getGRNSummary(grnId)]);
        setExpandedItems(prev => ({ ...prev, [grnId]: { items: toArr(items), summary: sum } }));
      } catch { /* silent */ } finally {
        setLoadingItems(prev => ({ ...prev, [grnId]: false }));
      }
    }
  };

  const q = search.toLowerCase();
  const filteredGRNs = grns.filter(grn =>
    [grn.grn_id, grn.po_id, grn.grn_number, grn.vendor_name]
      .some(v => String(v ?? "").toLowerCase().includes(q))
  );

  // tab counts
  const received   = grns.filter(g => g.status === "RECEIVED").length;
  const qcPending  = qcGRNs.length;
  const completed  = grns.filter(g => g.status === "COMPLETED").length;

  const tabs = [
    { id: "list",   label: "All GRNs",     badge: grns.length,  show: true },
    { id: "create", label: "Create GRN",   badge: null,         show: isSupervisor },
    { id: "qc",     label: "QC Inspection",badge: qcPending,    show: isQC },
  ].filter(t => t.show);

  return (
    <div className="space-y-4">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Goods Received Notes</h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage receipts, scan items, and run quality control</p>
        </div>
        <button
          onClick={loadAll}
          disabled={isLoading}
          className="p-1.5 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Stat strip ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total GRNs"    value={grns.length}  cls="text-[#1E3A8A]" />
        <StatCard label="Received"      value={received}     cls="text-blue-600" />
        <StatCard label="Awaiting QC"   value={qcPending}    cls="text-amber-600" />
        <StatCard label="Completed"     value={completed}    cls="text-emerald-600" />
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 flex gap-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-[#1E3A8A] text-[#1E3A8A]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                tab === t.id ? "bg-[#1E3A8A] text-white" : "bg-gray-100 text-gray-600"
              }`}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: All GRNs ────────────────────────────────────────────── */}
      {tab === "list" && (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search GRN, PO, number..."
              className="pl-9 h-9 border-gray-200"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <Card className="shadow-sm border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-8" />
                  <TableHead className="text-xs font-semibold text-gray-500">GRN ID</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500">GRN Number</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500">PO Ref</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500">ASN Ref</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500">Receipt Date</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500">Received By</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-500">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#1E3A8A]" />
                    </TableCell>
                  </TableRow>
                ) : filteredGRNs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                      {search ? "No GRNs match your search." : "No GRNs found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGRNs.map(grn => {
                    const isExp = expandedGRN === grn.grn_id;
                    const detail = expandedItems[grn.grn_id];
                    const ldg    = loadingItems[grn.grn_id];
                    return [
                      <TableRow
                        key={grn.grn_id}
                        className={`cursor-pointer hover:bg-gray-50 transition-colors ${isExp ? "bg-blue-50/30" : ""}`}
                        onClick={() => toggleGRN(grn.grn_id)}
                      >
                        <TableCell className="pl-4 pr-0">
                          {isExp
                            ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                            : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </TableCell>
                        <TableCell className="text-xs font-mono font-bold text-[#1E3A8A]">{grn.grn_id}</TableCell>
                        <TableCell className="text-xs text-gray-600">{grn.grn_number || "—"}</TableCell>
                        <TableCell className="text-xs font-mono text-gray-600">{grn.po_id || "—"}</TableCell>
                        <TableCell className="text-xs font-mono text-gray-400">{grn.asn_id || "—"}</TableCell>
                        <TableCell className="text-xs text-gray-500">{fmtDate(grn.receipt_date)}</TableCell>
                        <TableCell className="text-xs text-gray-600">{grn.received_by_username || "—"}</TableCell>
                        <TableCell><StatusBadge status={grn.status} /></TableCell>
                      </TableRow>,
                      isExp && (
                        <TableRow key={`${grn.grn_id}-exp`} className="bg-blue-50/10">
                          <TableCell colSpan={8} className="p-0">
                            {ldg ? (
                              <div className="py-6 flex justify-center">
                                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                              </div>
                            ) : detail ? (
                              <div className="px-8 py-4">
                                {/* summary */}
                                {detail.summary && (
                                  <div className="flex gap-6 mb-3 text-xs">
                                    <span className="text-gray-500">Received: <strong className="text-gray-800">{detail.summary.received ?? 0}</strong></span>
                                    <span className="text-emerald-600">Accepted: <strong>{detail.summary.accepted ?? 0}</strong></span>
                                    <span className="text-red-500">Rejected: <strong>{detail.summary.rejected ?? 0}</strong></span>
                                  </div>
                                )}
                                {detail.items.length === 0 ? (
                                  <p className="text-xs text-gray-400 py-2">No items added yet.</p>
                                ) : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-gray-400 border-b border-gray-100">
                                        <th className="text-left py-1.5 font-semibold">Product</th>
                                        <th className="text-left py-1.5 font-semibold">Batch</th>
                                        <th className="text-right py-1.5 font-semibold">Received</th>
                                        <th className="text-right py-1.5 font-semibold">Accepted</th>
                                        <th className="text-right py-1.5 font-semibold">Rejected</th>
                                        <th className="text-left py-1.5 font-semibold">QC</th>
                                        <th className="text-left py-1.5 font-semibold">Barcode</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {detail.items.map(item => (
                                        <tr key={item.grn_item_id} className="border-b border-gray-50">
                                          <td className="py-1.5 font-medium text-gray-800">
                                            {item.snapshot_product_name || item.product_name}
                                          </td>
                                          <td className="py-1.5 font-mono text-gray-500">
                                            {item.batch?.batch_number || item.batch_number || "—"}
                                          </td>
                                          <td className="py-1.5 text-right tabular-nums">{item.received_quantity}</td>
                                          <td className="py-1.5 text-right tabular-nums text-emerald-600 font-semibold">{item.accepted_quantity ?? 0}</td>
                                          <td className="py-1.5 text-right tabular-nums text-red-500 font-semibold">{item.rejected_quantity ?? 0}</td>
                                          <td className="py-1.5">
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                                              item.qc_status === "Completed"
                                                ? "bg-green-100 text-green-700"
                                                : "bg-amber-100 text-amber-700"
                                            }`}>
                                              {item.qc_status}
                                            </span>
                                          </td>
                                          <td className="py-1.5">
                                            {item.barcode_image
                                              ? <img
                                                  src={`data:image/png;base64,${item.barcode_image}`}
                                                  alt={item.grn_item_id}
                                                  className="h-7 w-auto"
                                                />
                                              : <span className="text-gray-300 text-[10px]">Generated after QC</span>}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ),
                    ];
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* ── Tab: Create GRN (Supervisor) ─────────────────────────────── */}
      {tab === "create" && isSupervisor && (
        <SupervisorPanel
          poList={poList}
          asnList={asnList}
          existingGRNs={grns}
          onGRNCreated={() => { loadAll(); setTab("list"); }}
        />
      )}

      {/* ── Tab: QC Inspection ───────────────────────────────────────── */}
      {tab === "qc" && isQC && (
        <QCPanel
          grns={qcGRNs}
          onRefresh={() => { loadAll(); }}
        />
      )}

    </div>
  );
}