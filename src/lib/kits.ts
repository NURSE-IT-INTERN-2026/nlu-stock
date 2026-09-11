import type { Prisma } from "@/generated/prisma/client";
import { ItemStatus, LoanType } from "@/generated/prisma/enums";
import { allocateAcrossLots, lockItems, recomputeItemCounts } from "@/lib/stock";
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

/** Read a kit's BOM, classified and priced against current stock. */
export async function loadKitComponents(tx: TxClient, kitItemId: string): Promise<KitComponent[]> {
  const rows = await tx.kitBom.findMany({
    where: { kitItemId },
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

  return rows.map((r) => {
    const c = r.componentItem;
    const dispenseType = c.category.profile.dispenseType;
    const kind: ComponentKind = c.trackIndividually
      ? "TRACKED"
      : dispenseType === "CONSUMABLE"
        ? "CONSUMABLE"
        : "COUNT";
    return {
      itemId: c.id,
      code: c.code,
      name: c.name,
      unitName: c.issueUnit.name,
      bomUnitName: r.unit.name,
      kind,
      perSet: r.quantity,
      availableQty: c.availableQty,
    };
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
 * The system never sees a single consumable go in — the recipe counts ชิ้น while the stock
 * counts กล่อง — so what is physically in the box is the staff's business, not the app's.
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
  // ประกอบชุด = ตัดของหลายรายการพร้อมกัน ล็อกทั้งชุดกับตัว KIT เองก่อนเริ่มตัด (lockItems
  // เรียงตาม id ให้แล้ว) — ชุดสองชุดที่ใช้ของซ้ำกันคนละลำดับจึงไม่ไขว้ล็อกกันเป็น deadlock.
  await lockItems(tx, [kitItemId, ...components.map((c) => c.itemId)]);
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
    kitSubItemId: string;
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
      kitSubItemId: row.kitSubItemId,
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
      kitSubItemId: setSubItemId,
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
  const { component, sets, setSubItemIds, kit, codes, userId, loanGroupId } = opts;
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

  for (const [i, code] of codes.entries()) {
    await logIntoSet(tx, {
      itemId: component.itemId,
      kitSubItemId: setSubItemIds[i],
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
 * qty stops showing as out. `kitSubItemId` pins it to the set being emptied — two sets of the
 * same kit hold identical rows for the same item, and matching on the item alone closed
 * whichever was newest. Missing rows are tolerated: sets assembled under the old one-shot
 * model have StockAdjustment rows instead and there is nothing to close.
 */
async function closeSetLoan(
  tx: TxClient,
  opts: { itemId: string; subItemId?: string | null; kitSubItemId?: string; userId: string; note: string },
): Promise<void> {
  const open = await tx.dispenseRecord.findFirst({
    where: {
      itemId: opts.itemId,
      subItemId: opts.subItemId ?? null,
      ...(opts.kitSubItemId ? { kitSubItemId: opts.kitSubItemId } : {}),
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
 * damage screen rather than a second damage path hidden inside the kit UI.
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

export interface SetHolding {
  itemId: string;
  code: string;
  name: string;
  unitName: string;
  quantity: number;
}

/**
 * What a set is actually holding, read off the นำไปใช้งาน rows assemble wrote for it — the
 * คงทน half of the box, summed per item. The recipe is not consulted: it is free to change
 * while sets are alive (sets are permanent, so locking it would lock it forever), and a box
 * must hand back what went into it, not what the current recipe would put in a new one.
 *
 * Empty for sets assembled before the rows carried a set id and whose notes did not backfill —
 * callers fall back to the recipe there, which is all those sets ever had.
 */
export async function loadSetHoldings(tx: TxClient, setSubItemId: string): Promise<SetHolding[]> {
  const rows = await tx.dispenseRecord.findMany({
    where: { kitSubItemId: setSubItemId, subItemId: null, loanType: LoanType.INUSE, returnedAt: null },
    select: {
      itemId: true,
      quantity: true,
      // ปรับชุดตามสูตร hands part of a holding back rather than all of it, so what the box
      // still holds is what has not been resolved yet — never the row's original quantity.
      resolvedQty: true,
      item: { select: { code: true, name: true, issueUnit: { select: { name: true } } } },
    },
  });

  const byItem = new Map<string, SetHolding>();
  for (const r of rows) {
    const open = r.quantity - r.resolvedQty;
    if (open <= 0) continue;
    const held = byItem.get(r.itemId);
    if (held) held.quantity += open;
    else byItem.set(r.itemId, { itemId: r.itemId, code: r.item.code, name: r.item.name, unitName: r.item.issueUnit.name, quantity: open });
  }
  return [...byItem.values()];
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
  const readSet = () => tx.subItem.findUnique({
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
  let set = await readSet();
  if (!set) throw new Error("ไม่พบชุดอุปกรณ์");
  if (set.item.category.profile.code !== "KIT") throw new Error("รายการนี้ไม่ใช่ชุดอุปกรณ์");
  if (set.status === ItemStatus.DISPOSED) throw new Error("ชุดนี้ถูกยกเลิกไปแล้ว");
  if (set.status === ItemStatus.ON_LOAN) throw new Error("ชุดนี้ถูกยืมออกอยู่ — ต้องรับคืนก่อน");

  const setLabel = `${set.item.code}-${set.subCode}`;
  const affected = new Set<string>();

  // ของคงทนที่คืนโดยจำนวนไม่ได้อยู่ใน kitContents (นั่นมีแต่ชิ้นที่นับรายชิ้น) — อ่านจากใบ
  // นำไปใช้งานของชุดนี้ ถ้าไม่มี (ชุดเก่าก่อนมีคอลัมน์) ค่อยตกกลับไปใช้สูตร. อ่านทั้งคู่มาก่อน
  // เพื่อจะได้ล็อกทุกอย่างในคราวเดียว
  const components = await loadKitComponents(tx, set.itemId);
  // สูตรเป็นทางถอยเฉยๆ — คืนของคงทนตามที่ตัดไปจริง ไม่ใช่ตามสูตรวันนี้
  const toDurables = (holdings: SetHolding[]): SetHolding[] => holdings.length > 0
    ? holdings
    : components.filter((c) => c.kind === "COUNT").map((c) => ({
        itemId: c.itemId, code: c.code, name: c.name, unitName: c.unitName, quantity: c.perSet,
      }));
  let durables = toDurables(await loadSetHoldings(tx, set.id));
  // ล็อกครั้งเดียว ก่อนเขียนอะไรทั้งสิ้น — ทางกลับของ assembleKitSets และต้องเป็นชุด id ชุด
  // เดียวกับที่ assemble ล็อก. แยกล็อกสองรอบไม่ได้: lockItems เรียงให้แค่ภายในรอบของมันเอง
  // ยกเลิกชุดที่ถือ id สูงไว้แล้วไปขอ id ต่ำ สวนกับประกอบชุดที่ไล่จากต่ำไปสูง = deadlock.
  await lockItems(tx, [
    set.itemId,
    ...set.kitContents.map((p) => p.itemId),
    ...components.map((c) => c.itemId),
    ...durables.map((d) => d.itemId),
  ]);

  // ที่ตรวจไปข้างบนคือข้อมูลก่อนล็อก — ใบที่ commit ไประหว่างเรารอคิวทำให้มันเก่าไปแล้ว และ
  // increment ที่ข้อ 2 ไม่มีเงื่อนไขคอยกัน ยกเลิกซ้อนกันสองใบจึงคืนของคงทนสองเท่า อ่านใหม่
  // ตอนถือล็อกแล้ว ชุด id ที่ล็อกไว้ยังครอบคลุม เพราะทุกทางที่แก้ชุดล็อก set.itemId ก่อนเสมอ
  set = await readSet();
  if (!set) throw new Error("ไม่พบชุดอุปกรณ์");
  if (set.status === ItemStatus.DISPOSED) throw new Error("ชุดนี้ถูกยกเลิกไปแล้ว");
  if (set.status === ItemStatus.ON_LOAN) throw new Error("ชุดนี้ถูกยืมออกอยู่ — ต้องรับคืนก่อน");
  durables = toDurables(await loadSetHoldings(tx, set.id));

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
      kitSubItemId: set.id,
      userId,
      note: note ?? `ยกเลิกชุด ${setLabel}`,
    });
    affected.add(piece.itemId);
  }

  // 2. คงทน: hand back exactly what the box was recorded as holding.
  for (const d of durables) {
    await allocateAcrossLots(tx, d.itemId, d.quantity);
    await tx.item.update({ where: { id: d.itemId }, data: { availableQty: { increment: d.quantity } } });
    await closeSetLoan(tx, { itemId: d.itemId, kitSubItemId: set.id, userId, note: note ?? `ยกเลิกชุด ${setLabel}` });
    affected.add(d.itemId);
  }

  // 3. สิ้นเปลือง were never cut, so there is nothing to hand back — the recipe is the only
  //    thing that can say what should still be in the box, and it is advice, not a movement.
  const consumables: CancelSetResult["consumables"] = components
    .filter((c) => c.kind === "CONSUMABLE")
    .map((c) => ({ name: c.name, quantity: c.perSet, unitName: c.bomUnitName }));

  // 4. The set itself is gone.
  await tx.subItem.update({ where: { id: set.id }, data: { status: ItemStatus.DISPOSED } });
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


// ── ปรับชุดตามสูตร ──────────────────────────────────────────────────────────────

export interface SetDrift {
  itemId: string;
  code: string;
  name: string;
  unitName: string;
  kind: ComponentKind;
  /** What the box is recorded as holding. */
  held: number;
  /** What the recipe asks for now. 0 = the recipe dropped it. */
  want: number;
  /** Stock on the shelf right now — a shortfall here is what blocks ปรับชุดตามสูตร. */
  availableQty: number;
}

/**
 * Where an assembled set disagrees with the recipe as it stands today — one row per item, and
 * only the ones that differ. Consumables never appear: the system does not cut them, so it has
 * no count to disagree with.
 *
 * A set is built once and the recipe stays editable forever (sets are permanent, so locking it
 * would lock it for good), which means a box on the shelf can legitimately be an older spec.
 * This is the list ปรับชุดตามสูตร works from, and an empty one is why the button is not there.
 */
export async function kitSetDrift(tx: TxClient, setSubItemId: string): Promise<SetDrift[]> {
  const set = await tx.subItem.findUnique({
    where: { id: setSubItemId },
    select: { itemId: true, kitContents: { select: { itemId: true } } },
  });
  if (!set) return [];

  const components = await loadKitComponents(tx, set.itemId);
  const holdings = await loadSetHoldings(tx, setSubItemId);

  const heldByItem = new Map<string, number>();
  for (const h of holdings) heldByItem.set(h.itemId, h.quantity);
  for (const p of set.kitContents) heldByItem.set(p.itemId, (heldByItem.get(p.itemId) ?? 0) + 1);

  const drift: SetDrift[] = [];
  for (const c of components) {
    if (c.kind === "CONSUMABLE") continue;
    const held = heldByItem.get(c.itemId) ?? 0;
    if (held !== c.perSet) {
      drift.push({
        itemId: c.itemId, code: c.code, name: c.name, unitName: c.unitName,
        kind: c.kind, held, want: c.perSet, availableQty: c.availableQty,
      });
    }
    heldByItem.delete(c.itemId);
  }
  // Whatever is left is in the box but no longer in the recipe.
  for (const [itemId, held] of heldByItem) {
    const h = holdings.find((x) => x.itemId === itemId);
    const item = await tx.item.findUnique({
      where: { id: itemId },
      select: { code: true, name: true, availableQty: true, issueUnit: { select: { name: true } } },
    });
    drift.push({
      itemId,
      code: item?.code ?? h?.code ?? "",
      name: item?.name ?? h?.name ?? "",
      unitName: item?.issueUnit.name ?? h?.unitName ?? "",
      kind: h ? "COUNT" : "TRACKED",
      held,
      want: 0,
      availableQty: item?.availableQty ?? 0,
    });
  }
  return drift;
}

/** Hand `qty` of a คงทน component back out of one set, marking its open holdings newest first. */
async function releaseQtyFromSet(
  tx: TxClient,
  opts: { itemId: string; kitSubItemId: string; qty: number; userId: string; note: string },
): Promise<void> {
  // The stock comes back once, here. The rows below only record which holding gave it up —
  // logReturn writes history, it does not move a number.
  await allocateAcrossLots(tx, opts.itemId, opts.qty);
  await tx.item.update({ where: { id: opts.itemId }, data: { availableQty: { increment: opts.qty } } });

  let left = opts.qty;
  const open = await tx.dispenseRecord.findMany({
    where: { itemId: opts.itemId, kitSubItemId: opts.kitSubItemId, subItemId: null, loanType: LoanType.INUSE, returnedAt: null },
    orderBy: { dispensedAt: "desc" },
    select: { id: true, quantity: true, resolvedQty: true },
  });

  for (const row of open) {
    if (left <= 0) break;
    const openQty = row.quantity - row.resolvedQty;
    if (openQty <= 0) continue;
    const take = Math.min(openQty, left);
    const resolved = row.resolvedQty + take;
    await tx.dispenseRecord.update({
      where: { id: row.id },
      data: {
        resolvedQty: resolved,
        // Only a fully emptied holding is closed — a box that gave back 1 of its 3 trays is
        // still holding 2, and a returnedAt here would drop them off every outstanding view.
        ...(resolved >= row.quantity ? { returnedAt: new Date(), returnCondition: "AVAILABLE" as const } : {}),
      },
    });
    await logReturn(tx, {
      itemId: opts.itemId,
      subItemId: null,
      dispenseRecordId: row.id,
      quantity: take,
      condition: "AVAILABLE",
      notes: opts.note,
      userId: opts.userId,
    });
    left -= take;
  }
  // `left > 0` means the ledger held fewer open units than the box was carrying — possible for
  // sets assembled before holdings were recorded. The stock is already back; there is simply no
  // row left to mark, which is the most those sets ever had.
}

export interface ResyncSetResult {
  kitItemId: string;
  setLabel: string;
  applied: SetDrift[];
  consumables: { name: string; quantity: number; unitName: string }[];
}

/**
 * ปรับชุดตามสูตร — bring one assembled box up to the recipe as it stands now, keeping the box.
 *
 * ยกเลิกชุด + ประกอบใหม่ reaches the same stock position, but it retires the set code: the
 * sticker on a physical box would have to be reprinted every time a recipe is edited, and the
 * box's borrow history would split in two across what is plainly the same box. This is the
 * same movements against the same SubItem row.
 *
 * Only what differs moves. A component whose count did not change is not handed back and taken
 * out again — nobody touched it, and a history that says otherwise is a history staff learn to
 * distrust. Consumables are listed, never moved: the recipe counts ชิ้น while the item is
 * stocked in กล่อง, so the box's gauze is refilled by hand like it always was.
 */
export async function resyncKitSet(
  tx: TxClient,
  { setSubItemId, userId, note }: CancelSetInput,
): Promise<ResyncSetResult> {
  const readSet = () => tx.subItem.findUnique({
    where: { id: setSubItemId },
    select: {
      id: true,
      subCode: true,
      status: true,
      itemId: true,
      item: { select: { code: true, name: true, locationId: true, category: { select: { profile: { select: { code: true } } } } } },
      kitContents: { select: { id: true, itemId: true, subCode: true, status: true } },
    },
  });
  let set = await readSet();
  if (!set) throw new Error("ไม่พบชุดอุปกรณ์");
  if (set.item.category.profile.code !== "KIT") throw new Error("รายการนี้ไม่ใช่ชุดอุปกรณ์");
  if (set.status === ItemStatus.DISPOSED) throw new Error("ชุดนี้ถูกยกเลิกไปแล้ว");
  // The box is not on the shelf to be repacked, and the borrower is holding the old spec.
  if (set.status === ItemStatus.ON_LOAN) throw new Error("ชุดนี้ถูกยืมออกอยู่ — ต้องรับคืนก่อน");

  const setLabel = `${set.item.code}-${set.subCode}`;
  let drift = await kitSetDrift(tx, set.id);
  if (drift.length === 0) throw new Error("ชุดนี้ตรงกับสูตรอยู่แล้ว");

  const components = await loadKitComponents(tx, set.itemId);
  // ล็อกทั้งสูตร ไม่ใช่แค่ส่วนต่างวันนี้ — ส่วนต่างที่อ่านใหม่หลังล็อกอาจโผล่ของที่รอบแรก
  // ยังตรงสูตรอยู่ และต้องอยู่ในล็อกแล้ว. ล็อกครั้งเดียวเหมือน assembleKitSets ขอเพิ่มทีหลัง
  // = สวนลำดับกัน = deadlock
  const locked = new Set([
    set.itemId,
    ...components.map((c) => c.itemId),
    ...drift.map((d) => d.itemId),
    ...set.kitContents.map((p) => p.itemId),
  ]);
  await lockItems(tx, [...locked]);

  // ที่ตรวจไปข้างบนคือข้อมูลก่อนล็อก — ปรับชุดสองใบซ้อนกันจะเอาส่วนต่างใบเก่ามาลงซ้ำทั้งชุด
  // (ฝั่ง delta ติดลบคืนของสองเท่า ฝั่งบวกใส่ชิ้นเกินสูตร) อ่านสถานะกับส่วนต่างใหม่ตอนถือล็อก
  set = await readSet();
  if (!set) throw new Error("ไม่พบชุดอุปกรณ์");
  if (set.status === ItemStatus.DISPOSED) throw new Error("ชุดนี้ถูกยกเลิกไปแล้ว");
  if (set.status === ItemStatus.ON_LOAN) throw new Error("ชุดนี้ถูกยืมออกอยู่ — ต้องรับคืนก่อน");
  drift = await kitSetDrift(tx, set.id);
  if (drift.length === 0) throw new Error("ชุดนี้ตรงกับสูตรอยู่แล้ว");
  // สูตรไม่ได้ถูกล็อกไปกับ items — ถ้ามันเพิ่งเพิ่มของที่อยู่นอกชุดที่ล็อกไว้ ให้ถอย ดีกว่าเขียนทั้งที่ไม่มีล็อก
  const unlocked = drift.find((d) => !locked.has(d.itemId));
  if (unlocked) throw new Error(`สูตรเพิ่งถูกแก้ (${unlocked.name}) — ลองใหม่อีกครั้ง`);

  const reason = `ปรับชุดตามสูตร ${setLabel}${note ? ` (${note})` : ""}`;
  const loanGroupId = crypto.randomUUID();
  const affected = new Set<string>();

  for (const d of drift) {
    affected.add(d.itemId);
    const delta = d.want - d.held;

    if (d.kind === "TRACKED") {
      if (delta > 0) {
        const copies = await tx.subItem.findMany({
          where: { itemId: d.itemId, status: ItemStatus.AVAILABLE, inKitSubItemId: null },
          orderBy: { subCode: "asc" },
          take: delta,
          select: { id: true, status: true },
        });
        if (copies.length < delta) {
          throw new Error(`${d.name} พร้อมใช้งานไม่พอ (ต้องการเพิ่ม ${delta} ${d.unitName}, มี ${copies.length})`);
        }
        for (const piece of copies) {
          await tx.subItem.update({ where: { id: piece.id }, data: { status: ItemStatus.IN_USE, inKitSubItemId: set.id } });
          await tx.itemStatusLog.create({
            data: {
              itemId: d.itemId, subItemId: piece.id, kitSubItemId: set.id,
              previousStatus: piece.status, newStatus: ItemStatus.IN_USE,
              reason: `${reason} — ใส่เข้าชุด`, changedBy: userId,
            },
          });
          await logIntoSet(tx, {
            itemId: d.itemId, subItemId: piece.id, kitSubItemId: set.id, quantity: 1,
            setLabel, locationId: set.item.locationId, userId, loanGroupId,
          });
        }
      } else {
        const spare = set.kitContents.filter((p) => p.itemId === d.itemId).slice(0, -delta);
        for (const piece of spare) {
          await tx.subItem.update({ where: { id: piece.id }, data: { status: ItemStatus.AVAILABLE, inKitSubItemId: null } });
          await tx.itemStatusLog.create({
            data: {
              itemId: d.itemId, subItemId: piece.id, kitSubItemId: set.id,
              previousStatus: piece.status, newStatus: ItemStatus.AVAILABLE,
              reason: `${reason} — เอาออกจากชุด`, changedBy: userId,
            },
          });
          await closeSetLoan(tx, { itemId: d.itemId, subItemId: piece.id, kitSubItemId: set.id, userId, note: reason });
        }
      }
      continue;
    }

    // คงทน: move the difference only.
    if (delta > 0) {
      await allocateAcrossLots(tx, d.itemId, -delta);
      const upd = await tx.item.updateMany({
        where: { id: d.itemId, availableQty: { gte: delta } },
        data: { availableQty: { decrement: delta } },
      });
      if (upd.count === 0) throw new Error(`${d.name} มีไม่พอ (ต้องการเพิ่ม ${delta} ${d.unitName})`);
      await logIntoSet(tx, {
        itemId: d.itemId, kitSubItemId: set.id, quantity: delta,
        setLabel, locationId: set.item.locationId, userId, loanGroupId,
      });
    } else {
      await releaseQtyFromSet(tx, { itemId: d.itemId, kitSubItemId: set.id, qty: -delta, userId, note: reason });
    }
  }

  // The audit line for the box itself: one row naming every change, so its ประวัติ explains
  // why the contents are no longer the ones it was assembled with. Header line, then one line
  // per item — six components on a single line is a paragraph nobody reads to the end, and the
  // reading views print it with whitespace-pre-line.
  await tx.itemStatusLog.create({
    data: {
      itemId: set.itemId,
      subItemId: set.id,
      previousStatus: set.status,
      newStatus: set.status,
      reason: [reason, ...drift.map((d) => `• ${d.name} ${d.held}→${d.want} ${d.unitName}`)].join("\n"),
      changedBy: userId,
    },
  });

  for (const itemId of affected) await recomputeItemCounts(tx, itemId);
  await recomputeItemCounts(tx, set.itemId);

  return {
    kitItemId: set.itemId,
    setLabel,
    applied: drift,
    consumables: components
      .filter((c) => c.kind === "CONSUMABLE")
      .map((c) => ({ name: c.name, quantity: c.perSet, unitName: c.bomUnitName })),
  };
}
