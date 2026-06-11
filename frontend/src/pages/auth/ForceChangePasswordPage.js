import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Warehouse, Lock, Loader2, AlertCircle } from "lucide-react";
import { forceChangePassword } from "../../services/apiService";

export default function ForceChangePasswordPage() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await forceChangePassword(newPassword, confirmPassword);
      navigate("/auth/select-role");
    } catch (err) {
      setError(err.message || "Could not update password.");
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

        <Card className="shadow-sm border-l-4 border-l-warning">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-5 h-5 text-warning" />
              <CardTitle className="text-lg">Update Password</CardTitle>
            </div>
            <CardDescription>
              First-time login detected. Please set a new secure password to continue.
            </CardDescription>
            {error && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded mt-2">
                <AlertCircle className="w-3.5 h-3.5" />
                {error}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword" size="sm">New Password</Label>
                <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required disabled={isLoading} placeholder="Min. 8 characters" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" size="sm">Confirm Password</Label>
                <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={isLoading} placeholder="Re-type password" />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save & Access System"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}