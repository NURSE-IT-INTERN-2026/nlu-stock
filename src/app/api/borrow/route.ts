import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, handleError, parseBody } from "@/lib/api-utils";
import { recomputeItemCounts } from "@/lib/stock";
import { isManualHold } from "@/lib/status-utils";
import { STATUS_LABELS } from "@/lib/constants";
import { ItemStatus } from "@/generated/prisma/enums";
import { isSelfBorrowable, isConsumeOnly, selfBorrowMax, selfBorrowDueAt, SELF_BORROW_DEFAULT_DAYS, SELF_BORROW_MAX_DAYS } from "@/lib/self-borrow";
import { isSelfBorrower } from "@/lib/roles";

// ยืมเอง — deliberately NOT part of /api/dispense. That route takes a whole cart, asks what
// the stock is for (usageType/courseCode), and can park a piece in a room (INUSE); none of
// that applies here, and folding self-service into it would mean every one of its branches
// had to re-ask "but is the caller allowed to do this unattended?".
//
// One item, one line, and the borrower is the staff row — so the record is indistinguishable
// to รับคืน/รายงาน from one an admin typed. Admin still closes the loan.
//
// สิ้นเปลือง files as CONSUME with no due date, exactly as the cart does: it is เบิกใช้, it
// never comes back, and a dueAt on it would show up as an overdue loan nobody can return.

const borrowSchema = z
  .object({
    itemId: z.string().min(1),
    quantity: z.number().int().positive().default(1),
    /** Set when the QR carried ?copy=. Omitted = the server picks a free piece. */
    subItemId: z.string().nullish(),
    // ใช้ใน — asked here for the same reason the cart asks it: a loan nobody can attribute to
    // a subject or an activity is a row that answers no question on any report.
    usageType: z.enum(["COURSE", "ACTIVITY", "OTHER"]),
    courseCode: z.string().nullish(),
    /** COURSE → the course name snapshot; ACTIVITY/OTHER → what it is for. Never both. */
    usageNote: z.string().max(500).nullish(),
    // จำนวนวันที่ยืม ไม่ใช่ timestamp — the server owns the clock. A client that posts its own
    // dueAt is a client that can post one already in the past, or one in 2099.
    days: z.number().int().min(1).max(SELF_BORROW_MAX_DAYS).default(SELF_BORROW_DEFAULT_DAYS),
  })
  // Mirrors the cart's client-side rules on the server, where they actually bind: the dialog
  // can be bypassed, and a loan filed with no subject is unrecoverable after the fact.
  .superRefine((v, ctx) => {
    if (v.usageType === "COURSE" && !v.courseCode) {
      ctx.addIssue({ code: "custom", path: ["courseCode"], message: "เลือกรายวิชา" });
    }
    if (v.usageType !== "COURSE" && !v.usageNote?.trim()) {
      ctx.addIssue({ code: "custom", path: ["usageNote"], message: "ระบุว่านำไปใช้ทำอะไร" });
    }
  });

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;
  // Staff have the full เบิก/ยืม screen, which records who the item is actually for. Letting
  // them through here would file loans against themselves and quietly lose the recipient.
  if (!isSelfBorrower(auth.user.role)) return forbidden();

  const { data, error: parseError } = await parseBody(borrowSchema)(req);
  if (parseError) return parseError;
  if (!data) return NextResponse.json({ error: "No data" }, { status: 400 });

  try {
    const recordId = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({
        where: { id: data.itemId },
        include: {
          category: { include: { profile: true } },
          issueUnit: true,
          subItems: { where: { status: ItemStatus.AVAILABLE }, orderBy: { subCode: "asc" } },
          // FEFO: expiry first, then arrival to break ties between date-coded lots.
          lots: { where: { remainingQty: { gt: 0 } }, orderBy: [{ expiryDate: "asc" }, { receivedDate: "asc" }] },
        },
      });
      if (!item) throw new Error("ไม่พบพัสดุ");

      const profile = item.category.profile;
      const rule = {
        selfBorrowable: item.selfBorrowable,
        selfBorrowLimit: item.selfBorrowLimit,
        availableQty: item.availableQty,
        trackIndividually: item.trackIndividually,
        dispenseType: profile.dispenseType,
        profileSelfBorrowable: profile.selfBorrowable,
        profileSelfBorrowLimit: profile.selfBorrowLimit,
      };
      if (!isSelfBorrowable(rule)) throw new Error(`${item.name} ไม่เปิดให้เบิก-ยืมเอง กรุณาติดต่อเจ้าหน้าที่`);
      const consumeOnly = isConsumeOnly(rule);
      if (!item.isActive) throw new Error(`${item.name} ถูกปิดใช้งาน`);
      // Same carve-out as api/dispense: a tracked item's aggregate status is the highest-priority
      // status among its pieces, so ONE ชำรุด copy out of ten reads as DAMAGED on the parent and
      // this check would refuse the nine that are fine. Tracked pieces are covered instead by the
      // AVAILABLE filter on subItems above, which judges the actual piece going out.
      if (!item.trackIndividually && isManualHold(item.status)) {
        throw new Error(`${item.name}: สถานะ ${STATUS_LABELS[item.status]} — ยืมไม่ได้`);
      }

      const max = selfBorrowMax(rule);
      if (max <= 0) throw new Error(`${item.name} ไม่มีของพร้อมให้ยืมตอนนี้`);
      if (data.quantity > max) {
        throw new Error(`${item.name} ยืมเองได้ครั้งละไม่เกิน ${max} ${item.issueUnit.name}`);
      }

      // Tracked: resolve to one physical piece. A named copy is the copy in the borrower's hand
      // — if it is no longer free, say so instead of quietly filing the loan against a different
      // piece that is still sitting on the shelf. Only an unnamed borrow (the item page, which
      // shows no copy) lets the server choose.
      const sub = item.trackIndividually
        ? data.subItemId
          ? item.subItems.find((s) => s.id === data.subItemId)
          : item.subItems[0]
        : null;
      if (item.trackIndividually && !sub) {
        throw new Error(
          data.subItemId
            ? `${item.name} ชิ้นที่สแกนไม่ว่างแล้ว — สแกนชิ้นอื่น`
            : `${item.name} ถูกยืมออกไปหมดแล้ว`,
        );
      }

      // สิ้นเปลืองที่มีล็อต: ตัดล็อตที่หมดอายุก่อน (FEFO) เหมือน buildCartItem — the include
      // below sorts them. ของที่ไม่มีล็อต (ส่วนใหญ่) ใช้ availableQty เป็นตัวนับตัวเดียว.
      const lot = consumeOnly ? item.lots[0] ?? null : null;
      if (lot && lot.remainingQty < data.quantity) {
        throw new Error(`ล็อต ${lot.lotNumber} เหลือเพียง ${lot.remainingQty} ${item.issueUnit.name}`);
      }

      const record = await tx.dispenseRecord.create({
        data: {
          itemId: item.id,
          subItemId: sub?.id,
          lotId: lot?.id,
          quantity: item.trackIndividually ? 1 : data.quantity,
          // The borrower IS the actor here. recipient repeats the name so the รับคืน screen,
          // which reads recipient for "ใครถือของอยู่", needs no special case for these rows.
          staffId: auth.user.userId,
          recipient: auth.user.name,
          // Same column discipline as the cart: เหตุผล always lands in usageNote, and only
          // the type that owns a field may send it — a course code left over from a switched
          // usageType would file one kind of use under another.
          usageType: data.usageType,
          courseCode: data.usageType === "COURSE" ? data.courseCode : null,
          usageNote: data.usageType === "COURSE" ? data.usageNote?.trim() || null : data.usageNote!.trim(),
          notes: consumeOnly ? "เบิกเองผ่าน QR" : "ยืมเองผ่าน QR",
          loanGroupId: randomUUID(),
          // loanFields() is not reused here: it also decides INUSE, which self-service has no
          // way to reach, and spelling the two cases out keeps that impossible by construction.
          loanType: consumeOnly ? "CONSUME" : "BORROW",
          dueAt: consumeOnly ? null : selfBorrowDueAt(data.days),
        },
      });

      if (sub) {
        // Optimistic lock, same as the qty branch below: the status read above is already stale.
        // QR on a shelf is exactly the concurrent case — two borrowers scanning one copy at the
        // same moment both saw it AVAILABLE, and an unconditional update let both loans through.
        const claimed = await tx.subItem.updateMany({
          where: { id: sub.id, status: ItemStatus.AVAILABLE },
          data: { status: ItemStatus.ON_LOAN },
        });
        if (claimed.count === 0) throw new Error(`${item.name} มีคนตัดหน้ายืมไปแล้ว`);
        // Mirrors api/dispense: this log row is what lets an item's ประวัติ fold the status
        // change into the ยืม row beside it instead of printing the same event twice.
        await tx.itemStatusLog.create({
          data: {
            itemId: item.id,
            subItemId: sub.id,
            previousStatus: sub.status,
            newStatus: ItemStatus.ON_LOAN,
            reason: "ยืมเอง",
            changedBy: auth.user.userId,
          },
        });
        await recomputeItemCounts(tx, item.id);
      } else {
        // Optimistic lock, same as dispense: two people scanning the last unit at once must
        // not both win. availableQty read above is already stale by the time we get here.
        const updated = await tx.item.updateMany({
          where: { id: item.id, availableQty: { gte: data.quantity } },
          data: { availableQty: { decrement: data.quantity } },
        });
        if (updated.count === 0) throw new Error(`${item.name} เหลือไม่พอ มีคนตัดหน้าไปแล้ว`);

        if (lot) {
          // Locked the same way, and checked after: a lot that lost the race leaves the item
          // counter already decremented, so the throw has to roll the transaction back.
          const lotUpdate = await tx.lot.updateMany({
            where: { id: lot.id, remainingQty: { gte: data.quantity } },
            data: { remainingQty: { decrement: data.quantity } },
          });
          if (lotUpdate.count === 0) throw new Error(`ล็อต ${lot.lotNumber} เหลือไม่พอ มีคนตัดหน้าไปแล้ว`);
        }
        // ของสิ้นเปลืองที่ไม่มีล็อตต้องไม่ถูก sync ยอดจาก SUM(lots) — recomputeItemCounts
        // guards on lotCount itself, which is why it is safe to call for both shapes.
        await recomputeItemCounts(tx, item.id);
      }

      return record.id;
    });

    return NextResponse.json({ success: true, id: recordId }, { status: 201 });
  } catch (err) {
    return handleError(err, "ยืมไม่สำเร็จ");
  }
}
