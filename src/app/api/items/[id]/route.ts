import { prisma } from "@/lib/prisma";
import { requireAuth, json, notFound } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      category: true,
      location: true,
      issueUnit: true,
      subUnit: true,
      subItems: { orderBy: { subCode: "asc" } },
      lots: { orderBy: { expiryDate: "asc" } },
      dispenseRecords: {
        take: 5,
        orderBy: { dispensedAt: "desc" },
        include: { staff: { select: { name: true } } },
      },
      receiveRecords: {
        take: 5,
        orderBy: { receivedAt: "desc" },
        include: { receiver: { select: { name: true } } },
      },
      maintenanceRecords: {
        take: 5,
        orderBy: { performedAt: "desc" },
        include: { performer: { select: { name: true } } },
      },
      statusLogs: {
        take: 5,
        orderBy: { changedAt: "desc" },
        include: { changer: { select: { name: true } } },
      },
      adjustments: {
        take: 5,
        orderBy: { adjustedAt: "desc" },
        include: { adjuster: { select: { name: true } } },
      },
    },
  });

  if (!item) return notFound("Item not found");

  return json(item);
}
