// หลักฐานแนบย้อนหลัง — one write path for every "แนบเพิ่ม" and "ลบไฟล์" in the app.
//
// The urls stay where they already are: three String[] columns on the three tables that own an
// evidence-carrying event. This file is only the map from a record type to its column, plus the
// rules for changing one safely. Moving the urls into an Attachment table would be a migration
// across every write route for nothing the array cannot already do.

import { EXT_BY_MIME, MAX_EVIDENCE_FILES } from "@/lib/uploads";

/** recordType → the String[] column that holds its หลักฐาน. The allowlist, too: a type absent
 *  here is refused, so a caller cannot name an arbitrary table. */
export const ATTACH_TARGETS = {
  StockAdjustment: "imageEvidenceUrls",
  MaintenanceRecord: "attachmentUrls",
  ItemStatusLog: "imageUrls",
} as const;

export type AttachRecordType = keyof typeof ATTACH_TARGETS;

export function isAttachRecordType(v: unknown): v is AttachRecordType {
  return typeof v === "string" && v in ATTACH_TARGETS;
}

/**
 * A url this app itself stored, and nothing else.
 *
 * The client hands back whatever POST /api/upload gave it, but "the client hands it back" is not
 * a guarantee — the value lands in an `<img src>` and an `<a href>` on every screen that shows the
 * event, so an unchecked string is someone else's origin (or a `javascript:`) rendered by us.
 * The shape is exactly what the upload route writes: /uploads/<uuid>.<ext>, extension from the
 * byte-sniff allowlist.
 */
const UPLOAD_URL = new RegExp(
  `^/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(${Object.values(EXT_BY_MIME)
    .map((e) => e.replace(".", "\\."))
    .join("|")})$`,
  "i",
);

export const isUploadUrl = (url: unknown): url is string =>
  typeof url === "string" && UPLOAD_URL.test(url);

/**
 * หลักฐานที่มากับ body ของ route ที่ยังไม่ได้ผูก zod — คืน [] เมื่อไม่มีไฟล์แนบมา และคืน null
 * เมื่อมี url ที่ไม่ได้มาจากการอัปโหลดในระบบ ให้ผู้เรียกตอบ 400 แทนการดรอปเงียบ ๆ
 *
 * ดรอปเงียบไม่ได้เพราะคำว่า "หลักฐาน" คือทั้งหมดของฟีเจอร์นี้: เจ้าหน้าที่ที่แนบไฟล์แล้วระบบ
 * เก็บไม่ครบโดยไม่บอก จะปิดใบไปทั้งที่เชื่อว่ามีหลักฐานติดอยู่
 *
 * และปล่อยผ่านก็ไม่ได้: url ที่ไม่ใช่ /uploads/ จะถูก withBase() ส่งผ่านดิบ ๆ แล้ว
 * AttachmentList วาดเป็น <a href> ป้าย "เอกสาร 1" — ลิงก์นอกที่หน้าตาเหมือนไฟล์ของระบบเอง
 * (รวมถึง javascript: ซึ่งไม่เคยเป็น src ของ <img> จึงไม่มีอะไรกันมันไว้)
 */
export function evidenceUrls(raw: unknown): string[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  // slice ก่อน every: เพดาน 5 ไฟล์เป็นกติกาของฟอร์ม ส่วน url แปลกปลอมเป็นเรื่องความถูกต้อง
  // ของหลักฐาน — ใบที่แนบมา 6 ไฟล์ถูกต้องทุกไฟล์ ไม่ควรถูกปฏิเสธทั้งใบ
  const urls: unknown[] = raw.slice(0, MAX_EVIDENCE_FILES);
  return urls.every(isUploadUrl) ? (urls as string[]) : null;
}

/**
 * รูปพัสดุ — ผ่อนกว่า isUploadUrl หนึ่งขั้น และตั้งใจให้ผ่อน.
 *
 * ค่าพวกนี้ลงไปอยู่ใน <img src> เท่านั้น (ItemThumb, แกลเลอรีในหน้าพัสดุ) ไม่เคยเป็น href —
 * `javascript:` จึงไม่ทำงาน แต่ก็ไม่มีเหตุผลให้เก็บมันไว้ ส่วน https ภายนอกต้องยอมจริง ๆ
 * เพราะรูปตั้งต้นของพัสดุเกือบพันตัวชี้ไป picsum อยู่ (scripts/seed-picsum.ts) — บังคับ
 * /uploads/ ตรงนี้แปลว่าเปิดกล่องแก้ไขพัสดุแล้วกดบันทึกโดยไม่แตะรูปก็ 422.
 *
 * ไฟล์ที่อัปโหลดเองยังผ่านทางแรกเสมอ ทางที่สองเป็นของรูปภายนอกล้วน ๆ
 */
export const isSafeImageSrc = (url: unknown): url is string =>
  isUploadUrl(url) || (typeof url === "string" && /^https:\/\/[^\s"'<>\\]+$/.test(url));

export type AttachmentChange = {
  /** Files to append. Must be urls this app stored; anything else is dropped. */
  add?: unknown;
  /** Files to unlink. A url not currently on the record is ignored, not an error. */
  remove?: unknown;
};

export type ResolvedChange = {
  next: string[];
  added: string[];
  removed: string[];
};

/**
 * What the array should become, and what actually changed — the caller writes `next` and logs
 * `added`/`removed`. Kept pure so the rules are testable without a database.
 *
 * Removals apply before additions, so swapping a wrong photo for the right one in one call does
 * not trip the cap. Duplicates are dropped: attaching the same url twice would render it twice
 * and give the delete button two identical targets.
 */
export function resolveChange(current: string[], change: AttachmentChange): ResolvedChange {
  const add = (Array.isArray(change.add) ? change.add : []).filter(isUploadUrl);
  const remove = new Set((Array.isArray(change.remove) ? change.remove : []).filter(isUploadUrl));

  const kept = current.filter((u) => !remove.has(u));
  const removed = current.filter((u) => remove.has(u));

  const next = [...kept];
  const added: string[] = [];
  for (const url of add) {
    if (next.length >= MAX_EVIDENCE_FILES) break;
    if (next.includes(url)) continue;
    next.push(url);
    added.push(url);
  }

  return { next, added, removed };
}

/** Whether the change is worth a write at all — an edit dialog that closes untouched sends both
 *  lists empty, and two admins racing can both resolve to a no-op. */
export const isNoop = (c: ResolvedChange) => c.added.length === 0 && c.removed.length === 0;
