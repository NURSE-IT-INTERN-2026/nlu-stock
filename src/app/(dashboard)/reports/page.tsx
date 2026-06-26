"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Package, ShoppingCart, BookOpen, AlertTriangle, Wallet,
  Wrench, CalendarClock, History,
} from "lucide-react";
import { StockSummaryTab } from "@/components/reports/stock-summary-tab";
import { DispenseHistoryTab } from "@/components/reports/dispense-history-tab";
import { UsageBySubjectTab } from "@/components/reports/usage-by-subject-tab";
import { NearExpiryLowStockTab } from "@/components/reports/near-expiry-low-stock-tab";
import { AnnualCostTab } from "@/components/reports/annual-cost-tab";
import { DamagedAssetsTab } from "@/components/reports/damaged-assets-tab";
import { MaintenanceScheduleTab } from "@/components/reports/maintenance-schedule-tab";
import { MaintenanceHistoryTab } from "@/components/reports/maintenance-history-tab";

const TABS = [
  { value: "stock-summary", label: "สรุปสต็อก", icon: Package, component: StockSummaryTab },
  { value: "dispense-history", label: "ประวัติการเบิก", icon: ShoppingCart, component: DispenseHistoryTab },
  { value: "usage-by-subject", label: "การใช้งานรายวิชา", icon: BookOpen, component: UsageBySubjectTab },
  { value: "near-expiry-low-stock", label: "ใกล้หมดอายุ / สต็อกต่ำ", icon: AlertTriangle, component: NearExpiryLowStockTab },
  { value: "annual-cost", label: "ค่าใช้จ่ายรายปี", icon: Wallet, component: AnnualCostTab },
  { value: "damaged-assets", label: "พัสดุชำรุด", icon: Wrench, component: DamagedAssetsTab },
  { value: "maintenance-schedule", label: "ตารางบำรุงรักษา", icon: CalendarClock, component: MaintenanceScheduleTab },
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

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="pb-6">
        <h1 className="text-xl font-semibold tracking-tight">รายงาน</h1>
        <p className="text-sm text-muted-foreground mt-1">สรุปและวิเคราะห์ข้อมูลพัสดุ การเบิก และการบำรุงรักษา</p>
      </div>

      {/* Horizontal tabs */}
      <div className="border-b mb-6">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map(({ value, label, icon: Icon }) => {
            const isActive = activeTab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setActiveTab(value)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
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
