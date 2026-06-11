import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import {
  Plus, Search, Check, X, Loader2, Eye, Building2, Package,
  User, Mail, Phone, MapPin, Clock, Tag, FileText, AlertTriangle,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { useAuth } from "../components/lib/auth-context";
import {
  listPurchaseRequests,
  getPurchaseRequest,
  createPurchaseRequest,
  managerApprovePR,
  financeApprovePR,
  listProducts,
  listVendors,
  getVendor,
  getProduct,
  updatePurchaseRequest, // you may need to add this to apiService if not present
} from "../services/apiService";
import { useToast } from "../components/ui/use-toast";
import { formatDateDDMMYYYY } from "../components/utils/helpers";

// ─── helpers ──────────────────────────────────────────────────────────────
const toArray = (res, knownKey = null) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (knownKey && Array.isArray(res[knownKey])) return res[knownKey];
  for (const key of ["results", "data", "items"]) {
    if (Array.isArray(res[key])) return res[key];
  }
  return Object.values(res).find(Array.isArray) || [];
};

const matchesSearch = (value, query) =>
  String(value ?? "").toLowerCase().includes(query);

const STATUS_MAP = {
  Pending:             { label: "Pending",          variant: "outline" },
  "Manager Approved":  { label: "Manager Approved", variant: "default" },
  "Finance Pending":   { label: "Finance Review",   variant: "warning" },
  Approved:            { label: "Approved",         variant: "secondary" },
  Rejected:            { label: "Rejected",         variant: "destructive" },
};

const EMPTY_PR = { product_id: "", vendor_id: "", requested_cartons: "" };

// ─── Approve Edit Drawer ───────────────────────────────────────────────────
// Shown when a manager clicks Approve on a PR.
// Lets them change vendor and carton qty before committing.
// For auto-generated PRs (is_auto_generated=true) this is especially important
// since the system-chosen vendor and qty may need manual adjustment.
function ApproveEditDrawer({ pr, vendors, products, open, onClose, onConfirm, isSubmitting }) {
  const [selectedVendor, setSelectedVendor]   = useState(pr?.vendor || pr?.vendor_id || "");
  const [cartons, setCartons]                 = useState(String(pr?.requested_cartons || ""));
  const [notes, setNotes]                     = useState("");

  // Reset when PR changes
  useEffect(() => {
    if (pr) {
      setSelectedVendor(pr.vendor || pr.vendor_id || "");
      setCartons(String(pr.requested_cartons || ""));
      setNotes("");
    }
  }, [pr]);

  if (!pr) return null;

  const product = products.find(
    p => String(p.product_id) === String(pr.product || pr.product_id)
  );
  const chosenVendor = vendors.find(v => String(v.vendor_id) === String(selectedVendor));

  const estimatedTotal = cartons && product
    ? parseInt(cartons) * (product.carton_price ?? product.unit_price ?? 0)
    : pr.total_amount ?? 0;

  const needsFinance = true;
  const vendorChanged = String(selectedVendor) !== String(pr.vendor || pr.vendor_id || "");
  const cartonsChanged = parseInt(cartons) !== pr.requested_cartons;
  const hasChanges = vendorChanged || cartonsChanged;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            Review &amp; Approve Purchase Request
          </DialogTitle>
          <DialogDescription>
            PR #{pr.pr_id}
            {pr.is_auto_generated && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-semibold">
                Auto-generated
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Product info — read-only */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Product</p>
            <p className="text-sm font-semibold text-gray-900">
              {pr.product_name || product?.product_name || "—"}
            </p>
            {product && (
              <div className="flex gap-4 mt-1 text-xs text-gray-500">
                <span>Category: <strong className="text-gray-700">{product.category}</strong></span>
                <span>Unit: <strong className="text-gray-700">₹{(product.unit_price ?? 0).toLocaleString()}</strong></span>
                <span>Carton price: <strong className="text-gray-700">₹{(product.carton_price ?? 0).toLocaleString()}</strong></span>
              </div>
            )}
          </div>

          {/* Original system recommendation (shown for auto-PRs) */}
          {pr.is_auto_generated && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> System Recommendation
              </p>
              <div className="flex gap-6 text-xs text-blue-700">
                <span>Vendor: <strong>{pr.vendor_name || "—"}</strong></span>
                <span>Score: <strong>{pr.recommended_score ? (pr.recommended_score * 100).toFixed(0) + "%" : "—"}</strong></span>
                <span>Cartons: <strong>{pr.requested_cartons}</strong></span>
                <span>Amount: <strong>₹{(pr.total_amount ?? 0).toLocaleString()}</strong></span>
              </div>
              <p className="text-[10px] text-blue-500 mt-1.5">
                You can change the vendor and quantity below before approving.
              </p>
            </div>
          )}

          {/* Editable vendor */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold text-gray-600">
              Vendor
              {vendorChanged && (
                <span className="ml-2 text-[10px] text-amber-600 font-normal">Changed</span>
              )}
            </Label>
            <Select value={String(selectedVendor)} onValueChange={setSelectedVendor}>
              <SelectTrigger className="h-9 text-sm border-gray-300">
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map(v => (
                  <SelectItem key={v.vendor_id} value={String(v.vendor_id)}>
                    <span className="flex items-center gap-2">
                      {v.vendor_name}
                      {String(v.vendor_id) === String(pr.vendor || pr.vendor_id) && (
                        <span className="text-[10px] text-gray-400">(system pick)</span>
                      )}
                      {v.lead_time && (
                        <span className="text-[10px] text-gray-400">· {v.lead_time}d lead</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chosenVendor && (
              <p className="text-[10px] text-gray-500">
                Contact: {chosenVendor.contact_person || "—"} · {chosenVendor.email || chosenVendor.phone || "—"}
              </p>
            )}
          </div>

          {/* Editable carton qty */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold text-gray-600">
              Cartons to order
              {cartonsChanged && (
                <span className="ml-2 text-[10px] text-amber-600 font-normal">
                  Changed from {pr.requested_cartons}
                </span>
              )}
            </Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min="1"
                value={cartons}
                onChange={e => setCartons(e.target.value)}
                className="h-9 w-32 text-sm border-gray-300 text-center tabular-nums"
              />
              {product && cartons && (
                <p className="text-xs text-gray-500">
                  = <strong className="text-gray-800">
                    {(parseInt(cartons) * (product.conversion_factor || 1)).toLocaleString()}
                  </strong> {product.base_unit || "units"}
                </p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold text-gray-600">Approval notes (optional)</Label>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Reason for vendor/qty change, special instructions..."
              className="h-9 text-sm border-gray-300"
            />
          </div>

          {/* Cost summary */}
          <div className={`rounded-lg px-4 py-3 border ${needsFinance ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Estimated Total</p>
                <p className="text-2xl font-bold tabular-nums text-gray-900 mt-0.5">
                  ₹{estimatedTotal.toLocaleString()}
                </p>
              </div>
              {needsFinance && (
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs font-semibold">
                    <AlertTriangle className="w-3 h-3" /> Finance approval required
                  </span>
                  <p className="text-[10px] text-amber-600 mt-1">All purchase requests require finance approval</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm({ vendor_id: selectedVendor, requested_cartons: parseInt(cartons), notes })}
            disabled={isSubmitting || !selectedVendor || !cartons || parseInt(cartons) < 1}
            className="bg-emerald-600 hover:bg-emerald-700 font-semibold"
          >
            {isSubmitting
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Approving...</>
              : hasChanges
              ? "Save Changes & Approve"
              : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function PurchaseRequestsPage() {
  const { user }  = useAuth();
  const { toast } = useToast();
  const location  = useLocation();
  const navigate  = useNavigate();

  const [search, setSearch]           = useState("");
  const [prs, setPrs]                 = useState([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [products, setProducts]       = useState([]);
  const [vendors, setVendors]         = useState([]);

  // Approve edit drawer
  const [approveDrawerPR, setApproveDrawerPR]   = useState(null);
  const [isApproving, setIsApproving]           = useState(false);

  // Reject confirmation
  const [rejectPR, setRejectPR]       = useState(null);
  const [isRejecting, setIsRejecting] = useState(false);

  // Finance action
  const [financeDialogPR, setFinanceDialogPR]   = useState(null);
  const [financeAction, setFinanceAction]       = useState(null); // "approve" | "reject"
  const [isFinanceActing, setIsFinanceActing]   = useState(false);

  // Detail view
  const [detailPR, setDetailPR]         = useState(null);
  const [detailVendor, setDetailVendor] = useState(null);
  const [detailProduct, setDetailProduct] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailOpen, setDetailOpen]     = useState(false);

  // Create PR dialog
  const [createOpen, setCreateOpen]   = useState(false);
  const [newPR, setNewPR]             = useState(EMPTY_PR);
  const [isCreating, setIsCreating]   = useState(false);

  const isManager = ["manager", "admin"].includes(user?.role);
  const isFinance  = ["finance_director", "admin"].includes(user?.role);

  const loadPRs = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listPurchaseRequests();
      setPrs(toArray(data));
    } catch (err) {
      toast({ title: "Error", description: "Failed to load purchase requests.", variant: "destructive" });
    } finally { setIsLoading(false); }
  }, [toast]);

  const loadProducts = useCallback(async () => {
    try { const data = await listProducts(); setProducts(toArray(data, "products")); }
    catch { /* silent */ }
  }, []);

  const loadVendors = useCallback(async () => {
    try { const data = await listVendors(); setVendors(toArray(data, "vendors")); }
    catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadPRs();
    loadProducts();
    loadVendors();
  }, [loadPRs, loadProducts, loadVendors]);

  // ── Detail view ──────────────────────────────────────────────────────────
  const handleViewDetails = useCallback(async (pr) => {
    setIsLoadingDetail(true);
    setDetailOpen(true);
    setDetailPR(pr);
    setDetailVendor(null);
    setDetailProduct(null);
    try {
      const [vRes, pRes] = await Promise.allSettled([
        pr.vendor   ? getVendor(pr.vendor)   : Promise.reject(),
        pr.product  ? getProduct(pr.product) : Promise.reject(),
      ]);
      if (vRes.status === "fulfilled") setDetailVendor(vRes.value);
      if (pRes.status === "fulfilled") setDetailProduct(pRes.value);
    } catch { /* silent */ }
    finally { setIsLoadingDetail(false); }
  }, []);

  // Auto-open PR detail/drawer from notification redirect_url (?view_pr=PRXXXX)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const viewPrId = params.get("view_pr");
    if (viewPrId && products.length > 0 && vendors.length > 0) {
      const loadSpecificPR = async () => {
        try {
          const prDetails = await getPurchaseRequest(viewPrId);
          if (prDetails) {
            if (prDetails.status === "Pending" && ["manager", "admin"].includes(user?.role)) {
              setApproveDrawerPR(prDetails);
            } else {
              handleViewDetails(prDetails);
            }
          }
        } catch (err) {
          toast({
            title: "Error",
            description: `Failed to load purchase request ${viewPrId}.`,
            variant: "destructive",
          });
        }
      };

      loadSpecificPR();

      // Clear only the view_pr query parameter from the URL
      const updatedParams = new URLSearchParams(location.search);
      updatedParams.delete("view_pr");
      const newSearch = updatedParams.toString();
      const newUrl = location.pathname + (newSearch ? `?${newSearch}` : "");
      navigate(newUrl, { replace: true });
    }
  }, [products, vendors, user, toast, handleViewDetails, location.search, location.pathname, navigate]);

  // ── Manager approve flow ─────────────────────────────────────────────────
  // Opens the edit drawer instead of a simple confirm dialog.
  const handleApproveClick = (pr) => setApproveDrawerPR(pr);

  const handleApproveConfirm = async ({ vendor_id, requested_cartons, notes }) => {
    if (!approveDrawerPR) return;
    setIsApproving(true);
    try {
      const pr = approveDrawerPR;

      // If manager changed vendor or qty, update the PR first before approving
      const vendorChanged   = String(vendor_id) !== String(pr.vendor || pr.vendor_id || "");
      const cartonsChanged  = requested_cartons !== pr.requested_cartons;

      if ((vendorChanged || cartonsChanged) && typeof updatePurchaseRequest === "function") {
        // updatePurchaseRequest should PATCH /api/purchase-requests/<pr_id>/
        // with { vendor_id, requested_cartons, notes }
        // Add this endpoint + apiService function if not yet present.
        await updatePurchaseRequest(pr.pr_id, {
          vendor_id,
          requested_cartons,
          ...(notes ? { manager_notes: notes } : {}),
        });
      }

      await managerApprovePR(pr.pr_id);

      const product = products.find(p => String(p.product_id) === String(pr.product || pr.product_id));
      const total = requested_cartons * (product?.carton_price ?? product?.unit_price ?? 0);
      const needsFinance = true;

      toast({
        title: "PR Approved",
        description: needsFinance && !isFinance
          ? "Sent to Finance Director for final approval."
          : "Purchase Order created and emailed to vendor.",
      });

      setApproveDrawerPR(null);
      loadPRs();
    } catch (err) {
      toast({ title: "Error", description: err.message || "Approval failed.", variant: "destructive" });
    } finally { setIsApproving(false); }
  };

  // ── Manager reject ───────────────────────────────────────────────────────
  const handleRejectConfirm = async () => {
    if (!rejectPR) return;
    setIsRejecting(true);
    try {
      // Most backends handle rejection at finance stage — if your backend supports
      // manager rejection at Pending stage too, call the right endpoint here.
      if (rejectPR.status === "Finance Pending" && isFinance) {
        await financeApprovePR(rejectPR.pr_id, { action: "reject" });
      } else {
        // For manager-stage rejection, send action:"reject" or call a dedicated endpoint
        await managerApprovePR(rejectPR.pr_id, { action: "reject" });
      }
      toast({ title: "PR Rejected", description: `PR #${rejectPR.pr_id} has been rejected.` });
      setRejectPR(null);
      loadPRs();
    } catch (err) {
      toast({ title: "Error", description: err.message || "Rejection failed.", variant: "destructive" });
    } finally { setIsRejecting(false); }
  };

  // ── Finance action ───────────────────────────────────────────────────────
  const handleFinanceAction = async () => {
    if (!financeDialogPR || !financeAction) return;
    setIsFinanceActing(true);
    try {
      await financeApprovePR(financeDialogPR.pr_id, { action: financeAction });
      toast({
        title: financeAction === "approve" ? "PR Approved" : "PR Rejected",
        description: financeAction === "approve"
          ? "Purchase Order created and emailed to vendor."
          : `PR #${financeDialogPR.pr_id} rejected by Finance.`,
      });
      setFinanceDialogPR(null);
      setFinanceAction(null);
      loadPRs();
    } catch (err) {
      toast({ title: "Error", description: err.message || "Action failed.", variant: "destructive" });
    } finally { setIsFinanceActing(false); }
  };

  // ── Create PR ────────────────────────────────────────────────────────────
  const handleCreatePR = async (e) => {
    e.preventDefault();
    if (!newPR.product_id || !newPR.vendor_id || !newPR.requested_cartons) {
      toast({ title: "Error", description: "Please fill in all fields.", variant: "destructive" });
      return;
    }
    setIsCreating(true);
    try {
      const product = products.find(p => String(p.product_id) === String(newPR.product_id));
      const cartons = parseInt(newPR.requested_cartons, 10);
      await createPurchaseRequest({
        product_id:       newPR.product_id,
        vendor_id:        newPR.vendor_id,
        requested_cartons: cartons,
        ...(product ? { total_amount: cartons * (product.carton_price ?? product.unit_price ?? 0) } : {}),
      });
      toast({ title: "Success", description: "Purchase request created." });
      setCreateOpen(false);
      setNewPR(EMPTY_PR);
      loadPRs();
    } catch (err) {
      toast({ title: "Error", description: err.message || "Failed to create PR.", variant: "destructive" });
    } finally { setIsCreating(false); }
  };

  // ── Permission helpers ───────────────────────────────────────────────────
  const canManagerApprove = (pr) => pr.status === "Pending" && isManager && pr.is_auto_generated;
  const canManagerReject  = (pr) => pr.status === "Pending" && isManager && pr.is_auto_generated;
  const canFinanceAct     = (pr) => pr.status === "Finance Pending" && isFinance;

  const q = search.toLowerCase();
  const filteredPRs = prs.filter(pr =>
    matchesSearch(pr.pr_id, q) ||
    matchesSearch(pr.product_name, q) ||
    matchesSearch(pr.vendor_name, q)
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Purchase Requests</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage and approve purchase requests. Managers can adjust vendor and quantity before approving.
        </p>
      </div>

      {/* toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search PRs..."
            className="pl-9 h-9 border-gray-200"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadPRs}
            disabled={isLoading}
            className="p-1.5 rounded border border-gray-200 hover:bg-gray-50"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          {user?.role !== "finance_director" && (
            <Button
              size="sm"
              className="h-9 bg-[#1E3A8A] hover:bg-[#1E293B]"
              onClick={() => { setNewPR(EMPTY_PR); setCreateOpen(true); }}
            >
              <Plus className="w-4 h-4 mr-1.5" /> Create PR
            </Button>
          )}
        </div>
      </div>

      {/* ── PR table ──────────────────────────────────────────────────────── */}
      <Card className="shadow-sm border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs font-semibold text-gray-600">PR ID</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Product</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-right">Cartons</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-right">Amount</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Vendor</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Date</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Status</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-right w-[140px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1E3A8A]" />
                  </TableCell>
                </TableRow>
              ) : filteredPRs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                    No purchase requests found
                  </TableCell>
                </TableRow>
              ) : (
                filteredPRs.map(pr => (
                  <TableRow key={pr.pr_id} className="hover:bg-gray-50">
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-medium text-gray-900">{pr.pr_id}</span>
                        {pr.is_auto_generated && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[9px] font-semibold" title="Auto-generated by reorder system">AUTO</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-700">{pr.product_name || "-"}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums text-gray-700">
                      {pr.requested_cartons ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-right font-medium text-gray-900">
                      ₹{(pr.total_amount ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-gray-600">{pr.vendor_name || "-"}</TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {formatDateDDMMYYYY(pr.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_MAP[pr.status]?.variant || "outline"}
                        className="text-xs"
                      >
                        {STATUS_MAP[pr.status]?.label || pr.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* View details */}
                        <button
                          onClick={() => handleViewDetails(pr)}
                          className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5 text-gray-500" />
                        </button>

                        {/* Manager: approve (opens edit drawer) */}
                        {canManagerApprove(pr) && (
                          <button
                            onClick={() => handleApproveClick(pr)}
                            className="p-1.5 rounded hover:bg-green-50 transition-colors"
                            title="Review & Approve"
                          >
                            <Check className="w-3.5 h-3.5 text-green-600" />
                          </button>
                        )}

                        {/* Manager: reject */}
                        {canManagerReject(pr) && (
                          <button
                            onClick={() => setRejectPR(pr)}
                            className="p-1.5 rounded hover:bg-red-50 transition-colors"
                            title="Reject"
                          >
                            <X className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        )}

                        {/* Finance: approve / reject */}
                        {canFinanceAct(pr) && (
                          <>
                            <button
                              onClick={() => { setFinanceDialogPR(pr); setFinanceAction("approve"); }}
                              className="p-1.5 rounded hover:bg-green-50 transition-colors"
                              title="Finance Approve"
                            >
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            </button>
                            <button
                              onClick={() => { setFinanceDialogPR(pr); setFinanceAction("reject"); }}
                              className="p-1.5 rounded hover:bg-red-50 transition-colors"
                              title="Finance Reject"
                            >
                              <X className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Approve Edit Drawer ──────────────────────────────────────────── */}
      <ApproveEditDrawer
        pr={approveDrawerPR}
        vendors={vendors}
        products={products}
        open={!!approveDrawerPR}
        onClose={() => setApproveDrawerPR(null)}
        onConfirm={handleApproveConfirm}
        isSubmitting={isApproving}
      />

      {/* ── Reject confirmation ──────────────────────────────────────────── */}
      <Dialog open={!!rejectPR} onOpenChange={() => setRejectPR(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Purchase Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject PR #{rejectPR?.pr_id}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectPR(null)} disabled={isRejecting}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={isRejecting}
            >
              {isRejecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Finance action confirmation ──────────────────────────────────── */}
      <Dialog open={!!financeDialogPR} onOpenChange={() => { setFinanceDialogPR(null); setFinanceAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {financeAction === "approve" ? "Finance Approve" : "Finance Reject"} — PR #{financeDialogPR?.pr_id}
            </DialogTitle>
            <DialogDescription>
              {financeAction === "approve"
                ? `Approve PR #${financeDialogPR?.pr_id}? A Purchase Order will be created and emailed to the vendor.`
                : `Reject PR #${financeDialogPR?.pr_id}?`}
            </DialogDescription>
          </DialogHeader>
          {financeAction === "approve" && financeDialogPR && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs space-y-1">
              <p><span className="text-gray-500">Vendor:</span> <strong>{financeDialogPR.vendor_name}</strong></p>
              <p><span className="text-gray-500">Amount:</span> <strong>₹{(financeDialogPR.total_amount ?? 0).toLocaleString()}</strong></p>
              <p><span className="text-gray-500">Cartons:</span> <strong>{financeDialogPR.requested_cartons}</strong></p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setFinanceDialogPR(null); setFinanceAction(null); }}
              disabled={isFinanceActing}
            >
              Cancel
            </Button>
            <Button
              variant={financeAction === "approve" ? "default" : "destructive"}
              onClick={handleFinanceAction}
              disabled={isFinanceActing}
              className={financeAction === "approve" ? "bg-[#1E3A8A] hover:bg-[#162d6e]" : ""}
            >
              {isFinanceActing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {financeAction === "approve" ? "Approve & Create PO" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail view ─────────────────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">Purchase Request Details</DialogTitle>
            <DialogDescription>
              PR #{detailPR?.pr_id} — Created on{" "}
              {formatDateDDMMYYYY(detailPR?.created_at)}
              {detailPR?.is_auto_generated && (
                <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-semibold">
                  Auto-generated
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {isLoadingDetail ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#1E3A8A]" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* PR Summary */}
              <div className="bg-gray-50 rounded-lg p-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#1E3A8A]" /> Request Summary
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Status</p>
                    <Badge variant={STATUS_MAP[detailPR?.status]?.variant || "outline"} className="mt-1">
                      {STATUS_MAP[detailPR?.status]?.label || detailPR?.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total Amount</p>
                    <p className="text-lg font-bold text-gray-900">₹{(detailPR?.total_amount ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Cartons</p>
                    <p className="text-sm font-medium text-gray-900">{detailPR?.requested_cartons ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Requested By</p>
                    <p className="text-sm text-gray-700">
                      {detailPR?.is_auto_generated ? "Auto-reorder system" : (detailPR?.created_by_username || "N/A")}
                    </p>
                  </div>
                </div>
                {detailPR?.recommended_score && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-500">
                      Vendor recommendation score:{" "}
                      <strong className="text-gray-700">
                        {(detailPR.recommended_score * 100).toFixed(0)}%
                      </strong>
                      {detailPR.manager_notes && (
                        <span className="ml-4">
                          Manager notes: <em className="text-gray-700">{detailPR.manager_notes}</em>
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Product Details */}
              {detailProduct && (
                <div className="border border-gray-200 rounded-lg p-5">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#1E3A8A]" /> Product Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <Tag className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Product ID / SKU</p>
                          <p className="text-sm font-mono text-gray-900">{detailProduct.product_id} / {detailProduct.sku_code}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Package className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Product Name</p>
                          <p className="text-sm font-medium text-gray-900">{detailProduct.product_name}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Building2 className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Brand</p>
                          <p className="text-sm text-gray-700">{detailProduct.brand_name}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Tag className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Category</p>
                          <p className="text-sm text-gray-700">{detailProduct.category}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <Tag className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Size</p>
                          <p className="text-sm text-gray-700">{detailProduct.size || "Not specified"}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Carton Price / Reorder Level</p>
                          <p className="text-sm text-gray-700">
                            ₹{(detailProduct.carton_price ?? detailProduct.unit_price ?? 0).toLocaleString()} / {detailProduct.re_order} units
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Tag className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Classification</p>
                          <p className="text-sm text-gray-700">
                            ABC: {detailProduct.ABC} | VED: {detailProduct.VED} | XYZ: {detailProduct.XYZ}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Vendor Details */}
              {detailVendor && (
                <div className="border border-gray-200 rounded-lg p-5">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#1E3A8A]" /> Vendor Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <Tag className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Vendor ID</p>
                          <p className="text-sm font-mono text-gray-900">{detailVendor.vendor_id}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Building2 className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Vendor Name</p>
                          <p className="text-sm font-medium text-gray-900">{detailVendor.vendor_name}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <User className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Contact Person</p>
                          <p className="text-sm text-gray-700">{detailVendor.contact_person}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <Mail className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Email</p>
                          <p className="text-sm text-gray-700">{detailVendor.email || "-"}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Phone className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Phone</p>
                          <p className="text-sm text-gray-700">{detailVendor.phone}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Lead Time</p>
                          <p className="text-sm text-gray-700">{detailVendor.lead_time} days</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Address</p>
                        <p className="text-sm text-gray-700">
                          {detailVendor.address}, {detailVendor.city}, {detailVendor.state}, {detailVendor.country}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Approval Timeline */}
              <div className="border border-gray-200 rounded-lg p-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#1E3A8A]" /> Approval Timeline
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      detailPR?.status === "Approved"       ? "bg-green-500"  :
                      detailPR?.status === "Rejected"       ? "bg-red-500"    :
                      detailPR?.status === "Finance Pending"? "bg-yellow-500" :
                      detailPR?.status === "Manager Approved"? "bg-blue-500"  : "bg-gray-300"
                    }`} />
                    <p className="text-sm text-gray-700">
                      {detailPR?.status === "Pending"           && "Awaiting Manager Approval"}
                      {detailPR?.status === "Manager Approved"  && "Manager Approved — Under Finance Review"}
                      {detailPR?.status === "Finance Pending"   && "Awaiting Finance Director Approval"}
                      {detailPR?.status === "Approved"          && "Approved — Purchase Order Created"}
                      {detailPR?.status === "Rejected"          && "Request Rejected"}
                    </p>
                  </div>
                  {!["Approved", "Rejected"].includes(detailPR?.status) && (
                    <div className="flex items-center gap-3 pl-4 border-l-2 border-yellow-400">
                      <div className="w-2 h-2 rounded-full bg-yellow-500" />
                      <p className="text-sm text-yellow-700">
                        Requires Finance Director approval
                      </p>
                    </div>
                  )}
                  {detailPR?.status === "Approved" && (
                    <div className="flex items-center gap-3 pl-4 border-l-2 border-green-400">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <p className="text-sm text-green-700">
                        Purchase Order has been created and email sent to vendor
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create PR dialog ─────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleCreatePR}>
            <DialogHeader>
              <DialogTitle>Create Purchase Request</DialogTitle>
              <DialogDescription>
                Select product, vendor, and carton quantity.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Product</Label>
                <Select value={newPR.product_id} onValueChange={v => setNewPR({ ...newPR, product_id: v })}>
                  <SelectTrigger className="border-gray-200">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map(p => (
                      <SelectItem key={p.product_id} value={String(p.product_id)}>
                        {p.product_name} — ₹{(p.carton_price ?? p.unit_price ?? 0).toLocaleString()}/ctn
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Vendor</Label>
                <Select value={newPR.vendor_id} onValueChange={v => setNewPR({ ...newPR, vendor_id: v })}>
                  <SelectTrigger className="border-gray-200">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => (
                      <SelectItem key={v.vendor_id} value={String(v.vendor_id)}>
                        {v.vendor_name}{v.lead_time ? ` · ${v.lead_time}d lead` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Requested Cartons</Label>
                <Input
                  type="number"
                  min="1"
                  value={newPR.requested_cartons}
                  onChange={e => setNewPR({ ...newPR, requested_cartons: e.target.value })}
                  required
                  className="border-gray-200"
                />
              </div>
              {newPR.product_id && newPR.requested_cartons && (() => {
                const p = products.find(p => String(p.product_id) === String(newPR.product_id));
                if (!p) return null;
                const total = parseInt(newPR.requested_cartons, 10) * (p.carton_price ?? p.unit_price ?? 0);
                return (
                  <p className="text-xs text-gray-500">
                    Estimated total:{" "}
                    <span className="font-medium text-gray-900">₹{total.toLocaleString()}</span>
                    <span className="ml-2 text-amber-600">(Requires Finance approval)</span>
                  </p>
                );
              })()}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isCreating} className="bg-[#1E3A8A] hover:bg-[#1E293B]">
                {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create PR
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}