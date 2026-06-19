import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";

const MONTH_LABELS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const now = new Date();
  // last 6 months incl current
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const records = await prisma.dispenseRecord.findMany({
    where: { dispensedAt: { gte: start } },
    select: { dispensedAt: true, quantity: true },
  });

  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, month: MONTH_LABELS[d.getMonth()], total: 0 };
  });

  for (const r of records) {
    const key = `${r.dispensedAt.getFullYear()}-${r.dispensedAt.getMonth()}`;
    const bucket = buckets.find((b) => b.key === key);
    if (bucket) bucket.total += r.quantity;
  }

  return json(buckets.map(({ month, total }) => ({ month, total })));
}
