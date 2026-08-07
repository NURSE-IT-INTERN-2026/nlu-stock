import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";

const MONTH_LABELS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// Monthly รับเข้า (ReceiveRecord) vs เบิกออก (DispenseRecord), last 12 months incl current.
// Quantities, not record counts — matches the unit of dispense-monthly.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [received, dispensed] = await Promise.all([
    prisma.receiveRecord.findMany({ where: { receivedAt: { gte: start } }, select: { receivedAt: true, quantity: true } }),
    prisma.dispenseRecord.findMany({ where: { dispensedAt: { gte: start } }, select: { dispensedAt: true, quantity: true } }),
  ]);

  const buckets = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, month: MONTH_LABELS[d.getMonth()], in: 0, out: 0 };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  for (const r of received) {
    const b = byKey.get(`${r.receivedAt.getFullYear()}-${r.receivedAt.getMonth()}`);
    if (b) b.in += r.quantity;
  }
  for (const r of dispensed) {
    const b = byKey.get(`${r.dispensedAt.getFullYear()}-${r.dispensedAt.getMonth()}`);
    if (b) b.out += r.quantity;
  }

  return json(buckets.map(({ month, in: inQty, out }) => ({ month, in: inQty, out })));
}
