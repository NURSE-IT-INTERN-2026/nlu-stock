"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/components/layout/auth-guard";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "สวัสดีตอนเช้า";
  if (h < 17) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}

function formatTimestamp(): string {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

export function DashboardGreeting() {
  const { user } = useSession();
  const greeting = getGreeting();
  const firstName = user?.name?.split(" ")[0] ?? "ผู้ใช้งาน";

  const [timestamp, setTimestamp] = useState(formatTimestamp);

  useEffect(() => {
    const id = setInterval(() => setTimestamp(formatTimestamp()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <h1 className="text-2xl flex items-baseline gap-2 flex-wrap">
        <span className="font-normal text-muted-foreground">{greeting}, </span>
        <span className="font-bold text-foreground">{firstName}</span>
        <span className="text-sm font-normal text-muted-foreground">
          นี่คือสถานะสต๊อกล่าสุดประจำวันนี้
        </span>
      </h1>
      <p className="text-xs text-muted-foreground mt-1">
        อัปเดตล่าสุด: {timestamp}
      </p>
    </div>
  );
}
