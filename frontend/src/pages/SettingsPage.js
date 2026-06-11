import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Loader2, Check } from "lucide-react";
import { useToast } from "../components/ui/use-toast";
import { getWarehouse, updateWarehouse, createWarehouse } from "../services/apiService";

export default function SettingsPage() {
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNew, setIsNew] = useState(false);

  // ✅ Professional notification state
  const [successMessage, setSuccessMessage] = useState("");

  const [warehouse, setWarehouse] = useState({
    warehouse_name: "",
    warehouse_email: "",
    warehouse_phone: "",
    address: "",
  });

  const [notifications, setNotifications] = useState({
    lowStock: true,
    asnArrival: true,
    prApproval: true,
  });

  /* ─── Load Warehouse ───────────────────────── */
  const loadWarehouse = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getWarehouse();
      if (data) {
        setWarehouse({
          warehouse_name:  data?.warehouse_name  ?? "",
          warehouse_email: data?.warehouse_email ?? "",
          warehouse_phone: data?.warehouse_phone ?? "",
          address:         data?.address         ?? "",
        });
        setIsNew(false);
      } else {
        setIsNew(true);
      }
    } catch (error) {
      // 404 = no warehouse exists yet (expected after fresh install / DB flush).
      // Silently fall into create mode without showing an error toast.
      const isNotFound =
        error.message?.toLowerCase().includes("not created") ||
        error.message?.toLowerCase().includes("not found") ||
        error.message?.includes("404");

      if (isNotFound) {
        setIsNew(true);
      } else {
        console.error("Failed to load warehouse:", error);
        toast({
          title: "Error",
          description: "Failed to load warehouse settings.",
          variant: "destructive",
        });
        setIsNew(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadWarehouse();
  }, [loadWarehouse]);


  /* ─── Auto hide notification ───────────────── */
  useEffect(() => {
    if (!successMessage) return;

    const timer = setTimeout(() => {
      setSuccessMessage("");
    }, 3000);

    return () => clearTimeout(timer);
  }, [successMessage]);

  /* ─── Submit Handler ───────────────────────── */
  const handleWarehouseUpdate = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (isNew) {
        await createWarehouse(warehouse);
        setIsNew(false);

        setSuccessMessage("Warehouse created successfully");
        toast({
          title: "Success",
          description: "Warehouse created successfully.",
        });
      } else {
        await updateWarehouse(warehouse);

        setSuccessMessage("Warehouse updated successfully");
        toast({
          title: "Success",
          description: "Warehouse settings updated.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ─── Notification Toggle ───────────────────── */
  const handleNotificationChange = (key) => {
    setNotifications((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));

    toast({
      title: "Saved",
      description: `${key} notification updated.`,
    });
  };

  /* ─── Loading UI ───────────────────────────── */
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">

      {/* ✅ Professional Notification Banner */}
      {successMessage && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-slate-700 text-xs shadow-sm transition-all duration-300">
          
          {/* Icon */}
          <div className="w-5 h-5 flex items-center justify-center rounded bg-slate-200">
            <Check className="w-3 h-3 text-slate-600" />
          </div>

          {/* Message */}
          <span className="font-medium tracking-tight">
            {successMessage}
          </span>

        </div>
      )}

      {/* ─── Warehouse Form ───────────────────── */}
      <form onSubmit={handleWarehouseUpdate}>
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {isNew ? "Create Warehouse" : "Warehouse Settings"}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">

            <div className="space-y-2">
              <Label className="text-xs font-medium">Warehouse Name</Label>
              <Input
                value={warehouse.warehouse_name}
                onChange={(e) =>
                  setWarehouse({ ...warehouse, warehouse_name: e.target.value })
                }
                className="h-9"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Warehouse Email</Label>
              <Input
                type="email"
                value={warehouse.warehouse_email}
                onChange={(e) =>
                  setWarehouse({ ...warehouse, warehouse_email: e.target.value })
                }
                className="h-9"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Warehouse Phone</Label>
              <Input
                value={warehouse.warehouse_phone}
                onChange={(e) =>
                  setWarehouse({ ...warehouse, warehouse_phone: e.target.value })
                }
                className="h-9"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Address</Label>
              <textarea
                value={warehouse.address}
                onChange={(e) =>
                  setWarehouse({ ...warehouse, address: e.target.value })
                }
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>

            <Button size="sm" type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {isNew ? "Create Warehouse" : "Save Warehouse"}
            </Button>

          </CardContent>
        </Card>
      </form>

      {/* ─── Notifications ───────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Notifications</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {[
            {
              key: "lowStock",
              title: "Low Stock Alerts",
              description: "Get notified when items hit reorder level",
            },
            {
              key: "asnArrival",
              title: "ASN Arrival Alerts",
              description: "Notify when shipments arrive",
            },
            {
              key: "prApproval",
              title: "PR Approval Required",
              description: "Alert for pending purchase approvals",
            },
          ].map(({ key, title, description }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>

              <Switch
                checked={notifications[key]}
                onCheckedChange={() => handleNotificationChange(key)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

    </div>
  );
}