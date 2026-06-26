"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useQuery } from "@tanstack/react-query";
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";
import { getItems } from "@/lib/api";
import { useDebounce } from "@/hooks/use-debounce";
import type { SessionUser } from "@/types";

interface PaletteItem {
  id: string;
  name: string;
  code: string;
}

const NAV: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/", label: "แดชบอร์ด" },
  { href: "/items", label: "รายการพัสดุ" },
  { href: "/dispense", label: "เบิก-ยืมพัสดุ" },
  { href: "/receive", label: "รับเข้าพัสดุ" },
  { href: "/alerts", label: "การแจ้งเตือน" },
  { href: "/maintenance", label: "บำรุงรักษา" },
  { href: "/reports", label: "รายงาน" },
  { href: "/settings", label: "ตั้งค่า", adminOnly: true },
];

function isEditable(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

export function CommandPalette({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 250);

  const nav = NAV.filter((n) => !n.adminOnly || user.role === "ADMIN");

  // Global trigger: `/` (Latin layout) or Cmd/Ctrl+K (layout-independent via e.code).
  // Guard: never trigger while typing in a field — keeps Thai IME composition intact.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open) return;
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && (e.key === "k" || e.code === "KeyK")) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "/" && !isEditable(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const { data: results, isFetching } = useQuery({
    queryKey: ["palette", "items", debounced],
    queryFn: async () => {
      const d = await getItems({ q: debounced, limit: "6" });
      return (d.items ?? []) as PaletteItem[];
    },
    enabled: open && debounced.trim().length >= 2,
  });

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  const items = results ?? [];
  const searching = debounced.trim().length >= 2;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 supports-backdrop-filter:backdrop-blur-[2px]" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-[18%] z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none">
          <DialogPrimitive.Title className="sr-only">คำสั่งลัด</DialogPrimitive.Title>
          <Command shouldFilter={false} className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">esc</kbd>
            </div>

            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                {searching && isFetching ? "กำลังค้นหา…" : "ไม่พบผลลัพธ์ — ลองคำอื่น"}
              </Command.Empty>

              <Command.Group heading="นำทาง" className="[&_[cmdk-group-heading]]:px-2 py-1 text-xs font-medium text-muted-foreground">
                {nav.map((n) => (
                  <Command.Item
                    key={n.href}
                    value={`nav-${n.label}`}
                    onSelect={() => go(n.href)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground data-[selected=true]:bg-muted"
                  >
                    <span className="flex-1">{n.label}</span>
                    <CornerDownLeft className="size-3 opacity-0 data-[selected=true]:opacity-60" />
                  </Command.Item>
                ))}
              </Command.Group>

              {searching && (
                <Command.Group heading="พัสดุ" className="[&_[cmdk-group-heading]]:px-2 py-1 text-xs font-medium text-muted-foreground">
                  {items.map((it) => (
                    <Command.Item
                      key={it.id}
                      value={`item-${it.id}-${it.name}`}
                      onSelect={() => go(`/items/${it.id}`)}
                      className="flex cursor-pointer items-baseline gap-2 rounded-lg px-2 py-2 text-sm text-foreground data-[selected=true]:bg-muted"
                    >
                      <span className="font-mono text-[11px] text-muted-foreground">{it.code}</span>
                      <span className="flex-1 truncate">{it.name}</span>
                    </Command.Item>
                  ))}
                  {searching && !isFetching && items.length === 0 && (
                    <p className="px-2 py-2 text-sm text-muted-foreground">ไม่พบพัสดุที่ตรง</p>
                  )}
                </Command.Group>
              )}
            </Command.List>

            <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><ArrowUp className="size-3" /><ArrowDown className="size-3" /> เลื่อน</span>
              <span className="flex items-center gap-1"><CornerDownLeft className="size-3" /> เลือก</span>
              <span className="flex-1" />
              <span>ปิด <kbd className="rounded border border-border bg-muted px-1 text-[10px]">esc</kbd></span>
            </div>
          </Command>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
