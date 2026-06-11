/**
 * RejectionDetailsPage.js
 * 
 * View for Manager, Admin, and Supervisor to see rejected items from QC.
 * Managers can confirm the rejection after verification.
 */

import React, { useState, useEffect, useCallback } from "react";
import { 
  Card, CardContent 
} from "../components/ui/card";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "../components/ui/table";
import { Button } from "../components/ui/button";
import { 
  AlertCircle, CheckCircle2, Eye, Loader2, Package, Search, 
  Trash2, ShieldAlert, ImageIcon, History, ClipboardCheck, X, ChevronLeft, ChevronRight
} from "lucide-react";
import { useToast } from "../components/ui/use-toast";
import { useAuth } from "../components/lib/auth-context";
import { listRejections, confirmRejection } from "../services/apiService";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription
} from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";

export default function RejectionDetailsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [selectedImageInfo, setSelectedImageInfo] = useState(null);

  const isManager = user?.role === "manager";

  const loadRejections = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listRejections();
      setItems(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to load rejection records.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadRejections();
  }, [loadRejections]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedImageInfo) return;
      if (e.key === 'ArrowRight') {
        setSelectedImageInfo(prev => ({ ...prev, index: (prev.index + 1) % prev.images.length }));
      } else if (e.key === 'ArrowLeft') {
        setSelectedImageInfo(prev => ({ ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImageInfo]);

  const handleConfirm = async (itemId) => {
    setConfirming(itemId);
    try {
      await confirmRejection(itemId);
      toast({
        title: "Success",
        description: "Rejection confirmed successfully.",
      });
      loadRejections();
    } catch (err) {
      toast({
        title: "Error",
        description: err.message || "Failed to confirm rejection.",
        variant: "destructive",
      });
    } finally {
      setConfirming(null);
    }
  };

  const filteredItems = items.filter(item => 
    item.grn_item_id.toLowerCase().includes(search.toLowerCase()) ||
    item.product_name.toLowerCase().includes(search.toLowerCase()) ||
    item.rejection_reason.toLowerCase().includes(search.toLowerCase()) ||
    (item.rejection_notes && item.rejection_notes.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#1E3A8A]" />
        <p className="text-sm text-gray-500 animate-pulse">Loading rejection records...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-red-600" />
            QC Rejection Logs
          </h1>
          <p className="text-gray-500 mt-1">
            Monitor and verify items rejected during Quality Check.
          </p>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search rejections..."
            className="pl-9 h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-red-50 border-red-100">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-red-100 rounded-full">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-600 uppercase tracking-wider">Total Rejections</p>
              <p className="text-2xl font-bold text-red-900">{items.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-amber-50 border-amber-100">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-amber-100 rounded-full">
              <History className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-600 uppercase tracking-wider">Pending Action</p>
              <p className="text-2xl font-bold text-amber-900">
                {items.filter(i => !i.rejection_confirmed).length}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50 border-emerald-100">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-full">
              <ClipboardCheck className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-600 uppercase tracking-wider">Verified Logs</p>
              <p className="text-2xl font-bold text-emerald-900">
                {items.filter(i => i.rejection_confirmed).length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow>
                <TableHead>Item ID / GRN</TableHead>
                <TableHead>Product Details</TableHead>
                <TableHead>Rejected Qty</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-50">
                      <Package className="w-10 h-10" />
                      <p>No rejection records found.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => (
                  <TableRow key={item.grn_item_id} className="hover:bg-gray-50/50 transition-colors">
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-mono text-xs font-bold text-[#1E3A8A]">{item.grn_item_id}</p>
                        <p className="text-[10px] text-gray-500">GRN: {item.grn}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-gray-900">{item.product_name}</p>
                        <p className="text-xs text-gray-500">Batch: {item.batch_number || "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-bold">
                        {item.rejected_quantity} Units
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{item.rejection_reason || "Unspecified"}</span>
                        {item.rejection_notes && (
                          <>
                            <span className="text-[10px] font-bold text-gray-500 mt-1 uppercase tracking-wider">Internal Notes:</span>
                            <span className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 p-1.5 rounded border border-gray-100 mt-0.5">{item.rejection_notes}</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.rejection_confirmed ? (
                        <div className="flex items-center gap-1.5 text-emerald-600">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-bold">Verified</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-500">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-xs font-bold">Awaiting Manager</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 border-gray-200 hover:bg-gray-50">
                              <Eye className="w-3.5 h-3.5 text-gray-600" />
                              View Details
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl sm:rounded-2xl border-none p-0 overflow-hidden bg-white">
                            <DialogHeader className="bg-[#1E3A8A] text-white px-6 py-6">
                              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                                <AlertCircle className="w-6 h-6 text-amber-400" />
                                Rejection Verification
                              </DialogTitle>
                              <DialogDescription className="text-[#94a3b8] text-sm mt-1 uppercase tracking-widest font-mono">
                                ITEM ID: {item.grn_item_id}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                              <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-4">
                                  <div>
                                    <Label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1 block">Product Name</Label>
                                    <p className="text-base font-bold text-gray-900">{item.product_name}</p>
                                  </div>
                                  <div>
                                    <Label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1 block">Rejection Reason</Label>
                                    <p className="text-sm font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-md inline-block">
                                      {item.rejection_reason}
                                    </p>
                                  </div>
                                  <div>
                                    <Label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1 block">Internal Notes</Label>
                                    <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg leading-relaxed border border-gray-100 min-h-[60px] whitespace-pre-wrap">
                                      {item.rejection_notes ? (
                                        <span className="italic text-gray-600">"{item.rejection_notes}"</span>
                                      ) : (
                                        <span className="text-gray-400 italic">No internal notes provided.</span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <div className="space-y-4">
                                  <div>
                                    <Label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1 block">Rejected Quantity</Label>
                                    <p className="text-2xl font-black text-red-600">{item.rejected_quantity} Units</p>
                                  </div>
                                  <div>
                                    <Label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1 block">Snapshot Barcode</Label>
                                    <p className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-700 inline-block">{item.snapshot_barcode}</p>
                                  </div>
                                  {item.rejection_confirmed && (
                                    <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                                      <p className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold mb-1">Confirmed By</p>
                                      <p className="text-sm font-bold text-emerald-900">
                                        {item.rejection_confirmed_by_username || "System Admin"} 
                                        <span className="block text-[10px] font-normal text-emerald-600 opacity-70 mt-0.5 font-mono">
                                          {new Date(item.rejection_confirmed_at).toLocaleString()}
                                        </span>
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div>
                                <Label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-3 block">Inspection Evidence</Label>
                                {item.rejection_images && item.rejection_images.length > 0 ? (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {item.rejection_images.map((img, i) => (
                                      <div 
                                        key={i} 
                                        className="group relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50 hover:border-[#1E3A8A] transition-all cursor-zoom-in"
                                        onClick={() => setSelectedImageInfo({ images: item.rejection_images, index: i })}
                                      >
                                        <img
                                          src={img.startsWith('data:') ? img : `data:image/png;base64,${img}`}
                                          alt={`evidence-${i}`}
                                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                          <ImageIcon className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 opacity-60">
                                    <ImageIcon className="w-8 h-8 text-gray-400 mb-2" />
                                    <p className="text-xs font-medium text-gray-500">No images captured during QC</p>
                                  </div>
                                )}
                              </div>

                              {isManager && !item.rejection_confirmed && (
                                <div className="pt-4 border-t border-gray-100">
                                  <Button 
                                    className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-200 flex items-center justify-center gap-2 group transition-all"
                                    onClick={() => handleConfirm(item.grn_item_id)}
                                    disabled={confirming === item.grn_item_id}
                                  >
                                    {confirming === item.grn_item_id ? (
                                      <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                      <>
                                        <CheckCircle2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                        Verify & Confirm Rejection
                                      </>
                                    )}
                                  </Button>
                                  <p className="text-[10px] text-center text-gray-400 mt-3 font-medium">
                                    Confirming will finalize the rejection status and mark the item as out of inventory.
                                  </p>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>

                        {isManager && !item.rejection_confirmed && (
                          <Button 
                            variant="default" 
                            size="sm" 
                            className="h-8 bg-red-600 hover:bg-red-700 font-bold"
                            onClick={() => handleConfirm(item.grn_item_id)}
                            disabled={confirming === item.grn_item_id}
                          >
                            {confirming === item.grn_item_id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              "Confirm"
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Image Zoom Dialog */}
      <Dialog open={!!selectedImageInfo} onOpenChange={(open) => { if (!open) setSelectedImageInfo(null); }}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 border-none bg-transparent shadow-none overflow-hidden flex items-center justify-center">
          {selectedImageInfo && (
            <div className="relative w-full h-full flex items-center justify-center group">
              {selectedImageInfo.images.length > 1 && (
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 border-none text-white rounded-full h-10 w-10 z-50 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setSelectedImageInfo(prev => ({ ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length })); 
                  }}
                >
                  <ChevronLeft className="w-6 h-6" />
                </Button>
              )}
              
              <img 
                src={selectedImageInfo.images[selectedImageInfo.index].startsWith('data:') ? selectedImageInfo.images[selectedImageInfo.index] : `data:image/png;base64,${selectedImageInfo.images[selectedImageInfo.index]}`} 
                alt="Zoomed evidence" 
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300"
              />
              
              {selectedImageInfo.images.length > 1 && (
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 border-none text-white rounded-full h-10 w-10 z-50 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setSelectedImageInfo(prev => ({ ...prev, index: (prev.index + 1) % prev.images.length })); 
                  }}
                >
                  <ChevronRight className="w-6 h-6" />
                </Button>
              )}

              <Button 
                variant="outline" 
                size="icon" 
                className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 border-none text-white rounded-full h-8 w-8 z-50 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setSelectedImageInfo(null)}
              >
                <X className="w-4 h-4" />
              </Button>

              {selectedImageInfo.images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-3 py-1.5 rounded-full font-medium z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {selectedImageInfo.index + 1} / {selectedImageInfo.images.length}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Label({ children, className, ...props }) {
  return (
    <label className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`} {...props}>
      {children}
    </label>
  );
}
