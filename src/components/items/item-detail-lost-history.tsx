"use client";

import { useCallback, useState } from "react";
import { fmtDate, TH_DATE, TH_DATETIME, TH_DAY } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, User2, Undo2, X, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getItemHistory, recoverStock } from "@/lib/api";
import { toast } from "sonner";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";
import { effectiveCode } from "@/lib/constants";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface LostEvent {
  id: string;
  type: string;
  date: string;
  user: string;
  details: {
    source?: "PIECE" | "ADJUSTMENT";
    subCode?: string | null;
    qty?: number;
    reason?: string | null;
    notes?: string | null;
    recoveredAt?: string | null;
  };
}

const SOURCE_META: Record<string, { label: string; cls: string }> = {
  PIECE: { label: "ชิ้น", cls: "bg-warning/10 text-warning-700 border-warning/20" },
  ADJUSTMENT: { label: "ปรับสต็อก", cls: "bg-muted text-foreground border-border" },
};

const fmtDT = (s: string) => fmtDate(s, TH_DATETIME);

export function ItemDetailLostHistory({ itemId, itemCode, isMulti, onSuccess }: { itemId: string; itemCode: string; isMulti: boolean; onSuccess?: () => void }) {
  const isMobile = useIsMobile();
  const perPage = PAGE_SIZE.DEFAULT;

  const fetchPage = useCallback(
    async (p: number) => {
      const qs = new URLSearchParams({ page: String(p), perPage: String(perPage), lost: "1" });
      const data = await getItemHistory(itemId, qs.toString());
      return {
        items: (data.events || []) as LostEvent[],
        total: ((data as Record<string, unknown>).total as number) || 0,
      };
    },
    [itemId, perPage],
  );

  const {
    items: events, total, page, totalPages, loading, isLoadingMore, hasNext, loadMore, setPage, refetch,
  } = usePagedList<LostEvent>({ fetchPage, pageSize: perPage, isMobile });

  const [recoverTarget, setRecoverTarget] = useState<LostEvent | null>(null);
  const [recoverNote, setRecoverNote] = useState("");
  const [recovering, setRecovering] = useState(false);
  const closeRecover = () => { setRecoverTarget(null); setRecoverNote(""); };
  const doRecover = async () => {
    if (!recoverTarget) return;
    setRecovering(true);
    try {
      await recoverStock(itemId, { source: recoverTarget.details?.source ?? "PIECE", recordId: recoverTarget.id, note: recoverNote.trim() || undefined });
      toast.success("เรียกคืนแล้ว");
      closeRecover();
      refetch();
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เรียกคืนไม่สำเร็จ");
    } finally {
      setRecovering(false);
    }
  };

  // Row fields derived from the event source.
  const rowOf = (e: LostEvent) => {
    const d = e.details ?? {};
    const src = d.source ?? "PIECE";
    const code = d.subCode ? effectiveCode(itemCode, d.subCode, isMulti ? 99 : 1) : null;
    const qty = src === "ADJUSTMENT" ? d.qty ?? 0 : 1;
    const reason = (src === "PIECE" ? d.reason : d.notes) || "—";
    return { src, code, qty, reason };
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <SectionHeader eyebrow="ความเสียหาย" title="ประวัติสูญหาย" />
        <div className="p-4 sm:p-5 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <SectionHeader eyebrow="ความเสียหาย" title="ประวัติสูญหาย" />

      {events.length === 0 ? (
        <p className="text-center py-10 text-sm text-muted-foreground">ไม่มีประวัติสูญหาย</p>
      ) : isMobile ? (
        <ul className="p-3 space-y-2">
          {events.map((e) => {
            const r = rowOf(e);
            const meta = SOURCE_META[r.src] ?? SOURCE_META.PIECE;
            return (
              <li key={e.id} className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <Badge variant="outline" className={cn("text-[10px]", meta.cls)}>{meta.label}</Badge>
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <CalendarDays className="size-3" />{fmtDT(e.date)}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  {r.code && <span className="font-mono text-sm font-medium truncate">{r.code}</span>}
                  <span className="text-sm font-medium">× {r.qty}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 break-words">{r.reason}</p>
                <p className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                  <User2 className="size-3" /> by {e.user}
                </p>
                <div className="mt-2 flex justify-end">
                  {e.details?.recoveredAt ? (
                    <Badge variant="secondary" className="text-[10px]">เรียกคืนแล้ว</Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setRecoverTarget(e)}><Undo2 className="size-3.5 mr-1" />เรียกคืน</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[170px] text-xs text-muted-foreground">วันที่</TableHead>
              <TableHead className="text-xs text-muted-foreground">รายการ</TableHead>
              <TableHead className="w-[80px] text-right text-xs text-muted-foreground">จำนวน</TableHead>
              <TableHead className="text-xs text-muted-foreground">สาเหตุ/หมายเหตุ</TableHead>
              <TableHead className="w-[160px] text-xs text-muted-foreground">ผู้บันทึก</TableHead>
              <TableHead className="w-[120px] text-right text-xs text-muted-foreground">เรียกคืน</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => {
              const r = rowOf(e);
              const meta = SOURCE_META[r.src] ?? SOURCE_META.PIECE;
              return (
                <TableRow key={e.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDT(e.date)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className={cn("shrink-0 text-[10px]", meta.cls)}>{meta.label}</Badge>
                      {r.code && <span className="font-mono text-xs truncate">{r.code}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{r.qty}</TableCell>
                  <TableCell className="text-xs text-muted-foreground break-words">{r.reason}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.user}</TableCell>
                  <TableCell className="text-right">
                    {e.details?.recoveredAt ? (
                      <Badge variant="secondary" className="text-[10px]">เรียกคืนแล้ว</Badge>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setRecoverTarget(e)}><Undo2 className="size-3.5 mr-1" />เรียกคืน</Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 && (
        <div className="px-4 sm:px-5 border-t border-border">
          <p className="text-xs text-muted-foreground py-1">{total} รายการ</p>
          {isMobile ? (
            <Pagination mode="loadMore" shown={events.length} total={total} hasMore={hasNext} isLoading={isLoadingMore} onLoadMore={loadMore} />
          ) : (
            <Pagination page={page} total={total} pageSize={perPage} onChange={setPage} />
          )}
        </div>
      )}

      <Dialog open={!!recoverTarget} onOpenChange={(o) => { if (!o && !recovering) closeRecover(); }}>
        <DialogContent showCloseButton={false} className="max-w-[calc(100%-2rem)] sm:max-w-[420px] gap-0 overflow-hidden p-0 sm:rounded-2xl">
          <DialogTitle className="sr-only">เรียกคืนของสูญหาย</DialogTitle>
          <DialogDescription className="sr-only">ยืนยันเรียกคืนกลับเป็นพร้อมใช้งาน</DialogDescription>
          <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success-700"><Undo2 className="h-4 w-4" /></div>
              <div><p className="text-base font-semibold text-foreground">เรียกคืนของสูญหาย</p><p className="text-xs text-muted-foreground">กลับเป็นพร้อมใช้งาน</p></div>
            </div>
            <button type="button" disabled={recovering} onClick={() => closeRecover()} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"><X className="h-4 w-4" /></button>
          </div>
          <div className="bg-secondary/40 px-6 py-6 space-y-3">
            {recoverTarget && (() => {
              const r = rowOf(recoverTarget);
              const meta = SOURCE_META[r.src] ?? SOURCE_META.PIECE;
              return (
                <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[10px]", meta.cls)}>{meta.label}</Badge>
                    {r.code && <span className="font-mono text-sm font-medium truncate">{r.code}</span>}
                  </div>
                  <div className="text-sm">จำนวนที่เรียกคืน <span className="font-semibold">{r.qty}</span></div>
                  <div className="text-xs text-muted-foreground">{fmtDT(recoverTarget.date)}</div>
                </div>
              );
            })()}
            <div className="space-y-1.5">
              <Label htmlFor="recover-note" className="text-xs text-muted-foreground">หมายเหตุ (optional)</Label>
              <Textarea id="recover-note" placeholder="เช่น เจอที่ห้องเก่า..." value={recoverNote} onChange={(e) => setRecoverNote(e.target.value)} rows={2} className="bg-card text-sm" disabled={recovering} />
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2 text-xs text-success-700">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>ของจะกลับเข้าสต็อกพร้อมใช้งาน การเรียกคืนบันทึกเข้าประวัติ ไม่สามารถย้อนได้</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-card px-6 py-4">
            <Button variant="outline" onClick={() => closeRecover()} disabled={recovering}>ยกเลิก</Button>
            <Button onClick={() => void doRecover()} disabled={recovering}>
              {recovering && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}ยืนยันเรียกคืน
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div className="px-4 sm:px-5 py-4 border-b border-border">
      {eyebrow && <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{eyebrow}</div>}
      <h2 className="text-lg font-semibold leading-tight mt-0.5 truncate">{title}</h2>
    </div>
  );
}
