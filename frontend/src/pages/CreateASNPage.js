/**
 * CreateASNPage.js
 *
 * Dedicated full-page Create ASN screen.
 * Backend model (ASN):
 *   - asn_number   CharField(50, unique)          REQUIRED
 *   - po           ForeignKey(PurchaseOrder)       REQUIRED
 *   - vendor       ForeignKey(Vendor)              REQUIRED
 *   - shipment_date    DateField                   REQUIRED
 *   - expected_arrival_date DateField              REQUIRED
 *   - vehicle_num  CharField(max_length=13)        REQUIRED (no blank=True)
 *   - driver_name  CharField(max_length=25)        REQUIRED
 *   - driver_phone CharField(max_length=15)        REQUIRED
 *
 * ASNItem fields (per item):
 *   - asn              FK to ASN                  REQUIRED
 *   - product          FK to Product              REQUIRED
 *   - expected_quantity IntegerField               REQUIRED
 *   - shipped_quantity  IntegerField               REQUIRED (set = expected initially)
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button }  from "../components/ui/button";
import { Input }   from "../components/ui/input";
import { Card }    from "../components/ui/card";
import { Badge }   from "../components/ui/badge";
import { Label }   from "../components/ui/label";
import { ArrowLeft, Plus, Trash2, Loader2, Truck, PackagePlus, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "../components/ui/use-toast";
import {
  createASN, createASNItem,
  listVendors, listProducts, listPurchaseOrders,
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

const EMPTY_ITEM = { product: "", expected_quantity: "" };

/* ── Field-level validators ── */
const validators = {
  asn_number:            v => null, // Optional: backend auto-generates if empty
  po:                    v => v        ? null : "Purchase Order is required.",
  vendor:                v => v        ? null : "Vendor is required.",
  shipment_date:         v => v        ? null : "Shipment Date is required.",
  expected_arrival_date: v => {
    if (!v) return "Expected Arrival Date is required.";
    return null;
  },
  vehicle_num: v => {
    if (!v.trim())         return "Vehicle Number is required.";
    if (v.trim().length > 13) return "Vehicle Number must be at most 13 characters.";
    return null;
  },
  driver_name: v => {
    if (!v.trim())          return "Driver Name is required.";
    if (v.trim().length > 25) return "Driver Name must be at most 25 characters.";
    return null;
  },
  driver_phone: v => {
    if (!v.trim())           return "Driver Phone is required.";
    if (v.trim().length > 15) return "Driver Phone must be at most 15 characters.";
    return null;
  },
};

function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-red-600 mt-1">
      <AlertCircle className="w-3 h-3 shrink-0" />
      {msg}
    </p>
  );
}

function Req() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

/* ════════════════════════════════════════ */
export default function CreateASNPage() {
  const navigate  = useNavigate();
  const { toast } = useToast();

  /* reference data */
  const [vendors,        setVendors]       = useState([]);
  const [products,       setProducts]      = useState([]);
  const [purchaseOrders, setPOs]           = useState([]);
  const [refLoading,     setRefLoading]    = useState(true);

  /* form */
  const [form, setForm] = useState({
    asn_number:            "",
    po:                    "",
    vendor:                "",
    shipment_date:         "",
    expected_arrival_date: "",
    vehicle_num:           "",
    driver_name:           "",
    driver_phone:          "",
  });
  const [items,   setItems]   = useState([{ ...EMPTY_ITEM }]);
  const [errors,  setErrors]  = useState({});
  const [touched, setTouched] = useState({});
  const [saving,  setSaving]  = useState(false);

  /* load reference data */
  useEffect(() => {
    Promise.all([listVendors(), listProducts(), listPurchaseOrders()])
      .then(([vr, pr, por]) => {
        setVendors(toArray(vr, "vendors"));
        setProducts(toArray(pr, "products"));
        setPOs(toArray(por, "purchase_orders"));
      })
      .catch(() => toast({ title: "Warning", description: "Could not load reference data.", variant: "destructive" }))
      .finally(() => setRefLoading(false));
  }, [toast]);

  /* ── field helpers ── */
  const setField = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setTouched(t => ({ ...t, [key]: true }));
    const err = validators[key]?.(val) ?? null;
    setErrors(e => ({ ...e, [key]: err }));
  };

  const touchAll = () => {
    const t = {};
    Object.keys(form).forEach(k => { t[k] = true; });
    setTouched(t);
    const e = {};
    Object.keys(validators).forEach(k => { e[k] = validators[k](form[k]); });
    setErrors(e);
    return Object.values(e).every(v => !v);
  };

  /* item helpers */
  const setItemField = (idx, key, val) =>
    setItems(arr => arr.map((it, i) => i === idx ? { ...it, [key]: val } : it));
  const addItem    = () => setItems(arr => [...arr, { ...EMPTY_ITEM }]);
  const removeItem = idx => setItems(arr => arr.filter((_, i) => i !== idx));

  /* validate items */
  const validateItems = () => {
    const valid = items.filter(it => it.product && it.expected_quantity);
    if (!valid.length) {
      toast({ title: "Items Required", description: "Add at least one item with product and quantity.", variant: "destructive" });
      return null;
    }
    return valid;
  };

  /* ── submit ── */
  const handleSubmit = async () => {
    const formOk   = touchAll();
    const validItems = validateItems();
    if (!formOk || !validItems) return;

    setSaving(true);
    let createdAsnId = null;

    try {
      /* 1. Create ASN header */
      const payload = {
        asn_number:            form.asn_number.trim(),
        po:                    form.po,
        vendor:                form.vendor,
        shipment_date:         form.shipment_date,
        expected_arrival_date: form.expected_arrival_date,
        vehicle_num:           form.vehicle_num.trim(),
        driver_name:           form.driver_name.trim(),
        driver_phone:          form.driver_phone.trim(),
      };

      const asnRes = await createASN(payload);
      createdAsnId = asnRes?.asn_id ?? asnRes?.id ?? asnRes?.data?.asn_id ?? null;

      if (!createdAsnId) throw new Error("ASN created but no ID returned from server.");

      /* 2. Create items */
      for (const it of validItems) {
        await createASNItem({
          asn:               createdAsnId,
          product:           it.product,
          expected_quantity: Number(it.expected_quantity),
          shipped_quantity:  Number(it.expected_quantity),  // initially = expected
        });
      }

      toast({ title: "ASN Created", description: `${form.asn_number} created with ${validItems.length} item(s).` });
      navigate("/asn");

    } catch (err) {
      toast({
        title:       "Creation Failed",
        description: createdAsnId
          ? `ASN created but items failed: ${err.message}`
          : `Failed to create ASN: ${err.message}`,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  /* ── selected PO label ── */
  const selectedPO = purchaseOrders.find(po => (po.po_id ?? po.id) === form.po);

  /* ════════════════════════════════════════ */
  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Page Header ── */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/asn")}
          className="p-2 rounded-md hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Create New ASN</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Advanced Shipping Notice — shipment &amp; driver details
          </p>
        </div>
      </div>

      {refLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[#1E3A8A]" />
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">

          {/* ══════════════════════════════════════════
               LEFT COLUMN — ASN Header Details
          ══════════════════════════════════════════ */}
          <div className="col-span-12 lg:col-span-7 space-y-5">

            {/* Shipment Details Card */}
            <Card className="p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b">
                <Truck className="w-4 h-4 text-[#1E3A8A]" />
                <h2 className="text-sm font-semibold text-gray-800">Shipment Details</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* ASN Number */}
                <div className="col-span-2">
                  <Label className="text-xs font-semibold">ASN Number</Label>
                  <Input
                    id="asn_number"
                    disabled
                    value="Auto-generated upon creation"
                    className="mt-1 h-9 bg-gray-100 text-gray-500 italic cursor-not-allowed"
                  />
                </div>

                {/* Purchase Order */}
                <div className="col-span-2">
                  <Label className="text-xs font-semibold">Purchase Order<Req /></Label>
                  <select
                    id="po"
                    value={form.po}
                    onChange={e => setField("po", e.target.value)}
                    className={`mt-1 flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${touched.po && errors.po ? "border-red-400" : "border-input"}`}
                  >
                    <option value="">— Select Purchase Order —</option>
                    {purchaseOrders.map(po => (
                      <option key={po.po_id ?? po.id} value={po.po_id ?? po.id}>
                        {po.po_id ?? po.id} {po.vendor_name ? `· ${po.vendor_name}` : ""} {po.product_name ? `· ${po.product_name}` : ""}
                      </option>
                    ))}
                  </select>
                  <FieldError msg={touched.po && errors.po} />
                  {selectedPO && (
                    <p className="text-[10px] text-blue-600 mt-1">
                      Qty: {selectedPO.order_quantity ?? "—"} · Total: ₹{(selectedPO.total_amount ?? 0).toLocaleString()}
                    </p>
                  )}
                </div>

                {/* Vendor */}
                <div className="col-span-2">
                  <Label className="text-xs font-semibold">Vendor<Req /></Label>
                  <select
                    id="vendor"
                    value={form.vendor}
                    onChange={e => setField("vendor", e.target.value)}
                    className={`mt-1 flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${touched.vendor && errors.vendor ? "border-red-400" : "border-input"}`}
                  >
                    <option value="">— Select Vendor —</option>
                    {vendors.map(v => (
                      <option key={v.vendor_id ?? v.id} value={v.vendor_id ?? v.id}>
                        {v.vendor_name ?? v.name}
                      </option>
                    ))}
                  </select>
                  <FieldError msg={touched.vendor && errors.vendor} />
                </div>

                {/* Shipment Date */}
                <div>
                  <Label className="text-xs font-semibold">Shipment Date<Req /></Label>
                  <Input
                    id="shipment_date"
                    type="date"
                    value={form.shipment_date}
                    onChange={e => setField("shipment_date", e.target.value)}
                    className={`mt-1 h-9 ${touched.shipment_date && errors.shipment_date ? "border-red-400" : ""}`}
                  />
                  <FieldError msg={touched.shipment_date && errors.shipment_date} />
                </div>

                {/* Expected Arrival */}
                <div>
                  <Label className="text-xs font-semibold">Expected Arrival<Req /></Label>
                  <Input
                    id="expected_arrival_date"
                    type="date"
                    value={form.expected_arrival_date}
                    onChange={e => setField("expected_arrival_date", e.target.value)}
                    className={`mt-1 h-9 ${touched.expected_arrival_date && errors.expected_arrival_date ? "border-red-400" : ""}`}
                  />
                  <FieldError msg={touched.expected_arrival_date && errors.expected_arrival_date} />
                </div>
              </div>
            </Card>

            {/* Driver & Vehicle Card */}
            <Card className="p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b">
                <Truck className="w-4 h-4 text-[#1E3A8A]" />
                <h2 className="text-sm font-semibold text-gray-800">Driver &amp; Vehicle</h2>
                <span className="ml-auto text-[10px] text-muted-foreground">All fields required</span>
              </div>

              <div className="grid grid-cols-2 gap-4">

                {/* Driver Name */}
                <div>
                  <Label className="text-xs font-semibold">Driver Name<Req /></Label>
                  <Input
                    id="driver_name"
                    placeholder="Full name (max 25 chars)"
                    maxLength={25}
                    value={form.driver_name}
                    onChange={e => setField("driver_name", e.target.value)}
                    className={`mt-1 h-9 ${touched.driver_name && errors.driver_name ? "border-red-400" : ""}`}
                  />
                  <div className="flex items-center justify-between">
                    <FieldError msg={touched.driver_name && errors.driver_name} />
                    {form.driver_name && (
                      <span className="text-[10px] text-gray-400 mt-1">{form.driver_name.length}/25</span>
                    )}
                  </div>
                </div>

                {/* Driver Phone */}
                <div>
                  <Label className="text-xs font-semibold">Driver Phone<Req /></Label>
                  <Input
                    id="driver_phone"
                    placeholder="+91 99999 99999 (max 15)"
                    maxLength={15}
                    value={form.driver_phone}
                    onChange={e => setField("driver_phone", e.target.value)}
                    className={`mt-1 h-9 ${touched.driver_phone && errors.driver_phone ? "border-red-400" : ""}`}
                  />
                  <div className="flex items-center justify-between">
                    <FieldError msg={touched.driver_phone && errors.driver_phone} />
                    {form.driver_phone && (
                      <span className="text-[10px] text-gray-400 mt-1">{form.driver_phone.length}/15</span>
                    )}
                  </div>
                </div>

                {/* Vehicle Number */}
                <div className="col-span-2">
                  <Label className="text-xs font-semibold">Vehicle Number<Req /></Label>
                  <Input
                    id="vehicle_num"
                    placeholder="e.g. TN01AB1234 (max 13 chars)"
                    maxLength={13}
                    value={form.vehicle_num}
                    onChange={e => setField("vehicle_num", e.target.value.toUpperCase())}
                    className={`mt-1 h-9 font-mono tracking-widest uppercase ${touched.vehicle_num && errors.vehicle_num ? "border-red-400" : ""}`}
                  />
                  <div className="flex items-center justify-between">
                    <FieldError msg={touched.vehicle_num && errors.vehicle_num} />
                    <span className={`text-[10px] mt-1 ${form.vehicle_num.length === 13 ? "text-emerald-600 font-medium" : "text-gray-400"}`}>
                      {form.vehicle_num.length}/13
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Maximum 13 characters. Standard Indian format: e.g. TN01AB1234
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* ══════════════════════════════════════════
               RIGHT COLUMN — Items + Submit
          ══════════════════════════════════════════ */}
          <div className="col-span-12 lg:col-span-5 space-y-5">

            {/* Items Card */}
            <Card className="p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b">
                <PackagePlus className="w-4 h-4 text-[#1E3A8A]" />
                <h2 className="text-sm font-semibold text-gray-800">Shipment Items</h2>
                <Badge variant="outline" className="ml-auto text-xs">{items.length} item{items.length !== 1 ? "s" : ""}</Badge>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {items.map((item, idx) => (
                  <div key={idx} className="rounded-md border border-gray-200 bg-gray-50/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                        Item {idx + 1}
                      </span>
                      <button
                        onClick={() => removeItem(idx)}
                        disabled={items.length === 1}
                        className="p-1 rounded hover:bg-red-50 disabled:opacity-30 transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>

                    {/* Product */}
                    <div>
                      <Label className="text-[10px] font-semibold text-gray-600">
                        Product<Req />
                      </Label>
                      <select
                        value={item.product}
                        onChange={e => setItemField(idx, "product", e.target.value)}
                        className="mt-0.5 flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm"
                      >
                        <option value="">— Select product —</option>
                        {products.map(p => (
                          <option key={p.product_id ?? p.id} value={p.product_id ?? p.id}>
                            {p.product_name ?? p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Expected Quantity */}
                    <div>
                      <Label className="text-[10px] font-semibold text-gray-600">
                        Expected Qty (base units)<Req />
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="0"
                        value={item.expected_quantity}
                        onChange={e => setItemField(idx, "expected_quantity", e.target.value)}
                        className="mt-0.5 h-8 text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addItem}
                className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-medium text-[#1E3A8A] border border-dashed border-[#1E3A8A]/40 rounded-md py-2 hover:bg-blue-50/40 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>

              <div className="mt-3 rounded-md bg-amber-50 border border-amber-100 px-3 py-2 text-[10px] text-amber-700">
                <p className="font-semibold mb-0.5">Notes:</p>
                <p>• <strong>Shipped Quantity</strong> is initially set equal to Expected Quantity and can be updated when the shipment arrives.</p>
                <p>• Quantities are in <strong>base units</strong> (pieces, kg, etc.).</p>
              </div>
            </Card>

            {/* Submit Card */}
            <Card className="p-5 shadow-sm bg-gray-50/50">
              <div className="space-y-3">
                {/* Validation summary */}
                {Object.values(errors).some(Boolean) && Object.values(touched).some(Boolean) && (
                  <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">
                      Please fix the highlighted fields before submitting.
                    </p>
                  </div>
                )}

                {/* Ready indicator */}
                {!Object.values(errors).some(Boolean) && Object.keys(touched).length > 0 && (
                  <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <p className="text-xs text-emerald-700 font-medium">All fields valid. Ready to submit.</p>
                  </div>
                )}

                <Button
                  id="submit-asn-btn"
                  onClick={handleSubmit}
                  disabled={saving}
                  className="w-full bg-[#1E3A8A] hover:bg-[#162d6e] h-10"
                >
                  {saving
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating ASN…</>
                    : <><Truck className="w-4 h-4 mr-2" />Create ASN</>
                  }
                </Button>

                <Button
                  variant="outline"
                  className="w-full h-9"
                  onClick={() => navigate("/asn")}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
