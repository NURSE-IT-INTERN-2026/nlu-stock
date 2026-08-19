"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  ReportFilters, defaultDateFilters, periodLabel,
  type FilterValues, type FilterConfig,
} from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ReportSummary, type SummaryStat } from "./report-summary";
import { ExportButtons } from "./export-buttons";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wrench } from "lucide-react";
import { SectionTitle, chipStyle, type Token } from "./report-kit";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";
import { fmtDate, TH_DATE } from "@/lib/format";
import { getReport } from "@/lib/api";
import {
  STATUS_LABELS, STATUS_VARIANTS, MAINT_RESULT_LABELS, labelFor, effectiveCode,
  type ItemStatus, type MaintenanceResult,
} from "@/lib/constants";

const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const venue = (v: "INTERNAL" | "EXTERNAL" | null) =>
  v ? (v === "EXTERNAL" ? "ภายนอก" : "ภายใน") : "—";

// ── ชำรุด / ตัดจำหน่าย — สถานะของพัสดุ ──────────────────────────────────────────

interface DamageRow {
  id: string;
  code: string;
  name: string;
  status: ItemStatus;
  categoryName: string;
  location: string;
  reason: string;
  repairVenue: "INTERNAL" | "EXTERNAL" | null;
  value: number | null;
  /** true = ราคาจากใบรับเข้าของชิ้นนั้นเอง (ยอดที่จ่ายจริง); false = ราคาเฉลี่ยของรายการ (ประมาณการ) */
  valueExact: boolean;
  changedAt: string;
}

interface DamageSummary {
  damaged: number;
  underRepair: number;
  writtenOff: number;
  disposed: number;
  lost: number;
  writtenOffValue: number;
  pricedWriteOffs: number;
  unpricedWriteOffs: number;
  exactWriteOffs: number;
}

const dateCol: Column<DamageRow> = {
  key: "changedAt",
  header: "แจ้งเมื่อ",
  // แถวที่ไม่มี statusLog (ของที่ import เข้ามาพร้อมสถานะชำรุด) ไม่มีวันที่ให้แสดง
  render: (r) => (r.changedAt ? fmtDate(new Date(r.changedAt), TH_DATE) : "—"),
};

// /alerts และ /items ตอบได้แล้วว่า "ชิ้นไหนพังอยู่ตอนนี้" — ส่วนนี้จึงเป็นประวัติย้อนหลัง:
// ช่วงที่เลือกมีอะไรพังบ้าง พังเพราะอะไร ส่งซ่อมในหรือนอก. คอลัมน์เรียงตามลำดับนั้น.
const damagedColumns: Column<DamageRow>[] = [
  dateCol,
  { key: "code", header: "รหัสพัสดุ" },
  { key: "name", header: "รายการพัสดุ" },
  { key: "reason", header: "เหตุผล", render: (r) => r.reason || "—" },
  { key: "repairVenue", header: "ส่งซ่อมที่", render: (r) => venue(r.repairVenue) },
  { key: "categoryName", header: "หมวดหมู่" },
  { key: "location", header: "สถานที่", render: (r) => r.location || "—" },
];

const writeOffColumns: Column<DamageRow>[] = [
  { ...dateCol, header: "ตัดออกเมื่อ" },
  { key: "code", header: "รหัสพัสดุ" },
  { key: "name", header: "รายการพัสดุ" },
  {
    key: "status",
    header: "สถานะ",
    render: (r) => <Badge variant={STATUS_VARIANTS[r.status] ?? "default"}>{STATUS_LABELS[r.status] ?? r.status}</Badge>,
  },
  { key: "reason", header: "เหตุผล", render: (r) => r.reason || "—" },
  {
    key: "value",
    header: "มูลค่าที่เสียไป",
    className: "text-right",
    // ≈ = ราคาเฉลี่ยของรายการ ไม่ใช่ยอดที่จ่ายจริงของชิ้นนี้ — ชิ้นที่ผูกใบรับเข้าไว้แสดงตัวเลขเปล่า
    render: (r) => (r.value === null ? "—" : r.valueExact ? baht(r.value) : `≈ ${baht(r.value)}`),
  },
  { key: "categoryName", header: "หมวดหมู่" },
];

function DamageSection({
  statuses, token, columns, empty, stats,
}: {
  statuses: string;
  token: Token;
  columns: Column<DamageRow>[];
  empty: string;
  stats: (s: DamageSummary, f: FilterValues) => SummaryStat[];
}) {
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<FilterValues>(defaultDateFilters);
  const [summary, setSummary] = useState<DamageSummary | null>(null);
  const perPage = PAGE_SIZE.DEFAULT;

  const fetchPage = useCallback(async (p: number) => {
    const params: Record<string, string> = { page: String(p), perPage: String(perPage), status: statuses };
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    const json = (await getReport("damaged-assets", params)) as {
      items: DamageRow[]; total: number; summary: DamageSummary;
    };
    setSummary(json.summary);
    return { items: json.items, total: json.total };
  }, [filters, perPage, statuses]);

  const {
    items: data, total, page, totalPages, loading, isLoadingMore, hasNext, loadMore, setPage,
  } = usePagedList<DamageRow>({ fetchPage, pageSize: perPage, isMobile });

  return (
    <>
      <ReportFilters
        config={{ dateRange: true } satisfies FilterConfig}
        values={filters}
        onChange={setFilters}
        actions={<ExportButtons reportType="damaged-assets" filters={{ ...filters, status: statuses }} />}
      />
      {summary && <ReportSummary stats={stats(summary, filters)} />}
      <ReportDataTable
        columns={columns}
        data={data}
        loading={loading}
        // A page of items can carry more rows than perPage (one tracked item = many damaged
        // copies), so the table must render the page whole and never re-paginate it.
        pageSize={Math.max(1, data.length)}
        emptyMessage={empty}
        token={token}
      />
      {isMobile ? (
        data.length > 0 && (
          <Pagination
            mode="loadMore"
            shown={data.length}
            total={total}
            hasMore={hasNext}
            isLoading={isLoadingMore}
            onLoadMore={loadMore}
          />
        )
      ) : (
        <>
          {/* "รายการพัสดุ" ไม่ใช่ "ชิ้น" — พัสดุรายชิ้นที่พัง 27 ชิ้นคือ 1 รายการในตัวนับนี้
              แต่เป็น 27 ในแถบสรุปด้านบน */}
          <p className="text-xs text-muted-foreground py-1">
            หน้า {page} จาก {totalPages} ({total} รายการพัสดุ)
          </p>
          <Pagination page={page} total={total} pageSize={perPage} onChange={setPage} />
        </>
      )}
    </>
  );
}

// ── ส่งซ่อม — บันทึกการซ่อม ไม่ใช่สถานะ ─────────────────────────────────────────

interface RepairRow {
  id: string;
  itemCode: string;
  itemName: string;
  subCode: string | null;
  subCount: number;
  result: string;
  issue: string;
  cost: number;
  repairVenue: "INTERNAL" | "EXTERNAL" | null;
  performer: string;
  performedAt: string;
}

interface RepairSummary {
  corrective: number;
  totalCost: number;
  costedRecords: number;
}

const repairColumns: Column<RepairRow>[] = [
  { key: "performedAt", header: "วันที่", render: (r) => fmtDate(new Date(r.performedAt), TH_DATE) },
  { key: "itemCode", header: "รหัสพัสดุ", render: (r) => effectiveCode(r.itemCode, r.subCode, r.subCount) },
  { key: "itemName", header: "รายการพัสดุ" },
  { key: "issue", header: "อาการ / สิ่งที่ทำ", render: (r) => r.issue || "—" },
  {
    key: "result",
    header: "ผลการดำเนินการ",
    render: (r) => <Badge variant="secondary">{labelFor(MAINT_RESULT_LABELS, r.result as MaintenanceResult)}</Badge>,
  },
  { key: "cost", header: "ค่าใช้จ่าย", className: "text-right", render: (r) => (r.cost > 0 ? baht(r.cost) : "—") },
  { key: "repairVenue", header: "ส่งซ่อมที่", render: (r) => venue(r.repairVenue) },
  { key: "performer", header: "ผู้ดำเนินการ" },
];

/**
 * งานซ่อม (MaintenanceRecord type = CORRECTIVE) เคยอยู่ปนกับรอบตรวจบำรุงใน tab ประวัติบำรุงรักษา
 * ทั้งที่คนละเรื่องกัน — รอบตรวจคืองานตามแผน ส่วนงานซ่อมคือผลของการชำรุดที่อยู่ในหน้านี้.
 * ย้ายมาแล้วสองที่จึงตอบคนละคำถามเต็มๆ และค่าซ่อมมาอยู่ข้างของที่พัง.
 */
function RepairSection() {
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<FilterValues>(defaultDateFilters);
  const [summary, setSummary] = useState<RepairSummary | null>(null);
  const perPage = PAGE_SIZE.DEFAULT;

  const fetchPage = useCallback(async (p: number) => {
    const params: Record<string, string> = {
      page: String(p), perPage: String(perPage), maintenanceType: "CORRECTIVE",
    };
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    const json = (await getReport("maintenance-history", params)) as {
      records: RepairRow[]; total: number; summary: RepairSummary;
    };
    setSummary(json.summary);
    return { items: json.records, total: json.total };
  }, [filters, perPage]);

  const {
    items: data, total, page, totalPages, loading, isLoadingMore, hasNext, loadMore, setPage,
  } = usePagedList<RepairRow>({ fetchPage, pageSize: perPage, isMobile });

  return (
    <>
      <ReportFilters
        config={{ dateRange: true } satisfies FilterConfig}
        values={filters}
        onChange={setFilters}
        actions={
          <ExportButtons reportType="maintenance-history" filters={{ ...filters, maintenanceType: "CORRECTIVE" }} />
        }
      />
      {summary && (
        <ReportSummary
          stats={[
            {
              label: "ครั้งที่ส่งซ่อม",
              value: total.toLocaleString(),
              hint: periodLabel(filters),
              token: "repair",
            },
            // ฿0 อ่านว่า "ซ่อมฟรี" ไม่ใช่ "ยังไม่ได้กรอกราคา" — ไม่มีแถวไหนมีค่าใช้จ่ายเลยจึงเป็น —
            {
              label: "ค่าซ่อมรวม",
              value: summary.costedRecords > 0 ? baht(summary.totalCost) : "—",
              hint: summary.costedRecords > 0
                ? `จาก ${summary.costedRecords.toLocaleString()} จาก ${total.toLocaleString()} รายการที่ระบุค่าใช้จ่าย`
                : `ยังไม่ได้กรอกค่าใช้จ่ายสักรายการ (0 จาก ${total.toLocaleString()})`,
              token: summary.costedRecords > 0 ? "value" : undefined,
            },
          ]}
        />
      )}
      <ReportDataTable
        columns={repairColumns}
        data={data}
        loading={loading}
        pageSize={isMobile ? Math.max(1, data.length) : perPage}
        emptyMessage="ไม่มีงานซ่อมในช่วงนี้"
        token="repair"
      />
      {isMobile ? (
        data.length > 0 && (
          <Pagination
            mode="loadMore"
            shown={data.length}
            total={total}
            hasMore={hasNext}
            isLoading={isLoadingMore}
            onLoadMore={loadMore}
          />
        )
      ) : (
        <>
          <p className="text-xs text-muted-foreground py-1">
            หน้า {page} จาก {totalPages} ({total} รายการ)
          </p>
          <Pagination page={page} total={total} pageSize={perPage} onChange={setPage} />
        </>
      )}
    </>
  );
}

// ── Tab ────────────────────────────────────────────────────────────────────────

const SEGMENTS = ["damaged", "repair", "writeoff"] as const;
type Segment = (typeof SEGMENTS)[number];

const SEGMENT_META: Record<Segment, { label: string; token: Token; subtitle: string }> = {
  damaged: { label: "ชำรุด", token: "damage", subtitle: "ช่วงที่เลือกมีอะไรพังบ้าง และพังเพราะอะไร" },
  repair: { label: "ส่งซ่อม", token: "repair", subtitle: "งานซ่อมที่ทำไปแล้ว ซ่อมที่ไหน และจ่ายไปเท่าไร" },
  writeoff: { label: "ตัดจำหน่าย", token: "dispose", subtitle: "ของที่ตัดออกจากคลังถาวร และมูลค่าที่เสียไป" },
};

export function DamagedAssetsTab() {
  const [segment, setSegment] = useState<Segment>("damaged");
  const meta = SEGMENT_META[segment];

  return (
    <div className="space-y-4 pb-2">
      <SectionTitle token={meta.token} icon={Wrench} title="ชำรุด & ส่งซ่อม" subtitle={meta.subtitle} />

      {/* segment เป็น state ในหน้านี้เอง ไม่ขึ้น URL: ?kind= ถูก tab ออกจากคลังจองไว้แล้ว และทุก
          tab ของหน้ารายงานถูก mount พร้อมกัน — ใช้ชื่อซ้ำจะเด้งข้ามกัน */}
      <Tabs value={segment} onValueChange={(v) => setSegment(v as Segment)}>
        <TabsList variant="chip" className="w-full min-w-0 sm:w-auto">
          {SEGMENTS.map((s) => (
            <TabsTrigger key={s} value={s} className="min-w-0" style={chipStyle(SEGMENT_META[s].token)}>
              {SEGMENT_META[s].label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {segment === "damaged" && (
        <>
          {/* หน้านี้เป็นประวัติ ไม่ใช่คิวงาน — ที่ปิดงานได้จริงคือ /alerts จึงชี้ไปตรงนั้นแทนที่จะ
              ทำปุ่มจัดการซ้ำอีกชุด */}
          <p className="text-sm text-muted-foreground">
            ต้องการปิดงานที่ค้างอยู่ตอนนี้{" "}
            <Link href="/alerts" className="text-primary hover:underline">
              ไปจัดการที่แจ้งเตือน →
            </Link>
          </p>
          <DamageSection
            statuses="DAMAGED"
            token="damage"
            columns={damagedColumns}
            empty="ไม่มีพัสดุชำรุดในช่วงนี้"
            stats={(s, f) => [
              {
                label: "ชิ้นที่ชำรุด",
                value: s.damaged.toLocaleString(),
                hint: `${periodLabel(f)} · นับเป็นชิ้น`,
                token: s.damaged > 0 ? "damage" : undefined,
              },
            ]}
          />
        </>
      )}

      {segment === "repair" && <RepairSection />}

      {segment === "writeoff" && (
        <DamageSection
          statuses="DISPOSED,LOST"
          token="dispose"
          columns={writeOffColumns}
          empty="ไม่มีของที่ตัดจำหน่ายในช่วงนี้"
          stats={(s, f) => [
            {
              label: "ตัดจำหน่าย / สูญหาย",
              value: s.writtenOff.toLocaleString(),
              hint: `${periodLabel(f)} · จำหน่าย ${s.disposed.toLocaleString()} · สูญหาย ${s.lost.toLocaleString()}`,
              token: s.writtenOff > 0 ? "dispose" : undefined,
            },
            // ชิ้นที่ผูกใบรับเข้าไว้ใช้ยอดที่จ่ายจริงของใบนั้น ส่วนที่เหลือยังเป็นราคาเฉลี่ยของรายการ
            // ป้ายจึงเลิกเขียน "ประมาณการ" เมื่อทุกชิ้นที่คิดราคาได้มาจากใบของตัวเองครบแล้ว
            {
              label: s.exactWriteOffs === s.pricedWriteOffs ? "มูลค่าที่เสียไป" : "มูลค่าที่เสียไป (ประมาณการ)",
              value: s.pricedWriteOffs > 0 ? baht(s.writtenOffValue) : "—",
              hint: s.pricedWriteOffs > 0
                ? `คิดจาก ${s.pricedWriteOffs.toLocaleString()} จาก ${s.writtenOff.toLocaleString()} ชิ้น · ราคาจริงจากใบรับเข้า ${s.exactWriteOffs.toLocaleString()} ชิ้น`
                : `ยังไม่ได้กรอกราคาสักรายการ (0 จาก ${s.writtenOff.toLocaleString()} ชิ้น)`,
              token: s.pricedWriteOffs > 0 ? "value" : undefined,
            },
          ]}
        />
      )}
    </div>
  );
}
