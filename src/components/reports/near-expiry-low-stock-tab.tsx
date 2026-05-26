"use client";

import { useEffect, useState, useCallback } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ExportButtons } from "./export-buttons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const filterConfig: FilterConfig = { categories: true };

interface LowStockRow {
  id: string;
  code: string;
  name: string;
  categoryName: string;
  availableQty: number;
  minThreshold: number;
  issueUnit: string;
}

interface NearExpiryRow {
  id: string;
  lotNumber: string;
  expiryDate: string;
  quantity: number;
  itemCode: string;
  itemName: string;
  categoryName: string;
  daysUntilExpiry: number;
}

const lowStockColumns: Column<LowStockRow>[] = [
  { key: "code", header: "Code" },
  { key: "name", header: "Item" },
  { key: "categoryName", header: "Category" },
  {
    key: "availableQty",
    header: "Available",
    render: (r) => (
      <span className={r.availableQty === 0 ? "text-red-500 font-semibold" : ""}>
        {r.availableQty}
      </span>
    ),
  },
  { key: "minThreshold", header: "Threshold" },
  { key: "issueUnit", header: "Unit" },
];

const nearExpiryColumns: Column<NearExpiryRow>[] = [
  { key: "itemCode", header: "Code" },
  { key: "itemName", header: "Item" },
  { key: "lotNumber", header: "Lot" },
  {
    key: "daysUntilExpiry",
    header: "Days Left",
    render: (r) => (
      <Badge variant={r.daysUntilExpiry <= 30 ? "destructive" : "secondary"}>
        {r.daysUntilExpiry}d
      </Badge>
    ),
  },
  {
    key: "expiryDate",
    header: "Expiry",
    render: (r) => new Date(r.expiryDate).toLocaleDateString(),
  },
  { key: "quantity", header: "Qty" },
];

export function NearExpiryLowStockTab() {
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [nearExpiry, setNearExpiry] = useState<NearExpiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterValues>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    const res = await fetch(`/api/reports/near-expiry-low-stock?${params.toString()}`);
    const json = await res.json();
    setLowStock(json.lowStock);
    setNearExpiry(json.nearExpiry);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <ReportFilters config={filterConfig} values={filters} onChange={setFilters} />
        <ExportButtons reportType="near-expiry-low-stock" filters={filters} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Badge variant="destructive">{lowStock.length}</Badge>
            Low Stock Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReportDataTable columns={lowStockColumns} data={lowStock} pageSize={10} emptyMessage="No low stock items" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Badge variant="secondary">{nearExpiry.length}</Badge>
            Near Expiry Lots (90 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReportDataTable columns={nearExpiryColumns} data={nearExpiry} pageSize={10} emptyMessage="No near-expiry lots" />
        </CardContent>
      </Card>
    </div>
  );
}
