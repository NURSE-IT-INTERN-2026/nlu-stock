"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, ShoppingCart, Truck, MoreHorizontal, Wrench, BarChart3, Settings, LogOut, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { logout } from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import type { SessionUser } from "@/types";
import { useAlerts } from "@/hooks/use-alerts";
import { canManageStock } from "@/lib/roles";

const tabs = [
  { href: "/", label: "หน้าหลัก", icon: LayoutDashboard },
  { href: "/items", label: "พัสดุ", icon: Package },
  { href: "/alerts", label: "แจ้งเตือน", icon: Bell },
  { href: "/dispense", label: "เบิก", icon: ShoppingCart },
  { href: "/receive", label: "รับเข้า", icon: Truck, stockOnly: true },
];

interface BottomTabProps {
  user: SessionUser;
}

export function BottomTab({ user }: BottomTabProps) {
  const pathname = usePathname();
  const alerts = useAlerts();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const canStock = canManageStock(user.role);
  const visibleTabs = tabs.filter((t) => !t.stockOnly || canStock);

  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }

  return (
    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-md px-3 pb-3">
        <div className="flex items-center justify-around rounded-3xl border border-border/60 bg-card/95 px-2 py-2 shadow-[0_-8px_30px_-10px_oklch(0.2_0.04_60/0.15)] backdrop-blur">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.href);
            const showBadge = tab.href === "/alerts" && alerts.total > 0;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "relative flex flex-1 min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-1 text-[11px] transition",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="relative grid size-9 place-items-center rounded-xl">
                  {active && (
                    <motion.span
                      layoutId="bottom-tab-active"
                      transition={{ type: "spring", stiffness: 450, damping: 35 }}
                      className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-primary/60 shadow-sm"
                    />
                  )}
                  <Icon className={cn("relative size-5", active && "text-primary-foreground")} />
                  {showBadge && (
                    <span className="absolute -right-1 -top-1 z-10 grid min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white ring-2 ring-card">
                      {alerts.total}
                    </span>
                  )}
                </span>
                <span className={cn("leading-none whitespace-nowrap", active && "font-semibold")}>{tab.label}</span>
              </Link>
            );
          })}

          <Sheet>
            <SheetTrigger
              render={(props) => (
                <button {...props} className="flex flex-1 min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-1 text-[11px] text-muted-foreground transition hover:text-foreground">
                  <span className="grid size-9 place-items-center rounded-xl">
                    <MoreHorizontal className="size-5" />
                  </span>
                  <span className="leading-none whitespace-nowrap">เพิ่มเติม</span>
                </button>
              )}
            />
            <SheetContent side="bottom" className="h-auto rounded-t-xl">
              <SheetTitle className="sr-only">เมนูเพิ่มเติม</SheetTitle>
              <div className="space-y-1 pb-4">
                {canStock && (
                  <SheetClose
                    nativeButton={false}
                    render={<Link href="/maintenance" className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent" />}
                  >
                    <Wrench className="h-4 w-4" />
                    บำรุงรักษา
                  </SheetClose>
                )}
                <SheetClose
                  nativeButton={false}
                  render={<Link href="/reports" className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent" />}
                >
                  <BarChart3 className="h-4 w-4" />
                  รายงาน
                </SheetClose>
                {user.role === "SUPERADMIN" && (
                  <SheetClose
                    nativeButton={false}
                    render={<Link href="/settings" className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent" />}
                  >
                    <Settings className="h-4 w-4" />
                    ตั้งค่า
                  </SheetClose>
                )}
                <SheetClose
                  render={<button type="button" onClick={handleLogout} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-destructive hover:bg-accent" />}
                >
                  <LogOut className="h-4 w-4" />
                  ออกจากระบบ
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
