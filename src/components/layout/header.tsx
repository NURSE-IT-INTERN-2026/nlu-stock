"use client";

import { useTheme } from "next-themes";
import { useRouter, usePathname } from "next/navigation";
import { Moon, Sun, LogOut, User, Settings, ShoppingBasket, ChevronRight } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/components/dispense/cart-context";
import { logout } from "@/lib/api";
import type { SessionUser } from "@/types";

interface HeaderProps {
  title: string;
  user: SessionUser;
}

function Breadcrumb({ title }: { title: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Build trail from intermediate segments only (skip root)
  const trail = segments.slice(0, -1).map((seg, i, arr) => {
    const href = "/" + arr.slice(0, i + 1).join("/");
    return { label: seg.charAt(0).toUpperCase() + seg.slice(1), href };
  });

  // If no trail, just show the title
  if (trail.length === 0) {
    return (
      <nav className="text-sm min-w-0">
        <span className="font-medium truncate">{title}</span>
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-1 text-sm min-w-0">
      {trail.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground/50" />}
          <a href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors truncate">
            {crumb.label}
          </a>
        </span>
      ))}
      <ChevronRight className="size-3.5 text-muted-foreground/50" />
      <span className="font-medium truncate">{title}</span>
    </nav>
  );
}

export function Header({ title, user }: HeaderProps) {
  const { setTheme, theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { itemCount } = useCart();

  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-6 h-14 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      {/* Left: breadcrumb */}
      <Breadcrumb title={title} />

      {/* Spacer */}
      <span className="flex-1" />

      {/* Right: actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Cart */}
        <button
          onClick={() => router.push("/dispense/confirm")}
          className="relative flex items-center justify-center size-8 rounded-full bg-white hover:bg-gray-50 transition-colors"
        >
          <ShoppingBasket className="size-4" />
          {itemCount > 0 && (
            <Badge
              key={itemCount}
              className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full p-0 flex items-center justify-center text-[9px]"
            >
              {itemCount}
            </Badge>
          )}
        </button>

        {/* Theme */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="relative flex items-center justify-center size-8 rounded-full bg-white hover:bg-gray-50 transition-colors"
        >
          <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </button>

        {/* Avatar gradient pill */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div
              role="button"
              tabIndex={0}
              className="flex items-center gap-2 rounded-full bg-white pl-3 pr-1 py-1 hover:bg-gray-50 transition-all cursor-pointer"
            >
              <div className="hidden sm:flex flex-col items-end min-w-0">
                <p className="text-xs font-medium truncate max-w-[80px] leading-tight">{user.name}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{user.role}</p>
              </div>
              <div className="size-7 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
