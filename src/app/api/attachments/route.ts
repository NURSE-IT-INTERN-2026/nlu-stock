import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth, json, error, notFound, handleError, getSearchParams } from "@/lib/api-utils";
import { isAttachRecordType, resolveChange, isNoop, type AttachRecordType } from "@/lib/attachments";

// แนบไฟล์ย้อนหลัง. One endpoint behind every "แนบเพิ่ม"/"ลบไฟล์" button, so the rules — who may,
// how many, which urls count, what gets logged — live in one place instead of once per form.
//
// Attaching at the moment a record is created still happens on that record's own route; only
// the after-the-fact edits come through here, and only those leave an attachment_logs row.

/** The three tables that own an evidence array. Prisma delegates are spelled out rather than
 *  indexed by string so the client's recordType can never select one. */
async function readUrls(recordType: AttachRecordType, id: string): Promise<string[] | null> {
  switch (recordType) {
    case "StockAdjustment": {
      const r = await prisma.stockAdjustment.findUnique({ where: { id }, select: { imageEvidenceUrls: true } });
      return r?.imageEvidenceUrls ?? null;
    }
    case "MaintenanceRecord": {
      const r = await prisma.maintenanceRecord.findUnique({ where: { id }, select: { attachmentUrls: true } });
      return r?.attachmentUrls ?? null;
    }
    case "ItemStatusLog": {
      const r = await prisma.itemStatusLog.findUnique({ where: { id }, select: { imageUrls: true } });
      return r?.imageUrls ?? null;
    }
  }
}

async function writeUrls(recordType: AttachRecordType, id: string, urls: string[]): Promise<void> {
  switch (recordType) {
    case "StockAdjustment":
      await prisma.stockAdjustment.update({ where: { id }, data: { imageEvidenceUrls: urls } });
      return;
    case "MaintenanceRecord":
      await prisma.maintenanceRecord.update({ where: { id }, data: { attachmentUrls: urls } });
      return;
    case "ItemStatusLog":
      await prisma.itemStatusLog.update({ where: { id }, data: { imageUrls: urls } });
      return;
  }
}

function parseTarget(recordType: unknown, recordId: unknown) {
  if (!isAttachRecordType(recordType)) return null;
  if (typeof recordId !== "string" || !recordId) return null;
  return { recordType, recordId };
}

/** ประวัติไฟล์แนบ — read on demand from the popover, never on page load. Anyone who may see the
 *  files may see who changed them; it is an audit trail, not a stock write. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const target = parseTarget(params.get("recordType"), params.get("recordId"));
  if (!target) return error("ข้อมูลไม่ครบ", 400);

  const rows = await prisma.attachmentLog.findMany({
    where: target,
    include: { by: { select: { name: true } } },
    orderBy: { at: "desc" },
  });

  return json({
    entries: rows.map((r) => ({
      id: r.id, url: r.url, action: r.action, at: r.at.toISOString(), by: r.by.name,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const body = await request.json().catch(() => null);
  const target = parseTarget(body?.recordType, body?.recordId);
  if (!target) return error("ข้อมูลไม่ครบ", 400);

  try {
    // Read → resolve → write is not atomic; two admins attaching at once means the second read
    // may miss the first's file. The cost of losing that race is one url to re-attach, and the
    // alternative is a row lock on tables the whole app writes through. ponytail: last write
    // wins, revisit if more than a couple of people ever edit the same event.
    const current = await readUrls(target.recordType, target.recordId);
    if (current === null) return notFound("ไม่พบรายการ");

    const change = resolveChange(current, { add: body?.add, remove: body?.remove });
    if (isNoop(change)) return json({ urls: current });

    await writeUrls(target.recordType, target.recordId, change.next);
    await prisma.attachmentLog.createMany({
      data: [
        ...change.added.map((url) => ({ ...target, url, action: "ADD", byId: auth.user.userId })),
        ...change.removed.map((url) => ({ ...target, url, action: "REMOVE", byId: auth.user.userId })),
      ],
    });

    return json({ urls: change.next });
  } catch (err) {
    return handleError(err, "แก้ไขไฟล์แนบไม่สำเร็จ");
  }
}
