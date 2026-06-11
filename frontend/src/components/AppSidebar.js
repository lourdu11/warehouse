import React from "react";
import { useLocation } from "react-router-dom";
import { NavLink } from "./NavLink";
import { useAuth } from "../components/lib/auth-context";
import { getNavItemsForRole } from "../components/lib/role-config";
import { Warehouse } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "./ui/sidebar";

export function AppSidebar() {
  const { user } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  if (!user) return null;

  const navItems = getNavItemsForRole(user.role);

  return (
    <Sidebar collapsible="icon" className="border-r">
      {/* Logo */}
      <div className="flex items-center px-4 py-5 border-b">
        <div className="flex items-center gap-3 w-full">
          <div className="flex items-center justify-center w-8 h-8 rounded bg-[#1E3A8A] shrink-0">
            <Warehouse className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-900">WMS Pro</span>
              <span className="text-[10px] text-gray-500">Warehouse Management</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <SidebarContent className="py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                // Use startsWith for nested routes, exact for top-level
                const active = item.url.includes("/", 1)
                  ? location.pathname.startsWith(item.url)
                  : location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink
                        to={item.url}
                        end
                        className="flex items-center w-full px-4 py-2.5 text-sm rounded-md transition-colors text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        activeClassName="bg-gray-100 text-[#1E3A8A] font-medium"
                      >
                        <item.icon className={`w-4 h-4 shrink-0 ${active ? "text-[#1E3A8A]" : "text-gray-500"}`} />
                        {!collapsed && (
                          <span className="ml-3 truncate">{item.title}</span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}