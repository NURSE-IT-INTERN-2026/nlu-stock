"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  ShoppingCart, BookOpen, Wallet,
  Wrench, History, ArrowDownToLine, Boxes,
} from "lucide-react";
import { StockBalanceTab } from "@/components/reports/stock-balance-tab";
import { StockOutTab } from "@/components/reports/stock-out-tab";
import { ReceiveHistoryTab } from "@/components/reports/receive-history-tab";
import { UsageBySubjectTab } from "@/components/reports/usage-by-subject-tab";
import { AnnualCostTab } from "@/components/reports/annual-cost-tab";
import { DamagedAssetsTab } from "@/components/reports/damaged-assets-tab";
import { MaintenanceHistoryTab } from "@/components/reports/maintenance-history-tab";
import { usePageHeader } from "@/components/layout/page-header-context";

// เรียงตาม tab ที่มีข้อมูลจริงก่อน — ออกจากคลังคือสิ่งที่เกิดขึ้นทุกวัน ส่วนมูลค่า/ค่าใช้จ่าย
// รอให้มีคนกรอกราคาก่อนถึงจะมีอะไรให้อ่าน. `hint` คือประโยคเดียวที่บอกว่า tab นี้ตอบคำถามอะไร.
const TABS = [
  { value: "dispense-history", label: "ออกจากคลัง", hint: "ของที่จ่ายออกไปแล้ว ใครเอาไป คืนหรือยัง", icon: ShoppingCart, component: StockOutTab },
  { value: "receive-history", label: "เข้าคลัง", hint: "ของที่รับเข้าและคืนกลับเข้าคลัง", icon: ArrowDownToLine, component: ReceiveHistoryTab },
  { value: "usage-by-subject", label: "สถิติการใช้งาน", hint: "เบิกไปใช้กับวิชาหรือกิจกรรมไหน", icon: BookOpen, component: UsageBySubjectTab },
  { value: "damaged-assets", label: "ชำรุด & ส่งซ่อม", hint: "ตอนนี้อะไรพังอยู่ พังเพราะอะไร ซ่อมที่ไหน", icon: Wrench, component: DamagedAssetsTab },
  { value: "maintenance-history", label: "ประวัติบำรุงรักษา", hint: "รอบตรวจเช็คและซ่อมที่ทำไปแล้ว", icon: History, component: MaintenanceHistoryTab },
  { value: "stock-balance", label: "มูลค่าคงคลัง", hint: "ของที่เหลืออยู่ คิดเป็นเงินเท่าไร แยกตามหมวด", icon: Boxes, component: StockBalanceTab },
  { value: "annual-cost", label: "ค่าใช้จ่ายรายปี", hint: "ซื้อและซ่อมไปเท่าไรในปีนั้น", icon: Wallet, component: AnnualCostTab },
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
    router.replace(`${pathname}?${params.toString()}`);
  };

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

      {/* One line saying what this tab answers — the tab labels alone never told anyone
          whether "ชำรุด" meant what is broken now or what was repaired last year. */}
      <p className="-mt-2 mb-4 text-xs text-muted-foreground sm:-mt-3 sm:mb-5">{active.hint}</p>

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
