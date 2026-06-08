"use client";

import { useEffect, useState, useCallback } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ExportButtons } from "./export-buttons";
import { AnnualCostChart } from "./charts/annual-cost-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { getReport } from "@/lib/api";

const filterConfig: FilterConfig = { year: true, categories: true };

interface PurchaseRow {
  id: string;
  code: string;
  name: string;
  purchasePrice: number;
  purchaseDate: string;
  categoryName: string;
}

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

const purchaseColumns: Column<PurchaseRow>[] = [
  { key: "code", header: "Code" },
  { key: "name", header: "Item" },
  { key: "categoryName", header: "Category" },
  {
    key: "purchasePrice",
    header: "Price",
    render: (r) => `฿${r.purchasePrice.toLocaleString()}`,
  },
  {
    key: "purchaseDate",
    header: "Date",
    render: (r) => format(new Date(r.purchaseDate), "dd MMM yyyy"),
  },
];

const repairColumns: Column<RepairRow>[] = [
  { key: "itemCode", header: "Code" },
  { key: "itemName", header: "Item" },
  { key: "type", header: "Type" },
  {
    key: "cost",
    header: "Cost",
    render: (r) => `฿${r.cost.toLocaleString()}`,
  },
  {
    key: "performedAt",
    header: "Date",
    render: (r) => format(new Date(r.performedAt), "dd MMM yyyy"),
  },
  { key: "performer", header: "By" },
];

export function AnnualCostTab() {
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [repairs, setRepairs] = useState<RepairRow[]>([]);
  const [byCategory, setByCategory] = useState<{ categoryName: string; totalPurchase: number; totalRepair: number }[]>([]);
  const [totalPurchase, setTotalPurchase] = useState(0);
  const [totalRepair, setTotalRepair] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterValues>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filters.year) params.year = filters.year;
    if (filters.categoryId) params.categoryId = filters.categoryId;
    const json = (await getReport("annual-cost", params)) as {
      purchases: PurchaseRow[];
      repairs: RepairRow[];
      byCategory: { categoryName: string; totalPurchase: number; totalRepair: number }[];
      totalPurchase: number;
      totalRepair: number;
    };
    setPurchases(json.purchases);
    setRepairs(json.repairs);
    setByCategory(json.byCategory);
    setTotalPurchase(json.totalPurchase);
    setTotalRepair(json.totalRepair);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <ReportFilters config={filterConfig} values={filters} onChange={setFilters} />
        <ExportButtons reportType="annual-cost" filters={filters} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Purchase</p>
            <p className="text-2xl font-bold">฿{totalPurchase.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Repair</p>
            <p className="text-2xl font-bold">฿{totalRepair.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <AnnualCostChart data={byCategory} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Purchases</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportDataTable columns={purchaseColumns} data={purchases} pageSize={10} emptyMessage="No purchase records" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Repairs</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportDataTable columns={repairColumns} data={repairs} pageSize={10} emptyMessage="No repair records" />
        </CardContent>
      </Card>
    </div>
  );
}
