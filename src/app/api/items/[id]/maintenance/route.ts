import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { z } from "zod";

const maintenanceSchema = z.object({
  type: z.enum(["PREVENTIVE", "CORRECTIVE"]),
  result: z.enum(["AVAILABLE", "NEEDS_MORE_REPAIR", "DISPOSED"]),
  performedAt: z.coerce.date(),
  issue: z.string().max(500).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  cost: z.number().min(0).optional().nullable(),
  nextMaintenanceAt: z.coerce.date().optional().nullable(),
  attachmentUrls: z.array(z.string()).default([]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "INSTRUCTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: itemId } = await params;
  const body = await req.json();
  const parsed = maintenanceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;

  try {
    const record = await prisma.$transaction(async (tx) => {
      const rec = await tx.maintenanceRecord.create({
        data: {
          itemId,
          type: data.type,
          result: data.result,
          performedAt: data.performedAt,
          performedBy: session.userId,
          issue: data.issue ?? undefined,
          description: data.description ?? undefined,
          cost: data.cost ?? undefined,
          attachmentUrls: data.attachmentUrls,
          nextMaintenanceAt: data.nextMaintenanceAt ?? undefined,
        },
      });

      await tx.item.update({
        where: { id: itemId },
        data: {
          lastMaintenanceDate: data.performedAt,
          ...(data.nextMaintenanceAt && { nextMaintenanceDate: data.nextMaintenanceAt }),
          ...(data.result === "AVAILABLE" && { status: "AVAILABLE" }),
        },
      });

      return rec;
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    console.error("Maintenance create error:", err);
    return NextResponse.json({ error: "Failed to create maintenance record" }, { status: 500 });
  }
}
