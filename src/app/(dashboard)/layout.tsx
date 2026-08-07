"use client";

import React, { useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomTab } from "@/components/layout/bottom-tab";
import { Header } from "@/components/layout/header";
import { useSession } from "@/components/layout/auth-guard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertProvider } from "@/hooks/use-alerts";
import { CartProvider } from "@/components/dispense/cart-context";
import { PageHeaderProvider } from "@/components/layout/page-header-context";

// Pages that manage their own height/scroll (app-shell style) — drop main's vertical padding so they fill the viewport.
const FULL_BLEED = new Set(["/receive", "/items", "/settings", "/alerts"]);

const pageTitles: Record<string, string> = {
  "/": "หน้าหลัก",
  "/items": "รายการพัสดุทั้งหมด",
  "/alerts": "การแจ้งเตือน",
  "/dispense": "เบิก-ยืมพัสดุ",
  "/receive": "รับพัสดุเข้า",
  "/maintenance": "บันทึกการบำรุงรักษา",
  "/reports": "รายงาน",
  "/settings": "ตั้งค่าระบบ",
};

function getTitle(pathname: string) {
  if (pathname.startsWith("/items/") && pathname !== "/items") return "รายละเอียดพัสดุ";
  if (pathname === "/cart") return "เบิก-ยืมพัสดุ";
  return pageTitles[pathname] || "NLU Stock";
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Auto-collapse on tablet (md–xl), expand on desktop (xl+)
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setSidebarCollapsed(!mq.matches);
    const handler = (e: MediaQueryListEvent) => setSidebarCollapsed(!e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), []);

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <Skeleton className="hidden md:block w-72 h-full" />
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  return (
    <AlertProvider>
      <CartProvider>
      <PageHeaderProvider>
        <div className="flex min-h-dvh lg:h-dvh lg:overflow-hidden" style={{ ["--sidebar-w" as string]: sidebarCollapsed ? "4rem" : "16rem" }}>
        <Sidebar
          user={user}
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
        />
        <div className="flex flex-1 flex-col min-w-0">
          <Header title={getTitle(pathname)} user={user} sidebarCollapsed={sidebarCollapsed} />
          <main className={cn(
            "flex-1 px-4 sm:px-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:px-6 lg:pb-6 lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-none",
            // app-shell pages keep mobile fixed-height scroll (their h-full panes need a bounded ancestor).
            // max-h (not h): flex-1 sets flex-basis 0% which makes an explicit height ignored when the flex
            // container's size is indefinite (mobile appshell is min-h-dvh) — main would grow to content and not scroll.
            // max-height clamps the flex-resolved size reliably, so main stays viewport-bound and scrolls internally.
            FULL_BLEED.has(pathname) && "max-h-[calc(100dvh-4rem)] sm:max-h-[calc(100dvh-5rem)] lg:max-h-none overflow-y-auto overflow-x-hidden overscroll-none",
          )}>
            {children}
          </main>
        </div>
        <BottomTab user={user} />
      </div>
      </PageHeaderProvider>
      </CartProvider>
    </AlertProvider>
  );
}
