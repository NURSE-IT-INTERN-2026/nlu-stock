"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { useDispenseMonthly } from "@/hooks/use-dashboard-queries";
import { MonthlyDispenseChart } from "./monthly-dispense-chart";

export function MonthlyDispenseWidget() {
  const { data, isLoading, error, refetch } = useDispenseMonthly();

  return (
    <Card className="flex flex-col h-full w-full">
      <CardHeader className="border-b py-3">
        <CardTitle className="text-base font-semibold text-foreground">
          การเบิก-จ่ายรายเดือน
        </CardTitle>
        <CardAction>
          <Link href="/reports" className={buttonVariants({ variant: "outline", size: "sm" })}>
            ดูรายงาน
            <ChevronRight className="size-3.5" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        {isLoading ? (
          <div className="flex items-end justify-around gap-2 h-[200px]">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="w-full rounded-t-sm" style={{ height: `${80 - i * 8}%` }} />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-6">
            <p className="text-sm text-destructive mb-2">{error.message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>โหลดใหม่</Button>
          </div>
        ) : (
          <MonthlyDispenseChart data={data ?? []} />
        )}
      </CardContent>
    </Card>
  );
}
