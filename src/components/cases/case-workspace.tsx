"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDate, TH_DATE } from "@/lib/format";
import {
  Wrench, ShieldCheck, ShoppingCart, MonitorCog, ClipboardCheck, SearchX, Search, FilterX, ChevronRight,
  CalendarDays, ListFilter, CircleDot, Paperclip, Link2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCases, getCaseDetail, recoverStock, type CaseSummaryJson, type CaseDetailJson, type CaseTotalsJson } from "@/lib/api";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { CASE_TYPE_LABELS, caseRangeOptions, type CaseState, type CaseType } from "@/lib/case-types";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AttachmentList } from "@/components/shared/attachment-list";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ReportDataTable, type Column } from "@/components/reports/report-data-table";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";

// หน้านี้ตอบคำถามเดียว: "งานนี้เกิดอะไรขึ้นบ้าง". ไม่ใช่ feed ของ log — log ทุกบรรทัดอยู่ใต้เคสที่มันเกิด
// เสมอ จึงไม่มีคำถามว่า "บรรทัดนี้ของเคสไหน" ให้ต้องเดา. ที่มาของเคสอยู่ใน src/lib/cases.ts

const TYPE_META: Record<CaseType, { icon: typeof Wrench; tone: string; ring: string }> = {
  REPAIR: { icon: Wrench, tone: "bg-warning/15 text-warning-700 dark:text-warning-200", ring: "bg-warning" },
  MAINTENANCE: { icon: ShieldCheck, tone: "bg-success/10 text-success-700 dark:text-success-200", ring: "bg-success" },
  BORROW: { icon: ShoppingCart, tone: "bg-primary/10 text-primary", ring: "bg-primary" },
  INUSE: { icon: MonitorCog, tone: "bg-info-500/10 text-info-700 dark:text-info-200", ring: "bg-info-500" },
  LOST: { icon: SearchX, tone: "bg-destructive/10 text-destructive dark:text-danger-400", ring: "bg-destructive" },
};

const STATE_TONE: Record<CaseState, string> = {
  OPEN: "bg-warning/15 text-warning-700 dark:text-warning-200",
  DONE: "bg-success/10 text-success-700 dark:text-success-200",
  CANCELLED: "bg-muted text-muted-foreground",
};

const TYPE_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  ...(Object.keys(CASE_TYPE_LABELS) as CaseType[]).map((t) => ({ value: t, label: CASE_TYPE_LABELS[t] })),
];
// โหมดสิ่งที่ต้องทำเสนอเฉพาะประเภทที่โผล่ในนั้นได้จริง — ตัวเลือกที่กดแล้วว่างเปล่าเสมอไม่ใช่ตัวกรอง
const TODO_TYPE_OPTIONS = TYPE_OPTIONS.filter((o) => o.value !== "INUSE");
const STATE_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "OPEN", label: "กำลังดำเนินการ" },
  { value: "DONE", label: "เสร็จสิ้น" },
  { value: "CANCELLED", label: "ยกเลิก" },
];
const RANGE_OPTIONS = caseRangeOptions();

/**
 * เวิร์กสเปซเคส ตัวเดียว สามที่: รายการสิ่งที่ต้องทำของ /alerts, แท็บประวัติของ /maintenance และ
 * ของ /repairs. `lockType` คือความต่างทั้งหมด — หน้าที่ถามคำถามเดียวไม่ต้องมี dropdown ให้เลือก
 * ประเภท และที่สำคัญกว่านั้นคือ ทั้งสามที่อ่านจากที่มาเดียวกัน จึงไม่มีทางเป็น log คนละกองที่ไม่ตรงกัน.
 *
 * หน้าตาเป็นตารางเต็มความกว้าง กดแถวแล้วรายละเอียดเปิดเป็น drawer ทางขวา. เดิมเป็นสองช่อง 1:2 ซึ่ง
 * บังคับให้รายการอยู่ในคอลัมน์ ~341px — กว้างพอสำหรับสี่บรรทัดต่อเคสเท่านั้น รหัสเคสกับผู้แจ้งจึง
 * หล่นหายทั้งที่เป็นสองอย่างที่คนตามงานถามถึงที่สุด. ตารางคืนความกว้างนั้นให้ ส่วนรายละเอียดมาเมื่อ
 * ถูกเรียก แทนที่จะกินครึ่งจอค้างไว้ตลอดเวลาเผื่อว่าจะมีคนอ่าน.
 */
export function CaseWorkspace({ itemId, subItemId, lockType, todo, initialCaseId, compact, canEdit, onTotals }: {
  itemId?: string;
  subItemId?: string;
  lockType?: CaseType;
  /**
   * รายการสิ่งที่ต้องทำ: เฉพาะเคสที่ยังมีคนรออยู่ (isTodo ฝั่ง server). สถานะถูกล็อกไว้เป็น
   * "กำลังดำเนินการ" อยู่แล้ว dropdown สถานะจึงหายไป — ตัวกรองที่มีค่าเดียวให้เลือกไม่ใช่ตัวกรอง.
   */
  todo?: boolean;
  /** เปิดหน้ามาพร้อม drawer ของเคสใบนี้ — ลิงก์จากประวัติของพัสดุชี้มาที่เคสตรงๆ */
  initialCaseId?: string;
  /** Embedded in an item tab: no filter bar — a scoped list of three has nothing to filter. */
  compact?: boolean;
  canEdit?: boolean;
  /** Handed the totals of every fetch, plus the query that produced them, so a caller can head
   *  the list with them and export exactly what is on screen. The workspace itself draws
   *  neither: a list scoped to one พัสดุ has nothing to total and nothing to export. */
  onTotals?: (totals: CaseTotalsJson, query: string) => void;
}) {
  const [type, setType] = useState<string>(lockType ?? "all");
  const [state, setState] = useState("all");
  const [range, setRange] = useState("all");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [cases, setCases] = useState<CaseSummaryJson[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(initialCaseId ?? null);
  // แบ่งหน้าที่ server เพราะตัวแบ่งหน้าอยู่ใต้ตารางให้เห็น — เลข 7 ที่กดได้ต้องพาไปถึงเคสที่ 137 จริง.
  // เดิมขอ 50 ใบรวดแล้วไม่ส่ง page เลย หัวรายการจึงเขียนว่า "137 เคส" ทั้งที่เลื่อนได้แค่ 50.
  const [page, setPage] = useState(1);

  // Held in a ref, not a dependency: callers pass an inline arrow, and a new function identity
  // every render would refire the fetch below forever.
  const onTotalsRef = useRef(onTotals);
  useEffect(() => { onTotalsRef.current = onTotals; });

  // A keystroke per request would put one full case build behind every letter.
  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const dirty = (!lockType && type !== "all") || (!todo && state !== "all") || range !== "all" || !!search;

  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ perPage: String(PAGE_SIZE.DEFAULT), page: String(page) });
    if (type !== "all") p.set("type", type);
    if (state !== "all") p.set("state", state);
    if (range !== "all") p.set("range", range);
    if (search) p.set("q", search);
    if (todo) p.set("todo", "true");
    if (itemId) p.set("itemId", itemId);
    if (subItemId) p.set("subItemId", subItemId);
    (async () => {
      setLoading(true);
      try {
        const data = await getCases(p.toString());
        if (!live) return;
        setCases(data.cases);
        setTotal(data.total);
        onTotalsRef.current?.(data.summary, p.toString());
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [type, state, range, search, todo, itemId, subItemId, page]);

  // ตัวกรองใหม่ = ชุดผลลัพธ์ใหม่ หน้าที่ 4 ของชุดเก่าจึงไม่มีความหมาย และมักว่างเปล่า
  useEffect(() => { setPage(1); }, [type, state, range, search]);

  // Derived, not stored: a selection that the newest filter excludes must not survive as state
  // the user cannot navigate back to — drawer ที่ยังเปิดค้างอยู่บนเคสที่ตารางไม่มีแล้ว คือหน้าจอที่
  // ปิดแล้วหาทางกลับไม่เจอ. ไม่มีการเลือกแถวแรกให้เอง: drawer ที่เด้งขึ้นมาเองตั้งแต่เปิดหน้าคือ
  // แผงที่ทับตารางทั้งที่ยังไม่มีใครกดอะไร.
  const active = useMemo(() => {
    if (selected && cases.some((c) => c.id === selected)) return selected;
    // A deep link from an item's ประวัติ names a case the default filters may not list. Honour it
    // rather than silently dropping the reader on some other case.
    if (selected === initialCaseId && initialCaseId) return initialCaseId;
    return null;
  }, [cases, selected, initialCaseId]);

  const clear = () => { setType(lockType ?? "all"); setState("all"); setRange("all"); setQ(""); };

  return (
    <div className="space-y-4">
      {!compact && <Filters {...{ type, setType, state, setState, range, setRange, dirty, clear, lockType, todo, q, onQ: setQ }} />}
      <p className="text-sm font-semibold">
        รายการเคส <span className="text-muted-foreground tabular-nums">({total} เคส)</span>
      </p>
      {/* ตารางเดิมของหน้ารายงาน: row click + คีย์บอร์ด + สถานะว่าง/กำลังโหลด + เลื่อนแนวนอนบนจอแคบ
          มีครบแล้ว ตารางเจ้าที่สองไม่มีอะไรใหม่ให้. pageSize ต้องเท่า perPage ที่ขอจาก server เพราะ
          ตารางหั่นข้อมูลของตัวเองอีกชั้น — ตัวเลขไม่ตรงกันเมื่อไหร่ แถวท้ายหายเงียบๆ */}
      <ReportDataTable
        columns={CASE_COLUMNS}
        data={cases}
        loading={loading}
        pageSize={PAGE_SIZE.DEFAULT}
        emptyMessage="ไม่มีเคสตามตัวกรองนี้"
        onRowClick={(c) => setSelected(c.id)}
        footer={<Pagination page={page} total={total} pageSize={PAGE_SIZE.DEFAULT} onChange={setPage} loading={loading} unit="เคส" />}
      />
      <Sheet open={!!active} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        {/* ความกว้างชุดเดียวคุมครบทุกจอ — มือถือเต็มจอ, แท็บเล็ตกับเดสก์ท็อป 520px — จึงไม่ต้องมี
            branch isMobile/isTablet ให้ดูแล. 520 ไม่ใช่ 384 เพราะหัวเคสมีสองบรรทัด + ป้ายสองอัน และ
            แท็บสี่อันต่อกันจนเบียด; ไม่ใช่ 768 เพราะ drawer ที่กินครึ่งจอ 1440px ก็คือสองช่องแบบเดิม
            ที่เพิ่งเลิกใช้. ทางแก้คือขยายแผง ไม่ใช่หดฟอนต์ — ข้อมูลครบบนแผงที่อ่านแล้วล้าไม่ได้แก้อะไร.

            prefix ต้องเป็น data-[side=right]:sm: ให้ตรงกับ default ของ SheetContent เป๊ะ ไม่งั้น
            tailwind-merge มองเป็นคนละคีย์แล้วปล่อยรอดมาทั้งคู่ จากนั้น attribute selector ก็ชนะ plain
            class ทุกครั้ง — แผงจะค้างที่ max-w-sm เงียบๆ. กับดักเดียวกับคอมเมนต์เรื่อง h-auto ใน
            src/components/ui/sheet.tsx */}
        <SheetContent
          side="right"
          className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]"
          showCloseButton={false}
        >
          {/* ปุ่มปิดสำเร็จรูปของ Sheet เป็น absolute top-3 right-3 ซึ่งตกลงมาทับปุ่มลงมือบนหัวเคสพอดี.
              แถบหัวของตัวเองถูกกว่าการยัด padding ข้ามคอมโพเนนต์ไปเว้นที่ให้ปุ่มที่ CaseDetailPane
              ไม่รู้ว่ามีอยู่. */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
            <SheetTitle className="text-sm font-semibold">รายละเอียดเคส</SheetTitle>
            <SheetClose render={<Button variant="ghost" size="icon-sm" />}>
              <X className="size-4" />
              <span className="sr-only">ปิด</span>
            </SheetClose>
          </div>
          <SheetDescription className="sr-only">ไทม์ไลน์ รายละเอียด หลักฐาน และเคสที่เกี่ยวข้องของเคสที่เลือก</SheetDescription>
          {/* min-h-0 คู่กับ flex-1: flex child ที่ basis 0% ในพ่อที่สูงไม่แน่นอนจะไม่ยอมหด แล้วไทม์ไลน์
              ยาวๆ จะดันแผงทะลุจอแทนที่จะเลื่อนอยู่ข้างใน */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {active && <CaseDetailPane bare caseId={active} onOpenCase={setSelected} canEdit={canEdit} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Filters({ type, setType, state, setState, range, setRange, dirty, clear, lockType, todo, q, onQ }: {
  type: string; setType: (v: string) => void;
  state: string; setState: (v: string) => void;
  range: string; setRange: (v: string) => void;
  dirty: boolean; clear: () => void;
  lockType?: CaseType;
  todo?: boolean;
  /** โหมดตาราง: ช่องค้นหาย้ายมาอยู่กับตัวกรองตัวอื่น เพราะหัวการ์ดที่เคยถือมันไว้ไม่มีแล้ว */
  q?: string; onQ?: (v: string) => void;
}) {
  const typeOptions = todo ? TODO_TYPE_OPTIONS : TYPE_OPTIONS;
  const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? "";
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
      {/* A page that asks one question offers no way to ask another — the ประเภทเคส picker only
          appears where more than one type can show up. */}
      {!lockType && (
        <Field label="ประเภทเคส">
          <FilterSelect icon={ListFilter} value={type} onValueChange={setType} selectedLabel={label(typeOptions, type)}>
            {typeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </FilterSelect>
        </Field>
      )}
      {!todo && (
        <Field label="สถานะ">
          <FilterSelect icon={CircleDot} value={state} onValueChange={setState} selectedLabel={label(STATE_OPTIONS, state)}>
            {STATE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </FilterSelect>
        </Field>
      )}
      <Field label="ช่วงเวลา">
        <FilterSelect icon={CalendarDays} value={range} onValueChange={setRange} selectedLabel={label(RANGE_OPTIONS, range)}>
          {RANGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </FilterSelect>
      </Field>
      {onQ && (
        <Field label="ค้นหา">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q ?? ""}
              onChange={(e) => onQ(e.target.value)}
              placeholder="ค้นหาเคส / รหัส / พัสดุ…"
              className="h-9 rounded-lg pl-8 sm:w-[240px]"
            />
          </div>
        </Field>
      )}
      {dirty && (
        <Button variant="outline" className="ml-auto gap-1.5" onClick={clear}>
          <FilterX className="size-4" /> ล้างตัวกรอง
        </Button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[150px] flex-1 sm:flex-none">
      <p className="mb-1.5 text-[11px] text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function FilterSelect({ icon: Icon, value, onValueChange, selectedLabel, children }: {
  icon: typeof Wrench;
  value: string;
  onValueChange: (v: string) => void;
  selectedLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange((v as string) ?? "all")}>
      <SelectTrigger className="h-9 w-full gap-2 rounded-lg border-border bg-background sm:w-[190px]">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        {/* Base UI Select.Value falls back to the raw value when the popup is unmounted — the
            label has to be passed in. Same as every other select in the app. */}
        <SelectValue>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

// ── รายการเคส ─────────────────────────────────────────────────────────────────
function StatePill({ c }: { c: CaseSummaryJson }) {
  return (
    // จุดนำหน้าเหมือนกับป้ายสถานะบนหัวเคส — ทึบ+จุด แปลว่าสถานะ ทั้งในรายการและในเคส
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap", STATE_TONE[c.state])}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {c.statusLabel}
    </span>
  );
}

// ── ตารางเคส (โหมด drawer) ────────────────────────────────────────────────────
// คิวงานอ่านแบบกวาดสายตาเทียบกันทีละคอลัมน์ ซึ่งการ์ดสี่บรรทัดในคอลัมน์ ~341px ทำไม่ได้ — มันใส่ได้
// แค่ประเภท/เรื่อง/พัสดุ/วันที่ ส่วนผู้แจ้งกับรหัสเคสหล่นหายไปทั้งที่เป็นสองอย่างที่คนตามงานถามถึงที่สุด.
//
// nowrap เป็นค่าตั้งต้นของ TableCell ซึ่งถูกกับคอลัมน์ที่ขาดกลางคำไม่ได้ — รหัสเคส, สถานะ, ประเภท,
// วันที่ — แต่พอเจ็ดคอลัมน์ nowrap พร้อมกัน ความกว้างรวมทะลุ 1440px แล้วคอลัมน์อัปเดตโดนขอบตัดเป็น
// "24 ส.ค. 256" ทั้งที่ยังไม่มี drawer เปิดด้วยซ้ำ. ทางออกไม่ใช่หดฟอนต์หรือบีบทุกคอลัมน์ให้พอดีจอ —
// ตารางนี้มีไว้สแกน — แต่คือปล่อยสามคอลัมน์ที่เป็นประโยคให้ห่อบรรทัดได้ แล้วมันจะดูดส่วนเกินไปเอง
// ก่อนที่คอลัมน์ที่ขาดไม่ได้จะโดนเบียด. min-w กันไม่ให้ห่อจนเหลือคำละบรรทัด — "ตรวจเช็คตามรอบ
// ประจำปี" ซึ่งเป็นเรื่องที่ซ้ำบ่อยที่สุด วัดได้ 186px จึงห่อทิ้ง "ปี" ไว้บรรทัดล่างลำพังที่ 150 และ 170. ผู้แจ้งกลับไป nowrap หลังลองแล้ว: มันเป็น
// คอลัมน์ที่ห่อง่ายที่สุด เบราว์เซอร์จึงเลือกมันก่อนเสมอ แล้ว "Admin User" กลายเป็นสองบรรทัดทุกแถว
// ทั้งตาราง — ความสูงแถวคูณสอง แลกกับที่ว่างไม่กี่สิบพิกเซล
const CASE_COLUMNS: Column<CaseSummaryJson>[] = [
  {
    key: "type",
    header: "ประเภท",
    render: (c) => {
      const { icon: Icon, tone } = TYPE_META[c.type];
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("grid size-5 shrink-0 place-items-center rounded", tone)}>
            <Icon className="size-3" />
          </span>
          {CASE_TYPE_LABELS[c.type]}
        </span>
      );
    },
  },
  { key: "code", header: "รหัสเคส", className: "font-mono text-xs", render: (c) => c.code },
  { key: "subject", header: "เรื่อง", className: "min-w-[190px] font-medium whitespace-normal", render: (c) => c.subject },
  {
    key: "title",
    header: "พัสดุ",
    className: "min-w-[200px] whitespace-normal",
    render: (c) => `${c.title}${c.qty != null ? ` · ${c.qty} ${c.unit}` : ""}`,
  },
  { key: "state", header: "สถานะ", render: (c) => <StatePill c={c} /> },
  { key: "openedBy", header: "ผู้แจ้ง", className: "text-muted-foreground", render: (c) => c.openedBy || "—" },
  {
    key: "updatedAt",
    header: "อัปเดต",
    className: "tabular-nums text-muted-foreground",
    render: (c) => fmtDate(c.updatedAt, TH_DATE),
  },
];

// ── รายละเอียดเคส ─────────────────────────────────────────────────────────────
const DETAIL_TABS = [
  { value: "timeline", label: "ไทม์ไลน์" },
  { value: "info", label: "รายละเอียด" },
  // "หลักฐาน" not "เอกสาร": เอกสาร now means the ใบเบิก a case came out of, which is a
  // different thing and lives under รายละเอียด.
  { value: "files", label: "หลักฐาน" },
  { value: "related", label: "เกี่ยวข้อง" },
] as const;

type DetailTab = (typeof DETAIL_TABS)[number]["value"];

/**
 * รายละเอียดเคสหนึ่งใบ. Exported เพราะประวัติของพัสดุเปิดเคสด้วยตัวนี้เหมือนกัน — คนละหน้า แต่ต้อง
 * เป็นเคสใบเดียวกันที่หน้าตาเหมือนกันเป๊ะ ไม่ใช่ของสองอันที่ค่อยๆ เพี้ยนออกจากกัน.
 */
export function CaseDetailPane({ caseId, onOpenCase, canEdit, bare }: {
  caseId: string;
  onOpenCase: (id: string) => void;
  canEdit?: boolean;
  /** อยู่ใน Sheet แล้ว: การ์ดซ้อนในแผงคือเส้นขอบสองชั้นที่ไม่ได้แบ่งอะไรเพิ่ม */
  bare?: boolean;
}) {
  const [data, setData] = useState<CaseDetailJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DetailTab>("timeline");
  const [acting, setActing] = useState(false);
  const [note, setNote] = useState("");
  const [askAction, setAskAction] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // แนบเพิ่ม/ลบ answers with the record's array as it stands. Keyed by the record, not by the
  // step, so an edit survives switching tabs without refetching the whole case.
  const [edited, setEdited] = useState<Record<string, string[]>>({});
  const shell = bare ? "" : "rounded-2xl border border-border bg-card";

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      // Back to the timeline on every case: the tab a reader left open on the last case says
      // nothing about the one they just picked.
      setTab("timeline");
      try {
        const d = await getCaseDetail(caseId);
        if (live) setData(d);
      } catch {
        if (live) setData(null);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [caseId, reloadKey]);

  const attach: AttachProps = {
    canEdit: !!canEdit,
    edited,
    onEdited: (key, urls) => setEdited((m) => ({ ...m, [key]: urls })),
  };
  const fileCount = useMemo(
    () => data?.attachments.reduce((n, a) => n + (edited[attachKey(a)] ?? a.urls).length, 0) ?? 0,
    [data, edited],
  );

  if (loading) {
    return (
      <section className={cn("space-y-3 p-5", shell)}>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </section>
    );
  }
  if (!data) {
    return (
      <section className={cn("grid place-items-center py-24", shell)}>
        <p className="text-sm text-muted-foreground">ไม่พบเคสนี้</p>
      </section>
    );
  }

  const meta = TYPE_META[data.type];
  const Icon = meta.icon;

  return (
    <div>
      <section className={cn("overflow-hidden", shell)}>
        <header className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-b border-border px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", meta.tone)}>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            {/* ป้ายสองอันนี้ตอบคนละคำถาม — "นี่งานอะไร" กับ "ไปถึงไหนแล้ว" — จึงต้องแยกด้วยรูปทรง
                ไม่ใช่แค่สี: ป้ายทึบเหมือนกันสองอันทำให้สีอ่านเหมือนเป็นหมวดหมู่ทั้งคู่ แล้วคนอ่าน
                ต้องจำเอาเองว่าอันซ้ายแปลว่าอะไร. กฎที่ได้: เส้นขอบ+ไอคอน = ประเภท, ทึบ+จุด = สถานะ.
                ประเภทจึงไม่ถือสีของตัวเองที่นี่ (ไอคอนก้อนใหญ่ซ้ายมือถือไว้แล้ว) — สีในแถวนี้
                เหลือความหมายเดียวคือเคสจบหรือยัง. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                <Icon className="size-3" />
                {CASE_TYPE_LABELS[data.type]}
              </span>
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold", STATE_TONE[data.state])}>
                <span aria-hidden className="size-1.5 rounded-full bg-current" />
                {data.statusLabel}
              </span>
            </div>
            {/* The subject is the heading; the code sits with the other reference numbers below
                it. Someone opening a case wants to know what it is about, then quote its number. */}
            <h2 className="mt-1 text-lg font-semibold leading-tight tracking-tight">{data.subject}</h2>
            {/* line-clamp-2 ไม่ใช่ truncate: ชื่อพัสดุยาวๆ อย่าง "เครื่องควบคุมการให้สารละลายทาง
                หลอดเลือดดำโดยใช้กระบอกฉีดยา" ไม่มีทางพอบรรทัดเดียวไม่ว่าแผงจะกว้างแค่ไหน หัวเคสจึง
                ตัดคำตอบของ "เคสนี้เรื่องของชิ้นไหน" ทิ้งทุกครั้ง ทั้งที่ชื่อเต็มนอนอยู่ในแท็บรายละเอียด
                ห่างไปคลิกเดียว. สองบรรทัดพอสำหรับชื่อที่ยาวที่สุดในคลัง และยังกันหัวเคสไม่ให้ยืดจน
                ไทม์ไลน์ถูกดันตกจอ */}
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
              {data.title}{data.qty != null ? ` · ${data.qty} ${data.unit}` : ""}
            </p>
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              {data.code} · {data.itemCode}{data.subCode ? `-${data.subCode}` : ""}
            </p>
          </div>
          {/* ปุ่มปิดเคสอยู่บนเคส เฉพาะงานที่ไม่มีหน้างานของตัวเอง — ดู CaseAction ใน lib/cases.ts */}
          {data.action && canEdit && (
            <Button className="col-start-2 mt-2 w-fit gap-1.5 sm:col-start-3 sm:row-start-1 sm:mt-0" onClick={() => setAskAction(true)}>
              <ClipboardCheck className="size-4" /> {data.action.label}
            </Button>
          )}
        </header>

        <div className="flex gap-1 overflow-x-auto border-b border-border bg-muted/30 px-3">
          {DETAIL_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                "relative shrink-0 px-3 py-2.5 text-sm font-medium transition",
                tab === t.value ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.value === "files" && fileCount > 0 && (
                <span className="ml-1.5 text-[11px] tabular-nums text-muted-foreground">{fileCount}</span>
              )}
              {t.value === "related" && data.related.length > 0 && (
                <span className="ml-1.5 text-[11px] tabular-nums text-muted-foreground">{data.related.length}</span>
              )}
              {tab === t.value && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "timeline" && <Timeline steps={data.steps} tone={meta.ring} attach={attach} />}
          {tab === "info" && <InfoTab data={data} onOpenCase={onOpenCase} />}
          {tab === "files" && <FilesTab data={data} attach={attach} />}
          {tab === "related" && <RelatedTab data={data} onOpenCase={onOpenCase} />}
        </div>
      </section>

      <Dialog open={askAction} onOpenChange={(o) => { if (!o) { setAskAction(false); setNote(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{data.action?.label}</DialogTitle>
            <DialogDescription>
              {data.action ? ACTION_COPY[data.action.kind].hint : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="บันทึกเพิ่มเติม (ไม่บังคับ)"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setAskAction(false); setNote(""); }}>ยกเลิก</Button>
              <Button
                disabled={acting}
                onClick={async () => {
                  if (!data.action) return;
                  setActing(true);
                  try {
                    await runCaseAction(data.action, note.trim() || undefined);
                    toast.success(ACTION_COPY[data.action.kind].done);
                    setAskAction(false);
                    setNote("");
                    setReloadKey((k) => k + 1);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "ยืนยันไม่สำเร็จ");
                  } finally {
                    setActing(false);
                  }
                }}
              >
                {acting ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
                ยืนยัน
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── ไทม์ไลน์ ──────────────────────────────────────────────────────────────────
// ขั้นที่ยังไม่ถึงก็แสดง เป็นวงกลมโปร่งไม่มีเวลา — เคสซ่อมที่ "แจ้งแล้วแต่ยังไม่ส่ง" ถูกนิยามด้วย
// ขั้นที่ยังไม่เกิด การซ่อนมันไว้คือการซ่อนคำตอบ. ส่วน "รอส่งซ่อม" ไม่มี timestamp ของตัวเอง
// (มันคือ repairSentAt = null) จึงเป็นป้ายบนเส้นเชื่อม ไม่ใช่จุด — เขียนเป็นจุดเมื่อไหร่ก็ต้องกุเวลา.
const ACTION_COPY: Record<"RECOVER", { hint: string; done: string }> = {
  RECOVER: {
    hint: "ของที่แจ้งหายไว้หาเจอแล้ว กดยืนยันเพื่อคืนเข้าคลัง — ยอดจะกลับมาและเคสนี้จะปิด",
    done: "เรียกคืนแล้ว — ของกลับเข้าคลัง",
  },
};

/** ปุ่มบนเคสเรียก API เดิมของงานนั้น ไม่ได้เขียน logic ปิดเคสขึ้นมาใหม่อีกชุด. */
function runCaseAction(action: NonNullable<CaseDetailJson["action"]>, note?: string) {
  const [source, recordId, itemId] = action.targetId.split(":");
  return recoverStock(itemId, { source: source as "PIECE" | "ADJUSTMENT", recordId, note });
}

type AttachProps = {
  canEdit: boolean;
  edited: Record<string, string[]>;
  onEdited: (key: string, urls: string[]) => void;
};

const attachKey = (a: { recordType: string; recordId: string }) => `${a.recordType}:${a.recordId}`;

function CaseAttachments({ groups, attach }: {
  groups: CaseDetailJson["attachments"];
  attach: AttachProps;
}) {
  return (
    <div className="space-y-1.5">
      {groups.map((a) => {
        const key = attachKey(a);
        const urls = attach.edited[key] ?? a.urls;
        if (!urls.length && !attach.canEdit) return null;
        return (
          <AttachmentList
            key={key}
            urls={urls}
            target={a}
            canEdit={attach.canEdit}
            onChange={(next) => attach.onEdited(key, next)}
          />
        );
      })}
    </div>
  );
}

function Timeline({ steps, tone, attach }: { steps: CaseDetailJson["steps"]; tone: string; attach: AttachProps }) {
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => {
        const pending = !s.at;
        const last = i === steps.length - 1;
        return (
          <li key={s.key} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4">
            <div className="flex flex-col items-center">
              <span
                aria-hidden
                className={cn(
                  "mt-1.5 size-3 shrink-0 rounded-full",
                  pending ? "border-2 border-dashed border-muted-foreground/50 bg-card" : tone,
                )}
              />
              {!last && <span aria-hidden className="w-px flex-1 bg-border" />}
            </div>
            <div className={cn("min-w-0", last ? "pb-0" : "pb-5")}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className={cn("text-sm font-semibold", pending && "text-muted-foreground")}>{s.label}</p>
                <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {s.at ? `${fmtDate(s.at, TH_DATE)} · ${timeOf(s.at)} น.` : "ยังไม่ถึงขั้นนี้"}
                </p>
              </div>
              {s.detail && <p className="mt-0.5 text-sm text-muted-foreground">{s.detail}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {s.by && <span>โดย {s.by}</span>}
                {s.cost != null && <span className="tabular-nums">฿{s.cost.toLocaleString("th-TH")}</span>}
              </div>
              {s.attachments.length > 0 && (
                <div className="mt-2">
                  <CaseAttachments groups={s.attachments} attach={attach} />
                </div>
              )}
              {s.waiting && (
                <p className="mt-2 inline-flex rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                  {s.waiting}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });

function InfoTab({ data, onOpenCase }: { data: CaseDetailJson; onOpenCase: (id: string) => void }) {
  return (
    <div className="space-y-6">
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {data.fields.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className="mt-0.5 break-words text-sm font-medium">{f.value}</dd>
          </div>
        ))}
      </dl>

      {data.document && <DocumentBlock doc={data.document} currentId={data.id} onOpenCase={onOpenCase} />}
    </div>
  );
}

/**
 * เอกสารต้นทางของเคสนี้ — ใบเบิก/ยืมใบเดียวที่จ่ายของออกหลายรายการ.
 *
 * นี่คือที่ที่ตอบว่า "ใบนี้มีอะไรอีกบ้าง" โดยไม่ต้องเอาของอีกเก้ารายการมาปนอยู่ในเคสของชามรูปไต:
 * แต่ละบรรทัดมีเคสของตัวเอง มีสถานะของตัวเอง กดข้ามไปได้. บรรทัดเบิกใช้ไม่มีเคส จึงกดไม่ได้ —
 * ของสิ้นเปลืองออกไปแล้วไม่กลับ ไม่มีอะไรให้ติดตาม.
 */
function DocumentBlock({ doc, currentId, onOpenCase }: {
  doc: NonNullable<CaseDetailJson["document"]>;
  currentId: string;
  onOpenCase: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 flex flex-wrap items-baseline gap-x-2 text-[11px] uppercase tracking-widest text-muted-foreground">
        เอกสารต้นทาง
        <span className="font-mono normal-case tracking-normal text-foreground">{doc.code}</span>
        <span className="normal-case tracking-normal">
          {fmtDate(doc.at, TH_DATE)} · {doc.by} · {doc.lines.length} รายการ
        </span>
      </p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {doc.lines.map((l) => {
          const isCurrent = l.caseId === currentId;
          const clickable = !!l.caseId && !isCurrent;
          return (
            <li key={l.itemId + (l.subCode ?? "") + l.kind}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => l.caseId && onOpenCase(l.caseId)}
                className={cn(
                  "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left transition",
                  isCurrent && "bg-primary/5",
                  clickable && "hover:bg-muted/40",
                )}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{l.name}</span>
                    {isCurrent && <span className="shrink-0 text-[10px] font-semibold text-primary">เคสนี้</span>}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {l.itemCode}{l.subCode ? `-${l.subCode}` : ""} · {l.kind}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm tabular-nums">{l.qty} {l.unit}</span>
                  <span className={cn(
                    "block text-[11px] font-medium",
                    l.statusLabel.startsWith("ค้าง")
                      ? "text-warning-700 dark:text-warning-200"
                      : "text-muted-foreground",
                  )}>
                    {l.statusLabel}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FilesTab({ data, attach }: { data: CaseDetailJson; attach: AttachProps }) {
  const groups = data.attachments.filter((a) => (attach.edited[attachKey(a)] ?? a.urls).length > 0);
  if (!groups.length) return <p className="py-10 text-center text-sm text-muted-foreground">ยังไม่มีเอกสารหรือรูปภาพในเคสนี้</p>;
  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const step = data.steps.find((s) => s.attachments.some((a) => a.recordId === g.recordId && a.recordType === g.recordType));
        return (
          <div key={`${g.recordType}:${g.recordId}`}>
            <p className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Paperclip className="size-3" />
              {/* หลักฐานทุกไฟล์บอกได้ว่ามาจากขั้นไหนของเคส — นั่นคือทั้งหมดที่หน้านี้มีไว้แก้. */}
              จากขั้น “{step?.label ?? "ไม่ทราบขั้นตอน"}”
              {step?.at ? ` · ${fmtDate(step.at, TH_DATE)}` : ""}
            </p>
            <CaseAttachments groups={[g]} attach={attach} />
          </div>
        );
      })}
    </div>
  );
}

function RelatedTab({ data, onOpenCase }: { data: CaseDetailJson; onOpenCase: (id: string) => void }) {
  if (!data.related.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">ไม่มีเคสอื่นที่เกี่ยวข้อง</p>;
  }
  return (
    <ul className="space-y-2">
      {data.related.map((r) => {
        const meta = TYPE_META[r.type];
        const Icon = meta.icon;
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpenCase(r.id)}
              className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border p-3 text-left transition hover:border-primary/40 hover:bg-muted/40"
            >
              <span className={cn("grid size-9 place-items-center rounded-lg", meta.tone)}>
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-mono text-sm font-semibold">
                  <Link2 className="size-3.5 text-muted-foreground" />{r.code}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{r.note}</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
