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
import { History } from "lucide-react";
import { SectionTitle } from "./report-kit";
import { fmtDate, TH_DATE } from "@/lib/format";
import { getReport } from "@/lib/api";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";
import { MAINT_TYPE_LABELS, MAINT_RESULT_LABELS, labelFor, effectiveCode, type MaintenanceType, type MaintenanceResult } from "@/lib/constants";

const filterConfig: FilterConfig = { dateRange: true, maintenanceType: true };

interface Row {
  id: string;
  itemCode: string;
  itemName: string;
  subCode: string | null;
  subCount: number;
  categoryName: string;
  type: string;
  result: string;
  issue: string;
  cost: number;
  repairVenue: "INTERNAL" | "EXTERNAL" | null;
  performer: string;
  performedAt: string;
}

interface Summary {
  preventive: number;
  corrective: number;
  totalCost: number;
  costedRecords: number;
}

const columns: Column<Row>[] = [
  {
    key: "performedAt",
    header: "วันที่",
    render: (r) => fmtDate(new Date(r.performedAt), TH_DATE),
  },
  { key: "itemCode", header: "รหัสพัสดุ", render: (r) => effectiveCode(r.itemCode, r.subCode, r.subCount) },
  { key: "itemName", header: "รายการพัสดุ" },
  {
    key: "type",
    header: "ประเภท",
    render: (r) => <Badge variant="outline">{labelFor(MAINT_TYPE_LABELS, r.type as MaintenanceType)}</Badge>,
  },
  {
    key: "result",
    header: "ผลการดำเนินการ",
    render: (r) => <Badge variant="secondary">{labelFor(MAINT_RESULT_LABELS, r.result as MaintenanceResult)}</Badge>,
  },
  { key: "issue", header: "อาการ / สิ่งที่ทำ", render: (r) => r.issue || "—" },
  {
    key: "cost",
    header: "ค่าใช้จ่าย",
    className: "text-right",
    render: (r) => (r.cost > 0 ? `฿${r.cost.toLocaleString()}` : "—"),
  },
  { key: "repairVenue", header: "ส่งซ่อมที่", render: (r) => (r.repairVenue ? (r.repairVenue === "EXTERNAL" ? "ภายนอก" : "ภายใน") : "—") },
  { key: "performer", header: "ผู้ดำเนินการ" },
];

export function MaintenanceHistoryTab() {
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<FilterValues>(defaultDateFilters);
  const [summary, setSummary] = useState<Summary | null>(null);
  const perPage = PAGE_SIZE.DEFAULT;

  const fetchPage = useCallback(async (p: number) => {
    const params: Record<string, string> = {
      page: String(p),
      perPage: String(perPage),
    };
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.maintenanceType) params.maintenanceType = filters.maintenanceType;
    const json = (await getReport("maintenance-history", params)) as {
      records: Row[]; total: number; summary: Summary;
    };
    setSummary(json.summary);
    return { items: json.records, total: json.total };
  }, [filters, perPage]);

  const {
    items: data, total, page, totalPages, loading, isLoadingMore, hasNext, loadMore, setPage,
  } = usePagedList<Row>({ fetchPage, pageSize: perPage, isMobile });

  return (
    <div className="space-y-4 pb-2">
      <SectionTitle
        token="repair"
        icon={History}
        title="ประวัติบำรุงรักษา"
        subtitle="รอบตรวจเช็คตามกำหนด และงานซ่อมที่ทำไปแล้ว พร้อมค่าใช้จ่าย"
      />
      <ReportFilters
        config={filterConfig}
        values={filters}
        onChange={setFilters}
        actions={<ExportButtons reportType="maintenance-history" filters={filters} />}
      />
      {summary && (
        <ReportSummary
          stats={[
            {
              label: "ตรวจบำรุงตามรอบ",
              value: summary.preventive.toLocaleString(),
              hint: `${periodLabel(filters)} · เช็ค/ทำความสะอาดตามกำหนด`,
              token: "maintain",
            },
            {
              label: "ซ่อมเมื่อชำรุด",
              value: summary.corrective.toLocaleString(),
              hint: "ซ่อมหลังของพัง",
              token: summary.corrective > summary.preventive ? "damage" : "repair",
            },
            // ฿0 อ่านว่า "ซ่อมฟรี" ไม่ใช่ "ยังไม่ได้กรอกราคา" — พอไม่มีแถวไหนมีค่าใช้จ่ายเลย
            // ตัวเลขจึงเป็น — แล้วให้ hint บอกว่าต้องไปกรอกอีกกี่รายการ
            {
              label: "ค่าใช้จ่ายรวม",
              value: summary.costedRecords > 0 ? `฿${summary.totalCost.toLocaleString()}` : "—",
              hint: summary.costedRecords > 0
                ? `จาก ${summary.costedRecords.toLocaleString()} จาก ${total.toLocaleString()} รายการที่ระบุค่าใช้จ่าย`
                : `ยังไม่ได้กรอกค่าใช้จ่ายสักรายการ (0 จาก ${total.toLocaleString()})`,
              token: summary.costedRecords > 0 ? "value" : undefined,
            },
          ]}
        />
      )}
      <ReportDataTable
        columns={columns}
        data={data}
        loading={loading}
        pageSize={isMobile ? Math.max(1, data.length) : perPage}
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
    </div>
  );
}
