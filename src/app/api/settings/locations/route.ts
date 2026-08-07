import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, json, error, parseBody } from "@/lib/api-utils";
import { locationCreateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const locations = await prisma.location.findMany({
    orderBy: [{ building: "asc" }, { floor: "asc" }, { room: "asc" }, { detail: "asc" }],
    include: { _count: { select: { items: true } } },
  });

  return json(locations);
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { data, error: parseErr } = await parseBody(locationCreateSchema)(request);
  if (parseErr) return parseErr;
  if (!data) return error("No data");

  const location = await prisma.location.create({ data });

  return json(location, 201);
}
