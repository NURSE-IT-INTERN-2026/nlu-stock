"use client";

import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Moon, Sun, LogOut, ImageUp, ShoppingBasket, ChevronRight, Bell } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/components/dispense/cart-context";
import { useAlerts } from "@/hooks/use-alerts";
import { logout } from "@/lib/api";
import { ROLE_LABELS, labelFor, type Role } from "@/lib/constants";
import { isSelfBorrower } from "@/lib/roles";
import type { SessionUser } from "@/types";
import { usePageHeader } from "@/components/layout/page-header-context";
import { withBase } from "@/lib/base-path";
import { AvatarDialog } from "@/components/layout/avatar-dialog";

interface HeaderProps {
  title: string;
  user: SessionUser;
  sidebarCollapsed?: boolean;
}

const SEGMENT_LABELS: Record<string, string> = {
  items: "รายการพัสดุ",
  dispense: "เบิก-ยืมพัสดุ",
  receive: "รับเข้า-คืนพัสดุ",
  reports: "รายงาน & สถิติ",
  alerts: "รายการที่ต้องจัดการ",
  settings: "ตั้งค่าระบบ",
  cart: "เบิก-ยืมพัสดุ",
  borrow: "ยืนยันการเบิก-ยืม",
};

function Breadcrumb({ title, detail }: { title: string; detail?: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const labelFor = (seg: string) => SEGMENT_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);

  // Intermediate segments form the trail — skip raw id/dynamic segments without a label.
  const intermediate = segments.slice(0, -1).flatMap((seg, i) =>
    SEGMENT_LABELS[seg]
      ? [{ label: SEGMENT_LABELS[seg], href: "/" + segments.slice(0, i + 1).join("/") }]
      : []
  );
  // On a root-level page that supplies a detail, promote the single segment to a
  // clickable crumb so we render "Page › detail" (e.g. "รายการที่ต้องจัดการ › ทั้งหมด").
  const trail = detail && segments.length === 1
    ? [{ label: labelFor(segments[0]), href: "/" + segments[0] }]
    : intermediate;

  // Final segment: prefer page-supplied detail (e.g. item code, active tab) over generic title
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
          <Link href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors truncate">
            {crumb.label}
          </Link>
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
  const { itemCount } = useCart();
  const { detail } = usePageHeader();
  const alerts = useAlerts();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);

  async function handleLogout() {
    await logout();
    window.location.href = withBase("/login");
  }

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 h-16 sm:h-20 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      {/* Left: brand (when sidebar collapsed) + breadcrumb */}
      {sidebarCollapsed && (
        <>
          <Link href="/" className="flex items-center gap-2 shrink-0 mr-1">
            <Image src={withBase("/nurse-th.png")} alt="NLU Stock" width={40} height={40} className="size-10 rounded-lg" />
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
        {/* Alerts — ซ่อนจาก BORROWER เหมือนที่ sidebar กับ bottom-tab ซ่อน: /alerts ไม่อยู่ใน
            BORROWER_PAGES (src/proxy.ts) คนกดจึงถูกเด้งไป /scan และป้ายตัวเลขก็เป็น 0
            ตลอดอยู่แล้วเพราะ AlertProvider ถูกสร้างด้วย enabled={false} ให้ role นี้ */}
        {!isSelfBorrower(user.role) && (
          <button
            type="button"
            aria-label="รายการที่ต้องจัดการ"
            onClick={() => router.push("/alerts")}
            className="relative hidden lg:flex items-center justify-center size-12 rounded-full border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Bell className="size-5" />
            {alerts.total > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
                {alerts.total}
              </span>
            )}
          </button>
        )}

        {/* Cart */}
        <button
          type="button"
          aria-label="ดูตะกร้า"
          // Same basket, two confirm screens: /cart is the staff form (ผู้รับ, ชุดเบิก,
          // ตั้งใช้ในห้อง) and proxy bounces a borrower off it.
          onClick={() => router.push(isSelfBorrower(user.role) ? "/borrow" : "/cart")}
          className="relative flex items-center justify-center size-12 rounded-full border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ShoppingBasket className="size-5" />
          {itemCount > 0 && (
            <Badge
              key={itemCount}
              className="animate-cart-pop absolute -top-1 -right-1 h-5 min-w-5 rounded-full p-0 flex items-center justify-center text-[10px]"
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
                <p className="text-xs text-muted-foreground leading-tight">{labelFor(ROLE_LABELS, user.role as Role)}</p>
              </div>
              {avatarUrl ? (
                <img src={withBase(avatarUrl)} alt="" className="size-9 sm:size-10 rounded-full object-cover shrink-0" />
              ) : (
                <div className="size-9 sm:size-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
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
            <DropdownMenuItem onClick={() => setAvatarOpen(true)}>
              <ImageUp className="mr-2 h-4 w-4" />
              เปลี่ยนรูปโปรไฟล์
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
              {theme === "dark" ? "โหมดสว่าง" : "โหมดมืด"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              ออกจากระบบ
            </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <AvatarDialog open={avatarOpen} onOpenChange={setAvatarOpen} onSaved={setAvatarUrl} />
      </div>
    </header>
  );
}
