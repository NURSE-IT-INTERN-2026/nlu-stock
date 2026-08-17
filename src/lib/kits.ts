import type { Prisma } from "@/generated/prisma/client";
import { ItemStatus, LoanType } from "@/generated/prisma/enums";
import { allocateAcrossLots, recomputeItemCounts } from "@/lib/stock";
import { logReturn } from "@/lib/returns";

type TxClient = Prisma.TransactionClient;

/**
 * A KIT (อุปกรณ์ประกอบวิชา) set is persistent.
 *
 *   KIT Item    = the recipe (name + BOM). One row forever, never stock.
 *   KIT SubItem = one physically assembled set, with its own status.
 *
 * ประกอบ → ยืม → คืน → ยืมอีก. Returning a set does NOT unpack it: the box comes back whole
 * and stays a box. Stock is cut once, at assemble time, and the set holds it until an admin
 * explicitly kills the set (ยกเลิกชุด, cancelKitSet below).
 *
 * Components fall into three buckets, and the bucket decides what assemble does:
 *   tracked (trackIndividually) — specific SubItems held IN_USE with inKitSubItemId set
 *   non-tracked durable (COUNT) — cut from availableQty
 *   consumable (CONSUMABLE)     — NOT CUT. The BOM counts ชิ้น while the item is stocked in
 *                                 กล่อง (50/กล่อง) and nothing converts between the two, so
 *                                 any automatic cut is wrong by a factor nobody can predict.
 *                                 Staff เบิก them through the normal cart, which knows the
 *                                 real unit. ประกอบ only asks them to confirm the box is full.
 *
 * Both cut buckets are recorded as นำไปใช้งาน — a DispenseRecord with loanType INUSE, one per
 * set, carrying the set's code in `notes`. StockAdjustment is not used: the components have
 * not been adjusted, they are in a box being used, and the INUSE screens should say so.
 */

export type ComponentKind = "TRACKED" | "COUNT" | "CONSUMABLE";

export interface KitComponent {
  itemId: string;
  code: string;
  name: string;
  unitName: string;
  kind: ComponentKind;
  perSet: number;
  availableQty: number;
  /** The BOM's own unit. Differs from unitName when the recipe counts in a smaller unit than
   *  the item is stocked in (ก๊อซ 5 ชิ้น out of a กล่อง) — see unitMismatch below. */
  bomUnitName: string;
}

/** Read a kit's BOM, classified and priced against current stock. Free-text rows are dropped. */
export async function loadKitComponents(tx: TxClient, kitItemId: string): Promise<KitComponent[]> {
  const rows = await tx.kitBom.findMany({
    where: { kitItemId, componentItemId: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: {
      quantity: true,
      unit: { select: { name: true } },
      componentItem: {
        select: {
          id: true,
          code: true,
          name: true,
          trackIndividually: true,
          availableQty: true,
          issueUnit: { select: { name: true } },
          category: { select: { profile: { select: { dispenseType: true } } } },
        },
      },
    },
  });

  return rows.flatMap((r) => {
    const c = r.componentItem;
    if (!c) return [];
    const dispenseType = c.category.profile.dispenseType;
    const kind: ComponentKind = c.trackIndividually
      ? "TRACKED"
      : dispenseType === "CONSUMABLE"
        ? "CONSUMABLE"
        : "COUNT";
    return [{
      itemId: c.id,
      code: c.code,
      name: c.name,
      unitName: c.issueUnit.name,
      bomUnitName: r.unit.name,
      kind,
      perSet: r.quantity,
      availableQty: c.availableQty,
    }];
  });
}

/**
 * Components whose recipe unit disagrees with the unit their stock is counted in — "5 ชิ้น"
 * against an item stocked in กล่อง. Only the cut buckets matter: perSet is subtracted from
 * availableQty verbatim, so a mismatch quietly removes 5 boxes instead of 5 pieces. Consumables
 * are not cut at all and are exempt by construction; tracked components count SubItems, so
 * their perSet is always pieces.
 */
export function unitMismatches(components: KitComponent[]): KitComponent[] {
  return components.filter((c) => c.kind === "COUNT" && c.bomUnitName !== c.unitName);
}

/** How many more sets the current stock can build. Consumables abstain — the system does not
 *  cut them, so it cannot say whether there is enough, and letting them cap the number would
 *  block assembly on a count that means nothing. */
export function maxAssemblableSets(components: KitComponent[]): number {
  const cut = components.filter((c) => c.kind !== "CONSUMABLE");
  if (cut.length === 0) return 0;
  return Math.min(...cut.map((c) => Math.floor(c.availableQty / c.perSet)));
}

/** Next Cnn for a kit item. Counts DISPOSED sets too — a dead set never frees its number. */
async function nextSetCodes(tx: TxClient, kitItemId: string, count: number): Promise<string[]> {
  const existing = await tx.subItem.findMany({ where: { itemId: kitItemId }, select: { subCode: true } });
  const max = existing.reduce((m, s) => {
    const n = parseInt(s.subCode.replace(/\D/g, ""), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return Array.from({ length: count }, (_, i) => `C${String(max + 1 + i).padStart(2, "0")}`);
}

export interface AssembleInput {
  kitItemId: string;
  sets: number;
  userId: string;
  /** Tracked components only: which copies to put in, in set order. Omitted → auto-pick AVAILABLE. */
  picks?: { componentItemId: string; subItemIds: string[] }[];
}

/**
 * ประกอบชุด — build `sets` physical copies of a kit recipe, cutting the durable components.
 * Runs inside the caller's $transaction. Returns the new set SubItem ids.
 *
 * A fresh set is ready to lend (needsCheck false) even though the system never saw a single
 * consumable go in: the confirmation checkbox on the assemble dialog IS that check, the same
 * human act the ตรวจชุด screen asks for after every return.
 */
export async function assembleKitSets(
  tx: TxClient,
  { kitItemId, sets, userId, picks = [] }: AssembleInput,
): Promise<{ setSubItemIds: string[] }> {
  const kit = await tx.item.findUnique({
    where: { id: kitItemId },
    select: { id: true, code: true, name: true, locationId: true, category: { select: { profile: { select: { code: true } } } } },
  });
  if (!kit) throw new Error("ไม่พบชุดอุปกรณ์");
  if (kit.category.profile.code !== "KIT") throw new Error(`${kit.name} ไม่ใช่อุปกรณ์ประกอบวิชา`);

  const components = await loadKitComponents(tx, kitItemId);
  if (components.length === 0) {
    throw new Error("ชุดนี้ยังไม่ได้ผูกส่วนประกอบกับพัสดุจริง — แก้รายการส่วนประกอบก่อน");
  }
  const bad = unitMismatches(components);
  if (bad.length > 0) {
    throw new Error(
      `หน่วยในสูตรไม่ตรงกับหน่วยจ่ายของพัสดุ — ${bad.map((c) => `${c.name} (สูตร ${c.bomUnitName}, คลัง ${c.unitName})`).join(", ")}`,
    );
  }

  // One loanGroupId for the whole click, so the INUSE rows written below can be read back as
  // one act of assembly instead of a scatter of unrelated withdrawals.
  const loanGroupId = crypto.randomUUID();

  // 1. The set rows first: tracked components need an id to point at.
  const codes = await nextSetCodes(tx, kitItemId, sets);
  const setSubItemIds: string[] = [];
  for (const subCode of codes) {
    const created = await tx.subItem.create({
      data: { itemId: kitItemId, subCode, name: kit.name, status: ItemStatus.AVAILABLE, locationId: kit.locationId },
      select: { id: true },
    });
    setSubItemIds.push(created.id);
    await tx.itemStatusLog.create({
      data: {
        itemId: kitItemId,
        subItemId: created.id,
        previousStatus: ItemStatus.AVAILABLE,
        newStatus: ItemStatus.AVAILABLE,
        reason: `ประกอบชุด ${kit.code}-${subCode}`,
        changedBy: userId,
      },
    });
  }

  // 2. Cut the durable components, one record per set.
  for (const c of components) {
    if (c.kind === "CONSUMABLE") continue;
    if (c.kind === "TRACKED") {
      await cutTracked(tx, {
        component: c, sets, setSubItemIds, kit, codes, userId, loanGroupId,
        picked: picks.find((p) => p.componentItemId === c.itemId)?.subItemIds,
      });
    } else {
      await cutQty(tx, { component: c, sets, setSubItemIds, kit, codes, userId, loanGroupId });
    }
    await recomputeItemCounts(tx, c.itemId);
  }

  await recomputeItemCounts(tx, kitItemId);
  return { setSubItemIds };
}

/** The นำไปใช้งาน row that stands for "this is inside set X right now". OTHER + notes is what
 *  makes an item's ประวัติ print the sentence as the event headline (see api/items/[id]/history). */
async function logIntoSet(
  tx: TxClient,
  row: {
    itemId: string;
    subItemId?: string | null;
    quantity: number;
    setLabel: string;
    locationId: string | null;
    userId: string;
    loanGroupId: string;
  },
): Promise<void> {
  await tx.dispenseRecord.create({
    data: {
      itemId: row.itemId,
      subItemId: row.subItemId ?? undefined,
      quantity: row.quantity,
      usageType: "OTHER",
      notes: `ประกอบอยู่ในชุด ${row.setLabel}`,
      staffId: row.userId,
      locationId: row.locationId ?? undefined,
      loanGroupId: row.loanGroupId,
      loanType: LoanType.INUSE,
    },
  });
}

/** Tracked component: reserve one AVAILABLE copy per unit needed and park it inside a set. */
async function cutTracked(
  tx: TxClient,
  opts: {
    component: KitComponent;
    sets: number;
    setSubItemIds: string[];
    kit: { code: string; name: string; locationId: string | null };
    codes: string[];
    userId: string;
    loanGroupId: string;
    picked?: string[];
  },
): Promise<void> {
  const { component, sets, setSubItemIds, kit, codes, userId, loanGroupId, picked } = opts;
  const needed = component.perSet * sets;

  // Staff can swap the auto-picks before confirming, so an explicit list wins — but every id
  // in it still has to be an AVAILABLE copy of this component, checked here and not in the UI.
  const copies = picked?.length
    ? await tx.subItem.findMany({ where: { id: { in: picked }, itemId: component.itemId }, select: { id: true, subCode: true, status: true } })
    : await tx.subItem.findMany({
        where: { itemId: component.itemId, status: ItemStatus.AVAILABLE, inKitSubItemId: null },
        orderBy: { subCode: "asc" },
        take: needed,
        select: { id: true, subCode: true, status: true },
      });

  const usable = copies.filter((s) => s.status === ItemStatus.AVAILABLE);
  if (usable.length < needed) {
    throw new Error(`${component.name} พร้อมใช้งานไม่พอ (ต้องการ ${needed} ${component.unitName}, มี ${usable.length})`);
  }

  for (let i = 0; i < needed; i++) {
    const piece = usable[i];
    const slot = Math.floor(i / component.perSet);
    const setSubItemId = setSubItemIds[slot];
    const setLabel = `${kit.code}-${codes[slot]}`;
    await tx.subItem.update({
      where: { id: piece.id },
      data: { status: ItemStatus.IN_USE, inKitSubItemId: setSubItemId },
    });
    await tx.itemStatusLog.create({
      data: {
        itemId: component.itemId,
        subItemId: piece.id,
        kitSubItemId: setSubItemId,
        previousStatus: ItemStatus.AVAILABLE,
        newStatus: ItemStatus.IN_USE,
        reason: `ประกอบอยู่ในชุด ${setLabel}`,
        changedBy: userId,
      },
    });
    await logIntoSet(tx, {
      itemId: component.itemId,
      subItemId: piece.id,
      quantity: 1,
      setLabel,
      locationId: kit.locationId,
      userId,
      loanGroupId,
    });
  }
}

/** Non-tracked durable: drain lots FIFO, then availableQty. One INUSE record per set. */
async function cutQty(
  tx: TxClient,
  opts: {
    component: KitComponent;
    sets: number;
    setSubItemIds: string[];
    kit: { code: string; locationId: string | null };
    codes: string[];
    userId: string;
    loanGroupId: string;
  },
): Promise<void> {
  const { component, sets, kit, codes, userId, loanGroupId } = opts;
  const needed = component.perSet * sets;

  await allocateAcrossLots(tx, component.itemId, -needed);

  // Optimistic guard, same shape as dispense: the item must still hold what we counted.
  const upd = await tx.item.updateMany({
    where: { id: component.itemId, availableQty: { gte: needed } },
    data: { availableQty: { decrement: needed } },
  });
  if (upd.count === 0) {
    throw new Error(`${component.name} มีไม่พอ (ต้องการ ${needed} ${component.unitName})`);
  }

  for (const code of codes) {
    await logIntoSet(tx, {
      itemId: component.itemId,
      quantity: component.perSet,
      setLabel: `${kit.code}-${code}`,
      locationId: kit.locationId,
      userId,
      loanGroupId,
    });
  }
}

/**
 * Close the นำไปใช้งาน record that put `quantity` of an item into a set, so the piece or the
 * qty stops showing as out. Matched on the open INUSE row for that item (and sub-item), which
 * is what assemble wrote. Missing rows are tolerated: sets assembled under the old one-shot
 * model have StockAdjustment rows instead and there is nothing to close.
 */
async function closeSetLoan(
  tx: TxClient,
  opts: { itemId: string; subItemId?: string | null; userId: string; note: string },
): Promise<void> {
  const open = await tx.dispenseRecord.findFirst({
    where: {
      itemId: opts.itemId,
      subItemId: opts.subItemId ?? null,
      loanType: LoanType.INUSE,
      returnedAt: null,
    },
    orderBy: { dispensedAt: "desc" },
  });
  if (!open) return;

  await tx.dispenseRecord.update({
    where: { id: open.id },
    data: { resolvedQty: open.quantity, returnedAt: new Date(), returnCondition: "AVAILABLE" },
  });
  await logReturn(tx, {
    itemId: opts.itemId,
    subItemId: opts.subItemId ?? null,
    dispenseRecordId: open.id,
    quantity: open.quantity,
    condition: "AVAILABLE",
    notes: opts.note,
    userId: opts.userId,
  });
}

/**
 * "NLU-KIT-003-C01" for the set a piece is currently inside, or null when it is in none.
 *
 * แจ้งชำรุด uses this to name the box a broken piece is leaving. Detaching itself is one field
 * on the update the status route already writes, and the INUSE record is closed by the
 * closeOpenLoan call that route already makes — a broken piece leaves through the ordinary
 * damage screen rather than a second damage path hidden inside the kit UI. The set is not
 * flagged รอตรวจ: things break while a set is out, and a set that has been out already is.
 */
export async function kitSetLabelOf(tx: TxClient, subItemId: string): Promise<string | null> {
  const piece = await tx.subItem.findUnique({
    where: { id: subItemId },
    select: { inKitSubItem: { select: { subCode: true, item: { select: { code: true } } } } },
  });
  const set = piece?.inKitSubItem;
  return set ? `${set.item.code}-${set.subCode}` : null;
}

export interface CancelSetInput {
  setSubItemId: string;
  userId: string;
  note?: string | null;
}

export interface CancelSetResult {
  kitItemId: string;
  setLabel: string;
  /** Consumable lines the system never touched — the caller reminds staff they are on their own. */
  consumables: { name: string; quantity: number; unitName: string }[];
}

/**
 * ยกเลิกชุด — the exit door, not part of the normal cycle. The set dies and the durables it
 * was holding go home. Without it a mis-assembled set would trap its tracked pieces forever:
 * nothing else ends a set now that returning one does not.
 *
 * The set SubItem lands on DISPOSED and the row stays: dispense, return and status-log rows
 * point at it, and deleting it would take that history with them. Consumables are not returned
 * because they were never taken — staff put them in by hand and take them out the same way.
 */
export async function cancelKitSet(
  tx: TxClient,
  { setSubItemId, userId, note }: CancelSetInput,
): Promise<CancelSetResult> {
  const set = await tx.subItem.findUnique({
    where: { id: setSubItemId },
    select: {
      id: true,
      subCode: true,
      status: true,
      itemId: true,
      item: { select: { code: true, name: true, category: { select: { profile: { select: { code: true } } } } } },
      kitContents: { select: { id: true, itemId: true, subCode: true, status: true, item: { select: { name: true } } } },
    },
  });
  if (!set) throw new Error("ไม่พบชุดอุปกรณ์");
  if (set.item.category.profile.code !== "KIT") throw new Error("รายการนี้ไม่ใช่ชุดอุปกรณ์");
  if (set.status === ItemStatus.DISPOSED) throw new Error("ชุดนี้ถูกยกเลิกไปแล้ว");
  if (set.status === ItemStatus.ON_LOAN) throw new Error("ชุดนี้ถูกยืมออกอยู่ — ต้องรับคืนก่อน");

  const setLabel = `${set.item.code}-${set.subCode}`;
  const affected = new Set<string>();

  // 1. Tracked pieces: back on the shelf, INUSE record closed.
  for (const piece of set.kitContents) {
    await tx.subItem.update({
      where: { id: piece.id },
      data: { status: ItemStatus.AVAILABLE, inKitSubItemId: null },
    });
    await tx.itemStatusLog.create({
      data: {
        itemId: piece.itemId,
        subItemId: piece.id,
        kitSubItemId: set.id,
        previousStatus: piece.status,
        newStatus: ItemStatus.AVAILABLE,
        reason: `ยกเลิกชุด ${setLabel}${note ? ` (${note})` : ""}`,
        changedBy: userId,
      },
    });
    await closeSetLoan(tx, {
      itemId: piece.itemId,
      subItemId: piece.id,
      userId,
      note: note ?? `ยกเลิกชุด ${setLabel}`,
    });
    affected.add(piece.itemId);
  }

  // 2. Non-tracked components. Durables go back by qty; consumables were never cut and are
  //    only listed so staff know what is still physically in the box.
  const components = await loadKitComponents(tx, set.itemId);
  const consumables: CancelSetResult["consumables"] = [];
  for (const c of components) {
    if (c.kind === "CONSUMABLE") {
      consumables.push({ name: c.name, quantity: c.perSet, unitName: c.bomUnitName });
      continue;
    }
    if (c.kind === "TRACKED") continue;

    await allocateAcrossLots(tx, c.itemId, c.perSet);
    await tx.item.update({ where: { id: c.itemId }, data: { availableQty: { increment: c.perSet } } });
    await closeSetLoan(tx, { itemId: c.itemId, userId, note: note ?? `ยกเลิกชุด ${setLabel}` });
    affected.add(c.itemId);
  }

  // 3. The set itself is gone.
  await tx.subItem.update({ where: { id: set.id }, data: { status: ItemStatus.DISPOSED, needsCheck: false } });
  await tx.itemStatusLog.create({
    data: {
      itemId: set.itemId,
      subItemId: set.id,
      previousStatus: set.status,
      newStatus: ItemStatus.DISPOSED,
      reason: `ยกเลิกชุด ${setLabel}${note ? ` (${note})` : ""}`,
      changedBy: userId,
    },
  });

  for (const itemId of affected) await recomputeItemCounts(tx, itemId);
  await recomputeItemCounts(tx, set.itemId);

  return { kitItemId: set.itemId, setLabel, consumables };
}

/**
 * ยืนยันตรวจชุด — a human opened the box, compared it against the recipe and says it is ready.
 * The system checks nothing: it cannot count gauze, and anything that needed fixing was fixed
 * through the normal screens before this button was pressed. All it does is lift the gate.
 */
export async function confirmKitSetChecked(
  tx: TxClient,
  { setSubItemId, userId, note }: { setSubItemId: string; userId: string; note?: string | null },
): Promise<{ kitItemId: string; setLabel: string }> {
  const set = await tx.subItem.findUnique({
    where: { id: setSubItemId },
    select: {
      id: true, subCode: true, status: true, itemId: true, needsCheck: true,
      item: { select: { code: true, category: { select: { profile: { select: { code: true } } } } } },
    },
  });
  if (!set) throw new Error("ไม่พบชุดอุปกรณ์");
  if (set.item.category.profile.code !== "KIT") throw new Error("รายการนี้ไม่ใช่ชุดอุปกรณ์");
  if (set.status === ItemStatus.DISPOSED) throw new Error("ชุดนี้ถูกยกเลิกไปแล้ว");
  if (set.status === ItemStatus.ON_LOAN) throw new Error("ชุดนี้ถูกยืมออกอยู่ — ต้องรับคืนก่อน");
  if (!set.needsCheck) throw new Error("ชุดนี้ตรวจแล้ว");

  const setLabel = `${set.item.code}-${set.subCode}`;
  await tx.subItem.update({ where: { id: set.id }, data: { needsCheck: false } });
  await tx.itemStatusLog.create({
    data: {
      itemId: set.itemId,
      subItemId: set.id,
      previousStatus: set.status,
      newStatus: set.status,
      reason: `ตรวจชุด ${setLabel} — ของครบ พร้อมให้ยืม${note ? ` (${note})` : ""}`,
      changedBy: userId,
    },
  });

  await recomputeItemCounts(tx, set.itemId);
  return { kitItemId: set.itemId, setLabel };
}
