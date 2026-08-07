import { requireAuth, json, handleError } from "@/lib/api-utils";
import { getCourseName } from "@/lib/courses";
import { NextRequest } from "next/server";

// Resolves one course code to its Thai title, called once when the user picks a course —
// never per dropdown row. A registrar outage returns `name: null` rather than an error:
// the code alone still identifies the course well enough to dispense against.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  try {
    const { code } = await params;
    return json(await getCourseName(code));
  } catch (err) {
    return handleError(err, "ดึงชื่อวิชาไม่สำเร็จ", 502);
  }
}
