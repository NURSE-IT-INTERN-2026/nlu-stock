"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Download, FileSpreadsheet, FileDown } from "lucide-react";
import { withBase } from "@/lib/base-path";
import type { FilterValues } from "./report-filters";

interface ExportButtonsProps {
  reportType: string;
  /** Tabs built on ReportFilters pass their FilterValues; เคสงาน keeps its own filter shape and
   *  passes that instead — either way this only forwards the pairs to the export route. */
  filters: FilterValues | Record<string, string | undefined>;
}

export function ExportButtons({ reportType, filters }: ExportButtonsProps) {
  const params = new URLSearchParams();
  params.set("type", reportType);
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === "") continue;
    // location เป็น object (cascade อาคาร/ชั้น/ห้อง/จุด) — แบนเป็นคีย์ละชั้นแบบเดียวกับที่ tab
    // ยิงหา API ไม่งั้นมันกลายเป็น "[object Object]" แล้วไฟล์ที่โหลดได้กว้างกว่าที่เห็นบนจอ
    if (typeof v === "object") {
      for (const [lk, lv] of Object.entries(v)) if (lv) params.set(lk, String(lv));
      continue;
    }
    params.set(k, String(v));
  }

  // window.open is one of the things Next does NOT prefix with basePath — without
  // withBase the app served from /nlu-stock opens /api/... and gets a 404.
  const baseUrl = withBase(`/api/reports/export?${params.toString()}`);

  // ponytail: เมนูเดียว ไม่ใช่สองปุ่ม — รูปแบบไฟล์เป็นทางเลือกของ "ส่งออก" อย่างเดียวกัน
  // การกางทั้งสองไว้ตลอดกินที่แถวหัวการ์ดเท่ากับตัวกรองสองตัว
  // CSV ถูกตัดออก — เขียน UTF-8 โดยไม่มี BOM ทำให้ชื่อไทยเพี้ยนทุกไฟล์เมื่อเปิดใน Excel
  // บน Windows ซึ่งเป็นที่เดียวที่ไฟล์พวกนี้ถูกเปิดจริง. xlsx เก็บ encoding ในตัวไฟล์
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" />}
      >
        <Download className="size-3.5" />
        ส่งออก
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem onClick={() => window.open(`${baseUrl}&format=xlsx`, "_blank")}>
          <FileSpreadsheet className="size-4" />
          Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open(`${baseUrl}&format=pdf`, "_blank")}>
          <FileDown className="size-4" />
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
