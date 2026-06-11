import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent } from "../components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Search, Loader2, RefreshCw, Download, ScanLine, CheckCircle,
  Package, AlertTriangle, ChevronDown, ChevronRight,
} from "lucide-react";
import { useToast } from "../components/ui/use-toast";
import {
  listGRNs,
  getGRNItems,
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

const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";

// ─── Generate Word doc for a QC-passed GRN ────────────────────────────────
function buildGRNDoc(grn, items) {
  const dateStr = fmtDate(new Date());
  const qcItems = items.filter(i => i.qc_status === "Completed" && (i.accepted_quantity ?? 0) > 0);

  const rows = qcItems.map((item, idx) => {
    const barcodeCell = item.barcode_image
      ? `<img src="data:image/png;base64,${item.barcode_image}"
              style="height:40px;width:auto;display:block;" />`
      : `<span style="font-family:Courier New;font-size:10px;color:#64748b;">(generated after QC)</span>`;

    return `
      <tr>
        <td class="cell center">${idx + 1}</td>
        <td class="cell center">${barcodeCell}</td>
        <td class="cell mono">${item.grn_item_id}</td>
        <td class="cell">${item.snapshot_product_name || item.product_name || "—"}</td>
        <td class="cell mono">${item.snapshot_barcode || "—"}</td>
        <td class="cell center grn">${item.accepted_quantity ?? 0}</td>
        <td class="cell write">&nbsp;</td>
        <td class="cell write">&nbsp;</td>
      </tr>`;
  }).join("");

  const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<title>GRN Inventory Log Sheet — ${grn.grn_id}</title>
<style>
  body   { font-family: Calibri, sans-serif; margin: 1.5cm 2cm; color: #0f172a; }
  h1     { font-size: 17px; font-weight: 700; color: #1E3A8A; margin: 0 0 3px; }
  .sub   { font-size: 11px; color: #475569; margin-bottom: 14px;
           border-bottom: 2px solid #1E3A8A; padding-bottom: 10px; }
  .notice{ background:#fef9c3; border:1px solid #fde047; padding:6px 10px;
           font-size:10px; color:#854d0e; border-radius:3px; margin-bottom:12px; }
  table  { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th     { background: #1E3A8A; color: #fff; font-size: 11px; padding: 7px 8px;
           border: 1px solid #1E3A8A; text-align: left; }
  .cell  { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 11px; vertical-align: middle; }
  .center{ text-align: center; }
  .mono  { font-family: Courier New, monospace; font-size: 10px; }
  .grn   { color: #16a34a; font-weight: 700; }
  .write { min-height: 26px; }
  tr:nth-child(even) td { background: #f8fafc; }
  .sign  { margin-top: 22px; font-size: 10px; color: #64748b;
           border-top: 1px solid #e2e8f0; padding-top: 8px; }
  .foot  { margin-top: 8px; font-size: 9px; color: #94a3b8; }
</style>
</head>
<body>
<h1>GRN Inventory Log Sheet</h1>
<div class="sub">
  <strong>GRN ID:</strong> ${grn.grn_id} &nbsp;|&nbsp;
  <strong>GRN Number:</strong> ${grn.grn_number || "—"} &nbsp;|&nbsp;
  <strong>PO Reference:</strong> ${grn.po_id || "—"} &nbsp;|&nbsp;
  <strong>Receipt Date:</strong> ${fmtDate(grn.receipt_date)} &nbsp;|&nbsp;
  <strong>Print Date:</strong> ${dateStr} &nbsp;|&nbsp;
  <strong>QC-Accepted Items:</strong> ${qcItems.length}
</div>
<div class="notice">
  Only QC-accepted items are listed below. Scan each item barcode during putaway and record the physical count in the Qty column.
</div>
<table>
  <thead>
    <tr>
      <th style="width:32px">S.No</th>
      <th style="width:85px">Item Barcode</th>
      <th>Item ID</th>
      <th>Product Name</th>
      <th>Product Barcode</th>
      <th style="width:62px;text-align:center">QC Accepted</th>
      <th style="width:72px">Phys. Count</th>
      <th>Remarks</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="sign">
  Counted By: _________________________ &nbsp;&nbsp;
  Verified By: _________________________ &nbsp;&nbsp;
  Date: _____________
</div>
<div class="foot">
  WMS Pro — Confidential Internal Document &nbsp;|&nbsp; ${dateStr} &nbsp;|&nbsp; GRN: ${grn.grn_id}
</div>
</body>
</html>`;

  return new Blob([html], { type: "application/msword" });
}

// ════════════════════════════════════════════════════════════════════════
// QC-PASSED GRN LIST + DOWNLOAD LOG SHEET
// ════════════════════════════════════════════════════════════════════════
function QCPassedGRNs() {
  const { toast }       = useToast();
  const [grns, setGrns] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [expanded, setExpanded]       = useState(null);
  const [itemsCache, setItemsCache]   = useState({});
  const [loadingGRN, setLoadingGRN]   = useState({});
  const [downloading, setDownloading] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listGRNs();
      const all = toArr(res);
      setGrns(all.filter(g => ["PUTAWAY_PENDING", "COMPLETED"].includes(g.status)));
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const toggleGRN = async (grnId) => {
    if (expanded === grnId) { setExpanded(null); return; }
    setExpanded(grnId);
    if (!itemsCache[grnId]) {
      setLoadingGRN(p => ({ ...p, [grnId]: true }));
      try {
        const res = await getGRNItems(grnId);
        setItemsCache(p => ({ ...p, [grnId]: toArr(res) }));
      } catch { /* silent */ } finally {
        setLoadingGRN(p => ({ ...p, [grnId]: false }));
      }
    }
  };

  const downloadDoc = async (e, grn) => {
    e.stopPropagation();
    setDownloading(p => ({ ...p, [grn.grn_id]: true }));
    try {
      let items = itemsCache[grn.grn_id];
      if (!items) {
        const res = await getGRNItems(grn.grn_id);
        items = toArr(res);
        setItemsCache(p => ({ ...p, [grn.grn_id]: items }));
      }
      const blob = buildGRNDoc(grn, items);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `grn-log-${grn.grn_id}-${Date.now()}.doc`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: `Log sheet for ${grn.grn_id} saved.` });
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDownloading(p => ({ ...p, [grn.grn_id]: false }));
    }
  };

  const q = search.toLowerCase();
  const filtered = grns.filter(g =>
    [g.grn_id, g.po_id, g.grn_number].some(v => String(v ?? "").toLowerCase().includes(q))
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search GRN, PO..."
            className="pl-9 h-9 border-gray-200"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={load} disabled={loading}
          className="p-1.5 rounded border border-gray-200 hover:bg-gray-50 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#1E3A8A]" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center border-gray-200 shadow-sm">
          <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No QC-passed GRNs found.</p>
          <p className="text-xs text-gray-300 mt-1">GRNs appear here after QC approval generates item barcodes.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(grn => {
            const isExp  = expanded === grn.grn_id;
            const items  = itemsCache[grn.grn_id] || [];
            const ldg    = loadingGRN[grn.grn_id];
            const dl     = downloading[grn.grn_id];
            const qcItems = items.filter(i => i.qc_status === "Completed" && (i.accepted_quantity ?? 0) > 0);

            return (
              <Card key={grn.grn_id}
                className={`shadow-sm overflow-hidden transition-all ${isExp ? "border-[#1E3A8A]/30" : "border-gray-200"}`}>

                <div
                  className={`flex items-center justify-between px-5 py-3.5 cursor-pointer transition-colors
                    ${isExp ? "bg-[#1E3A8A]/5" : "bg-white hover:bg-gray-50"}`}
                  onClick={() => toggleGRN(grn.grn_id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isExp
                      ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-[#1E3A8A] font-mono">{grn.grn_id}</p>
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${
                          grn.status === "COMPLETED"
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-purple-200 bg-purple-50 text-purple-700"
                        }`}>
                          {grn.status === "COMPLETED" ? "Completed" : "Putaway Pending"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {grn.grn_number || "—"} · PO: {grn.po_id || "—"} · {fmtDate(grn.receipt_date)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-4" onClick={e => e.stopPropagation()}>
                    {isExp && qcItems.length > 0 && (
                      <span className="text-[10px] text-gray-400">{qcItems.length} accepted items</span>
                    )}
                    <Button
                      size="sm"
                      onClick={e => downloadDoc(e, grn)}
                      disabled={dl}
                      className="h-8 bg-[#1E3A8A] hover:bg-[#162d6e] text-xs font-semibold"
                    >
                      {dl
                        ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating...</>
                        : <><Download className="w-3.5 h-3.5 mr-1.5" /> Download Log Sheet</>}
                    </Button>
                  </div>
                </div>

                {isExp && (
                  <div className="border-t border-gray-100">
                    {ldg ? (
                      <div className="py-8 flex justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      </div>
                    ) : items.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-6">No items found.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="text-xs font-semibold text-gray-500">Item Barcode</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-500">Item ID</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-500">Product</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-500 text-right">Accepted</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-500 text-right">Rejected</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-500">QC Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map(item => (
                            <TableRow key={item.grn_item_id} className="hover:bg-gray-50">
                              <TableCell>
                                {item.barcode_image
                                  ? <img
                                      src={`data:image/png;base64,${item.barcode_image}`}
                                      alt={item.grn_item_id}
                                      className="h-8 w-auto"
                                    />
                                  : <span className="text-[10px] text-gray-300 italic">Not generated</span>}
                              </TableCell>
                              <TableCell className="text-[10px] font-mono text-gray-500">{item.grn_item_id}</TableCell>
                              <TableCell>
                                <p className="text-xs font-medium text-gray-800">{item.snapshot_product_name || item.product_name}</p>
                                <p className="text-[10px] font-mono text-gray-400">{item.snapshot_barcode || "—"}</p>
                              </TableCell>
                              <TableCell className="text-right text-xs font-bold text-emerald-600 tabular-nums">
                                {item.accepted_quantity ?? 0}
                              </TableCell>
                              <TableCell className="text-right text-xs font-bold text-red-500 tabular-nums">
                                {item.rejected_quantity ?? 0}
                              </TableCell>
                              <TableCell>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  item.qc_status === "Completed"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}>
                                  {item.qc_status}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// INVENTORY LOGGER — scan item barcodes from printed sheet, log counts
// ════════════════════════════════════════════════════════════════════════
function InventoryLogger() {
  const { toast }     = useToast();
  const [grns, setGrns]               = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedGRN, setSelectedGRN] = useState(null);
  const [logItems, setLogItems]       = useState([]);
  const [loadingGRN, setLoadingGRN]   = useState(false);
  const [scanInput, setScanInput]     = useState("");
  const [activeItemId, setActiveItemId] = useState(null);
  const [qtyInput, setQtyInput]       = useState("");
  const [scanError, setScanError]     = useState("");
  const scanRef = useRef(null);

  useEffect(() => {
    (async () => {
      setLoadingList(true);
      try {
        const res = await listGRNs();
        const all = toArr(res);
        setGrns(all.filter(g => ["PUTAWAY_PENDING", "COMPLETED"].includes(g.status)));
      } catch { /* silent */ } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  const selectGRN = async (grn) => {
    setSelectedGRN(grn);
    setLogItems([]);
    setActiveItemId(null);
    setScanInput(""); setQtyInput(""); setScanError("");
    setLoadingGRN(true);
    try {
      const res = await getGRNItems(grn.grn_id);
      const items = toArr(res).filter(i => i.qc_status === "Completed" && (i.accepted_quantity ?? 0) > 0);
      setLogItems(items.map(i => ({ ...i, logged: false, loggedQty: null, loggedAt: null })));
      setTimeout(() => scanRef.current?.focus(), 100);
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingGRN(false);
    }
  };

  const handleScan = () => {
    const val = scanInput.trim();
    setScanError("");
    if (!val) { setScanError("Enter a barcode to scan."); return; }

    const match = logItems.find(i =>
      i.grn_item_id === val ||
      i.snapshot_barcode === val
    );
    if (!match) {
      setScanError(`"${val}" not found in this GRN's accepted items.`);
      return;
    }
    if (match.logged) {
      setScanError(`"${val}" already logged (${match.loggedQty} units).`);
      return;
    }
    setActiveItemId(match.grn_item_id);
    setQtyInput(String(match.accepted_quantity ?? ""));
    setScanInput("");
  };

  const confirmLog = () => {
    const qty = parseInt(qtyInput);
    if (isNaN(qty) || qty < 0) { setScanError("Enter a valid quantity."); return; }
    setLogItems(prev => prev.map(i =>
      i.grn_item_id === activeItemId
        ? { ...i, logged: true, loggedQty: qty, loggedAt: new Date() }
        : i
    ));
    toast({ title: "Logged", description: `${qty} units recorded.` });
    setActiveItemId(null); setQtyInput(""); setScanError("");
    setTimeout(() => scanRef.current?.focus(), 50);
  };

  const done    = logItems.filter(i => i.logged);
  const pending = logItems.filter(i => !i.logged);
  const pct     = logItems.length > 0 ? Math.round((done.length / logItems.length) * 100) : 0;
  const active  = logItems.find(i => i.grn_item_id === activeItemId);

  return (
    <div className="space-y-4">

      {/* GRN selector */}
      {!selectedGRN && (
        <Card className="shadow-sm border-gray-200">
          <CardContent className="p-5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
              Select a QC-Passed GRN to Log
            </p>
            {loadingList ? (
              <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
            ) : grns.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No QC-passed GRNs available.</p>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                {grns.map(g => (
                  <div
                    key={g.grn_id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => selectGRN(g)}
                  >
                    <div>
                      <p className="text-sm font-bold text-[#1E3A8A] font-mono">{g.grn_id}</p>
                      <p className="text-xs text-gray-500">{g.grn_number || "—"} · PO: {g.po_id || "—"} · {fmtDate(g.receipt_date)}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${
                      g.status === "COMPLETED"
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-purple-200 bg-purple-50 text-purple-700"
                    }`}>
                      {g.status === "COMPLETED" ? "Completed" : "Putaway Pending"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active logging session */}
      {selectedGRN && (
        <div className="space-y-4">

          {/* header bar */}
          <div className="flex items-center justify-between bg-[#1E3A8A] text-white rounded-lg px-5 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">Logging GRN</p>
              <p className="text-lg font-bold">{selectedGRN.grn_id}</p>
              <p className="text-xs opacity-70">{selectedGRN.grn_number || "—"} · {fmtDate(selectedGRN.receipt_date)}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums">{pct}%</p>
                <p className="text-xs opacity-70">{done.length}/{logItems.length} logged</p>
              </div>
              <button
                onClick={() => { setSelectedGRN(null); setLogItems([]); }}
                className="h-8 px-3 rounded bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition-colors">
                Change GRN
              </button>
            </div>
          </div>

          {/* progress bar */}
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>

          {loadingGRN ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#1E3A8A]" /></div>
          ) : (
            <div className="grid grid-cols-2 gap-4">

              {/* LEFT — scan + entry + pending */}
              <div className="space-y-3">

                {/* scan input */}
                <Card className="shadow-sm border-gray-200">
                  <CardContent className="p-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
                      Scan Item Barcode (from printed sheet)
                    </p>
                    <div className="flex gap-2 mb-2">
                      <div className="relative flex-1">
                        <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          ref={scanRef}
                          value={scanInput}
                          onChange={e => { setScanInput(e.target.value); setScanError(""); }}
                          onKeyDown={e => e.key === "Enter" && handleScan()}
                          placeholder="Scan or type GRN item barcode..."
                          className={`h-9 pl-9 font-mono text-sm border-gray-300 ${scanError ? "border-red-400 bg-red-50" : ""}`}
                          autoFocus
                        />
                      </div>
                      <Button onClick={handleScan} className="h-9 bg-[#1E3A8A] hover:bg-[#162d6e] text-sm">
                        Scan
                      </Button>
                    </div>
                    {scanError && (
                      <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {scanError}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* qty entry */}
                {active && (
                  <Card className="shadow-sm border-2 border-[#1E3A8A]">
                    <CardContent className="p-4">
                      <p className="text-[10px] font-semibold text-[#1E3A8A] uppercase tracking-widest mb-2">
                        Enter Physical Count
                      </p>
                      <p className="text-sm font-semibold text-gray-900">{active.snapshot_product_name || active.product_name}</p>
                      <p className="text-[10px] font-mono text-gray-400 mb-1">{active.grn_item_id}</p>
                      <p className="text-xs text-gray-500 mb-3">
                        QC Accepted: <span className="font-bold text-emerald-600">{active.accepted_quantity}</span> units
                      </p>
                      <div className="flex gap-2">
                        <Input
                          type="number" min="0"
                          value={qtyInput}
                          onChange={e => setQtyInput(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && confirmLog()}
                          placeholder="Physical count"
                          className="flex-1 h-9 text-sm border-gray-300"
                          autoFocus
                        />
                        <Button onClick={confirmLog} className="h-9 bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold">
                          Confirm
                        </Button>
                        <Button variant="outline" size="sm"
                          onClick={() => { setActiveItemId(null); setQtyInput(""); setScanError(""); scanRef.current?.focus(); }}
                          className="h-9 border-gray-300 text-sm">
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* pending list */}
                <Card className="shadow-sm border-gray-200">
                  <CardContent className="p-0">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-xs font-semibold text-gray-500">
                        Pending
                        <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                          {pending.length}
                        </span>
                      </p>
                    </div>
                    {pending.length === 0 ? (
                      <div className="py-8 text-center">
                        <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                        <p className="text-xs text-gray-400">All items logged</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-50 max-h-56 overflow-auto">
                        {pending.map(item => (
                          <div
                            key={item.grn_item_id}
                            className={`px-4 py-2.5 cursor-pointer transition-colors ${
                              activeItemId === item.grn_item_id
                                ? "bg-[#1E3A8A]/5 border-l-2 border-[#1E3A8A]"
                                : "hover:bg-gray-50"
                            }`}
                            onClick={() => {
                              setActiveItemId(item.grn_item_id);
                              setQtyInput(String(item.accepted_quantity ?? ""));
                              setScanError("");
                            }}
                          >
                            <p className="text-xs font-semibold text-gray-800 truncate">{item.snapshot_product_name || item.product_name}</p>
                            <p className="text-[10px] font-mono text-gray-400">{item.grn_item_id}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* RIGHT — logged items */}
              <Card className="shadow-sm border-gray-200">
                <CardContent className="p-0">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-500">
                      Logged
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                        {done.length}
                      </span>
                    </p>
                  </div>
                  {done.length === 0 ? (
                    <div className="py-12 text-center text-gray-300">
                      <CheckCircle className="w-7 h-7 mx-auto mb-2" />
                      <p className="text-xs">Logged items appear here</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="text-xs font-semibold text-gray-400">Product</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-400 text-right">QC Acc.</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-400 text-right">Logged</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-400">Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {done.map(item => (
                          <TableRow key={item.grn_item_id} className="hover:bg-gray-50">
                            <TableCell>
                              <p className="text-xs font-medium text-gray-800 max-w-[140px] truncate">
                                {item.snapshot_product_name || item.product_name}
                              </p>
                              <p className="text-[10px] font-mono text-gray-400">{item.grn_item_id}</p>
                            </TableCell>
                            <TableCell className="text-right text-xs text-gray-500 tabular-nums">{item.accepted_quantity}</TableCell>
                            <TableCell className="text-right text-xs font-bold text-emerald-600 tabular-nums">{item.loggedQty}</TableCell>
                            <TableCell className="text-[10px] text-gray-400 tabular-nums">{fmtTime(item.loggedAt)}</TableCell>
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
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ROOT PAGE
// ════════════════════════════════════════════════════════════════════════
export default function BarcodeCollectionPage() {
  const [tab, setTab] = useState("download");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Barcode Collection</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Download QC-passed GRN log sheets with item barcodes, or scan and log physical inventory counts.
        </p>
      </div>

      <div className="border-b border-gray-200 flex gap-0">
        {[
          { id: "download", label: "Download Log Sheets" },
          { id: "logger",   label: "Inventory Logger" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-[#1E3A8A] text-[#1E3A8A]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "download" && <QCPassedGRNs />}
      {tab === "logger"   && <InventoryLogger />}
    </div>
  );
}