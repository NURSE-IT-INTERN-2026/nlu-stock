"use client";

import React, { useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomTab } from "@/components/layout/bottom-tab";
import { CommandPalette } from "@/components/layout/command-palette";
import { Header } from "@/components/layout/header";
import { useSession } from "@/components/layout/auth-guard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertProvider } from "@/hooks/use-alerts";
import { CartProvider } from "@/components/dispense/cart-context";
import { PageHeaderProvider } from "@/components/layout/page-header-context";

// Pages that manage their own height/scroll (app-shell style) — drop main's vertical padding so they fill the viewport.
const FULL_BLEED = new Set(["/receive", "/items"]);

const pageTitles: Record<string, string> = {
  "/": "หน้าหลัก",
  "/items": "รายการพัสดุทั้งหมด",
  "/alerts": "การแจ้งเตือน",
  "/dispense": "เบิก-ยืมพัสดุ",
  "/receive": "รับพัสดุเข้า",
  "/maintenance": "การซ่อมบำรุง",
  "/reports": "รายงาน",
  "/settings": "ตั้งค่าระบบ",
};

function getTitle(pathname: string) {
  if (pathname.startsWith("/items/") && pathname !== "/items") return "รายละเอียดพัสดุ";
  if (pathname === "/dispense/cart") return "ยืนยันการเบิก";
  return pageTitles[pathname] || "NLU Stock";
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
      },
    },
  }));

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
    <QueryClientProvider client={queryClient}>
    <AlertProvider>
      <CartProvider>
      <PageHeaderProvider>
        <div className="flex h-screen overflow-hidden">
        <Sidebar
          user={user}
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
        />
        <div className="flex flex-1 flex-col min-w-0">
          <Header title={getTitle(pathname)} user={user} sidebarCollapsed={sidebarCollapsed} />
          <main className={cn(
            "flex-1 overflow-y-auto",
            FULL_BLEED.has(pathname) ? "px-6 pt-3 pb-20 lg:px-6 lg:pb-3" : "p-6 pb-20 lg:pb-6",
          )}>
            {children}
          </main>
        </div>
        <BottomTab user={user} />
        <CommandPalette user={user} />
      </div>
      </PageHeaderProvider>
      </CartProvider>
    </AlertProvider>
    </QueryClientProvider>
  );
}
