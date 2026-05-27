import { NextRequest } from "next/server";
import { requireAuth, json } from "@/lib/api-utils";
import { getAlertCounts } from "@/lib/alerts";

export async function GET(request: NextRequest) {
  const { denied } = await requireAuth(request);
  if (denied) return denied;

  return json(await getAlertCounts());
}
