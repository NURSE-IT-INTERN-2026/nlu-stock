"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomTab } from "@/components/layout/bottom-tab";
import { Header } from "@/components/layout/header";
import { useSession } from "@/components/layout/auth-guard";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertProvider } from "@/hooks/use-alerts";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/items": "All Items",
  "/dispense": "Dispense",
  "/receive": "Receive",
  "/reports": "Reports",
  "/settings": "Settings",
};

function getTitle(pathname: string) {
  if (pathname.startsWith("/items/") && pathname !== "/items") return "Item Detail";
  return pageTitles[pathname] || "NLU Stock";
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <Skeleton className="hidden md:block w-56 h-full" />
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
      <div className="flex min-h-screen">
        <Sidebar
          user={user}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <div className="flex flex-1 flex-col min-w-0">
          <Header title={getTitle(pathname)} user={user} />
          <main className="flex-1 overflow-auto p-6 pb-20 md:pb-6">
            {children}
          </main>
        </div>
        <BottomTab user={user} />
      </div>
    </AlertProvider>
  );
}
