"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { History, PackageCheck, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePageHeader } from "@/components/layout/page-header-context";
import { SubItemStatusPanel } from "@/components/receive/sub-item-status-panel";
import { CaseWorkspace } from "@/components/cases/case-workspace";

// ซ่อม ≠ บำรุงรักษา. บำรุงรักษา is planned — a cycle, a due date, a table you read ahead of time
// (/maintenance). ซ่อม is unplanned — something broke, and the only question is what is still
// open. Two intents, two pages: this one never shows a schedule, and that one never shows a
// repair queue. They meet only in maintenance_records, where a finished job of either kind lands.
// รับคืนจากส่งซ่อม ย้ายมาจาก /receive: นั่นคือหน้า "ของเข้าคลัง" ซึ่งเป็นคนละกริยากับการปิดงานซ่อม
// และคนที่ตามงานซ่อมอยู่ต้องข้ามไปอีกหน้าเพื่อปิดงานที่ตัวเองเปิดไว้เอง. ตอนนี้เที่ยวซ่อมทั้งเที่ยว
// (แจ้งชำรุด → ส่งซ่อม → รับคืน) อยู่หน้าเดียว.
type RepairTab = "worklist" | "receive" | "history";

const REPAIR_TABS = [
  { value: "worklist", label: "ค้างซ่อม", icon: Wrench },
  { value: "receive", label: "รับคืนจากส่งซ่อม", icon: PackageCheck },
  { value: "history", label: "ประวัติ", icon: History },
] as const;

export default function RepairsPage() {
  return (
    <Suspense>
      <RepairsShell />
    </Suspense>
  );
}

function RepairsShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: RepairTab = REPAIR_TABS.some((t) => t.value === rawTab) ? (rawTab as RepairTab) : "worklist";
  const changeTab = (value: RepairTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.replace(`/repairs?${params.toString()}`, { scroll: false });
  };

  const [openJobs, setOpenJobs] = useState(0);

  const { setDetail } = usePageHeader();
  const activeLabel = REPAIR_TABS.find((t) => t.value === tab)?.label;
  useEffect(() => {
    setDetail(activeLabel ?? null);
    return () => setDetail(null);
  }, [activeLabel, setDetail]);

  return (
    <div className="flex flex-col">
      <div className="border-b mb-4 sm:mb-6 -mx-4 px-4 sm:-mx-6 sm:px-6">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {REPAIR_TABS.map(({ value, label, icon: Icon }) => {
            const isActive = tab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => changeTab(value)}
                className={cn(
                  "relative flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
                {value === "worklist" && openJobs > 0 && (
                  <span className={cn(
                    "inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-bold tabular-nums",
                    isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}>{openJobs}</span>
                )}
                {isActive && (
                  <motion.span
                    layoutId="repairs-tab"
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                    className="absolute -bottom-[2px] left-0 right-0 h-0.5 bg-primary"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Mounted on every tab, not just its own, so the tab badge is right before anyone clicks it. */}
      <div className={cn("pb-4", tab !== "worklist" && "hidden")}>
        <SubItemStatusPanel status="ALL" onCount={setOpenJobs} emptyText="ไม่มีรายการค้างซ่อม" />
      </div>

      {/* ค้างซ่อม (ALL) รวมของที่ยังไม่ได้ส่งด้วย; แท็บนี้เหลือเฉพาะเที่ยวที่ส่งไปแล้ว ซึ่งเป็น
          รายการเดียวที่ "รับคืน" ได้จริง — คนที่มาปิดงานไม่ต้องอ่านผ่านคิวที่ยังไม่ถึงคิวตัวเอง. */}
      <div className={cn("pb-4", tab !== "receive" && "hidden")}>
        {tab === "receive" && (
          <SubItemStatusPanel status="UNDER_REPAIR" emptyText="ไม่มีรายการที่อยู่ระหว่างซ่อมแซม" />
        )}
      </div>

      {/* ประวัติ = เคสซ่อมทั้งหมด อ่านจากที่มาเดียวกับหน้า /cases. เดิมที่นี่ list บันทึกซ่อมดิบๆ ซึ่งคือ
          "ขั้นปิด" ของเคส — เป็น log คู่ขนานที่พูดเรื่องเดียวกันคนละหน่วย. หน้านี้เก็บไว้แค่คิวค้างซ่อม
          ซึ่งเป็นสิ่งที่ต้องลงมือทำ. */}
      <div className={cn("pb-4", tab !== "history" && "hidden")}>
        {tab === "history" && <CaseWorkspace lockType="REPAIR" />}
      </div>
    </div>
  );
}
