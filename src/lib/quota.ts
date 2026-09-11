import type { Prisma } from "@/generated/prisma/client";

type Database = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;

/** หนึ่งหน้าต่าง: คีย์ที่นับ, ความกว้างเป็นวินาที, จำนวนครั้งที่ยอมให้ในหน้าต่างนั้น */
export type QuotaWindow = readonly [key: string, seconds: number, limit: number];

/**
 * ตัวนับแบบ fixed window ที่ใช้ร่วมกันทุก worker — คีย์ไหนก็ได้ ไม่ผูกกับฟีเจอร์ใดฟีเจอร์หนึ่ง
 *
 * ตารางยังชื่อ ai_search_limits เพราะ AI search เป็นผู้ใช้รายแรก. ponytail: ไม่ rename เพราะ
 * migration ที่เปลี่ยนชื่อตารางแลกมาด้วยความเสี่ยงตอน deploy ทั้งที่คอลัมน์ทำงานถูกอยู่แล้ว —
 * ถ้าวันหนึ่งมีเหตุให้แตะตารางนี้อยู่แล้ว ค่อยเปลี่ยนชื่อไปพร้อมกัน
 *
 * หน้าต่างถูกนับไล่จากซ้ายไปขวา ตัวที่ผ่านไปแล้วถูกบวกไปแล้วแม้ตัวหลังจะปฏิเสธ — คำขอที่ถูก
 * ปฏิเสธจึงกินโควตาหน้าต่างแรกไปหนึ่งครั้ง เป็นพฤติกรรมเดิมตั้งแต่ AI search และยอมรับได้
 * เพราะคนที่ชนเพดานคือคนที่ยิงถี่อยู่แล้ว. เรียงหน้าต่างจากแคบไปกว้างเพื่อให้ผลข้างเคียงนี้
 * ตกอยู่กับหน้าต่างที่รีเซ็ตเร็วที่สุด
 */
export async function consumeQuota(db: Database, windows: readonly QuotaWindow[]): Promise<boolean> {
  await db.$executeRaw`DELETE FROM ai_search_limits WHERE "windowStart" < NOW() - INTERVAL '2 days'`;
  for (const [key, seconds, limit] of windows) {
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO ai_search_limits (key, "windowStart", count)
      VALUES (${key}, to_timestamp(floor(extract(epoch FROM NOW()) / ${seconds}) * ${seconds}), 1)
      ON CONFLICT (key) DO UPDATE SET
        "windowStart" = GREATEST(ai_search_limits."windowStart", EXCLUDED."windowStart"),
        count = CASE WHEN ai_search_limits."windowStart" < EXCLUDED."windowStart"
          THEN 1 ELSE ai_search_limits.count + 1 END
      WHERE ai_search_limits."windowStart" < EXCLUDED."windowStart" OR ai_search_limits.count < ${limit}
      RETURNING count
    `;
    if (!rows.length) return false;
  }
  return true;
}

/** ค้นหาด้วย AI — เรียก Gemini ซึ่งมีค่าใช้จ่ายจริง. คีย์เดิมตั้งแต่ก่อนแยกไฟล์ ห้ามเปลี่ยน
 *  ไม่งั้นคนที่กำลังติดเพดานอยู่ได้โควตาใหม่ฟรีตอน deploy */
export const consumeSearchQuota = (db: Database, userId: string) =>
  consumeQuota(db, [
    [`user:${userId}:minute`, 60, 20],
    [`user:${userId}:day`, 86400, 200],
    ["global:day", 86400, 2000],
  ] as const);

/**
 * เขียนไฟล์ลงดิสก์ — ไฟล์ละไม่เกิน 10MB แต่เดิมไม่จำกัดจำนวนครั้ง เจ้าหน้าที่คนเดียวจึงทำ
 * ดิสก์เต็มได้ด้วยสคริปต์สั้น ๆ
 *
 * 120 ครั้ง/ชม. เผื่อรอบรับเข้าที่แนบหลักฐานหลายใบต่อรายการติดกัน (5 ไฟล์ × 20 รายการยังอยู่
 * ในเพดาน) ส่วนเพดานรวมทั้งระบบคุมยอดต่อวันไว้อีกชั้น
 */
export const consumeUploadQuota = (db: Database, userId: string) =>
  consumeQuota(db, [
    [`upload:user:${userId}:hour`, 3600, 120],
    ["upload:global:day", 86400, 1500],
  ] as const);

/**
 * ชื่อรายวิชา — cache อยู่ในตาราง courses แต่ "ไม่พบ bulletin" ไม่ถูก cache (lib/courses เขียน
 * ชื่อเฉพาะตอนที่ registrar ตอบชื่อมา) รหัสมั่ว ๆ ที่ยิงซ้ำจึงวิ่งไปถึง apiservice.reg.cmu.ac.th
 * ทุกครั้ง — เพดานนี้กันไม่ให้ระบบเราเป็นเครื่องยิงต่อให้คนอื่น
 *
 * หน้าจอเรียกครั้งเดียวตอนผู้ใช้เลือกวิชา ไม่ใช่ต่อแถวใน dropdown — 20 ครั้ง/นาทีจึงเหลือเฟือ
 */
export const consumeCourseLookupQuota = (db: Database, userId: string) =>
  consumeQuota(db, [
    [`course:user:${userId}:minute`, 60, 20],
    ["course:global:minute", 60, 300],
  ] as const);

/**
 * ออกรายงาน — หนึ่งคำขอคือการกวาดทั้งคลังแล้วเรนเดอร์ PDF/xlsx ฝั่ง server ซึ่งกิน CPU และ
 * หน่วยความจำมากกว่าทุก endpoint ในระบบ เปิดทิ้งไว้แปลว่าใครก็ทำให้เครื่องช้าลงทั้งคณะได้
 */
export const consumeExportQuota = (db: Database, userId: string) =>
  consumeQuota(db, [
    [`export:user:${userId}:minute`, 60, 10],
    [`export:user:${userId}:hour`, 3600, 60],
  ] as const);
