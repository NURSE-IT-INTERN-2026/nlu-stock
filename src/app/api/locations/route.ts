import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const locations = await prisma.location.findMany({
    orderBy: [{ building: "asc" }, { floor: "asc" }, { room: "asc" }, { detail: "asc" }],
    select: { id: true, building: true, floor: true, room: true, detail: true },
  });

  const data = locations.map((l) => ({
    id: l.id,
    name: [l.building, l.floor, l.room, l.detail].filter(Boolean).join(" / "),
  }));

  return json(data);
}
