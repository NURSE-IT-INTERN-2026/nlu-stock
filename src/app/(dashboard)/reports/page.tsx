"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  Package, ShoppingCart, BookOpen, Wallet,
  Wrench, History, ArrowDownToLine, Boxes, CalendarClock,
} from "lucide-react";
import { StockSummaryTab } from "@/components/reports/stock-summary-tab";
import { StockBalanceTab } from "@/components/reports/stock-balance-tab";
import { DispenseHistoryTab } from "@/components/reports/dispense-history-tab";
import { OutstandingLoansTab } from "@/components/reports/outstanding-loans-tab";
import { ReceiveHistoryTab } from "@/components/reports/receive-history-tab";
import { UsageBySubjectTab } from "@/components/reports/usage-by-subject-tab";
import { AnnualCostTab } from "@/components/reports/annual-cost-tab";
import { DamagedAssetsTab } from "@/components/reports/damaged-assets-tab";
import { MaintenanceHistoryTab } from "@/components/reports/maintenance-history-tab";
import { usePageHeader } from "@/components/layout/page-header-context";

const TABS = [
  { value: "stock-summary", label: "สรุปสต็อก", icon: Package, component: StockSummaryTab },
  { value: "stock-balance", label: "มูลค่าคงเหลือรายพัสดุ", icon: Boxes, component: StockBalanceTab },
  { value: "dispense-history", label: "รายการเบิก", icon: ShoppingCart, component: DispenseHistoryTab },
  { value: "outstanding-loans", label: "รายการยืมค้าง", icon: CalendarClock, component: OutstandingLoansTab },
  { value: "receive-history", label: "ประวัติรับเข้า", icon: ArrowDownToLine, component: ReceiveHistoryTab },
  { value: "usage-by-subject", label: "สถิติการใช้งาน", icon: BookOpen, component: UsageBySubjectTab },
  { value: "annual-cost", label: "ค่าใช้จ่ายรายปี", icon: Wallet, component: AnnualCostTab },
  { value: "damaged-assets", label: "ครุภัณฑ์ชำรุด", icon: Wrench, component: DamagedAssetsTab },
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
  const router = useRouter();
  const pathname = usePathname();
  const tabParam = searchParams.get("tab");
  const validTabs: string[] = TABS.map((t) => t.value);
  const [activeTab, setActiveTab] = useState(
    tabParam && validTabs.includes(tabParam) ? tabParam : "stock-summary",
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
