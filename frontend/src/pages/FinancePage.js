import { useState, useEffect, useCallback } from "react";
import { Card } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Search, Download, Loader2 } from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { useToast } from "../components/ui/use-toast";
import { listPurchaseRequests, listPurchaseOrders } from "../services/apiService";
import { formatDateDDMMYYYY } from "../components/utils/helpers";

export default function FinancePage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [financeData, setFinanceData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFinanceData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [prs, pos] = await Promise.allSettled([
        listPurchaseRequests(),
        listPurchaseOrders(),
      ]);

      const prsData = prs.status === "fulfilled" ? (prs.value || []) : [];
      const posData = pos.status === "fulfilled" ? (pos.value || []) : [];

      const approvedPRs = prsData
        .filter(pr => pr.status === "Approved")
        .map(pr => ({
          id:        pr.pr_id,
          type:      "PR",
          amount:    parseFloat(pr.total_amount) || 0,
          status:    "approved",
          date:      pr.created_at,
          reference: pr.product_name || "-",
        }));

      const purchaseOrders = posData.map(po => ({
        id:        po.po_id,
        type:      "PO",
        amount:    parseFloat(po.total_amount) || 0,
        status:    "paid",
        date:      po.created_at,
        reference: po.vendor_name || "-",
      }));

      setFinanceData([...approvedPRs, ...purchaseOrders]);
    } catch (error) {
      console.error("Failed to load finance data:", error);
      toast({
        title: "Error",
        description: "Failed to load finance data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchFinanceData();
  }, [fetchFinanceData]);

  const q = search.toLowerCase();
  const filtered = financeData.filter(item =>
    // ✅ FIX: id may be a number — coerce to string before .toLowerCase()
    String(item.id ?? "").toLowerCase().includes(q) ||
    String(item.reference ?? "").toLowerCase().includes(q)
  );

  const totalPayable = filtered.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  const exportToCSV = () => {
    const headers = ["ID", "Type", "Amount", "Status", "Date", "Reference"];
    const rows = filtered.map(item => [
      item.id,
      item.type,
      item.amount,
      item.status,
      formatDateDDMMYYYY(item.date),
      item.reference,
    ]);
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Success", description: "Report exported successfully." });
  };

  // ✅ FIX: No <AppLayout> wrapper — layout is provided by the router via <Outlet>
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID or Reference..."
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={exportToCSV}
          disabled={isLoading || filtered.length === 0}
        >
          <Download className="w-4 h-4 mr-1.5" /> Export Report
        </Button>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs font-semibold">ID</TableHead>
              <TableHead className="text-xs font-semibold">Type</TableHead>
              <TableHead className="text-xs font-semibold text-right">Amount (₹)</TableHead>
              <TableHead className="text-xs font-semibold">Status</TableHead>
              <TableHead className="text-xs font-semibold">Date</TableHead>
              {/* <TableHead className="text-xs font-semibold">Reference</TableHead> */}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No finance records found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => (
                <TableRow key={`${item.type}-${item.id}`}>
                  <TableCell className="text-xs font-mono font-medium">{item.id}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-xs">{item.type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-right tabular-nums font-medium">
                    ₹{(parseFloat(item.amount) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={item.status === "paid" ? "secondary" : "default"}
                      className="text-xs capitalize"
                    >
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateDDMMYYYY(item.date)}
                  </TableCell>
                  {/* <TableCell className="text-xs">{item.reference}</TableCell> */}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="p-4 border-t bg-muted/30">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium">Total Payable</p>
            <p className="text-xl font-bold">
              ₹{totalPayable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}