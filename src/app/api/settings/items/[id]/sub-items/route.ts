import { prisma } from "@/lib/prisma";
import { requireAdmin, json, notFound, error, parseBody } from "@/lib/api-utils";
import { subItemCreateSchema, subItemBatchCreateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const subItems = await prisma.subItem.findMany({
    where: { itemId: id },
    orderBy: { subCode: "asc" },
    include: {
      dispenseRecords: {
        where: { returnedAt: null },
        orderBy: { dispensedAt: "desc" },
        take: 1,
        include: { staff: { select: { name: true } } },
      },
    },
  });

  return json(subItems);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return notFound("Item not found");
  if (!item.trackIndividually) return error("Item does not track individually");

  const body = await request.json();

  // Batch create mode
  if (body.prefix !== undefined) {
    const { data, error: parseErr } = await parseBody(subItemBatchCreateSchema)({
      json: () => Promise.resolve(body),
    } as Request);
    if (parseErr) return parseErr;
    if (!data) return error("No data");

    const subItems = [];
    for (let i = data.startNumber; i <= data.endNumber; i++) {
      const numStr = String(i).padStart(String(data.endNumber).length, "0");
      subItems.push({ itemId: id, subCode: `${data.prefix}${numStr}` });
    }

    const result = await prisma.subItem.createMany({
      data: subItems,
      skipDuplicates: true,
    });

    return json({ created: result.count }, 201);
  }

  // Single create mode
  const { data, error: parseErr } = await parseBody(subItemCreateSchema)({
    json: () => Promise.resolve(body),
  } as Request);
  if (parseErr) return parseErr;
  if (!data) return error("No data");

  const subItem = await prisma.subItem.create({
    data: { ...data, itemId: id },
  });

  return json(subItem, 201);
}
