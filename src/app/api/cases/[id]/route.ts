import { NextRequest } from "next/server";
import { requireAuth, json, notFound } from "@/lib/api-utils";
import { getCase } from "@/lib/cases";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  // `<TYPE>:<row id>` — the colon survives the URL, but a client that encoded it should work too.
  const { id } = await params;
  const found = await getCase(decodeURIComponent(id));
  return found ? json(found) : notFound("ไม่พบเคสนี้");
}
