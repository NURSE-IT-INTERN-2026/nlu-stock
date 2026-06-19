"use client";

import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Moon, Sun, LogOut, User, Settings, ShoppingBasket, ChevronRight, Bell } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/components/dispense/cart-context";
import { useAlerts } from "@/hooks/use-alerts";
import { logout } from "@/lib/api";
import type { SessionUser } from "@/types";
import { usePageHeader } from "@/components/layout/page-header-context";

interface HeaderProps {
  title: string;
  user: SessionUser;
  sidebarCollapsed?: boolean;
}

const SEGMENT_LABELS: Record<string, string> = {
  items: "รายการพัสดุ",
  dispense: "เบิกพัสดุ",
  receive: "รับพัสดุเข้า",
  reports: "รายงาน",
  settings: "ตั้งค่าระบบ",
  confirm: "ยืนยันการเบิก",
};

function Breadcrumb({ title, detail }: { title: string; detail?: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Build trail from intermediate segments only (skip root)
  const trail = segments.slice(0, -1).map((seg, i, arr) => {
    const href = "/" + arr.slice(0, i + 1).join("/");
    return { label: SEGMENT_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1), href };
  });

  // Final segment: prefer page-supplied detail (e.g. item code) over generic title
  const last = detail ?? title;

  // If no trail, just show the last label
  if (trail.length === 0) {
    return (
      <nav className="text-base min-w-0">
        <span className="font-medium truncate">{last}</span>
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-1 text-base min-w-0">
      {trail.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground/50" />}
          <a href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors truncate">
            {crumb.label}
          </a>
        </span>
      ))}
      <ChevronRight className="size-3.5 text-muted-foreground/50" />
      <span className="font-medium truncate">{last}</span>
    </nav>
  );
}

export function Header({ title, user, sidebarCollapsed }: HeaderProps) {
  const { setTheme, theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { itemCount } = useCart();
  const { detail } = usePageHeader();
  const alerts = useAlerts();

  const alertItems = [
    { count: alerts.lowStock, label: "สต็อกต่ำ", href: "/items?lowStock=true" },
    { count: alerts.nearExpiry, label: "ใกล้หมดอายุ", href: "/items?nearExpiry=true" },
    { count: alerts.overdueMaintenance, label: "เกินกำหนดซ่อม", href: "/items?overdueMaint=true" },
  ].filter((a) => a.count > 0);

  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-6 h-20 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      {/* Left: brand (when sidebar collapsed) + breadcrumb */}
      {sidebarCollapsed && (
        <>
          <Link href="/" className="flex items-center gap-2 shrink-0 mr-1">
            <Image src="/nurse-th.png" alt="NLU Stock" width={32} height={32} className="h-8 w-8 rounded-lg" />
            <span className="font-bold text-lg tracking-tight hidden sm:inline">NLU Stock</span>
          </Link>
          <span className="text-muted-foreground/40 select-none" aria-hidden="true">|</span>
        </>
      )}
      <Breadcrumb title={title} detail={detail} />

      {/* Spacer */}
      <span className="flex-1" />

      {/* Right: actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Alerts */}
        {alerts.total > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="การแจ้งเตือน"
              className="relative flex items-center justify-center size-12 rounded-full border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors max-[425px]:hidden"
            >
              <Bell className="size-5" />
              <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
                {alerts.total > 9 ? "9+" : alerts.total}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-orange-700 dark:text-orange-300">
                  {alerts.total} รายการแจ้งเตือน
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {alertItems.map((a) => (
                  <DropdownMenuItem key={a.href} onClick={() => router.push(a.href)} className="justify-between">
                    <span>{a.label}</span>
                    <span className="font-bold text-orange-600 dark:text-orange-400">{a.count}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Cart */}
        <button
          type="button"
          aria-label="ดูตะกร้า"
          onClick={() => router.push("/dispense/confirm")}
          className="relative flex items-center justify-center size-12 rounded-full border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors max-[425px]:hidden"
        >
          <ShoppingBasket className="size-5" />
          {itemCount > 0 && (
            <Badge
              key={itemCount}
              className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full p-0 flex items-center justify-center text-[10px]"
            >
              {itemCount}
            </Badge>
          )}
        </button>

        {/* Theme */}
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="relative flex items-center justify-center size-12 rounded-full border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors max-[425px]:hidden"
        >
          <Sun className="size-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </button>

        {/* Avatar gradient pill */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div
              role="button"
              tabIndex={0}
              className="flex items-center justify-center gap-2.5 h-12 w-12 sm:w-auto rounded-full border border-border bg-card p-0 sm:pl-4 sm:pr-1.5 sm:py-1 hover:bg-accent transition-all cursor-pointer"
            >
              <div className="hidden sm:flex flex-col items-end min-w-0">
                <p className="text-base font-semibold truncate max-w-[120px] leading-tight">{user.name}</p>
                <p className="text-xs text-muted-foreground leading-tight">{user.role}</p>
              </div>
              <div className="size-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="hidden max-[425px]:block" />
            <DropdownMenuItem className="hidden max-[425px]:flex justify-between" onClick={() => router.push("/dispense/confirm")}>
              <span className="flex items-center"><ShoppingBasket className="mr-2 h-4 w-4" />ตะกร้า</span>
              {itemCount > 0 && <span className="font-bold text-primary">{itemCount}</span>}
            </DropdownMenuItem>
            {alerts.total > 0 && alertItems.map((a) => (
              <DropdownMenuItem key={a.href} className="hidden max-[425px]:flex justify-between" onClick={() => router.push(a.href)}>
                <span className="flex items-center"><Bell className="mr-2 h-4 w-4" />{a.label}</span>
                <span className="font-bold text-orange-600 dark:text-orange-400">{a.count}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="hidden max-[425px]:block" />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
              {theme === "dark" ? "โหมดสว่าง" : "โหมดมืด"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
