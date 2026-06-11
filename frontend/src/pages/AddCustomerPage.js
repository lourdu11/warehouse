import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Loader2, ArrowLeft, Building, Mail, Phone, MapPin, Briefcase } from "lucide-react";
import { createCustomer } from "../services/apiService";
import { useToast } from "../components/ui/use-toast";

export default function AddCustomerPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    company_name: "",
    contact_person: "",
    email: "",
    phone: "",
    location: "",
    gstin: "",
    status: "Active",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await createCustomer(formData);
      toast({
        title: "Success",
        description: "Customer created successfully",
      });
      navigate("/customers");
    } catch (error) {
      toast({
        title: "Error",
        description: error.message || "Failed to create customer",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full hover:bg-slate-200">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Add New Customer</h1>
          <p className="text-sm text-slate-500">Register a new customer for sales and outbound orders.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="border-t-4 border-t-indigo-600 shadow-md">
          <CardHeader className="bg-slate-50/50 border-b pb-6">
            <CardTitle className="flex items-center gap-2 text-indigo-900">
              <Building className="w-5 h-5 text-indigo-600" /> Company Details
            </CardTitle>
            <CardDescription>
              Basic information about the customer's business.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="company_name" className="text-xs font-semibold uppercase text-slate-600">Company Name *</Label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    id="company_name" 
                    name="company_name" 
                    value={formData.company_name} 
                    onChange={handleChange} 
                    required 
                    placeholder="e.g. Stark Industries"
                    className="pl-9 focus-visible:ring-indigo-500"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="contact_person" className="text-xs font-semibold uppercase text-slate-600">Contact Person</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    id="contact_person" 
                    name="contact_person" 
                    value={formData.contact_person} 
                    onChange={handleChange} 
                    placeholder="e.g. Tony Stark"
                    className="pl-9 focus-visible:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-semibold uppercase text-slate-600">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    id="email" 
                    name="email" 
                    type="email" 
                    value={formData.email} 
                    onChange={handleChange} 
                    placeholder="contact@company.com"
                    className="pl-9 focus-visible:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-xs font-semibold uppercase text-slate-600">Phone Number *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    id="phone" 
                    name="phone" 
                    value={formData.phone} 
                    onChange={handleChange} 
                    required
                    placeholder="+1 234 567 8900"
                    className="pl-9 focus-visible:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location" className="text-xs font-semibold uppercase text-slate-600">Full Address / Location</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Textarea 
                  id="location" 
                  name="location" 
                  value={formData.location} 
                  onChange={handleChange} 
                  placeholder="123 Business Avenue, Tech Park..."
                  rows={3}
                  className="pl-9 focus-visible:ring-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="gstin" className="text-xs font-semibold uppercase text-slate-600">GSTIN / Tax ID</Label>
                <Input 
                  id="gstin" 
                  name="gstin" 
                  value={formData.gstin} 
                  onChange={handleChange} 
                  placeholder="Enter Tax ID"
                  className="focus-visible:ring-indigo-500 uppercase"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status" className="text-xs font-semibold uppercase text-slate-600">Status</Label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

          </CardContent>
          <CardFooter className="bg-slate-50 border-t px-6 py-4 flex items-center justify-between rounded-b-lg">
            <Button type="button" variant="ghost" onClick={() => navigate("/customers")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 min-w-[120px]">
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {isSubmitting ? "Saving..." : "Create Customer"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
