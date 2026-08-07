import { requireAuth, json, handleError } from "@/lib/api-utils";
import { listCourses } from "@/lib/courses";
import { NextRequest } from "next/server";

// Proxies a credentialed upstream, so it must be authed like any other route — an open
// endpoint here would let anyone spend our registrar quota. The tokens never leave the server.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  try {
    // `stale` tells the cart to caption the picker with the sync date — the list still
    // works, the user just needs to know a course opened today might not be in it yet.
    const { courses, stale, syncedAt } = await listCourses();
    return json({ courses, stale, syncedAt });
  } catch (err) {
    return handleError(err, "ดึงรายชื่อวิชาไม่สำเร็จ", 502);
  }
}
