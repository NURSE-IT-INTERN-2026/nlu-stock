import { prisma } from "@/lib/prisma";
import { requireAuth, json, error, parseBody } from "@/lib/api-utils";
import { locationCreateSchema } from "@/lib/validators";
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
    building: l.building,
    floor: l.floor,
    room: l.room,
    detail: l.detail,
    name: [l.building, l.floor, l.room, l.detail].filter(Boolean).join(" / "),
  }));

  return json(data);
}

/**
 * Find-or-create a location (used by the move/edit flow when a user picks a
 * "no-room" destination — building/floor + position). Any authed user can
 * resolve a destination this way; upserts by the unique key.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const { data, error: parseErr } = await parseBody(locationCreateSchema)(request);
  if (parseErr) return parseErr;
  if (!data) return error("No data");

  const room = data.room.trim();
  if (!room) return error("Room/position is required");

  const select = { id: true, building: true, floor: true, room: true, detail: true } as const;
  const detail = data.detail?.trim() ? data.detail.trim() : null;

  // findFirst (not upsert): detail is nullable, and SQL NULL != NULL breaks a
  // compound-unique upsert. The @@unique constraint still guards concurrent creates.
  const existing = await prisma.location.findFirst({
    where: { building: data.building, floor: data.floor, room, detail },
    select,
  });
  const location = existing ?? await prisma.location.create({
    data: { building: data.building, floor: data.floor, room, detail },
    select,
  });

  return json({
    ...location,
    name: [location.building, location.floor, location.room, location.detail].filter(Boolean).join(" / "),
  });
}
