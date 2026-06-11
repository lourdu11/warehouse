import { useState, useEffect, useCallback } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Plus, Search, Pencil, Trash2, Loader2, AlertCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useToast } from "../components/ui/use-toast";
import { listEmployees, adminCreateUser, updateEmployee, deleteEmployee } from "../services/apiService";
import { useAuth } from "../components/lib/auth-context";

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

// Detect "email already exists" from any Django error message shape
const isEmailDuplicate = (message = "") => {
  const m = message.toLowerCase();
  return (
    m.includes("email already") ||
    m.includes("already exists") ||
    m.includes("email is already") ||
    m.includes("duplicate") ||
    m.includes("unique")
  );
};

const ROLE_OPTIONS = [
  { value: "inventory_manager", label: "Inventory Manager" },
  { value: "quality_assistant", label: "Quality Assistant" },
  { value: "finance_director",  label: "Finance Director" },
  { value: "manager",           label: "Manager" },
  { value: "supervisor",        label: "Supervisor" },
  { value: "sales_manager",     label: "Sales Manager" },
];

const EMPTY_FORM = { username: "", email: "", f_name: "", l_name: "", role: "" };

export default function UsersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState("create");
  const [selectedUser, setSelectedUser] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  // ✅ Per-field inline errors — keyed by field name
  const [fieldErrors, setFieldErrors] = useState({});

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listEmployees();
      setUsers(toArray(data));
    } catch (error) {
      console.error("Failed to load users:", error);
      toast({ title: "Error", description: error.message || "Failed to load users.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const clearFieldErrors = () => setFieldErrors({});

  const handleOpenCreate = () => {
    setDialogMode("create");
    setFormData(EMPTY_FORM);
    clearFieldErrors();
    setSelectedUser(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (userItem) => {
    setSelectedUser(userItem);
    setFormData({
      username: userItem.username ?? "",
      email:    userItem.email    ?? "",
      f_name:   "",
      l_name:   "",
      role:     userItem.role     ?? "",
    });
    clearFieldErrors();
    setDialogMode("edit");
    setDialogOpen(true);
  };

  // Clear field-level error the moment the user edits that field
  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const handleDelete = async (userItem) => {
    if (!window.confirm(`Are you sure you want to delete ${userItem.username}?`)) return;
    setIsSubmitting(true);
    try {
      await deleteEmployee(userItem.employee_id);
      toast({ title: "Success", description: "User deleted successfully." });
      loadUsers();
    } catch (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    clearFieldErrors();
    try {
      if (dialogMode === "create") {
        await adminCreateUser(formData);
        toast({ title: "Success", description: "User created. Password sent to email." });
      } else {
        await updateEmployee(selectedUser.employee_id, {
          username: formData.username,
          email:    formData.email,
          role:     formData.role,
        });
        toast({ title: "Success", description: "User updated successfully." });
      }
      setDialogOpen(false);
      loadUsers();
    } catch (error) {
      const msg = error.message || "";

      if (isEmailDuplicate(msg)) {
        // ✅ Show inline error under the email field — dialog stays open
        setFieldErrors({ email: "This email is already registered. Use a different address." });
      } else {
        // Unexpected error — generic toast
        toast({ title: "Error", description: msg || "Operation failed.", variant: "destructive" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const q = search.toLowerCase();
  const filteredUsers = users.filter(
    (u) =>
      matchesSearch(u.username,    q) ||
      matchesSearch(u.employee_id, q) ||
      matchesSearch(u.email,       q)
  );

  if (user?.role !== "admin") {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">Access restricted. Admin only.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="text-sm text-gray-500 mt-1">Manage employee accounts and role assignments</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search users..."
            className="pl-9 h-9 border-gray-200"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" className="h-9 bg-[#1E3A8A] hover:bg-[#1E293B]" onClick={handleOpenCreate}>
          <Plus className="w-4 h-4 mr-1.5" /> Add User
        </Button>
      </div>

      <Card className="shadow-sm border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs font-semibold text-gray-600">Employee ID</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Username</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Email</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Role</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">First Login</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1E3A8A]" />
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((userItem) => (
                  <TableRow key={userItem.employee_id} className="hover:bg-gray-50">
                    <TableCell className="text-xs font-mono font-medium text-gray-600">
                      {userItem.employee_id}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-gray-900">
                      {userItem.username}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">{userItem.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {userItem.role?.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={userItem.is_first_login ? "outline" : "secondary"}
                        className="text-xs"
                      >
                        {userItem.is_first_login ? "Pending" : "Completed"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleOpenEdit(userItem)}
                          className="p-1.5 rounded hover:bg-gray-100 transition-colors" title="Edit">
                          <Pencil className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                        <button onClick={() => handleDelete(userItem)}
                          className="p-1.5 rounded hover:bg-red-50 transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) clearFieldErrors(); }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{dialogMode === "create" ? "Add New User" : "Edit User"}</DialogTitle>
              <DialogDescription>
                {dialogMode === "create"
                  ? "Create a new employee account. Password will be sent via email."
                  : "Update user information."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {dialogMode === "create" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>First Name *</Label>
                    <Input value={formData.f_name}
                      onChange={(e) => handleFieldChange("f_name", e.target.value)} required />
                  </div>
                  <div className="grid gap-2">
                    <Label>Last Name *</Label>
                    <Input value={formData.l_name}
                      onChange={(e) => handleFieldChange("l_name", e.target.value)} required />
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                <Label>Username *</Label>
                <Input value={formData.username}
                  onChange={(e) => handleFieldChange("username", e.target.value)} required />
              </div>

              {/* ✅ Email field with inline duplicate-error indication */}
              <div className="grid gap-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleFieldChange("email", e.target.value)}
                  required
                  aria-invalid={!!fieldErrors.email}
                  className={
                    fieldErrors.email
                      ? "border-red-500 focus-visible:ring-red-400 bg-red-50"
                      : ""
                  }
                />
                {fieldErrors.email && (
                  <p className="flex items-center gap-1.5 text-xs text-red-600">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label>Role *</Label>
                <Select value={formData.role}
                  onValueChange={(value) => handleFieldChange("role", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-[#1E3A8A] hover:bg-[#1E293B]">
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {dialogMode === "create" ? "Create User" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}