import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Plus, Search, Pencil, Trash2, Loader2, UserCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  listCustomers,
  updateCustomer,
  deleteCustomer,
} from "../services/apiService";
import { useToast } from "../components/ui/use-toast";

// Normalise any API response to a plain array
const toArray = (res) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  for (const key of ["results", "data", "items"]) {
    if (Array.isArray(res[key])) return res[key];
  }
  return Object.values(res).find(Array.isArray) || [];
};

// Safe search: coerces any value type to string before matching
const matchesSearch = (value, query) =>
  String(value ?? "").toLowerCase().includes(query);

const EMPTY_FORM = {
  company_name: "",
  contact_person: "",
  email: "",
  phone: "",
  location: "",
  gstin: "",
  status: "Active",
};

export default function CustomersPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState("create"); // create | edit | delete
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listCustomers();
      setCustomers(toArray(data));
    } catch (error) {
      console.error("Failed to load customers:", error);
      toast({
        title: "Error",
        description: "Failed to load customers. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleOpenEdit = (customer) => {
    setSelectedCustomer(customer);
    setFormData({
      company_name:   customer.company_name ?? "",
      contact_person: customer.contact_person ?? "",
      email:          customer.email   ?? "",
      phone:          customer.phone   ?? "",
      location:       customer.location ?? "",
      gstin:          customer.gstin    ?? "",
      status:         customer.status   ?? "Active",
    });
    setDialogMode("edit");
    setDialogOpen(true);
  };

  const handleOpenDelete = (customer) => {
    setSelectedCustomer(customer);
    setDialogMode("delete");
    setDialogOpen(true);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setIsSubmitting(true);
    try {
      if (dialogMode === "edit") {
        await updateCustomer(selectedCustomer.customer_id, formData);
        toast({ title: "Success", description: "Customer updated successfully." });
      } else if (dialogMode === "delete") {
        await deleteCustomer(selectedCustomer.customer_id);
        toast({ title: "Success", description: "Customer deleted successfully." });
      }
      setDialogOpen(false);
      loadCustomers();
    } catch (error) {
      console.error("Operation failed:", error);
      toast({
        title: "Error",
        description: error.message || "Operation failed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const q = search.toLowerCase();
  const filteredCustomers = customers.filter(
    (c) =>
      matchesSearch(c.company_name, q) ||
      matchesSearch(c.customer_id, q) ||
      matchesSearch(c.contact_person, q)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search customers by name or ID..."
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" className="h-9 bg-indigo-600 hover:bg-indigo-700" onClick={() => navigate("/customers/create")}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Customer
        </Button>
      </div>

      <Card className="shadow-sm overflow-hidden border-t-4 border-t-indigo-600">
        <div className="px-4 py-3 border-b bg-slate-50/50 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-indigo-600" /> Customer Directory
            <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {filteredCustomers.length}
            </span>
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="text-xs font-semibold text-slate-600">ID</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600">Company Name</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600">Contact</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600">Email</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600">Phone</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600">Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 text-right w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-400 mb-2" />
                    <p className="text-xs text-slate-500 font-medium">Loading customers...</p>
                  </TableCell>
                </TableRow>
              ) : filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <UserCheck className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-600">No customers found</p>
                    <p className="text-xs text-slate-400 mt-1">Try adjusting your search query</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCustomers.map((c) => (
                  <TableRow key={c.customer_id} className="hover:bg-indigo-50/30 transition-colors">
                    <TableCell className="text-xs font-mono font-medium text-indigo-600">{c.customer_id}</TableCell>
                    <TableCell className="text-sm font-bold text-slate-800">{c.company_name}</TableCell>
                    <TableCell className="text-xs text-slate-600 font-medium">{c.contact_person || "-"}</TableCell>
                    <TableCell className="text-xs text-slate-500">{c.email || "-"}</TableCell>
                    <TableCell className="text-xs text-slate-600 font-medium">{c.phone || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={c.status === "Active" ? "default" : "secondary"}
                        className={c.status === "Active" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "text-xs"}
                      >
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(c)}
                          className="p-1.5 rounded-md hover:bg-indigo-100 transition-colors group"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                        </button>
                        <button
                          onClick={() => handleOpenDelete(c)}
                          className="p-1.5 rounded-md hover:bg-rose-100 transition-colors group"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-slate-400 group-hover:text-rose-600" />
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

      {/* Edit Dialog */}
      <Dialog
        open={dialogOpen && dialogMode === "edit"}
        onOpenChange={setDialogOpen}
      >
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-xl text-indigo-900">Edit Customer</DialogTitle>
              <DialogDescription>Update the customer information.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="company_name" className="text-xs uppercase tracking-wider font-semibold text-slate-600">Company Name *</Label>
                <Input id="company_name" name="company_name" value={formData.company_name}
                  onChange={handleInputChange} required className="focus-visible:ring-indigo-500" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contact_person" className="text-xs uppercase tracking-wider font-semibold text-slate-600">Contact Person</Label>
                <Input id="contact_person" name="contact_person" value={formData.contact_person}
                  onChange={handleInputChange} className="focus-visible:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email" className="text-xs uppercase tracking-wider font-semibold text-slate-600">Email</Label>
                  <Input id="email" name="email" type="email" value={formData.email}
                    onChange={handleInputChange} className="focus-visible:ring-indigo-500" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone" className="text-xs uppercase tracking-wider font-semibold text-slate-600">Phone</Label>
                  <Input id="phone" name="phone" value={formData.phone}
                    onChange={handleInputChange} className="focus-visible:ring-indigo-500" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="location" className="text-xs uppercase tracking-wider font-semibold text-slate-600">Full Address / Location</Label>
                <Textarea id="location" name="location" value={formData.location}
                  onChange={handleInputChange} rows={2} className="focus-visible:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="gstin" className="text-xs uppercase tracking-wider font-semibold text-slate-600">GSTIN / Tax ID</Label>
                  <Input id="gstin" name="gstin" value={formData.gstin}
                    onChange={handleInputChange} className="focus-visible:ring-indigo-500" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="status" className="text-xs uppercase tracking-wider font-semibold text-slate-600">Status</Label>
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            <DialogFooter className="bg-slate-50 -mx-6 -mb-6 px-6 py-4 rounded-b-lg border-t mt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pencil className="w-4 h-4 mr-2" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={dialogOpen && dialogMode === "delete"}
        onOpenChange={setDialogOpen}
      >
        <DialogContent className="sm:max-w-[400px]">
          <div className="flex flex-col items-center justify-center text-center pt-8 pb-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6 text-rose-600" />
            </div>
            <DialogTitle className="text-xl mb-2">Delete Customer</DialogTitle>
            <DialogDescription className="text-base">
              Are you sure you want to delete{" "}
              <strong className="text-slate-800">{selectedCustomer?.company_name}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
