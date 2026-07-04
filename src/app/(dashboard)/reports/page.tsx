"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import {
  Package, ShoppingCart, BookOpen, Wallet,
  Wrench, History, ArrowDownToLine,
} from "lucide-react";
import { StockSummaryTab } from "@/components/reports/stock-summary-tab";
import { DispenseHistoryTab } from "@/components/reports/dispense-history-tab";
import { ReceiveHistoryTab } from "@/components/reports/receive-history-tab";
import { UsageBySubjectTab } from "@/components/reports/usage-by-subject-tab";
import { AnnualCostTab } from "@/components/reports/annual-cost-tab";
import { DamagedAssetsTab } from "@/components/reports/damaged-assets-tab";
import { MaintenanceHistoryTab } from "@/components/reports/maintenance-history-tab";
import { usePageHeader } from "@/components/layout/page-header-context";

const TABS = [
  { value: "stock-summary", label: "สรุปสต็อก", icon: Package, component: StockSummaryTab },
  { value: "dispense-history", label: "ประวัติการเบิก", icon: ShoppingCart, component: DispenseHistoryTab },
  { value: "receive-history", label: "ประวัติรับเข้า", icon: ArrowDownToLine, component: ReceiveHistoryTab },
  { value: "usage-by-subject", label: "การใช้งานรายวิชา", icon: BookOpen, component: UsageBySubjectTab },
  { value: "annual-cost", label: "ค่าใช้จ่ายรายปี", icon: Wallet, component: AnnualCostTab },
  { value: "damaged-assets", label: "พัสดุชำรุด", icon: Wrench, component: DamagedAssetsTab },
  { value: "maintenance-history", label: "ประวัติบำรุงรักษา", icon: History, component: MaintenanceHistoryTab },
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
  const tabParam = searchParams.get("tab");
  const validTabs: string[] = TABS.map((t) => t.value);
  const [activeTab, setActiveTab] = useState(
    tabParam && validTabs.includes(tabParam) ? tabParam : "stock-summary",
  );
  const { setDetail } = usePageHeader();

  // Reflect the active tab in the header breadcrumb ("รายงาน & สถิติ › <tab>").
  const activeTabLabel = TABS.find((t) => t.value === activeTab)?.label ?? "สรุปสต็อก";
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
                onClick={() => setActiveTab(value)}
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
