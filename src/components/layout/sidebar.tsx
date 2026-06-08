"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/types";
import { useAlerts } from "@/hooks/use-alerts";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/items", label: "All Items", icon: Package },
  { href: "/dispense", label: "Dispense", icon: ShoppingCart },
  { href: "/receive", label: "Receive", icon: Truck },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

interface SidebarProps {
  user: SessionUser;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ user, collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const alerts = useAlerts();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const filteredNav = navItems.filter(
    (item) => !item.adminOnly || user.role === "ADMIN"
  );

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r bg-card text-card-foreground transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo / Toggle */}
      <div className={cn("flex items-center h-16", collapsed ? "justify-center" : "justify-between px-4")}>
        {!collapsed && <span className="font-bold text-lg tracking-tight">NLU Stock</span>}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-md hover:bg-sidebar-accent text-muted-foreground"
        >
          <ChevronLeft
            className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")}
          />
        </button>
      </div>

      {/* Alert bell */}
      {alerts.total > 0 && (
        <Link
          href="/items?lowStock=true"
          title={collapsed ? `${alerts.total} alerts` : undefined}
          className={cn(
            "flex items-center rounded-xl text-sm transition-colors",
            collapsed ? "mx-2 justify-center p-2 relative" : "mx-3 gap-3 px-3 py-2.5",
            "text-orange-600 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/60 hover:bg-orange-100 dark:hover:bg-orange-950/80"
          )}
        >
          <span className="flex items-center justify-center shrink-0 h-8 w-8 rounded-lg bg-orange-200 dark:bg-orange-800/70">
            <Bell className="h-4 w-4 text-orange-600 dark:text-orange-300" />
          </span>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <span className="font-medium">{alerts.total} Alerts</span>
                <div className="text-xs text-orange-500 dark:text-orange-300/80 truncate">
                  {alerts.lowStock > 0 && `${alerts.lowStock} low`}
                  {alerts.lowStock > 0 && alerts.nearExpiry > 0 && " · "}
                  {alerts.nearExpiry > 0 && `${alerts.nearExpiry} exp`}
                  {(alerts.lowStock > 0 || alerts.nearExpiry > 0) && alerts.overdueMaintenance > 0 && " · "}
                  {alerts.overdueMaintenance > 0 && `${alerts.overdueMaintenance} maint`}
                </div>
              </div>
            </>
          )}
          {collapsed && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
              {alerts.total > 9 ? "9+" : alerts.total}
            </span>
          )}
        </Link>
      )}

      {/* Nav */}
      <nav className={cn("flex-1 space-y-1.5 mt-2", collapsed ? "px-2" : "px-3")}>
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-xl text-sm transition-colors",
                collapsed ? "justify-center p-2" : "gap-3 px-3 py-2.5",
                active
                  ? "bg-orange-500 text-white font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center shrink-0",
                  collapsed ? "h-8 w-8" : "h-8 w-8",
                  "rounded-lg",
                  active
                    ? "bg-white/20"
                    : "bg-orange-100 dark:bg-orange-900/30"
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-white" : "text-orange-500 dark:text-orange-400")} />
              </span>
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  <ChevronRight className={cn("h-3.5 w-3.5", active ? "text-white/70" : "text-muted-foreground/40")} />
                </>
              )}
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
