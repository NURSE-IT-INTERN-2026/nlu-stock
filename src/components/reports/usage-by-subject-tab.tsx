"use client";

import { useState, useCallback } from "react";
import {
  ReportFilters, defaultDateFilters, periodLabel,
  type FilterValues, type FilterConfig,
} from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ReportSummary } from "./report-summary";
import { ExportButtons } from "./export-buttons";
import { UsageBySubjectChart } from "@/components/dashboard/usage-by-subject-chart";
import { TrendingUp } from "lucide-react";
import { SectionTitle } from "./report-kit";
import { getReport } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";

const filterConfig: FilterConfig = { dateRange: true, categories: true };

interface Row {
  usageType: string | null;
  label: string;
  totalQuantity: number;
  records: number;
  itemCount: number;
}

interface Summary {
  subjects: number;
  records: number;
  units: number;
  unspecifiedRecords: number;
}

// จำนวนหน่วยอย่างเดียวตอบไม่ได้ว่าวิชานี้เบิกบ่อยหรือเบิกทีเดียวเยอะ และใช้ของกี่ชนิด —
// สองคอลัมน์นี้คือความต่างระหว่าง "รู้ยอด" กับ "รู้พฤติกรรม".
const columns: Column<Row>[] = [
  { key: "label", header: "วิชา / กิจกรรม" },
  { key: "records", header: "จำนวนครั้ง", className: "text-right", render: (r) => r.records.toLocaleString() },
  { key: "totalQuantity", header: "จำนวนหน่วย", className: "text-right", render: (r) => r.totalQuantity.toLocaleString() },
  { key: "itemCount", header: "ชนิดพัสดุ", className: "text-right", render: (r) => r.itemCount.toLocaleString() },
];

export function UsageBySubjectTab() {
  const [filters, setFilters] = useState<FilterValues>(defaultDateFilters);

  const fetcher = useCallback(async () => {
    const params: Record<string, string> = {};
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.categoryId) params.categoryId = filters.categoryId;
    return (await getReport("usage-by-subject", params)) as { rows: Row[]; summary: Summary };
  }, [filters]);

  const { data: result, isFetching: loading } = useAsync(fetcher, [fetcher]);
  const data = result?.rows ?? [];
  const summary = result?.summary ?? null;

  return (
    <div className="space-y-4">
      <SectionTitle
        token="maintain"
        icon={TrendingUp}
        title="สถิติการใช้งาน"
        subtitle="ของที่เบิกออกไป ถูกใช้กับวิชาหรือกิจกรรมไหน และวิชาไหนใช้มากที่สุด"
      />
      <ReportFilters
        config={filterConfig}
        values={filters}
        onChange={setFilters}
        actions={<ExportButtons reportType="usage-by-subject" filters={filters} />}
      />
      {summary && (
        <ReportSummary
          stats={[
            {
              label: "วิชา / กิจกรรมที่ใช้ของ",
              value: summary.subjects.toLocaleString(),
              hint: periodLabel(filters),
              token: "maintain",
            },
            {
              label: "จำนวนหน่วยรวม",
              value: summary.units.toLocaleString(),
              hint: `จากการเบิก ${summary.records.toLocaleString()} ครั้ง`,
              token: "issue",
            },
            {
              label: "ยังไม่ระบุการใช้งาน",
              value: summary.unspecifiedRecords.toLocaleString(),
              // The unspecified bucket is the report's own blind spot; hiding it would let the
              // subject breakdown read as complete when part of the stock is unaccounted for.
              hint: "ครั้งที่เบิกโดยไม่ได้เลือกวิชา/กิจกรรม",
              token: summary.unspecifiedRecords > 0 ? "repair" : undefined,
            },
          ]}
        />
      )}
      <UsageBySubjectChart
        data={data}
        title="สัดส่วนการใช้งาน"
        hint={periodLabel(filters)}
        height={260}
      />
      <ReportDataTable
        columns={columns}
        data={data}
        loading={loading}
        emptyMessage="ไม่มีการเบิกในช่วงนี้"
        token="maintain"
      />
    </div>
  );
}
