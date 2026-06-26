"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Wrench,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/types";

const navItems = [
  { href: "/", label: "แดชบอร์ด", icon: LayoutDashboard, hideForChildren: true },
  { href: "/items", label: "รายการพัสดุ", icon: Package },
  { href: "/dispense", label: "เบิก-ยืมพัสดุ", icon: ShoppingCart },
  { href: "/receive", label: "รับเข้าพัสดุ", icon: Truck },
  { href: "/maintenance", label: "บำรุงรักษา", icon: Wrench },
  { href: "/reports", label: "รายงาน & สถิติ", icon: BarChart3 },
  { href: "/settings", label: "ตั้งค่า", icon: Settings, adminOnly: true },
];

interface SidebarProps {
  user: SessionUser;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ user, collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const filteredNav = navItems.filter(
    (item) =>
      (!item.adminOnly || user.role === "ADMIN") &&
      (!item.hideForChildren || user.role !== "CHILDREN")
  );

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col border-r bg-card text-card-foreground transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo / Toggle */}
      <div className={cn("flex items-center h-20", collapsed ? "justify-center" : "justify-between px-4")}>
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2">
            <Image src="/nurse-th.png" alt="NLU Stock" width={32} height={32} className="h-8 w-8 rounded-lg" />
            <span className="font-bold text-lg tracking-tight">NLU Stock</span>
          </Link>
        )}
        <button
          type="button"
          aria-label={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
          onClick={onToggle}
          className="p-1.5 rounded-md hover:bg-sidebar-accent text-muted-foreground"
        >
          {collapsed ? (
            <Menu className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

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
                  ? "bg-orange-500 text-white font-semibold"
                  : "text-sidebar-foreground font-medium hover:bg-sidebar-accent"
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
