import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const dateFrom = params.get("dateFrom") || undefined;
  const dateTo = params.get("dateTo") || undefined;
  const categoryId = params.get("categoryId") || undefined;

  const where: Record<string, unknown> = {};
  if (dateFrom || dateTo) {
    where.dispensedAt = {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
    };
  }
  if (categoryId) {
    where.item = { categoryId };
  }

  const [groups, noSubjectCount] = await Promise.all([
    prisma.dispenseRecord.groupBy({
      by: ["subjectId"],
      where: { ...where, subjectId: { not: null } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
    }),
    prisma.dispenseRecord.aggregate({
      _sum: { quantity: true },
      where: { ...where, subjectId: null },
    }),
  ]);

  const subjectIds = groups.map((g) => g.subjectId!).filter(Boolean);
  const subjects = await prisma.subject.findMany({
    where: { id: { in: subjectIds } },
    select: { id: true, code: true, name: true },
  });

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));

  const data = groups.map((g) => {
    const subject = subjectMap.get(g.subjectId!);
    return {
      subjectId: g.subjectId,
      subjectCode: subject?.code ?? "",
      subjectName: subject?.name ?? "Unknown",
      totalQuantity: g._sum.quantity ?? 0,
    };
  });

  if ((noSubjectCount._sum.quantity ?? 0) > 0) {
    data.push({
      subjectId: null,
      subjectCode: "",
      subjectName: "No Subject",
      totalQuantity: noSubjectCount._sum.quantity ?? 0,
    });
  }

  return json(data);
}
