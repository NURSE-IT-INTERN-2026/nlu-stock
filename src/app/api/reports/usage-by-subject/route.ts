import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { groupUsageBySubject, groupInUseSnapshot, groupUsageByMonth } from "@/lib/usage-by-subject";
import { parseDispenseKind } from "@/lib/dispense-kind";
import { kindWhere } from "@/lib/dispense-kind-where";

/**
 * สถิติการใช้งาน แยกตามชนิดการออกจากคลัง.
 *
 * เดิม route นี้ไม่กรอง kind เลย ยอด "รายวิชา" จึงเป็นเบิกใช้บวกยืมรวมกัน — และในคลังนี้ยืมคือ
 * 65% ของทุกแถว แปลว่าตัวเลขที่คนอ่านใต้หัวข้อ "สถิติการใช้งาน" ส่วนใหญ่ไม่ใช่การเบิกใช้อย่างที่
 * ชื่อสื่อ. ตัวนับ "ยังไม่ระบุการใช้งาน" ก็นับแถว INUSE ทุกแถวไปด้วย ทั้งที่ นำไปใช้งาน ไม่ต้อง
 * ระบุการใช้งานโดยเจตนา (validators/dispense) — การ์ดจึงอ่านเหมือนคนกรอกข้อมูลตกหล่นทั้งที่ไม่ใช่.
 *
 * kindWhere ตัวเดียวกับที่ tab ออกจากคลังใช้ เพื่อให้สองหน้าไม่มีวันนับ "ยืม" คนละชุดกัน.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const kind = parseDispenseKind(params.get("kind"));
  const dateFrom = params.get("dateFrom") || undefined;
  const dateTo = params.get("dateTo") || undefined;
  const categoryId = params.get("categoryId") || undefined;
  // ปุ่มหมวดหมู่เป็น cascade: หยุดที่ชั้นประเภทก็กรองได้ ไม่ใช่ตัวกรองที่กดแล้วไม่เกิดอะไร
  const profileId = params.get("profileId") || undefined;

  const filters: Record<string, unknown>[] = [kindWhere(kind)];
  // นำไปใช้งานเป็นภาพนิ่งของตอนนี้ ไม่ใช่บัญชีเหตุการณ์ — ตัวกรองช่วงวันที่จึงไม่มีความหมายกับมัน
  // และถ้ารับมาจะตัดของที่ตั้งไว้ก่อนช่วงนั้นทิ้ง ทั้งที่มันยังอยู่ในห้องอยู่ (ดู groupInUseSnapshot)
  if (kind !== "inuse" && (dateFrom || dateTo)) {
    filters.push({
      dispensedAt: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
      },
    });
  }
  // AND, ไม่ใช่ spread: kindWhere ถือคีย์ `item` ของตัวเองอยู่แล้ว การเขียน where.item ทับจะลบ
  // เงื่อนไข dispenseType ของ kind ทิ้งเงียบๆ แล้วทุก segment จะกลับไปนับชุดเดียวกันหมด
  if (categoryId) filters.push({ item: { categoryId } });
  else if (profileId) filters.push({ item: { category: { profileId } } });

  const where = { AND: filters };

  // นำไปใช้งาน = ของที่ยังตั้งอยู่ตอนนี้ แยกตามอาคาร → ห้อง → พัสดุ. ไม่มีแกนเดือน เพราะภาพนิ่ง
  // ไม่มีเดือน — ของที่ตั้งไว้ตั้งแต่ปีที่แล้วก็ยังเป็นของที่อยู่ในห้องนั้นวันนี้.
  if (kind === "inuse") {
    const { rows, buildings } = await groupInUseSnapshot(where);
    return json({
      rows,
      buildings,
      summary: {
        records: rows.reduce((s, r) => s + r.records, 0),
        units: rows.reduce((s, r) => s + r.totalQuantity, 0),
      },
    });
  }

  // แกนหลักของรายงานคือเดือน — ตารางรวมทั้งช่วงยังอยู่ข้างล่างเพื่อตอบ "ทั้งช่วงใครใช้มากสุด"
  // แต่ตัวที่คนเปิดรายงานมาดูคือ ใช้เยอะเดือนไหน และเดือนนั้นเป็นวิชาหรือกิจกรรม
  const months = await groupUsageByMonth(where);

  const data = await groupUsageBySubject(where);

  // เบิกที่ไม่ได้ระบุการใช้งาน — ต้องอยู่ในรายงานด้วย ไม่งั้นยอดรวมไม่เท่ากับจำนวนที่เบิกจริง
  // และไม่มีใครเห็นว่ามีของหายไปจากสถิติเท่าไร. กรอง kind แล้วตัวนับนี้จึงหมายถึงการกรอกตกหล่น
  // จริงๆ ไม่ใช่แถว INUSE ที่ไม่ต้องกรอกอยู่แล้ว.
  const noTypeWhere = { AND: [...filters, { usageType: null }] };
  const [noTypeAgg, noTypeItems] = await Promise.all([
    prisma.dispenseRecord.aggregate({
      _sum: { quantity: true },
      _count: { _all: true },
      where: noTypeWhere,
    }),
    prisma.dispenseRecord.groupBy({ by: ["itemId"], where: noTypeWhere }),
  ]);

  if (noTypeAgg._count._all > 0) {
    data.push({
      // คีย์เดียวกับกลุ่ม NONE ในต้นไม้รายเดือน เพื่อให้กดแถวนี้แล้วเปิดรายละเอียดได้เหมือนแถวอื่น
      key: "NONE",
      usageType: null,
      courseCode: null,
      label: "ไม่ระบุ",
      totalQuantity: noTypeAgg._sum.quantity ?? 0,
      records: noTypeAgg._count._all,
      itemCount: noTypeItems.length,
    });
  }

  // ยอดรวมทั้งช่วง — หน้าจอแปะไว้ใต้ตารางอันดับ. ไม่ส่งจำนวนวิชา/แถวที่ไม่ระบุ เพราะอ่านจากตารางได้อยู่แล้ว
  const summary = {
    records: data.reduce((s, r) => s + r.records, 0),
    units: data.reduce((s, r) => s + r.totalQuantity, 0),
  };

  // การ์ดสัดส่วนรายวิชา — Notion ขอแยกออกมาอีกใบจากภาพรวม รายวิชา/กิจกรรม/อื่นๆ. คิดจากแถวชุด
  // เดียวกับตาราง เพื่อไม่ให้สองการ์ดบนหน้าเดียวกันเถียงกันเรื่องยอดของวิชาเดียวกัน.
  const courses = data.filter((r) => r.usageType === "COURSE" && r.courseCode);

  return json({ rows: data, courses, months, summary });
}
