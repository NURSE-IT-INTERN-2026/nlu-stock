"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function LoadError({ onRetry, stale = false }: { onRetry: () => void; stale?: boolean }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-card p-4 text-sm">
      <div>
        <p className="font-medium text-foreground">{stale ? "อัปเดตข้อมูลไม่สำเร็จ" : "โหลดข้อมูลไม่สำเร็จ"}</p>
        <p className="mt-1 text-muted-foreground">
          {stale ? "กำลังแสดงข้อมูลเดิม ซึ่งอาจไม่ตรงกับตัวกรองหรือสถานะล่าสุด" : "ยังตรวจสอบรายการไม่ได้ กรุณาลองใหม่"}
        </p>
      </div>
      <Button variant="outline" onClick={onRetry}>ลองใหม่</Button>
    </div>
  );
}

/** Initial failures never render an empty-state claim. Refresh/append failures retain
 * the last successful rows, visibly marked as stale. Hooks own data and retry semantics. */
export function LoadBoundary({ error, onRetry, hasData, loading = false, children }: {
  error: Error | null;
  loading?: boolean;
  onRetry: () => void;
  hasData: boolean;
  children: ReactNode;
}) {
  if (loading && !hasData) return <p role="status" className="p-6 text-muted-foreground">กำลังโหลดข้อมูล…</p>;
  return <>
    {error && <LoadError onRetry={onRetry} stale={hasData} />}
    {(!error || hasData) && children}
  </>;
}
