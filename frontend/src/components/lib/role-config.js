import {
  LayoutDashboard,
  Package,
  FileText,
  Truck,
  ClipboardCheck,
  Users,
  Building2,
  UserCheck,
  Warehouse,
  PackageOpen,
  Settings,
  DollarSign,
  CheckSquare,
  ScanLine,
  ShieldAlert,
  ShoppingCart,
} from "lucide-react";

const allModules = {
  dashboard:        { title: "Dashboard",            url: "/dashboard",              icon: LayoutDashboard },
  products:         { title: "Product",              url: "/products",               icon: Package },
  inventory:        { title: "Inventory",            url: "/inventory",              icon: Package },
  purchaseRequests: { title: "Purchase Requests",    url: "/purchase-requests",      icon: FileText },
  asn:              { title: "ASN",                  url: "/asn",                    icon: Truck },
  grn:              { title: "GRN",                  url: "/grn",                    icon: ClipboardCheck },
  qualityCheck:     { title: "QC",                   url: "/quality-check",          icon: CheckSquare },
  users:            { title: "Users",                url: "/users",                  icon: Users },
  vendors:          { title: "Vendor",               url: "/vendors",                icon: Building2 },
  customers:        { title: "Customer",             url: "/customers",              icon: UserCheck },
  warehouses:       { title: "Warehouse",            url: "/warehouses",             icon: Warehouse },
  outbound:         { title: "Outbound Orders",      url: "/outbound",               icon: PackageOpen },
  finance:          { title: "Finance",              url: "/finance",                icon: DollarSign },
  settings:         { title: "Settings",             url: "/settings",               icon: Settings },
  scanner:          { title: "Barcode Scanner",      url: "/barcode-scanner",        icon: ScanLine },
  rejections:       { title: "QC Rejections",        url: "/rejections",             icon: ShieldAlert },

  purchaseRequestsSales: { title: "Customer PRs", url: "/sales/purchase-requests", icon: ShoppingCart },
  salesOrders:           { title: "Sales Orders",       url: "/sales/orders",            icon: FileText },
  salesPayments:         { title: "Payments",           url: "/sales/payments",          icon: DollarSign },

  // ── Stock Approvals (CPR only, no dispatch) ──
  stockApprovals:   { title: "Stock Approvals",      url: "/stock-check",            icon: CheckSquare },

  // ── Supervisor Order Approval ──
  orderApproval:    { title: "Order Approval",       url: "/order-approval",         icon: ClipboardCheck },

  // ── Sales Finance (split into individual sidebar entries) ──
  awaitingConfirmation: { title: "Awaiting Confirmation", url: "/sales-finance/awaiting",   icon: DollarSign },
  confirmedPayments:    { title: "Confirmed Payments",     url: "/sales-finance/confirmed",  icon: ClipboardCheck },
};

const roleModules = {
  // Full access
  admin: [
    "dashboard",
    "users",
    "purchaseRequests",
    "asn",
    "grn",
    "qualityCheck",
    "scanner",
    "vendors",
    "customers",
    "inventory",
    "products",
    "outbound",
    "warehouses",
    "finance",
    "rejections",
    
    // Sales Manager workflow
    "purchaseRequestsSales",
    "salesOrders",
    "salesPayments",
    // Stock Approvals
    "stockApprovals",
    // Supervisor Order Approval
    "orderApproval",
    // Sales Finance
    "awaitingConfirmation",
    "confirmedPayments",
    "settings"
  ],
  // Operational managers
  manager: [
    "dashboard", "purchaseRequests", "asn", "outbound", "rejections", "vendors", "customers", "products", "inventory"
  ],
  // Warehouse supervisor
  supervisor: [
    "dashboard", "asn", "grn", "rejections", "inventory", "orderApproval"
  ],
  // QC roles
  quality_checker: [
    "dashboard", "qualityCheck", "grn"
  ],
  quality_assistant: [
    "dashboard", "qualityCheck", "grn"
  ],
  // Finance
  finance_director: [
    "dashboard", "purchaseRequests", "finance", "awaitingConfirmation", "confirmedPayments"
  ],
  // Inventory manager
  inventory_manager: [
    "dashboard", "vendors", "scanner", "inventory", "products", "warehouses",
    "stockApprovals", "outbound"
  ],
  // Sales manager
  sales_manager: [
    "dashboard",
    "customers",
    "purchaseRequestsSales", "salesOrders", "salesPayments"
  ],
};

export function getNavItemsForRole(role) {
  const modules = roleModules[role];

  if (!modules) {
    console.warn(`Role "${role}" not found in roleModules — defaulting to dashboard only.`);
    return [allModules.dashboard];
  }

  return modules.map((key) => allModules[key]).filter(Boolean);
}

/* ── Helpers used elsewhere ── */
export const ROLE_DISPLAY = {
  admin:             "Admin",
  manager:           "Manager",
  supervisor:        "Supervisor",
  quality_checker:   "Quality Checker",
  quality_assistant: "Quality Assistant",
  finance_director:  "Finance Director",
  inventory_manager: "Inventory Manager",
  sales_manager:     "Sales Manager",
};

export const canManageVendors = (role) =>
  ["admin", "inventory_manager", "manager"].includes(role);

export const canApproveFinance = (role) =>
  ["admin", "finance_director"].includes(role);

export const isAdmin = (role) => role === "admin";