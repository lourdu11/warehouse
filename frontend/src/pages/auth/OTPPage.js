import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../../components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "../../components/ui/input-otp";
import { Warehouse, ArrowLeft, CheckCircle, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "../../components/lib/auth-context";
import { readOtpContext, clearOtpContext } from "./Otpcontext";

// ── Constants ─────────────────────────────────────────────────────────────────
const OTP_LENGTH        = 6;
const RESEND_COOLDOWN_S = 30; // seconds before resend is allowed again

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseError(err) {
  if (!err) return "An unexpected error occurred.";
  if (err.response?.data?.message) return err.response.data.message;
  if (err.response?.data?.error)   return err.response.data.error;
  if (err.message)                 return err.message;
  return "An unexpected error occurred.";
}

const steps = ["Credentials", "OTP Verification"];

// ── Component ─────────────────────────────────────────────────────────────────
export default function OTPPage() {
  const navigate        = useNavigate();
  const { verifyOTP, resendOTP } = useAuth();
  const isSubmitting    = useRef(false);

  // ── Guard: redirect if no valid context ──────────────────────────────────────
  const [otpContext, setOtpContext] = useState(null);

  useEffect(() => {
    const ctx = readOtpContext();
    if (!ctx) {
      // Missing or corrupted — send user back to login
      navigate("/auth/login", { replace: true });
      return;
    }
    setOtpContext(ctx);
  }, [navigate]);

  // ── State ─────────────────────────────────────────────────────────────────────
  const [otp,         setOtp]         = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error,       setError]       = useState("");
  const [resendTimer, setResendTimer] = useState(0); // 0 = resend allowed

  // ── Resend countdown timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) { clearInterval(id); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [resendTimer]);

  // ── OTP change — clears error immediately ────────────────────────────────────
  const handleOtpChange = useCallback((val) => {
    setOtp(val);
    if (error) setError("");
  }, [error]);

  // ── Verify ────────────────────────────────────────────────────────────────────
  const handleVerify = async (e) => {
    e.preventDefault();
    if (otp.length < OTP_LENGTH || isVerifying || isSubmitting.current) return;

    isSubmitting.current = true;
    setIsVerifying(true);
    setError("");

    try {
      const result = await verifyOTP(otp);

      if (!result?.success) {
        setError(result?.error || "Invalid OTP. Please try again.");
        setOtp(""); // clear input so user can re-enter cleanly
        return;
      }

      // Success — clean up context; AuthContext handles navigation
      clearOtpContext();
    } catch (err) {
      console.error("[OTPPage] verifyOTP failed:", err);
      setError(parseError(err));
      setOtp("");
    } finally {
      setIsVerifying(false);
      isSubmitting.current = false;
    }
  };

  // ── Resend ────────────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendTimer > 0 || isResending || !otpContext) return;

    setIsResending(true);
    setError("");
    setOtp("");

    try {
      await resendOTP?.({ email: otpContext.email, employeeId: otpContext.employeeId });
      setResendTimer(RESEND_COOLDOWN_S);
    } catch (err) {
      console.error("[OTPPage] resendOTP failed:", err);
      setError(parseError(err));
    } finally {
      setIsResending(false);
    }
  };

  // ── Don't render until context is confirmed ───────────────────────────────────
  if (!otpContext) return null;

  // Mask the email for display: name@domain.com → n***@domain.com
  const maskedEmail = otpContext.email.replace(/^(.)(.*)(@.*)$/, (_, a, _b, c) => `${a}***${c}`);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-[400px]">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary mb-4">
            <Warehouse className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">WMS Pro</h1>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                i < 1
                  ? "bg-success text-success-foreground"
                  : "bg-primary text-primary-foreground"
              }`}>
                {i < 1 ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-xs ${i === 1 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {step}
              </span>
              {i < steps.length - 1 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">OTP Verification</CardTitle>
            <CardDescription>
              Enter the 6-digit code sent to{" "}
              <span className="font-medium text-foreground">{maskedEmail}</span>
            </CardDescription>

            {error && (
              <div className="mt-2 p-2 rounded bg-destructive/10 border border-destructive/20" role="alert">
                <p className="text-xs text-destructive font-medium">{error}</p>
              </div>
            )}
          </CardHeader>

          <CardContent>
            <form onSubmit={handleVerify} className="space-y-6">

              {/* OTP Input */}
              <div className="flex justify-center">
                <InputOTP
                  maxLength={OTP_LENGTH}
                  value={otp}
                  onChange={handleOtpChange}
                  disabled={isVerifying}
                >
                  <InputOTPGroup>
                    {[...Array(OTP_LENGTH)].map((_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {/* Verify button */}
              <Button
                type="submit"
                className="w-full"
                disabled={isVerifying || otp.length < OTP_LENGTH}
              >
                {isVerifying
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : "Verify & Continue"
                }
              </Button>
            </form>

            {/* Resend + Back */}
            <div className="mt-4 pt-4 border-t flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate("/auth/login")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3 h-3" /> Back to login
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={resendTimer > 0 || isResending}
                className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline transition-colors"
              >
                {isResending
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <RefreshCw className="w-3 h-3" />
                }
                {resendTimer > 0
                  ? `Resend in ${resendTimer}s`
                  : isResending ? "Sending…" : "Resend OTP"
                }
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}