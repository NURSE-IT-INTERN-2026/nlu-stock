"use client";

import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText, FileDown } from "lucide-react";
import type { FilterValues } from "./report-filters";

interface ExportButtonsProps {
  reportType: string;
  filters: FilterValues;
}

export function ExportButtons({ reportType, filters }: ExportButtonsProps) {
  const params = new URLSearchParams();
  params.set("type", reportType);
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== "") params.set(k, v);
  }

  const baseUrl = `/api/reports/export?${params.toString()}`;

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs gap-1"
        onClick={() => window.open(`${baseUrl}&format=csv`, "_blank")}
      >
        <FileText className="h-3.5 w-3.5" />
        CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs gap-1"
        onClick={() => window.open(`${baseUrl}&format=xlsx`, "_blank")}
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Excel
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs gap-1"
        onClick={() => window.open(`${baseUrl}&format=pdf`, "_blank")}
      >
        <FileDown className="h-3.5 w-3.5" />
        PDF
      </Button>
    </div>
  );
}
