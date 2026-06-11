import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  ArrowLeft,
  Building2,
  User,
  Mail,
  Phone,
  Clock,
  MapPin,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Warehouse,
} from "lucide-react";
import { createVendor, getVendor, updateVendor } from "../services/apiService";
import { useToast } from "../components/ui/use-toast";

const LOCATION_DATA = {
  "United States": {
    "California": ["Los Angeles", "San Francisco", "San Jose", "San Diego", "Sacramento"],
    "New York": ["New York City", "Buffalo", "Rochester", "Albany", "Syracuse"],
    "Texas": ["Houston", "Austin", "Dallas", "San Antonio", "Fort Worth"],
    "Washington": ["Seattle", "Tacoma", "Bellevue", "Spokane", "Olympia"],
    "Florida": ["Miami", "Orlando", "Tampa", "Jacksonville", "Tallahassee"],
  },
  "India": {
    "Karnataka": ["Bangalore", "Mysore", "Hubli", "Mangalore", "Belgaum"],
    "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Thane", "Nashik"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Trichy", "Salem"],
    "Delhi": ["New Delhi", "Noida", "Gurugram", "Dwarka", "Saket"],
    "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam"],
  },
  "United Kingdom": {
    "England": ["London", "Manchester", "Birmingham", "Leeds", "Liverpool"],
    "Scotland": ["Edinburgh", "Glasgow", "Aberdeen", "Dundee", "Inverness"],
    "Wales": ["Cardiff", "Swansea", "Newport", "St Davids", "Bangor"],
  },
  "Canada": {
    "Ontario": ["Toronto", "Ottawa", "Mississauga", "Hamilton", "London"],
    "Quebec": ["Montreal", "Quebec City", "Laval", "Gatineau", "Sherbrooke"],
    "British Columbia": ["Vancouver", "Victoria", "Surrey", "Burnaby", "Richmond"],
  },
  "Australia": {
    "New South Wales": ["Sydney", "Newcastle", "Wollongong", "Maitland"],
    "Victoria": ["Melbourne", "Geelong", "Ballarat", "Bendigo"],
    "Queensland": ["Brisbane", "Gold Coast", "Sunshine Coast", "Townsville"],
  },
  "Germany": {
    "Bavaria": ["Munich", "Nuremberg", "Augsburg", "Regensburg"],
    "Berlin": ["Berlin"],
    "Hamburg": ["Hamburg"],
  }
};

const EMPTY_FORM = {
  vendor_name: "",
  contact_person: "",
  email: "",
  phone: "",
  gstin: "",
  lead_time: "",
  address: "",
  city: "",
  state: "",
  country: "",
};

const Field = ({ label, icon: Icon, required, children }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
      {Icon && <Icon className="w-3 h-3" />}
      {label}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
    {children}
  </div>
);

/* ── Section wrapper — must be at module level so React never remounts inputs ── */
const Section = ({ icon: Icon, title, children }) => (
  <div className="bg-background rounded-lg border shadow-sm p-5 space-y-4">
    <div className="flex items-center gap-2 pb-3 border-b">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
    {children}
  </div>
);

export default function VendorFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();           // present on /vendors/edit/:id, absent on /vendors/create
  const isEditMode = Boolean(id);

  const { toast } = useToast();
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isLoadingVendor, setIsLoadingVendor] = useState(isEditMode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [warehouseError, setWarehouseError] = useState(false);

  const [isCustomCountry, setIsCustomCountry] = useState(false);
  const [isCustomState, setIsCustomState] = useState(false);
  const [isCustomCity, setIsCustomCity] = useState(false);

  /* ── Load existing vendor when editing ── */
  useEffect(() => {
    if (!isEditMode) return;
    (async () => {
      try {
        const vendor = await getVendor(id);
        const country = vendor.country ?? "";
        const state   = vendor.state   ?? "";
        const city    = vendor.city    ?? "";
        setIsCustomCountry(country && !LOCATION_DATA[country]);
        setIsCustomState(state && !(LOCATION_DATA[country] && LOCATION_DATA[country][state]));
        setIsCustomCity(city && !(LOCATION_DATA[country]?.[state]?.includes(city)));
        setFormData({
          vendor_name:    vendor.vendor_name    ?? "",
          contact_person: vendor.contact_person ?? "",
          email:          vendor.email          ?? "",
          phone:          vendor.phone          ?? "",
          gstin:          vendor.gstin          ?? "",
          lead_time:      vendor.lead_time      ?? "",
          address:        vendor.address        ?? "",
          city,
          state,
          country,
        });
      } catch {
        toast({ title: "Error", description: "Failed to load vendor details.", variant: "destructive" });
        navigate("/vendors");
      } finally {
        setIsLoadingVendor(false);
      }
    })();
  }, [id, isEditMode, navigate, toast]);

  const setField = (field) => (e) =>
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));

  const handleCountryChange = (val) => {
    if (val === "other") {
      setIsCustomCountry(true);
      setFormData((prev) => ({ ...prev, country: "", state: "", city: "" }));
      setIsCustomState(true);
      setIsCustomCity(true);
    } else {
      setIsCustomCountry(false);
      setFormData((prev) => ({ ...prev, country: val, state: "", city: "" }));
      setIsCustomState(false);
      setIsCustomCity(false);
    }
  };

  const handleStateChange = (val) => {
    if (val === "other") {
      setIsCustomState(true);
      setFormData((prev) => ({ ...prev, state: "", city: "" }));
      setIsCustomCity(true);
    } else {
      setIsCustomState(false);
      setFormData((prev) => ({ ...prev, state: val, city: "" }));
      setIsCustomCity(false);
    }
  };

  const handleCityChange = (val) => {
    if (val === "other") {
      setIsCustomCity(true);
      setFormData((prev) => ({ ...prev, city: "" }));
    } else {
      setIsCustomCity(false);
      setFormData((prev) => ({ ...prev, city: val }));
    }
  };

  const isFormValid =
    formData.vendor_name.trim() &&
    formData.email.trim() &&
    formData.gstin.trim() &&
    formData.phone.trim() &&
    formData.lead_time !== "";

  const completedFields = Object.values(formData).filter((v) => String(v).trim() !== "").length;
  const totalFields = Object.keys(formData).length;
  const progress = Math.round((completedFields / totalFields) * 100);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!isFormValid) return;
    setIsSubmitting(true);
    setWarehouseError(false);
    try {
      if (isEditMode) {
        await updateVendor(id, formData);
        toast({ title: "Success", description: `${formData.vendor_name} has been updated.` });
      } else {
        await createVendor(formData);
        toast({ title: "Success", description: `${formData.vendor_name} has been created.` });
      }
      navigate("/vendors");
    } catch (error) {
      const msg = error.message || "";
      if (msg.toLowerCase().includes("warehouse")) {
        setWarehouseError(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        toast({
          title: "Error",
          description: msg || `Failed to ${isEditMode ? "update" : "create"} vendor.`,
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };


  if (isLoadingVendor) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">

      {/* ── Sticky Top Bar ── */}
      <header className="sticky top-0 z-10 bg-background border-b px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/vendors")}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Vendors
          </Button>
          <div className="h-4 w-px bg-border" />
          <div>
            <h1 className="text-sm font-semibold">
              {isEditMode ? "Edit Vendor" : "Create New Vendor"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isEditMode
                ? "Update the vendor's information below"
                : "Fill in all required fields to register a vendor"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-28 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{completedFields}/{totalFields} fields</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/vendors")}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!isFormValid || isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving...</>
            ) : (
              <><CheckCircle2 className="w-4 h-4 mr-1.5" />{isEditMode ? "Save Changes" : "Create Vendor"}</>
            )}
          </Button>
        </div>
      </header>

      {/* ── Body ── */}
      <form onSubmit={handleSubmit} className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-5">

          {/* Warehouse Error Banner */}
          {warehouseError && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-5 py-4 shadow-sm">
              <Warehouse className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Warehouse Required
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  You must create a <span className="font-semibold">Warehouse</span> before registering a vendor.
                  Go to <span className="font-semibold">Settings</span> to set up a warehouse first.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/settings")}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground underline underline-offset-2 hover:text-muted-foreground transition-colors"
                >
                  Go to Settings →
                </button>
              </div>
              <button
                type="button"
                onClick={() => setWarehouseError(false)}
                className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none mt-0.5"
              >
                ×
              </button>
            </div>
          )}

          {/* ── Row 1: Vendor Info (2/3) + Procurement (1/3) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Vendor Info */}
            <div className="lg:col-span-2">
              <Section icon={Building2} title="Vendor Information">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Vendor Name" icon={Building2} required>
                    <Input
                      value={formData.vendor_name}
                      onChange={setField("vendor_name")}
                      placeholder="Company name"
                      className="h-9"
                      required
                    />
                  </Field>
                  <Field label="Contact Person" icon={User}>
                    <Input
                      value={formData.contact_person}
                      onChange={setField("contact_person")}
                      placeholder="Full name"
                      className="h-9"
                    />
                  </Field>
                  <Field label="Email Address" icon={Mail} required>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={setField("email")}
                      placeholder="Official email address"
                      className="h-9"
                      required
                    />
                  </Field>
                  <Field label="Phone Number" icon={Phone} required>
                    <Input
                      value={formData.phone}
                      onChange={setField("phone")}
                      placeholder="Phone number"
                      className="h-9"
                      required
                    />
                  </Field>
                  <Field label="GSTIN" icon={Building2} required>
                    <Input
                      value={formData.gstin}
                      onChange={setField("gstin")}
                      placeholder="e.g., 22AAAAA0000A1Z5"
                      className="h-9 font-mono uppercase"
                      required
                    />
                  </Field>
                </div>
              </Section>
            </div>

            {/* Procurement */}
            <Section icon={Clock} title="Procurement">
              <Field label="Lead Time (days)" icon={Clock} required>
                <Input
                  type="number"
                  min="0"
                  value={formData.lead_time}
                  onChange={setField("lead_time")}
                  placeholder="Lead time (days)"
                  className="h-9"
                  required
                />
              </Field>

              {formData.lead_time && (
                <div className="rounded-md bg-muted/60 border px-3 py-2 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Orders arrive in{" "}
                    <span className="font-semibold text-foreground">
                      {formData.lead_time} day{formData.lead_time !== "1" ? "s" : ""}
                    </span>{" "}
                    after placement
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">Default Status</span>
                <Badge variant="secondary" className="text-xs">Active</Badge>
              </div>
            </Section>
          </div>

          {/* ── Row 2: Address & Location ── */}
          <Section icon={MapPin} title="Address & Location">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-3">
                <Field label="Street Address" icon={MapPin}>
                  <textarea
                    value={formData.address}
                    onChange={setField("address")}
                    placeholder="Enter full street address..."
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  />
                </Field>
              </div>
              {/* ── Country ── */}
              <Field label="Country">
                {!isCustomCountry ? (
                  <Select value={formData.country} onValueChange={handleCountryChange}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(LOCATION_DATA).map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                      <SelectItem value="other">Other (type manually)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex gap-1.5">
                    <Input
                      value={formData.country}
                      onChange={setField("country")}
                      placeholder="Enter country"
                      className="h-9 flex-1"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => { setIsCustomCountry(false); setFormData(p => ({ ...p, country: "", state: "", city: "" })); setIsCustomState(false); setIsCustomCity(false); }}
                      className="text-xs text-muted-foreground underline whitespace-nowrap hover:text-foreground"
                    >
                      ← List
                    </button>
                  </div>
                )}
              </Field>

              {/* ── State ── */}
              <Field label="State">
                {!isCustomState ? (
                  <Select
                    value={formData.state}
                    onValueChange={handleStateChange}
                    disabled={!formData.country || isCustomCountry}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={formData.country ? "Select state" : "Select country first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(LOCATION_DATA[formData.country] ? Object.keys(LOCATION_DATA[formData.country]) : []).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                      <SelectItem value="other">Other (type manually)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex gap-1.5">
                    <Input
                      value={formData.state}
                      onChange={setField("state")}
                      placeholder="Enter state / province"
                      className="h-9 flex-1"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => { setIsCustomState(false); setFormData(p => ({ ...p, state: "", city: "" })); setIsCustomCity(false); }}
                      className="text-xs text-muted-foreground underline whitespace-nowrap hover:text-foreground"
                    >
                      ← List
                    </button>
                  </div>
                )}
              </Field>

              {/* ── City ── */}
              <Field label="City">
                {!isCustomCity ? (
                  <Select
                    value={formData.city}
                    onValueChange={handleCityChange}
                    disabled={!formData.state || isCustomState}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={formData.state ? "Select city" : "Select state first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(LOCATION_DATA[formData.country]?.[formData.state] ?? []).map((city) => (
                        <SelectItem key={city} value={city}>{city}</SelectItem>
                      ))}
                      <SelectItem value="other">Other (type manually)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex gap-1.5">
                    <Input
                      value={formData.city}
                      onChange={setField("city")}
                      placeholder="Enter city"
                      className="h-9 flex-1"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => { setIsCustomCity(false); setFormData(p => ({ ...p, city: "" })); }}
                      className="text-xs text-muted-foreground underline whitespace-nowrap hover:text-foreground"
                    >
                      ← List
                    </button>
                  </div>
                )}
              </Field>
            </div>
          </Section>

          {/* ── Row 3: Summary Preview ── */}
          <Section icon={CheckCircle2} title="Summary Preview">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Vendor Name",    value: formData.vendor_name },
                { label: "Contact",        value: formData.contact_person },
                { label: "Email",          value: formData.email },
                { label: "GSTIN",          value: formData.gstin },
                { label: "Lead Time",      value: formData.lead_time ? `${formData.lead_time} days` : "" },
                { label: "Location",       value: [formData.city, formData.state, formData.country].filter(Boolean).join(", ") },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-md bg-muted/50 border px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">{label}</p>
                  <p className={`text-xs font-medium truncate ${!value ? "text-muted-foreground italic" : "text-foreground"}`}>
                    {value || "—"}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Bottom Actions ── */}
          <div className="flex justify-end gap-3 pb-4">
            <Button type="button" variant="outline" onClick={() => navigate("/vendors")}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid || isSubmitting} className="min-w-[140px]">
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 mr-1.5" />{isEditMode ? "Save Changes" : "Create Vendor"}</>
              )}
            </Button>
          </div>

        </div>
      </form>
    </div>
  );
}