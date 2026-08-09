"use client";

import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileDown } from "lucide-react";
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
    <div className="flex w-full gap-2 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
      {/* CSV ถูกตัดออก — เขียน UTF-8 โดยไม่มี BOM ทำให้ชื่อไทยเพี้ยนทุกไฟล์เมื่อเปิดใน Excel
          บน Windows ซึ่งเป็นที่เดียวที่ไฟล์พวกนี้ถูกเปิดจริง. xlsx เก็บ encoding ในตัวไฟล์. */}
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
