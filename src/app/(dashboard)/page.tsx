import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getAlertCounts } from "@/lib/alerts";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { DashboardAlertBar } from "@/components/dashboard/dashboard-alert-bar";
import { DashboardBody } from "@/components/dashboard/dashboard-body";

// getAlertCounts อ่าน DB ตรง ๆ ไม่ผ่าน fetch — Next มองไม่เห็นว่าเป็นข้อมูลสด แล้ว prerender
// หน้านี้เป็น static ตอน build ตัวเลขบนแถบแจ้งเตือนจึงค้างที่ตอน build ตลอดกาล (พิสูจน์ด้วย
// `next build`: "/" ขึ้น ○ Static และตัวเลขฝังอยู่ใน .next/server/app/index.html)
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const counts = await getAlertCounts();

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <DashboardGreeting />

      <DashboardAlertBar counts={counts} />

      {/* DashboardBody reads the active tab from the URL (useSearchParams), which needs a
          boundary here or the whole route opts out of prerendering. */}
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <DashboardBody />
      </Suspense>
    </div>
  );
}
