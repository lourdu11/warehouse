import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../../components/ui/input-otp";
import { Warehouse, ArrowLeft, Loader2 } from "lucide-react";
import { forgotPasswordOTP, resetPassword } from "../../services/apiService";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState("email"); // email | otp | reset
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      await forgotPasswordOTP(email);
      setStep("otp");
    } catch (err) {
      setError(err.message || "Failed to send OTP.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      await resetPassword(email, otp, newPassword);
      navigate("/auth/login");
    } catch (err) {
      setError(err.message || "Reset failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-[400px] animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary mb-4">
            <Warehouse className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">WMS Pro</h1>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">
              {step === "email" ? "Forgot Password" : step === "otp" ? "Verify OTP" : "Set New Password"}
            </CardTitle>
            <CardDescription>
              {step === "email" && "Enter your email to receive a reset code."}
              {step === "otp" && "Enter the 6-digit code sent to your email."}
              {step === "reset" && "Choose a strong password for your account."}
            </CardDescription>
            {error && <p className="text-xs text-destructive bg-destructive/10 p-2 rounded mt-2">{error}</p>}
          </CardHeader>
          <CardContent>
            {step === "email" && (
              <form onSubmit={handleSendOTP} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-medium">Email Address</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@company.com" disabled={isLoading} />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Reset Code"}
                </Button>
              </form>
            )}

            {step === "otp" && (
              <form onSubmit={(e) => { e.preventDefault(); setStep("reset"); }} className="space-y-6">
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={isLoading}>
                    <InputOTPGroup>
                      {[...Array(6)].map((_, i) => <InputOTPSlot key={i} index={i} />)}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button type="submit" className="w-full" disabled={otp.length < 6}>Continue</Button>
              </form>
            )}

            {step === "reset" && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">New Password</Label>
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required disabled={isLoading} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Confirm Password</Label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={isLoading} />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reset Password"}
                </Button>
              </form>
            )}

            <div className="mt-4 pt-4 border-t">
              <button onClick={() => navigate("/auth/login")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-3 h-3" /> Back to login
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}