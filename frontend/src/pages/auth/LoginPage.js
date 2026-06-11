import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Warehouse, ArrowRight, Loader2,
  Package, Truck, ClipboardCheck, TrendingUp,
  Mail, User, Key, Eye, EyeOff,
} from "lucide-react";
import { login } from "../../services/apiService";
import { saveOtpContext } from "./Otpcontext";

// ── Constants ─────────────────────────────────────────────────────────────────
//
// ⚠️  SYNC THESE WITH YOUR BACKEND.
//     If your backend allows EMP01, change {3,} → {2,}.
//     If you support other prefixes, extend the alternation: (EMP|STAFF|WH)\d{2,}
//
const EMPLOYEE_ID_REGEX = /^EMP\d{3,}$/i;   // e.g. EMP001, EMP1234
const ADMIN_ID_REGEX    = /^ADM\d{4,}$/i;   // e.g. ADM0001, ADM12345
const EMAIL_REGEX       = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password policy — mirrors backend rules
const PASSWORD_MIN_LENGTH  = 8;
const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/; // lower + upper + digit

const FEATURES = [
  { icon: Package,        title: "Inventory Management", desc: "Real-time stock tracking"     },
  { icon: Truck,          title: "Supply Chain",          desc: "Vendor management" },
  { icon: ClipboardCheck, title: "Quality Control",       desc: "QC workflow & approvals"      },
  { icon: TrendingUp,     title: "Analytics",             desc: "Reports & insights"           },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function detectRole(id = "") {
  const t = id.trim();
  return {
    isAdmin:    ADMIN_ID_REGEX.test(t),
    isEmployee: EMPLOYEE_ID_REGEX.test(t),
  };
}

function parseApiError(err) {
  if (!err) return "An unexpected error occurred.";
  if (err.response?.data?.message) return err.response.data.message;
  if (err.response?.data?.error)   return err.response.data.error;
  if (err.message)                 return err.message;
  return "An unexpected error occurred.";
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const navigate = useNavigate();

  const [employeeId,   setEmployeeId]   = useState("");
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading,    setIsLoading]    = useState(false); // single submission guard
  const [fieldErrors,  setFieldErrors]  = useState({});
  const [apiError,     setApiError]     = useState("");

  // ── Validation ───────────────────────────────────────────────────────────────
  const validate = useCallback(() => {
    const errs = {};
    const id   = (employeeId ?? "").trim();

    if (!id) {
      errs.employeeId = "ID is required.";
    } else {
      const { isAdmin, isEmployee } = detectRole(id);
      if (!isAdmin && !isEmployee) {
        errs.employeeId = "Enter a valid Employee ID (e.g. EMP001) or Admin ID (e.g. ADM0001).";
      }
    }

    if (!email.trim()) {
      errs.email = "Email is required.";
    } else if (!EMAIL_REGEX.test(email.trim())) {
      errs.email = "Enter a valid email address.";
    }

    if (!password) {
      errs.password = "Password is required.";
    } else if (password.length < PASSWORD_MIN_LENGTH) {
      errs.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    } else if (!PASSWORD_POLICY_REGEX.test(password)) {
      errs.password = "Password must include uppercase, lowercase, and a number.";
    }

    return errs;
  }, [employeeId, email, password]);

  // ── Clears both field error + api error when user starts editing ─────────────
  const handleChange = (field, setter) => (e) => {
    setter(e.target.value);
    // Clear the specific field error
    if (fieldErrors[field]) {
      setFieldErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
    }
    // Clear stale API error so it doesn't linger after correction
    if (apiError) setApiError("");
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    // isLoading acts as the single submission guard — no need for a separate ref
    if (isLoading) return;

    setApiError("");
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setIsLoading(true);

    try {
      const id = employeeId.trim();
      const { isAdmin } = detectRole(id);

      // employee_id → arg1, email → arg2, password → arg3, admin_id → arg4
      // Pass undefined instead of null so unused fields are omitted by the service
      await login(
        isAdmin ? undefined : id,   // employee_id
        email.trim(),               // email
        password,                   // password
        isAdmin ? id : undefined    // admin_id
      );

      // Persist context safely — OTP page uses readOtpContext() and handles null
      saveOtpContext({ isAdmin, employeeId: id, email: email.trim() });
      navigate("/auth/otp");
    } catch (err) {
      console.error("[LoginPage] login failed:", err);
      setApiError(parseApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="w-full max-w-6xl flex flex-col lg:flex-row rounded-2xl overflow-hidden shadow-2xl">

        {/* ── Left – Branding ───────────────────────────────────────────────── */}
        <div className="lg:w-1/2 bg-primary relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/90 to-primary/70" />
          <div
            className="absolute inset-0 bg-cover bg-center opacity-20"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3')" }}
          />
          <div className="relative z-10 flex flex-col justify-center min-h-[550px] p-8 lg:p-12 text-primary-foreground">
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Warehouse className="w-6 h-6" />
                </div>
                <span className="text-xl font-bold">WMS Pro</span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold mb-4">Welcome Back</h1>
              <p className="text-base lg:text-lg opacity-90 mb-8">Enterprise Warehouse Management System</p>
            </div>
            <div className="space-y-4">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{title}</p>
                    <p className="text-xs opacity-80">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 pt-6 border-t border-white/20">
              <p className="text-xs opacity-70">© {new Date().getFullYear()} WMS Pro. All rights reserved.</p>
            </div>
          </div>
        </div>

        {/* ── Right – Form ──────────────────────────────────────────────────── */}
        <div className="lg:w-1/2 bg-background flex items-center justify-center p-8 lg:p-12">
          <div className="w-full max-w-md">

            {/* Mobile logo */}
            <div className="text-center mb-6 lg:hidden">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary mb-3">
                <Warehouse className="w-6 h-6 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold">WMS Pro</h1>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-bold">Sign In</h2>
              <p className="text-sm text-muted-foreground mt-1">Enter your credentials to access your account</p>
            </div>

            {apiError && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20" role="alert">
                <p className="text-xs text-destructive font-medium">{apiError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-5">

              {/* ID Field */}
              <div className="space-y-1.5">
                <Label htmlFor="employeeId" className="text-sm font-medium">Employee / Admin ID</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="employeeId"
                    placeholder="EMP001 or ADM0001"
                    className={`pl-10 h-11 ${fieldErrors.employeeId ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    value={employeeId}
                    onChange={handleChange("employeeId", setEmployeeId)}
                    disabled={isLoading}
                    autoComplete="username"
                    aria-describedby={fieldErrors.employeeId ? "employeeId-error" : undefined}
                  />
                </div>
                {fieldErrors.employeeId && (
                  <p id="employeeId-error" className="text-xs text-destructive">{fieldErrors.employeeId}</p>
                )}
              </div>

              {/* Email Field */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    className={`pl-10 h-11 ${fieldErrors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    value={email}
                    onChange={handleChange("email", setEmail)}
                    disabled={isLoading}
                    autoComplete="email"
                    aria-describedby={fieldErrors.email ? "email-error" : undefined}
                  />
                </div>
                {fieldErrors.email && (
                  <p id="email-error" className="text-xs text-destructive">{fieldErrors.email}</p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <button
                    type="button"
                    onClick={() => navigate("/auth/forgot-password")}
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className={`pl-10 pr-10 h-11 ${fieldErrors.password ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    value={password}
                    onChange={handleChange("password", setPassword)}
                    disabled={isLoading}
                    autoComplete="current-password"
                    aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p id="password-error" className="text-xs text-destructive">{fieldErrors.password}</p>
                )}
              </div>

              <Button type="submit" className="w-full h-11 gap-2" disabled={isLoading}>
                {isLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <> Sign In <ArrowRight className="w-4 h-4" /> </>
                }
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-xs text-muted-foreground">Secure login with OTP verification</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}