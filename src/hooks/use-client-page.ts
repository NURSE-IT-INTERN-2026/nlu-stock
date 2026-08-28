"use client";

import { useEffect, useMemo, useState } from "react";
import { PAGE_SIZE } from "@/lib/pagination-constants";

/**
 * แบ่งหน้าฝั่ง client สำหรับ list ที่โหลดมาทั้งก้อนแล้ว (ไม่ยิง server ต่อหน้า).
 *
 * ponytail: หน้าที่เกินขอบถูก clamp ไม่ใช่ reset — ลบแถวสุดท้ายของหน้า 3 ต้องตกมาหน้า 2
 * ไม่ใช่เด้งกลับหน้า 1. reset จริงเกิดเฉพาะตอน filter/search เปลี่ยน ซึ่งผู้เรียกส่งมาทาง
 * `resetKey` เพราะมีแต่ผู้เรียกที่รู้ว่าอะไรนับเป็น "คนละชุดผลลัพธ์".
 */
export function useClientPage<T>(rows: T[], pageSize: number = PAGE_SIZE.DEFAULT, resetKey?: unknown) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, totalPages);
  const paged = useMemo(
    () => rows.slice((current - 1) * pageSize, current * pageSize),
    [rows, current, pageSize],
  );

  return { page: current, setPage, paged, total: rows.length, pageSize };
}
