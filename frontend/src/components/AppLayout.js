import React, { useState, useRef, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "../components/ui/sidebar";
import { AppSidebar } from "../components/AppSidebar";
import { useAuth } from "../components/lib/auth-context";
import { LogOut } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import NotificationBell from "./NotificationBell";
import { listEmployees } from "../services/apiService";


/* First letter of the role string, upper-cased.
   inventory_manager → "I",  admin → "A",  supervisor → "S", etc. */
function roleInitial(role) {
  if (!role) return "U";
  return role.trim()[0].toUpperCase();
}

export function AppLayout() {
  const { user, logout, setUser } = useAuth();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef(null);

  /* Auto-sync user details if username is missing from old session storage */
  useEffect(() => {
    if (user && !user.username) {
      listEmployees()
        .then((employees) => {
          const current = employees.find((emp) => emp.employee_id === user.id);
          if (current) {
            const updated = {
              ...user,
              username: current.username,
              name: current.first_name || current.last_name
                ? `${current.first_name || ""} ${current.last_name || ""}`.trim()
                : current.username,
            };
            setUser(updated);
          }
        })
        .catch((err) => console.error("Error auto-fetching user details:", err));
    }
  }, [user, setUser]);

  /* Close dropdown on outside click */
  useEffect(() => {
    function handleOutsideClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [profileOpen]);

  /* Close dropdown on route change */
  useEffect(() => { setProfileOpen(false); }, [location.pathname]);

  const getTitle = () => {
    const p = location.pathname;
    if (p.includes("upload-agreement"))  return "Upload Vendor Agreement";
    if (p.includes("dashboard"))         return "Dashboard";
    if (p.includes("users"))             return "User Management";
    if (p.includes("products"))          return "Products";
    if (p.includes("inventory"))         return "Inventory";
    if (p.includes("purchase-requests")) return "Purchase Requests";
    if (p.includes("asn/create"))        return "Create ASN";
    if (p.includes("asn"))               return "ASN";
    if (p.includes("grn"))               return "GRN";
    if (p.includes("vendors"))           return "Vendors";
    if (p.includes("warehouses"))        return "Warehouses";
    if (p.includes("outbound"))          return "Outbound Orders";
    if (p.includes("quality-check"))     return "Quality Check";
    if (p.includes("finance"))           return "Finance";
    if (p.includes("settings"))          return "Settings";
    if (p.includes("barcode-scanner"))   return "Barcode Scanner";
    return "";
  };

  const initial = roleInitial(user?.role);

  const handleLogout = async () => {
    setProfileOpen(false);
    await logout();
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">

          {/* ── Navbar ── */}
          <header className="h-12 flex items-center justify-between border-b bg-card px-4 shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <h2 className="text-sm font-semibold text-foreground">{getTitle()}</h2>
            </div>

            <div className="flex items-center gap-3">
              {/* Live notification bell */}
              <NotificationBell />

              {/* Avatar dropdown — single letter derived from role */}
              <div className="relative" ref={dropdownRef}>
                <button
                  id="navbar-profile-btn"
                  onClick={() => setProfileOpen(o => !o)}
                  className="w-8 h-8 rounded-full bg-[#1E3A8A] flex items-center justify-center text-sm font-bold text-white hover:opacity-90 transition-opacity select-none"
                  aria-haspopup="true"
                  aria-expanded={profileOpen}
                  title={user?.role?.replace(/_/g, " ")}
                >
                  {initial}
                </button>

                {profileOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-52 rounded-lg border border-gray-200 bg-white shadow-lg z-50 overflow-hidden"
                    role="menu"
                  >
                    {/* User info header */}
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {user?.username || user?.name || "User"}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5 truncate">
                        {user?.id || ""}
                      </p>
                      <p className="text-xs text-gray-400 capitalize mt-0.5 truncate">
                        {user?.role?.replace(/_/g, " ") || ""}
                      </p>
                    </div>

                    {/* Sign Out */}
                    <button
                      id="navbar-signout-btn"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      role="menuitem"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 p-4 overflow-auto">
            <div className="animate-slide-in">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}