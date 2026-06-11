import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { useToast } from "../components/ui/use-toast";
import {
  ArrowLeft,
  Info,
  Loader2,
  Package,
  DollarSign,
  BarChart3,
  Truck,
  Check,
} from "lucide-react";
import {
  createProduct,
  updateProduct,
  getProduct,
  listCategories,
  createCategory,
  listVendors,
} from "../services/apiService";

/* ── helpers ── */
const toArray = (res, key = null) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (key && Array.isArray(res[key])) return res[key];
  for (const k of ["results", "data", "items"])
    if (Array.isArray(res[k])) return res[k];
  return Object.values(res).find(Array.isArray) || [];
};

/* ── constants ── */
const ABC_OPTIONS = [
  { value: "A", label: "A – High Value", color: "bg-red-100 text-red-700 border-red-200" },
  { value: "B", label: "B – Medium Value", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "C", label: "C – Low Value", color: "bg-green-100 text-green-700 border-green-200" },
];
const VED_OPTIONS = [
  { value: "V", label: "V – Vital", color: "bg-red-100 text-red-700 border-red-200" },
  { value: "E", label: "E – Essential", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "D", label: "D – Desirable", color: "bg-gray-100 text-gray-700 border-gray-200" },
];
const XYZ_OPTIONS = [
  { value: "X", label: "X – High Demand", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "Y", label: "Y – Medium Demand", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { value: "Z", label: "Z – Low Demand", color: "bg-slate-100 text-slate-700 border-slate-200" },
];

const CLASSIFICATION_INFO = {
  ABC: {
    title: "ABC Analysis",
    desc: "Classifies inventory by annual consumption value. A-items are highest value (~70–80% of total value), B-items are moderate (~15–25%), and C-items are lowest value (~5%). Helps prioritise management effort.",
  },
  VED: {
    title: "VED Analysis",
    desc: "Classifies items by criticality to operations. Vital (V) items cause production stoppage if unavailable. Essential (E) items affect efficiency. Desirable (D) items are convenient but not critical.",
  },
  XYZ: {
    title: "XYZ Analysis",
    desc: "Classifies by demand variability. X-items have stable, predictable demand. Y-items have seasonal or moderate variation. Z-items have highly irregular or unpredictable demand.",
  },
};

const EMPTY_FORM = {
  product_name: "",
  brand_name: "",
  size: "",
  description: "",
  category: "",
  quantity: 0,
  unit_price: "",
  re_order: "",
  vendor_id: "",
  ABC: "A",
  VED: "V",
  XYZ: "X",
};

/* ── Segment selector ── */
function SegmentSelector({ options, value, onChange }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all duration-150
            ${value === opt.value
              ? `${opt.color} ring-2 ring-offset-1 ring-current shadow-sm scale-105`
              : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── Classification Field with info icon ── */
function ClassificationField({ label, infoKey, options, value, onChange }) {
  const info = CLASSIFICATION_INFO[infoKey];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs font-semibold text-gray-700">{label}</Label>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-gray-400 hover:text-[#1E3A8A] transition-colors">
                <Info className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs p-3 bg-[#1E293B] text-white border-0 shadow-xl">
              <p className="font-semibold text-sm mb-1">{info.title}</p>
              <p className="text-xs text-gray-300 leading-relaxed">{info.desc}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <SegmentSelector options={options} value={value} onChange={onChange} />
    </div>
  );
}

/* ── Category selector with add ── */
function CategorySelector({ categories, value, onChange, onAdd }) {
  const [open, setOpen] = useState(false);
  const [newCat, setNewCat] = useState("");

  const handleAdd = () => {
    const trimmed = newCat.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    onChange(trimmed);
    setNewCat("");
    setOpen(false);
  };

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v !== "__add__") onChange(v);
      }}
      open={open}
      onOpenChange={setOpen}
    >
      <SelectTrigger className="border-gray-200 h-9 text-sm">
        <SelectValue placeholder="Select category" />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {categories.map((cat) => (
          <SelectItem key={cat} value={cat}>
            {cat}
          </SelectItem>
        ))}
        {/* Divider + Add new */}
        <div className="border-t border-gray-100 my-1" />
        <div className="px-2 py-1.5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            Add New Category
          </p>
          <div className="flex gap-1.5">
            <Input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="e.g., Lubricants"
              className="h-7 text-xs border-gray-200"
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              className="h-7 px-2 bg-[#1E3A8A] hover:bg-[#1E293B] shrink-0"
            >
              <Check className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </SelectContent>
    </Select>
  );
}

/* ── Section wrapper ── */
function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100 bg-gray-50/60">
        <div className="w-7 h-7 rounded-lg bg-[#1E3A8A]/10 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-[#1E3A8A]" />
        </div>
        <span className="text-sm font-semibold text-gray-800">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/* ── Main Page ── */
export default function CreateEditProductPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const { toast } = useToast();
  const isEdit = Boolean(id);

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (key, val) => setFormData((prev) => ({ ...prev, [key]: val }));

  /* load lookups */
  useEffect(() => {
    const load = async () => {
      try {
        const [vRes, cRes] = await Promise.allSettled([listVendors(), listCategories()]);
        setVendors(vRes.status === "fulfilled" ? toArray(vRes.value, "vendors") : []);
        setCategories(cRes.status === "fulfilled" ? toArray(cRes.value).map((cat) => cat.name) : []);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, []);

  const populate = useCallback((product) => {
    setFormData({
      product_name: product.product_name ?? "",
      brand_name:   product.brand_name   ?? "",
      size:         product.size         ?? "",
      description:  product.description  ?? "",
      category:     product.category     ?? "",
      quantity:     product.quantity     ?? 0,
      unit_price:   product.unit_price   ?? "",
      re_order:     product.re_order     ?? "",
      vendor_id:    String(product.vendor?.vendor_id     ?? product.vendor_id     ?? ""),
      ABC: product.ABC || "A",
      VED: product.VED || "V",
      XYZ: product.XYZ || "X",
    });
    // add product's category if not in list
    if (product.category) {
      setCategories((prev) =>
        prev.includes(product.category) ? prev : [...prev, product.category]
      );
    }
  }, []);

  /* if editing, pre-fill */
  useEffect(() => {
    if (!isEdit) return;
    const prefill = location.state?.product;
    if (prefill) {
      populate(prefill);
      setIsLoading(false);
    } else {
      getProduct(id)
        .then((p) => { populate(p); setIsLoading(false); })
        .catch((e) => {
          toast({ title: "Error", description: e.message, variant: "destructive" });
          navigate("/products");
        });
    }
  }, [id, isEdit, location.state?.product, navigate, toast, populate]);

  const handleAddCategory = async (cat) => {
    const normalized = cat.trim().toLowerCase();
    if (!normalized) return;
    try {
      await createCategory({ name: normalized });
    } catch (error) {
      console.error("Failed to persist category:", error);
    } finally {
      setCategories((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        unit_price: parseInt(formData.unit_price),
        re_order:   parseInt(formData.re_order),
        quantity:   parseInt(formData.quantity) || 0,
      };
      if (isEdit) {
        await updateProduct(id, payload);
        toast({ title: "Success", description: "Product updated successfully." });
      } else {
        await createProduct(payload);
        toast({ title: "Success", description: "Product created successfully." });
      }
      navigate("/products");
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#1E3A8A]" />
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-5 pb-8">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/products")}
            className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-0.5">
              <span
                className="hover:text-[#1E3A8A] cursor-pointer transition-colors"
                onClick={() => navigate("/products")}
              >
                Products
              </span>
              <span>/</span>
              <span className="text-gray-600 font-medium">
                {isEdit ? "Edit Product" : "New Product"}
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              {isEdit ? "Edit Product" : "Add New Product"}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/products")}
            className="h-9 border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="product-form"
            disabled={isSubmitting}
            className="h-9 bg-[#1E3A8A] hover:bg-[#1E293B] text-white px-5"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Product"}
          </Button>
        </div>
      </div>

      {/* ── Form ── */}
      <form id="product-form" onSubmit={handleSubmit}>

        {/* Row 1: Basic Info + Pricing */}
        <div className="grid grid-cols-5 gap-5 mb-5">

          {/* Basic Info – 3 cols */}
          <div className="col-span-3">
            <Section icon={Package} title="Product Information">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">
                    Product Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={formData.product_name}
                    onChange={(e) => set("product_name", e.target.value)}
                    placeholder="e.g., Industrial Bearing"
                    className="border-gray-200 h-9 text-sm"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">
                    Brand <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={formData.brand_name}
                    onChange={(e) => set("brand_name", e.target.value)}
                    placeholder="e.g., SKF, Bosch"
                    className="border-gray-200 h-9 text-sm"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">Size / Variant</Label>
                  <Input
                    value={formData.size}
                    onChange={(e) => set("size", e.target.value)}
                    placeholder="e.g., M, L, 10mm"
                    className="border-gray-200 h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">
                    Category <span className="text-red-500">*</span>
                  </Label>
                  <CategorySelector
                    categories={categories}
                    value={formData.category}
                    onChange={(v) => set("category", v)}
                    onAdd={handleAddCategory}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Describe the product, its use case, specifications..."
                    rows={3}
                    className="border-gray-200 text-sm resize-none"
                  />
                </div>
              </div>
            </Section>
          </div>

          {/* Pricing & Inventory – 2 cols */}
          <div className="col-span-2 space-y-5">
            <Section icon={DollarSign} title="Pricing & Stock">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">
                    Unit Price (₹) <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₹</span>
                    <Input
                      type="number"
                      min="0"
                      value={formData.unit_price}
                      onChange={(e) => set("unit_price", e.target.value)}
                      placeholder="0"
                      className="border-gray-200 h-9 text-sm pl-7"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">Initial Quantity</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.quantity}
                    onChange={(e) => set("quantity", parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="border-gray-200 h-9 text-sm"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-semibold text-gray-700">
                      Reorder Level <span className="text-red-500">*</span>
                    </Label>
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-gray-400 hover:text-[#1E3A8A] transition-colors">
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs p-3 bg-[#1E293B] text-white border-0 shadow-xl">
                          <p className="text-xs text-gray-300 leading-relaxed">
                            Minimum stock level that triggers a reorder alert. When current stock falls at or below this number, the product will be flagged as "Low Stock".
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    value={formData.re_order}
                    onChange={(e) => set("re_order", e.target.value)}
                    placeholder="e.g., 50"
                    className="border-gray-200 h-9 text-sm"
                    required
                  />
                </div>
              </div>
            </Section>
          </div>
        </div>

        {/* Row 2: Supplier/Vendor + Classifications */}
        <div className="grid grid-cols-5 gap-5">

          {/* Supplier & Vendor – 2 cols */}
          <div className="col-span-2">
            <Section icon={Truck} title="Supply Chain">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">Vendor</Label>
                  <Select
                    value={formData.vendor_id}
                    onValueChange={(v) => set("vendor_id", v)}
                  >
                    <SelectTrigger className="border-gray-200 h-9 text-sm">
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((v) => (
                        <SelectItem key={v.vendor_id} value={String(v.vendor_id)}>
                          {v.vendor_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Section>
          </div>

          {/* Classifications – 3 cols */}
          <div className="col-span-3">
            <Section icon={BarChart3} title="Inventory Classification">
              <div className="grid grid-cols-3 gap-6">
                <ClassificationField
                  label="ABC Classification"
                  infoKey="ABC"
                  options={ABC_OPTIONS}
                  value={formData.ABC}
                  onChange={(v) => set("ABC", v)}
                />
                <ClassificationField
                  label="VED Classification"
                  infoKey="VED"
                  options={VED_OPTIONS}
                  value={formData.VED}
                  onChange={(v) => set("VED", v)}
                />
                <ClassificationField
                  label="XYZ Classification"
                  infoKey="XYZ"
                  options={XYZ_OPTIONS}
                  value={formData.XYZ}
                  onChange={(v) => set("XYZ", v)}
                />
              </div>

              {/* Classification Summary Badge Row */}
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2">
                <span className="text-xs text-gray-400 font-medium">Selected classification:</span>
                {[
                  { key: "ABC", opts: ABC_OPTIONS, val: formData.ABC },
                  { key: "VED", opts: VED_OPTIONS, val: formData.VED },
                  { key: "XYZ", opts: XYZ_OPTIONS, val: formData.XYZ },
                ].map(({ key, opts, val }) => {
                  const opt = opts.find((o) => o.value === val);
                  return (
                    <span
                      key={key}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${opt?.color}`}
                    >
                      {val}
                    </span>
                  );
                })}
                <span className="text-xs text-gray-400 ml-1">
                  ({formData.ABC}-{formData.VED}-{formData.XYZ} product profile)
                </span>
              </div>
            </Section>
          </div>
        </div>

      </form>
    </div>
  );
}
