import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Course data comes from two APIs owned by other faculties:
//   1. the course code list   — edu.nurse.cmu.ac.th /api/Publish/CourseStructure
//   2. the course title       — apiservice.reg.cmu.ac.th /bulletin/{รหัสวิชา}
// Neither is ours, both can go down or change shape without telling us, so every read
// goes through the `courses` table. Upstream is only called when the rows go stale, and
// a failed call serves the last-known-good rows instead of taking the cart down.

const COURSE_STRUCTURE_URL = "https://edu.nurse.cmu.ac.th/api/Publish/CourseStructure";
const REG_BULLETIN_URL = "https://apiservice.reg.cmu.ac.th/bulletin";

// ponytail: 24h. The course structure turns over per term, not per hour — anything
// shorter just adds upstream calls to a list that did not change.
const TTL_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 10_000;

export type CourseRow = { code: string; name: string | null };
export type CourseList = { courses: CourseRow[]; stale: boolean; syncedAt: Date | null };

/** Missing credentials are a deployment mistake, not an outage — they must not be
 *  swallowed by the stale-cache fallback, or the app silently serves month-old data
 *  forever and nobody finds out. Thrown before the fallback's try/catch. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} — the course API cannot be reached without it`);
  return value;
}

// --- upstream calls -------------------------------------------------------------

// Real payload (verified against 001101) carries these as strings: "2552", "1".
const bulletinSchema = z.array(
  z.object({
    title_long_th: z.string().nullish(),
    year_start: z.string().nullish(),
    semester_start: z.string().nullish(),
  }).loose(),
);

type BulletinRow = { title_long_th?: string | null; year_start?: string | null; semester_start?: string | null };

/** Sortable "when did this revision open" key, e.g. 2567/1 → 25671. Missing fields sort
 *  oldest, so a row without a term never beats one that has one. */
function termKey(row: BulletinRow): number {
  return Number(row.year_start ?? 0) * 10 + Number(row.semester_start ?? 0);
}

/** The current name of a course out of its revision history.
 *
 *  One course carries several bulletin rows — the same course revised over different terms.
 *  001101 returns three, and the newest renamed it. The registrar happens to return them
 *  oldest-first, but it never promised to, and it does give us the term each revision opened
 *  in, so pick the newest explicitly rather than trusting array order. Ties keep the later
 *  row, which is the old last-row behaviour.
 *
 *  Zero rows means the registrar has no bulletin for the code (real: 578101) — null lets the
 *  picker fall back to the bare code instead of caching an empty name over a good one. */
export function latestCourseTitle(rows: BulletinRow[]): string | null {
  const latest = rows.reduce<BulletinRow | undefined>(
    (best, row) => (!best || termKey(row) >= termKey(best) ? row : best),
    undefined,
  );
  return latest?.title_long_th?.trim() || null;
}

/** The registrar sample passes cmuaccount_name/api_id as a GET *body*, which native
 *  fetch cannot do (the spec forbids a body on GET). Sent as query params instead —
 *  verified working against the live registrar, so no axios dependency is needed. */
async function fetchCourseTitle(code: string): Promise<string | null> {
  const token = requireEnv("REG_API_TOKEN");
  const params = new URLSearchParams({
    cmuaccount_name: requireEnv("REG_API_ACCOUNT"),
    api_id: process.env.REG_API_ID || "00081",
  });

  const res = await fetch(`${REG_BULLETIN_URL}/${encodeURIComponent(code)}?${params}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Registrar bulletin ${code}: HTTP ${res.status}`);

  return latestCourseTitle(bulletinSchema.parse(await res.json()));
}

/** CourseStructure's exact field names are unconfirmed against a real payload (the endpoint
 *  401s without a token), so rows are matched on any course-code-ish key rather than one
 *  guessed name. ponytail: replace with the real field once a payload has been seen — this
 *  function is the only place that needs to change. */
const courseStructureSchema = z.array(z.union([z.string(), z.record(z.string(), z.unknown())]));

function extractCode(row: string | Record<string, unknown>): string | null {
  if (typeof row === "string") return row.trim() || null;
  const key = Object.keys(row).find((k) => /^(course|subject)_?(no|code|id)$/i.test(k));
  const value = key ? row[key] : null;
  return typeof value === "string" || typeof value === "number" ? String(value).trim() || null : null;
}

async function fetchCourseCodes(): Promise<string[]> {
  const token = requireEnv("COURSE_STRUCTURE_TOKEN");
  const res = await fetch(COURSE_STRUCTURE_URL, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`CourseStructure: HTTP ${res.status}`);

  const codes = courseStructureSchema.parse(await res.json()).map(extractCode).filter((c) => c !== null);
  // An upstream that answers 200 with nothing usable is a shape change, not an empty
  // catalogue — treat it like a failure so the cached list survives.
  if (codes.length === 0) throw new Error("CourseStructure returned no usable course codes");
  return [...new Set(codes)];
}

// How many registrar lookups run at once while filling in missing names. The registrar
// answers in ~100ms, so 8 at a time clears a full 193-course catalogue in a couple of
// seconds — fast enough to do inline, gentle enough not to look like an attack.
const NAME_FETCH_CONCURRENCY = 8;

type NameSyncResult = {
  /** Courses that gained a title this run. */
  resolved: number;
  /** Courses the registrar answered for but has no bulletin entry — a real answer, not a fault. */
  untitled: number;
  failed: string[];
  /** Why the first failure happened. One cause usually explains all of them (expired token,
   *  registrar down), and it is the only part of a failure worth a human's attention. */
  firstError?: string;
  skipped?: string;
};

/** Fill in every course still missing a title. Runs once after a catalogue refresh, so the
 *  picker can show "รหัส — ชื่อ" for the whole list instead of a wall of bare numbers.
 *
 *  One course failing must not cost the other 192 their names, so failures are collected
 *  rather than thrown and simply leave `name` null — the next refresh retries it. Nothing is
 *  logged here: a registrar outage would mean one near-identical line per course, so the
 *  caller reports the whole run as a single line instead. */
async function resolveMissingNames(codes: string[]): Promise<NameSyncResult> {
  // Checked once up front: without registrar credentials every one of the lookups would fail
  // the same way, and "no credentials" is a different problem from "registrar is down".
  if (!process.env.REG_API_TOKEN || !process.env.REG_API_ACCOUNT) {
    return { resolved: 0, untitled: 0, failed: [], skipped: "REG_API_TOKEN/REG_API_ACCOUNT not set" };
  }

  const missing = await prisma.course.findMany({ where: { code: { in: codes }, name: null }, select: { code: true } });
  const result: NameSyncResult = { resolved: 0, untitled: 0, failed: [] };

  for (let i = 0; i < missing.length; i += NAME_FETCH_CONCURRENCY) {
    await Promise.all(
      missing.slice(i, i + NAME_FETCH_CONCURRENCY).map(async ({ code }) => {
        try {
          const name = await fetchCourseTitle(code);
          // Null means the registrar has no bulletin for this code. Writing it would blank the
          // column for no gain, so leave it be and count it separately from a failure.
          if (!name) {
            result.untitled += 1;
            return;
          }
          await prisma.course.update({ where: { code }, data: { name } });
          result.resolved += 1;
        } catch (err) {
          result.failed.push(code);
          result.firstError ??= err instanceof Error ? err.message : String(err);
        }
      }),
    );
  }
  return result;
}

/** One line per catalogue refresh, whether or not anything went wrong.
 *
 *  Logging only failures means a refresh that never ran looks exactly like one that ran
 *  perfectly — both are silent — so the success case has to say so out loud. Failures are
 *  summarised with a handful of example codes plus the first cause rather than one line per
 *  course, because 193 copies of the same expired-token error tell nobody anything new. */
function logNameSync(codeCount: number, r: NameSyncResult): void {
  const parts = [`courses: catalogue ${codeCount}`, `names +${r.resolved}`];
  if (r.untitled) parts.push(`no bulletin ${r.untitled}`);
  if (r.skipped) parts.push(`names skipped (${r.skipped})`);
  if (r.failed.length) {
    const sample = r.failed.slice(0, 5).join(", ") + (r.failed.length > 5 ? ", …" : "");
    parts.push(`failed ${r.failed.length} [${sample}] — ${r.firstError}`);
  }

  const line = parts.join(" · ");
  if (r.failed.length || r.skipped) console.error(line);
  else console.log(line);
}

// --- cached reads ---------------------------------------------------------------

/** Course codes for the dispense picker. Serves cache when fresh, refreshes when stale,
 *  and falls back to cache when upstream is down or has changed shape. */
export async function listCourses(): Promise<CourseList> {
  const cached = await prisma.course.findMany({ orderBy: { code: "asc" } });
  const newestSync = cached.reduce<Date | null>((a, c) => (!a || c.syncedAt > a ? c.syncedAt : a), null);
  if (newestSync && Date.now() - newestSync.getTime() < TTL_MS) {
    return { courses: cached, stale: false, syncedAt: newestSync };
  }

  try {
    const codes = await fetchCourseCodes();
    // Existing rows keep their resolved name — only the sync timestamp moves.
    await prisma.course.createMany({ data: codes.map((code) => ({ code })), skipDuplicates: true });
    await prisma.course.updateMany({ where: { code: { in: codes } }, data: { syncedAt: new Date() } });
    // Names come from a different system than the codes, so this is best-effort: whatever it
    // resolves is a bonus, and the picker is usable on codes alone if the registrar is down.
    logNameSync(codes.length, await resolveMissingNames(codes));
    const fresh = await prisma.course.findMany({ where: { code: { in: codes } }, orderBy: { code: "asc" } });
    return { courses: fresh, stale: false, syncedAt: new Date() };
  } catch (err) {
    // A network error, a 401, a timeout and a changed response shape all land here, and
    // all get the same answer: keep the picker working on what we already have.
    console.error("CourseStructure refresh failed, serving cached courses:", err);
    if (cached.length === 0) throw err; // nothing cached + upstream down = genuinely nothing to show
    return { courses: cached, stale: true, syncedAt: newestSync };
  }
}

/** Resolve one course code to its Thai title. Cached permanently once resolved — a course
 *  that already has a name never needs the registrar again. */
export async function getCourseName(code: string): Promise<CourseRow & { stale: boolean }> {
  const cached = await prisma.course.findUnique({ where: { code } });
  if (cached?.name) return { code, name: cached.name, stale: false };

  try {
    const name = await fetchCourseTitle(code);
    if (!name) return { code, name: null, stale: false };
    await prisma.course.upsert({ where: { code }, create: { code, name }, update: { name } });
    return { code, name, stale: false };
  } catch (err) {
    console.error(`Registrar lookup failed for ${code}, falling back to the bare code:`, err);
    // The code alone still identifies the course well enough to dispense against, so a
    // registrar outage must not block the cart — it just loses the friendly name.
    return { code, name: null, stale: true };
  }
}
