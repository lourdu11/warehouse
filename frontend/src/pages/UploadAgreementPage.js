import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import {
  ArrowLeft,
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Package,
  MapPin,
  CreditCard,
  StickyNote,
  CalendarDays,
  Users2,
} from "lucide-react";
import { getVendor, uploadVendorAgreement } from "../services/apiService";
import { useToast } from "../components/ui/use-toast";

/* ── tiny helpers ── */
const Field = ({ label, icon: Icon, children }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </Label>
    {children}
  </div>
);

const Section = ({ icon: Icon, title, children }) => (
  <div className="bg-background rounded-lg border shadow-sm p-5 space-y-4">
    <div className="flex items-center gap-2 pb-3 border-b">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
    {children}
  </div>
);

/* Reason code → human label */
const REASON_LABELS = {
  EMAIL_MISMATCH:  "Email Mismatch",
  GSTIN_MISMATCH:  "GSTIN Mismatch",
  MISSING_EMAIL:   "Email Missing in PDF",
  MISSING_GSTIN:   "GSTIN Missing in PDF",
  BOTH_MISMATCH:   "Email & GSTIN Mismatch",
  NO_VENDOR_ID:    "No Vendor Selected",
  INVALID_VENDOR:  "Invalid Vendor",
};

export default function UploadAgreementPage() {
  const { vendorId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileRef = useRef(null);

  const [vendor,      setVendor]      = useState(null);
  const [loadingVdr,  setLoadingVdr]  = useState(true);
  const [file,        setFile]        = useState(null);
  const [isDragging,  setIsDragging]  = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result,      setResult]      = useState(null);   // { ok, data }
  const [validErrs,   setValidErrs]   = useState([]);     // array of mismatch strings

  /* optional metadata fields */
  const [meta, setMeta] = useState({
    valid_from:        "",
    valid_until:       "",
    payment_terms:     "",
    delivery_location: "",
    notes:             "",
  });
  const setMetaField = (key) => (e) =>
    setMeta((prev) => ({ ...prev, [key]: e.target.value }));

  /* load vendor details */
  useEffect(() => {
    (async () => {
      try {
        const v = await getVendor(vendorId);
        setVendor(v);
      } catch {
        toast({ title: "Error", description: "Vendor not found.", variant: "destructive" });
        navigate("/vendors");
      } finally {
        setLoadingVdr(false);
      }
    })();
  }, [vendorId, navigate, toast]);

  /* ── file selection ── */
  const acceptFile = (f) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Invalid file", description: "Only PDF files are allowed.", variant: "destructive" });
      return;
    }
    setFile(f);
    setResult(null);
    setValidErrs([]);
  };

  const onFileChange = (e) => acceptFile(e.target.files[0]);
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    acceptFile(e.dataTransfer.files[0]);
  };

  /* ── submit ── */
  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setResult(null);
    setValidErrs([]);

    const fd = new FormData();
    fd.append("file", file);
    if (meta.valid_from)        fd.append("valid_from",        meta.valid_from);
    if (meta.valid_until)       fd.append("valid_until",       meta.valid_until);
    if (meta.payment_terms)     fd.append("payment_terms",     meta.payment_terms);
    if (meta.delivery_location) fd.append("delivery_location", meta.delivery_location);
    if (meta.notes)             fd.append("notes",             meta.notes);

    try {
      const data = await uploadVendorAgreement(vendorId, fd);
      setResult({ ok: true, data });
      toast({ title: "Agreement Approved ✓", description: `${data.total_items} product(s) processed.` });
    } catch (err) {
      /* parse combined validation errors out of the detail string */
      const detail  = err.message || "";
      const reason  = err.reason  || "VALIDATION_ERROR";
      const msgs    = detail.split(" | ").filter(Boolean);
      setValidErrs(msgs.length > 1 ? msgs : [detail]);
      setResult({ ok: false, reason });
      toast({ title: "Agreement Rejected", description: REASON_LABELS[reason] || reason, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  if (loadingVdr) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-10 bg-background border-b px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost" size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/vendors")}
          >
            <ArrowLeft className="w-4 h-4" /> Back to Vendors
          </Button>
          <div className="h-4 w-px bg-border" />
          <div>
            <h1 className="text-sm font-semibold">Upload Agreement</h1>
            <p className="text-xs text-muted-foreground">
              {vendor?.vendor_name} &bull; {vendor?.email}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleUpload}
          disabled={!file || isUploading}
        >
          {isUploading
            ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Uploading...</>
            : <><Upload className="w-4 h-4 mr-1.5" />Upload & Validate</>
          }
        </Button>
      </header>

      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-5">

          {/* ── Validation result banner ── */}
          {result && (
            <div className={`flex items-start gap-3 rounded-lg border px-5 py-4 shadow-sm ${
              result.ok
                ? "border-green-200 bg-green-50 dark:bg-green-950/20"
                : "border-destructive/30 bg-destructive/5"
            }`}>
              {result.ok
                ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                : <XCircle     className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                {result.ok ? (
                  <>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">Agreement Approved</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Agreement ID: <span className="font-mono font-medium">{result.data.agreement_id}</span>
                      &nbsp;&bull;&nbsp;{result.data.mapped} existing &bull; {result.data.new} new product(s)
                      {result.data.multi_vendor > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-purple-100 text-purple-700 font-semibold">
                          <Users2 className="w-2.5 h-2.5" />
                          {result.data.multi_vendor} multi-vendor product{result.data.multi_vendor !== 1 ? 's' : ''} detected
                        </span>
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Agreement Rejected — {REASON_LABELS[result.reason] || result.reason}
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {validErrs.map((msg, i) => (
                        <li key={i} className="text-xs text-muted-foreground leading-relaxed">
                          • {msg}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      A rejection email has been sent to <span className="font-medium">{vendor?.email}</span>.
                      Correct the PDF and try again.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Zone assignment reminder ── */}
          {result?.ok && result.data.needs_zone_assignment?.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-5 py-4">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Zone Assignment Required</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {result.data.needs_zone_assignment.length} new product(s) need a zone &amp; package type before they can be used in putaway.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {result.data.needs_zone_assignment.map((p) => (
                    <Badge key={p.product_id} variant="outline" className="text-xs font-mono">
                      {p.product_name || p.barcode}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* ── Left: PDF drop zone (2/3) ── */}
            <div className="lg:col-span-2 space-y-5">
              <Section icon={FileText} title="Agreement PDF">
                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed cursor-pointer transition-colors min-h-[160px] select-none ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : file
                      ? "border-green-400 bg-green-50/50 dark:bg-green-950/10"
                      : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
                  }`}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="sr-only"
                    onChange={onFileChange}
                  />
                  {file ? (
                    <div className="flex items-center gap-3 px-4 text-center">
                      <FileText className="w-8 h-8 text-green-600 shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-semibold text-foreground">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB &bull; Click to replace
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 px-4 text-center">
                      <Upload className="w-8 h-8 text-muted-foreground/50" />
                      <p className="text-sm font-medium text-foreground">Drop PDF here or click to browse</p>
                      <p className="text-xs text-muted-foreground">Only .pdf files accepted</p>
                    </div>
                  )}
                </div>

                {/* Validation checklist */}
                <div className="rounded-md bg-muted/50 border px-4 py-3 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Validation Checklist
                  </p>
                  {[
                    { label: "GSTIN in PDF must match",  value: vendor?.gstin  || "—" },
                    { label: "Email in PDF must match",  value: vendor?.email  || "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono font-medium text-foreground">{value}</span>
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── Optional metadata ── */}
              <Section icon={StickyNote} title="Agreement Details (Optional)">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Valid From" icon={CalendarDays}>
                    <Input type="date" value={meta.valid_from} onChange={setMetaField("valid_from")} className="h-9" />
                  </Field>
                  <Field label="Valid Until" icon={CalendarDays}>
                    <Input type="date" value={meta.valid_until} onChange={setMetaField("valid_until")} className="h-9" />
                  </Field>
                  <Field label="Payment Terms" icon={CreditCard}>
                    <Input
                      value={meta.payment_terms}
                      onChange={setMetaField("payment_terms")}
                      placeholder="e.g., Net 30"
                      className="h-9"
                    />
                  </Field>
                  <Field label="Delivery Location" icon={MapPin}>
                    <Input
                      value={meta.delivery_location}
                      onChange={setMetaField("delivery_location")}
                      placeholder="e.g., Delhi Warehouse"
                      className="h-9"
                    />
                  </Field>
                  <div className="col-span-2">
                    <Field label="Notes" icon={StickyNote}>
                      <textarea
                        value={meta.notes}
                        onChange={setMetaField("notes")}
                        placeholder="Any additional notes..."
                        rows={2}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                      />
                    </Field>
                  </div>
                </div>
              </Section>
            </div>

            {/* ── Right: Vendor summary (1/3) ── */}
            <div className="space-y-5">
              <Section icon={Package} title="Vendor Details">
                <div className="space-y-3">
                  {[
                    { label: "Vendor ID",   value: vendor?.vendor_id },
                    { label: "Name",        value: vendor?.vendor_name },
                    { label: "Email",       value: vendor?.email },
                    { label: "GSTIN",       value: vendor?.gstin },
                    { label: "Phone",       value: vendor?.phone },
                    { label: "Lead Time",   value: vendor?.lead_time ? `${vendor.lead_time} days` : null },
                    { label: "Location",    value: [vendor?.city, vendor?.state].filter(Boolean).join(", ") || null },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">{label}</p>
                      <p className={`text-xs font-medium mt-0.5 ${!value ? "text-muted-foreground italic" : "text-foreground font-mono"}`}>
                        {value || "—"}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <Badge variant={vendor?.is_active !== false ? "secondary" : "destructive"} className="text-xs">
                    {vendor?.is_active !== false ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </Section>

              {/* Workflow guide */}
              <div className="rounded-lg border bg-muted/30 px-4 py-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How it works</p>
                {[
                  "Upload the vendor's agreement PDF",
                  "System validates GSTIN & Email against vendor record",
                  "If both match → agreement is approved",
                  "Products in the PDF are created/updated",
                  "Assign zones to any new products",
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-muted border flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Success: processed products table ── */}
          {result?.ok && result.data.total_items > 0 && (
            <Section icon={Package} title={`Processed Products (${result.data.total_items})`}>
              <div className="flex gap-4 text-sm flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                  <span className="text-muted-foreground">{result.data.mapped} existing</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  <span className="text-muted-foreground">{result.data.new} new</span>
                </div>
                {result.data.multi_vendor > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Users2 className="w-3 h-3 text-purple-600" />
                    <span className="text-muted-foreground">{result.data.multi_vendor} multi-vendor</span>
                  </div>
                )}
              </div>
              {result.data.multi_vendor_barcodes?.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-[10px] font-semibold text-purple-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Users2 className="w-2.5 h-2.5" /> Multi-Vendor Products (same product, multiple vendors)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.data.multi_vendor_barcodes.map(bc => (
                      <span key={bc} className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-700">
                        {bc}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          )}

        </div>
      </div>
    </div>
  );
}
