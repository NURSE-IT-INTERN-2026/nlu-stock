"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { FolderKanban } from "lucide-react";
import { CaseWorkspace } from "@/components/cases/case-workspace";
import { ReportSummary, type SummaryStat } from "./report-summary";
import { ExportButtons } from "./export-buttons";
import { SectionTitle } from "./report-kit";
import { useSession } from "@/components/layout/auth-guard";
import { canManageStock } from "@/lib/roles";
import type { CaseTotalsJson } from "@/lib/api";

const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

/**
 * เคสงาน — งานที่มีคนรออยู่ ทุกประเภทในที่เดียว.
 *
 * แท็บนี้เคยเป็นหน้า /cases ของตัวเอง และเคยเป็นสองแท็บในหน้านี้ (ชำรุด & ส่งซ่อม, ประวัติบำรุงรักษา)
 * ที่อ่านจากคนละ query กัน. ตอนนี้ทั้งสามทางอ่านจาก /api/cases ทางเดียว — ตัวเลขในการ์ดกับแถวใน
 * ตารางจึงมาจากชุดเดียวกันเสมอ ไม่ใช่สองยอดที่ต้องคอยเถียงกันว่าอันไหนถูก.
 *
 * หน่วยนับไม่เหมือนแท็บ "ออกจากคลัง": ที่นั่นนับเป็นใบ (กดเบิกหนึ่งครั้ง = 1) ที่นี่นับเป็นรายการ
 * (ใบเดียวจ่ายสามอย่าง = 3 เคส) เพราะแต่ละรายการคืนคนละวันและจบคนละเวลา.
 */
export function CasesTab() {
  const { user } = useSession();
  const [totals, setTotals] = useState<CaseTotalsJson | null>(null);
  const [query, setQuery] = useState("");
  // ?case=REPAIR:<id> — ลิงก์ที่ประวัติของพัสดุยื่นมา ชี้มาที่เคสใบนั้นตรงๆ
  const initial = useSearchParams().get("case") ?? undefined;

  return (
    <div className="space-y-4">
      <SectionTitle
        token="damage"
        icon={FolderKanban}
        title="เคสงาน — งานไหนยังไม่จบ และจบไปแล้วด้วยอะไร"
        subtitle="ซ่อมแซม · บำรุงรักษา · ยืมพัสดุ · ตั้งใช้ในห้อง · ตรวจชุด · สูญหาย · นับเป็นรายการ ไม่ใช่ใบ"
      />
      <div className="flex justify-end">
        <ExportButtons reportType="cases" filters={exportFilters(query)} />
      </div>
      {totals && <ReportSummary stats={stats(totals)} />}
      <CaseWorkspace
        initialCaseId={initial}
        canEdit={canManageStock(user?.role ?? "")}
        onTotals={(t, q) => { setTotals(t); setQuery(q); }}
      />
    </div>
  );
}

/**
 * ตัวกรองที่หน้าจอใช้อยู่ แปลงเป็นสิ่งที่ /api/reports/export รับ: `type` ถูกจองไว้เป็นชนิดรายงานแล้ว
 * ประเภทเคสจึงต้องเดินทางในชื่อ caseType ไม่งั้นมันจะเขียนทับ type=cases แล้วไฟล์จะออกมาผิดรายงาน.
 * `perPage` เป็นเรื่องของการแบ่งหน้าบนจอ ไฟล์ส่งออกทั้งชุดเสมอ.
 */
function exportFilters(query: string): Record<string, string | undefined> {
  const p = new URLSearchParams(query);
  p.delete("perPage");
  const type = p.get("type");
  p.delete("type");
  if (type) p.set("caseType", type);
  return Object.fromEntries(p);
}

/**
 * สองก้อนที่ไม่บวกกัน: เงินที่จ่ายไปเพื่อให้ของกลับมาใช้ได้ กับเงินที่หายไปพร้อมของ.
 *
 * การ์ดของหายสลับหัวเรื่องตามความครบของข้อมูล — ตีราคาได้ไม่ถึงครึ่ง ตัวเลขเด่นคือ "กี่ชิ้น" ไม่ใช่
 * "กี่บาท": ของหาย 101 ชิ้นที่รู้ราคาแค่ชิ้นเดียวแล้วขึ้นหัวว่า ฿60,000 อ่านเหมือนยอดความเสียหายจริง
 * ทั้งที่อีก 100 ชิ้นยังไม่ถูกนับ. พอราคาถูกกรอกจนเกินครึ่ง การ์ดค่อยกลับไปนำด้วยยอดเงิน —
 * กลไกเดียวกับป้าย (ประมาณการ) ที่หายไปเองเมื่อทุกชิ้นมีใบรับเข้าของตัวเอง.
 */
function stats(t: CaseTotalsJson): SummaryStat[] {
  const out: SummaryStat[] = [
    {
      label: "ค่าซ่อม + บำรุงรักษา",
      value: t.servicePriced > 0 ? baht(t.serviceCost) : "—",
      hint: t.serviceCases === 0
        ? "ไม่มีเคสซ่อมหรือบำรุงในตัวกรองนี้"
        : `จาก ${t.servicePriced.toLocaleString()} จาก ${t.serviceCases.toLocaleString()} เคสซ่อม+บำรุงที่ระบุราคา`,
      token: t.servicePriced > 0 ? "value" : undefined,
    },
  ];

  if (t.lostCases === 0) return out;

  const known = t.lostPriced / t.lostCases >= 0.5;
  // ป้าย (ประมาณการ) หายเองเมื่อทุกเคสที่ตีราคาได้ใช้ราคาจากใบรับเข้าของชิ้นนั้นเอง
  const estimated = t.lostExact < t.lostPriced;
  out.push(
    known
      ? {
          label: estimated ? "มูลค่าที่หายไป (ประมาณการ)" : "มูลค่าที่หายไป",
          value: baht(t.lostValue),
          hint: `ของหาย ${t.lostUnits.toLocaleString()} หน่วย · ตีราคาได้ ${t.lostPriced.toLocaleString()} จาก ${t.lostCases.toLocaleString()} เคส`,
          token: "lost",
        }
      : {
          label: "ของหาย",
          value: `${t.lostUnits.toLocaleString()} หน่วย`,
          hint: t.lostPriced === 0
            ? `${t.lostCases.toLocaleString()} เคส · ยังไม่มีเคสไหนตีราคาได้`
            : `ตีราคาได้ ${t.lostPriced.toLocaleString()} จาก ${t.lostCases.toLocaleString()} เคส · ${baht(t.lostValue)} (ประมาณการ)`,
          token: "lost",
        },
  );
  return out;
}
