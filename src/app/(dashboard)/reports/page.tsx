"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  ShoppingCart, BookOpen, Wallet, ArrowDownToLine, Boxes,
} from "lucide-react";
import { StockBalanceTab } from "@/components/reports/stock-balance-tab";
import { StockOutTab } from "@/components/reports/stock-out-tab";
import { ReceiveHistoryTab } from "@/components/reports/receive-history-tab";
import { UsageBySubjectTab } from "@/components/reports/usage-by-subject-tab";
import { AnnualCostTab } from "@/components/reports/annual-cost-tab";
import { usePageHeader } from "@/components/layout/page-header-context";

// เรียงตาม tab ที่มีข้อมูลจริงก่อน — ออกจากคลังคือสิ่งที่เกิดขึ้นทุกวัน ส่วนมูลค่า/ค่าใช้จ่าย
// รอให้มีคนกรอกราคาก่อนถึงจะมีอะไรให้อ่าน.
//
// `เคสงาน` เคยอยู่ที่นี่ ก่อนหน้านั้นเคยเป็นหน้า /cases ของตัวเอง และเคยเป็น tab `ชำรุด & ส่งซ่อม`
// กับ `ประวัติบำรุงรักษา` ที่อ่านคนละ query กันแล้วให้ตัวเลขไม่ตรงกัน. ตอนนี้เคสอ่านที่ตัวของ —
// แท็บประวัติในหน้าพัสดุ — ส่วนงานที่ยังค้างอยู่รวมกันที่ /alerts?todo=true. หน้ารายงานเหลือแต่
// รายงาน: สิ่งที่นับรวมได้ทั้งคลัง ไม่ใช่ประวัติของของชิ้นใดชิ้นหนึ่ง.
//
// ไม่มีหัวเรื่องกับคำโปรยในแต่ละ tab แล้ว — ชื่อบน tab บอกครบอยู่แล้วว่ากำลังดูอะไร และคำโปรย
// ก็กินที่บนสุดของทุกหน้าจอโดยที่ไม่มีใครอ่านซ้ำรอบที่สอง.
// `token` คือสีประจำ tab ที่หัวตาราง / การ์ดตัวเลขข้างในใช้ร่วมกัน.
const TABS = [
  { value: "dispense-history", label: "ออกจากคลัง", token: "issue", icon: ShoppingCart, component: StockOutTab },
  { value: "receive-history", label: "เข้าคลัง", token: "stockin", icon: ArrowDownToLine, component: ReceiveHistoryTab },
  { value: "usage-by-subject", label: "สถิติการใช้งาน", token: "maintain", icon: BookOpen, component: UsageBySubjectTab },
  { value: "stock-balance", label: "มูลค่าคงคลัง", token: "value", icon: Boxes, component: StockBalanceTab },
  { value: "annual-cost", label: "ค่าใช้จ่ายรายปี", token: "value", icon: Wallet, component: AnnualCostTab },
] as const;

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsContent />
    </Suspense>
  );
}

function ReportsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabParam = searchParams.get("tab");
  const validTabs: string[] = TABS.map((t) => t.value);
  const [activeTab, setActiveTab] = useState(
    tabParam && validTabs.includes(tabParam) ? tabParam : TABS[0].value,
  );
  const { setDetail } = usePageHeader();

  // Write the active tab to ?tab= so a browser refresh stays on the same tab.
  const selectTab = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    params.delete("case");
    router.replace(`${pathname}?${params.toString()}`);
  };

  // ลิงก์เก่าที่ชี้มาแท็บเคสงาน. ปล่อยให้ตกไปแท็บแรกเงียบๆ แปลว่าคนกดมาแล้วไปโผล่ "ออกจากคลัง"
  // โดยไม่มีอะไรบอกว่าเกิดอะไรขึ้น — bookmark ที่ยังใช้ได้แต่พาไปผิดที่แย่กว่าลิงก์ที่พาไปถูกที่.
  useEffect(() => {
    if (tabParam === "cases") router.replace("/alerts?todo=true");
  }, [tabParam, router]);

  // Reflect the active tab in the header breadcrumb ("รายงาน & สถิติ › <tab>").
  const active = TABS.find((t) => t.value === activeTab) ?? TABS[0];
  const activeTabLabel = active.label;
  useEffect(() => {
    setDetail(activeTabLabel);
    return () => setDetail(null);
  }, [activeTabLabel, setDetail]);

  return (
    <div className="space-y-0">
      {/* Horizontal tabs */}
      <div className="border-b mb-4 sm:mb-6 -mx-4 px-4 sm:-mx-6 sm:px-6">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map(({ value, label, icon: Icon }) => {
            const isActive = activeTab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => selectTab(value)}
                className={`relative flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
                {isActive && (
                  <motion.span
                    layoutId="reports-tab"
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                    className="absolute -bottom-[2px] left-0 right-0 h-0.5 bg-primary"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content area */}
      <div>
        {TABS.map(({ value, component: Component }) => (
          <div key={value} className={activeTab === value ? "" : "hidden"}>
            <Component />
          </div>
        ))}
      </div>
    </div>
  );
}
