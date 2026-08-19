"use client";

import { useState, useCallback } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ReportSummary } from "./report-summary";
import { ExportButtons } from "./export-buttons";
import { AnnualCostChart, type AnnualCostMonth } from "./charts/annual-cost-chart";
import { Wallet } from "lucide-react";
import { SectionTitle } from "./report-kit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate, TH_DATE } from "@/lib/format";
import { getReport } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { MAINT_TYPE_LABELS, labelFor, type MaintenanceType } from "@/lib/constants";

const filterConfig: FilterConfig = { year: true, categories: true };

interface RepairRow {
  id: string;
  itemCode: string;
  itemName: string;
  categoryName: string;
  cost: number;
  performedAt: string;
  type: string;
  performer: string;
}

interface Summary {
  totalPurchase: number;
  totalRepair: number;
  durablePurchase: number;
  consumablePurchase: number;
  purchaseCount: number;
  repairCount: number;
  correctiveCost: number;
  correctiveCount: number;
  preventiveCost: number;
  preventiveCount: number;
  /** รายการที่อยู่ในปีนี้แต่ยังไม่มีราคา — ตัวหารที่บอกว่ายอดข้างบนครอบคลุมแค่ไหน */
  unpricedPurchases: number;
  unpricedRepairs: number;
}

interface Result {
  year: number;
  repairs: RepairRow[];
  byMonth: AnnualCostMonth[];
  summary: Summary;
}

const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const repairColumns: Column<RepairRow>[] = [
  { key: "performedAt", header: "วันที่", render: (r) => fmtDate(new Date(r.performedAt), TH_DATE) },
  { key: "itemCode", header: "รหัสพัสดุ" },
  { key: "itemName", header: "รายการพัสดุ" },
  { key: "type", header: "ประเภท", render: (r) => labelFor(MAINT_TYPE_LABELS, r.type as MaintenanceType) },
  { key: "cost", header: "ค่าใช้จ่าย", className: "text-right", render: (r) => baht(r.cost) },
  { key: "performer", header: "ผู้ดำเนินการ" },
];

export function AnnualCostTab() {
  const [filters, setFilters] = useState<FilterValues>({});

  const fetcher = useCallback(async () => {
    const params: Record<string, string> = {};
    if (filters.year) params.year = filters.year;
    if (filters.categoryId) params.categoryId = filters.categoryId;
    return (await getReport("annual-cost", params)) as Result;
  }, [filters]);

  const { data: result, isFetching: loading } = useAsync(fetcher, [fetcher]);

  const repairs = result?.repairs ?? [];
  const summary = result?.summary ?? null;
  const buddhistYear = (result?.year ?? new Date().getFullYear()) + 543;

  return (
    <div className="space-y-4">
      <SectionTitle
        token="value"
        icon={Wallet}
        title="ค่าใช้จ่ายรายปี"
        subtitle="ซื้อและซ่อมไปเท่าไรในปีนั้น — นับเฉพาะรายการที่กรอกราคาไว้แล้ว"
      />
      <ReportFilters
        config={filterConfig}
        values={filters}
        onChange={setFilters}
        actions={<ExportButtons reportType="annual-cost" filters={filters} />}
      />

      {summary && (
        <ReportSummary
          stats={[
            // ยอด ฿0 กับ "ยังไม่มีใครกรอกราคา" หน้าตาเหมือนกันเป๊ะ — พอไม่มีรายการที่มีราคาเลย
            // ตัวเลขจึงเป็น — และ hint เปลี่ยนไปบอกจำนวนที่ค้างกรอกแทน
            {
              label: "ค่าจัดซื้อ",
              value: summary.purchaseCount > 0 ? baht(summary.totalPurchase) : "—",
              // Both halves are named because the two come from different fields and only one
              // of them (consumables, via Lot.unitCost) is currently collected at รับเข้า.
              hint: summary.purchaseCount > 0
                ? `ครุภัณฑ์/คงทน ${baht(summary.durablePurchase)} · สิ้นเปลือง ${baht(summary.consumablePurchase)}`
                : `ยังไม่ได้กรอกราคา ${summary.unpricedPurchases.toLocaleString()} รายการในปีนี้`,
              token: summary.purchaseCount > 0 ? "value" : undefined,
            },
            // ซ่อมแซมกับตรวจบำรุงเป็นคนละก้อนงบ — ก้อนหนึ่งจ่ายเพราะของพัง อีกก้อนจ่ายเพื่อไม่ให้พัง
            {
              label: "ค่าซ่อมแซม",
              value: summary.correctiveCount > 0 ? baht(summary.correctiveCost) : "—",
              hint: summary.correctiveCount > 0
                ? `จาก ${summary.correctiveCount.toLocaleString()} ครั้งที่ซ่อมหลังของพัง`
                : summary.unpricedRepairs > 0
                  ? `ยังไม่ได้กรอกค่าซ่อม ${summary.unpricedRepairs.toLocaleString()} รายการในปีนี้`
                  : "ไม่มีงานซ่อมที่ระบุราคาในปีนี้",
              token: summary.correctiveCount > 0 ? "damage" : undefined,
            },
            {
              label: "ค่าตรวจบำรุง",
              value: summary.preventiveCount > 0 ? baht(summary.preventiveCost) : "—",
              hint: summary.preventiveCount > 0
                ? `จาก ${summary.preventiveCount.toLocaleString()} รอบตรวจตามกำหนด`
                : "ไม่มีรอบตรวจที่ระบุราคาในปีนี้",
              token: summary.preventiveCount > 0 ? "maintain" : undefined,
            },
            {
              label: `รวมปี พ.ศ. ${buddhistYear}`,
              value: summary.purchaseCount + summary.repairCount > 0
                ? baht(summary.totalPurchase + summary.totalRepair)
                : "—",
              hint: `นับเฉพาะรายการที่ระบุราคาไว้ · ยังค้างกรอก ${(summary.unpricedPurchases + summary.unpricedRepairs).toLocaleString()} รายการ`,
              token: summary.purchaseCount + summary.repairCount > 0 ? "value" : undefined,
            },
          ]}
        />
      )}

      <AnnualCostChart data={result?.byMonth ?? []} year={buddhistYear} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">รายการซ่อมบำรุง</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportDataTable
            columns={repairColumns}
            data={repairs}
            loading={loading}
            pageSize={10}
            emptyMessage="ไม่มีรายการซ่อมที่ระบุค่าใช้จ่ายในปีนี้"
            token="repair"
          />
        </CardContent>
      </Card>
    </div>
  );
}
