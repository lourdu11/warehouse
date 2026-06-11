import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "./components/ui/sonner";
import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";

import { AuthProvider, useAuth } from "./components/lib/auth-context";
import { AppLayout } from "./components/AppLayout";

// Pages
import UsersPage          from "./pages/UsersPage";
import ProductsPage       from "./pages/ProductsPage";
import CreateEditProductPage from "./pages/CreateEditProductPage";
import DashboardPage      from "./pages/DashboardPage";
import InventoryPage      from "./pages/InventoryPage";
import PurchaseRequestsPage from "./pages/PurchaseRequestsPage";
import ASNPage            from "./pages/ASNPage";
import GRNPage            from "./pages/GRNPage";
import CustomersPage      from "./pages/CustomersPage";
import AddCustomerPage    from "./pages/AddCustomerPage";
import WarehousesPage     from "./pages/WarehousesPage";
import OutboundPage       from "./pages/OutboundPage";
import QualityCheckPage   from "./pages/QualityCheckPage";
import FinancePage        from "./pages/FinancePage";
import SettingsPage       from "./pages/SettingsPage";
import VendorsPage        from "./pages/VendorsPage";
import CreateVendorPage   from "./pages/CreateVendorPage";
import UploadAgreementPage from "./pages/UploadAgreementPage";

// Sales Manager Workflow Pages
import SalesManagerPage from "./pages/SalesManagerPage";
import InventoryStockCheckPage from "./pages/InventoryStockCheckPage";
import SupervisorOrderApprovalPage from "./pages/SupervisorOrderApprovalPage";
import SalesFinancePage from "./pages/SalesFinancePage";

// Sales — split sidebar pages
import SalesPurchaseRequestsPage from "./pages/SalesPurchaseRequestsPage";
import SalesOrdersPage from "./pages/SalesOrdersPage";
import SalesPaymentsPage from "./pages/SalesPaymentsPage";

// Sales Finance — split sidebar pages
import SalesAwaitingConfirmationPage from "./pages/SalesAwaitingConfirmationPage";
import SalesConfirmedPaymentsPage from "./pages/SalesConfirmedPaymentsPage";

// Auth Pages
import LoginPage             from "./pages/auth/LoginPage";
import OTPPage               from "./pages/auth/OTPPage";
import ForgotPasswordPage    from "./pages/auth/ForgotPasswordPage";
import ForceChangePasswordPage from "./pages/auth/ForceChangePasswordPage";
import BarcodeScannerPage from "./pages/Barcodescannerpage";
import CreateASNPage     from "./pages/CreateASNPage";
import NotificationsPage from "./pages/NotificationsPage";
import RejectionDetailsPage from "./pages/RejectionDetailsPage";
const queryClient = new QueryClient();

/* ── Redirect unauthenticated users to login ── */
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen"><div className="w-6 h-6 border-2 border-[#1E3A8A] border-t-transparent rounded-full animate-spin" /></div>;
  if (!isAuthenticated) return <Navigate to="/auth/login" replace />;
  return children;
}

/* ── Role guard: redirect unauthorized users to /dashboard ── */
function RoleGuard({ allowedRoles, children }) {
  const { user } = useAuth();
  if (!allowedRoles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />

      <BrowserRouter>
        <AuthProvider>
          <Routes>

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* Auth routes (public) */}
            <Route path="/auth/login"                element={<LoginPage />} />
            <Route path="/auth/otp"                  element={<OTPPage />} />
            <Route path="/auth/forgot-password"      element={<ForgotPasswordPage />} />
            <Route path="/auth/force-change-password" element={<ForceChangePasswordPage />} />

            {/* Protected routes with shared layout */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              {/* ── Universally accessible (all authenticated roles) ── */}
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/products"  element={<ProductsPage />} />
 
              {/* ── Vendors (admin + inventory_manager + manager) ── */}
              <Route path="/vendors"         element={<RoleGuard allowedRoles={["admin","inventory_manager","manager"]}><VendorsPage /></RoleGuard>} />
              <Route path="/vendors/create"  element={<RoleGuard allowedRoles={["admin","inventory_manager","manager"]}><CreateVendorPage /></RoleGuard>} />
              <Route path="/vendors/edit/:id" element={<RoleGuard allowedRoles={["admin","inventory_manager","manager"]}><CreateVendorPage /></RoleGuard>} />
              <Route path="/vendors/:vendorId/upload-agreement" element={<RoleGuard allowedRoles={["admin","inventory_manager","manager"]}><UploadAgreementPage /></RoleGuard>} />
              {/* ── Customers (admin + sales_manager + manager) ── */}
              <Route path="/customers"        element={<RoleGuard allowedRoles={["admin","sales_manager","manager"]}><CustomersPage /></RoleGuard>} />
              <Route path="/customers/create" element={<RoleGuard allowedRoles={["admin","sales_manager","manager"]}><AddCustomerPage /></RoleGuard>} />

              {/* ── Inventory / Operations ── */}
              <Route path="/inventory"         element={<InventoryPage />} />
              <Route path="/purchase-requests" element={<PurchaseRequestsPage />} />
              <Route path="/asn"               element={<ASNPage />} />
              <Route path="/asn/create"        element={<CreateASNPage />} />
              <Route path="/grn"               element={<GRNPage />} />
              <Route path="/rejections"        element={<RoleGuard allowedRoles={["admin","manager","supervisor"]}><RejectionDetailsPage /></RoleGuard>} />
              <Route path="/outbound"          element={<OutboundPage />} />
              <Route path="/barcode-scanner" element={<BarcodeScannerPage />} />
              
              {/* ── Quality Check ── */}
              <Route path="/quality-check" element={<RoleGuard allowedRoles={["admin","quality_checker","quality_assistant","supervisor"]}><QualityCheckPage /></RoleGuard>} />

              {/* ── Warehouses ── */}
              <Route path="/warehouses" element={<RoleGuard allowedRoles={["admin","inventory_manager","manager"]}><WarehousesPage /></RoleGuard>} />

              {/* ── Finance ── */}
              <Route path="/finance" element={<RoleGuard allowedRoles={["admin","finance_director"]}><FinancePage /></RoleGuard>} />

              {/* ── Sales Manager Workflow (legacy combined route kept) ── */}
              <Route path="/sales"                       element={<RoleGuard allowedRoles={["admin","sales_manager"]}><SalesManagerPage /></RoleGuard>} />

              {/* ── Sales Manager — split sidebar pages ── */}
              <Route path="/sales/purchase-requests"     element={<RoleGuard allowedRoles={["admin","sales_manager"]}><SalesPurchaseRequestsPage /></RoleGuard>} />
              <Route path="/sales/orders"                element={<RoleGuard allowedRoles={["admin","sales_manager"]}><SalesOrdersPage /></RoleGuard>} />
              <Route path="/sales/payments"              element={<RoleGuard allowedRoles={["admin","sales_manager"]}><SalesPaymentsPage /></RoleGuard>} />

              {/* ── Stock Approvals (CPR only, no dispatch tab) ── */}
              <Route path="/stock-check"                 element={<RoleGuard allowedRoles={["admin","inventory_manager"]}><InventoryStockCheckPage /></RoleGuard>} />

              {/* ── Supervisor Order Approval ── */}
              <Route path="/order-approval"              element={<RoleGuard allowedRoles={["admin","supervisor"]}><SupervisorOrderApprovalPage /></RoleGuard>} />

              {/* ── Sales Finance (legacy combined route kept) ── */}
              <Route path="/sales-finance"               element={<RoleGuard allowedRoles={["admin","finance_director"]}><SalesFinancePage /></RoleGuard>} />

              {/* ── Sales Finance — split sidebar pages ── */}
              <Route path="/sales-finance/awaiting"      element={<RoleGuard allowedRoles={["admin","finance_director"]}><SalesAwaitingConfirmationPage /></RoleGuard>} />
              <Route path="/sales-finance/confirmed"     element={<RoleGuard allowedRoles={["admin","finance_director"]}><SalesConfirmedPaymentsPage /></RoleGuard>} />

              {/* ── Admin only ── */}
              <Route path="/users"    element={<RoleGuard allowedRoles={["admin"]}><UsersPage /></RoleGuard>} />
              <Route path="/settings" element={<RoleGuard allowedRoles={["admin"]}><SettingsPage /></RoleGuard>} />

              {/* Products create/edit — admin + manager + inventory_manager */}
              <Route path="/products/create"   element={<RoleGuard allowedRoles={["admin","manager","inventory_manager"]}><CreateEditProductPage /></RoleGuard>} />
              <Route path="/products/edit/:id" element={<RoleGuard allowedRoles={["admin","manager","inventory_manager"]}><CreateEditProductPage /></RoleGuard>} />
            </Route>


            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />

          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
