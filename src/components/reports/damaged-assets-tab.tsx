"use client";

import { useState, useCallback } from "react";
import {
  ReportFilters, defaultDateFilters, periodLabel,
  type FilterValues, type FilterConfig,
} from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ReportSummary } from "./report-summary";
import { ExportButtons } from "./export-buttons";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";
import { fmtDate, TH_DATE } from "@/lib/format";
import { getReport } from "@/lib/api";
import { STATUS_LABELS, STATUS_VARIANTS, type ItemStatus } from "@/lib/constants";

const filterConfig: FilterConfig = {
  dateRange: true,
  statusOptions: [
    { value: "DAMAGED", label: "ชำรุด" },
    { value: "UNDER_REPAIR", label: "ซ่อมบำรุง" },
    { value: "DISPOSED", label: "จำหน่าย" },
    { value: "LOST", label: "สูญหาย" },
  ],
};

interface Row {
  id: string;
  code: string;
  name: string;
  status: ItemStatus;
  categoryName: string;
  location: string;
  reason: string;
  repairVenue: "INTERNAL" | "EXTERNAL" | null;
  changedAt: string;
}

interface Summary {
  damaged: number;
  underRepair: number;
  writtenOff: number;
}

// /alerts และ /items ตอบได้แล้วว่า "ชิ้นไหนพัง" — tab นี้จึงตอบสิ่งที่อีกสองที่ตอบไม่ได้:
// พังเพราะอะไร ส่งซ่อมในหรือนอก และเกิดขึ้นเมื่อไหร่. คอลัมน์เรียงตามลำดับนั้น.
const columns: Column<Row>[] = [
  {
    key: "changedAt",
    header: "แจ้งเมื่อ",
    // แถวที่ไม่มี statusLog (ของที่ import เข้ามาพร้อมสถานะชำรุด) ไม่มีวันที่ให้แสดง
    render: (r) => (r.changedAt ? fmtDate(new Date(r.changedAt), TH_DATE) : "—"),
  },
  { key: "code", header: "รหัสพัสดุ" },
  { key: "name", header: "รายการพัสดุ" },
  {
    key: "status",
    header: "สถานะ",
    render: (r) => <Badge variant={STATUS_VARIANTS[r.status] ?? "default"}>{STATUS_LABELS[r.status] ?? r.status.replace(/_/g, " ")}</Badge>,
  },
  { key: "reason", header: "เหตุผล", render: (r) => r.reason || "—" },
  {
    key: "repairVenue",
    header: "ส่งซ่อมที่",
    render: (r) => (r.repairVenue ? (r.repairVenue === "EXTERNAL" ? "ภายนอก" : "ภายใน") : "—"),
  },
  { key: "categoryName", header: "หมวดหมู่" },
  { key: "location", header: "สถานที่", render: (r) => r.location || "—" },
];

export function DamagedAssetsTab() {
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<FilterValues>(defaultDateFilters);
  const [summary, setSummary] = useState<Summary | null>(null);
  const perPage = PAGE_SIZE.DEFAULT;

  // เดิม tab นี้ไม่ส่ง page เลยทั้งที่ route แบ่งหน้าอยู่ — เห็นแค่หน้าแรกโดยไม่มีอะไรบอก
  // ว่ายังมีต่อ. usePagedList ทำให้ตัวเลข total กับสิ่งที่แสดงตรงกัน.
  const fetchPage = useCallback(async (p: number) => {
    const params: Record<string, string> = { page: String(p), perPage: String(perPage) };
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.status) params.status = filters.status;
    const json = (await getReport("damaged-assets", params)) as {
      items: Row[]; total: number; summary: Summary;
    };
    setSummary(json.summary);
    return { items: json.items, total: json.total };
  }, [filters, perPage]);

  const {
    items: data, total, page, totalPages, loading, isLoadingMore, hasNext, loadMore, setPage,
  } = usePagedList<Row>({ fetchPage, pageSize: perPage, isMobile });

  return (
    <div className="space-y-4 pb-2">
      <ReportFilters
        config={filterConfig}
        values={filters}
        onChange={setFilters}
        actions={<ExportButtons reportType="damaged-assets" filters={filters} />}
      />
      {summary && (
        <ReportSummary
          stats={[
            {
              label: "ชำรุด รอส่งซ่อม",
              value: summary.damaged.toLocaleString(),
              hint: `${periodLabel(filters)} · นับเป็นชิ้น`,
              tone: summary.damaged > 0 ? "warning" : "default",
            },
            {
              label: "กำลังซ่อม",
              value: summary.underRepair.toLocaleString(),
              hint: "ส่งซ่อมแล้ว ยังไม่กลับเข้าคลัง",
            },
            {
              label: "จำหน่าย / สูญหาย",
              value: summary.writtenOff.toLocaleString(),
              hint: "ตัดออกจากคลังถาวร",
              tone: summary.writtenOff > 0 ? "danger" : "default",
            },
          ]}
        />
      )}
      <ReportDataTable
        columns={columns}
        data={data}
        loading={loading}
        // A page of items can carry more rows than perPage (one tracked item = many damaged
        // copies), so the table must render the page whole and never re-paginate it.
        pageSize={Math.max(1, data.length)}
        emptyMessage="ไม่มีพัสดุชำรุดในช่วงนี้"
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
    </div>
  );
}
