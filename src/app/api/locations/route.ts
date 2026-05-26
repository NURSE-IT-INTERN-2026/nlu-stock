import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const locations = await prisma.location.findMany({
    orderBy: [{ room: "asc" }, { cabinet: "asc" }, { shelf: "asc" }],
    select: { id: true, room: true, cabinet: true, shelf: true },
  });

  const data = locations.map((l) => ({
    id: l.id,
    name: [l.room, l.cabinet, l.shelf].filter(Boolean).join(" / "),
  }));

  return json(data);
}
