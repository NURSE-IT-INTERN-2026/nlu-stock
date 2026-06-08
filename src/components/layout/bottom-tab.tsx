"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, ShoppingCart, Truck, MoreHorizontal, BarChart3, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import type { SessionUser } from "@/types";
import { useAlerts } from "@/hooks/use-alerts";

const tabs = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/items", label: "Items", icon: Package },
  { href: "/dispense", label: "Dispense", icon: ShoppingCart },
  { href: "/receive", label: "Receive", icon: Truck },
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

  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-card">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const showBadge = tab.href === "/" && alerts.total > 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1.5 text-xs relative",
                isActive(tab.href)
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="h-6 w-6" />
              <span>{tab.label}</span>
              {showBadge && (
                <span className="absolute -top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
                  {alerts.total > 9 ? "9+" : alerts.total}
                </span>
              )}
            </Link>
          );
        })}

        <Sheet>
          <SheetTrigger
            render={(props) => (
              <button {...props} className="flex flex-col items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground">
                <MoreHorizontal className="h-6 w-6" />
                <span>More</span>
              </button>
            )}
          />
          <SheetContent side="bottom" className="h-auto rounded-t-xl">
            <SheetTitle className="sr-only">More menu</SheetTitle>
            <div className="space-y-1 pb-4">
              <Link
                href="/reports"
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent"
              >
                <BarChart3 className="h-4 w-4" />
                Reports
              </Link>
              {user.role === "ADMIN" && (
                <Link
                  href="/settings"
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-destructive hover:bg-accent"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
