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

// Real payload (verified against 001101, 951100, 551462) carries these as strings:
// "2552", "1", and open_status "1" = still taught / "0" = retired.
const bulletinSchema = z.array(
  z.object({
    title_long_th: z.string().nullish(),
    year_start: z.string().nullish(),
    semester_start: z.string().nullish(),
    open_status: z.string().nullish(),
  }).loose(),
);

type BulletinRow = {
  title_long_th?: string | null;
  year_start?: string | null;
  semester_start?: string | null;
  open_status?: string | null;
};

/** What one course's bulletin says about it right now. */
export type Bulletin = { name: string | null; open: boolean };

/** Sortable "when did this revision open" key, e.g. 2567/1 → 25671. Missing fields sort
 *  oldest, so a row without a term never beats one that has one.
 *
 *  A term that will not parse ("2567ก") sorts oldest too rather than becoming NaN: every
 *  comparison against NaN is false, so a NaN in the first row would pin that row as newest
 *  and never be displaced — and open_status is read off whichever row wins, so one garbled
 *  field could retire a course that is being taught today. */
function num(value: string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function termKey(row: BulletinRow): number {
  return num(row.year_start) * 10 + num(row.semester_start);
}

/** The revision that is in force today.
 *
 *  One course carries several bulletin rows — the same course revised over different terms.
 *  001101 returns three, and the newest renamed it. The registrar happens to return them
 *  oldest-first, but it never promised to, and it does give us the term each revision opened
 *  in, so pick the newest explicitly rather than trusting array order. Ties keep the later
 *  row, which is the old last-row behaviour.
 *
 *  Null means the registrar has no bulletin for this code at all (real: 578101). */
export function latestRevision(rows: BulletinRow[]): BulletinRow | null {
  return rows.reduce<BulletinRow | null>(
    (best, row) => (!best || termKey(row) >= termKey(best) ? row : best),
    null,
  );
}

/** The course's current title. Null when there is no bulletin, or the newest revision left
 *  the title blank — the picker then falls back to the bare code instead of caching an
 *  empty name over a good one. */
export function latestCourseTitle(rows: BulletinRow[]): string | null {
  return latestRevision(rows)?.title_long_th?.trim() || null;
}

/** Whether the course is still taught, off the newest revision's open_status.
 *
 *  Only the newest revision's flag counts: a course with three revisions has open_status "0"
 *  on the two it has moved past (951100 is real: 2552 closed, 2566 closed, 2568 open), and
 *  reading any of those would retire a course that is running today.
 *
 *  No bulletin at all (real: 578101) means the registrar has nothing to say, not that the
 *  course is closed — the faculty catalogue still lists it, so keep it pickable. */
export function latestCourseOpen(rows: BulletinRow[]): boolean {
  const latest = latestRevision(rows);
  return !latest || latest.open_status?.trim() !== "0";
}

/** The registrar sample passes cmuaccount_name/api_id as a GET *body*, which native
 *  fetch cannot do (the spec forbids a body on GET). Sent as query params instead —
 *  verified working against the live registrar, so no axios dependency is needed. */
async function fetchBulletin(code: string): Promise<Bulletin> {
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

  const rows = bulletinSchema.parse(await res.json());
  return { name: latestCourseTitle(rows), open: latestCourseOpen(rows) };
}

/** Rows are matched on any course-code-ish key rather than one hard-coded field name.
 *  The live payload has since been read successfully (193 codes, all resolved to titles),
 *  but the loose match costs nothing and survives an upstream field rename. */
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

// How many registrar lookups run at once. The registrar answers in ~100ms, so 8 at a time
// clears a full 193-course catalogue in a couple of seconds — fast enough to do inline,
// gentle enough not to look like an attack.
const NAME_FETCH_CONCURRENCY = 8;

type NameSyncResult = {
  /** Courses whose title or open flag the registrar confirmed this run. */
  resolved: number;
  /** Courses the registrar answered for with no usable title — no bulletin at all, or a
   *  blank one. A real answer, not a fault. */
  untitled: number;
  /** Courses the registrar reports as retired. They stay in the table (history can still
   *  resolve their names) but drop out of the picker. */
  closed: number;
  failed: string[];
  /** Why the first failure happened. One cause usually explains all of them (expired token,
   *  registrar down), and it is the only part of a failure worth a human's attention. */
  firstError?: string;
  skipped?: string;
};

/** Re-read every course's bulletin after a catalogue refresh: the title for the picker, and
 *  open_status to decide whether the course is still offered.
 *
 *  Every code, not just the ones missing a title — open_status and the title both change
 *  under a code that never changes, so a fetch-once-and-keep-forever cache would show a
 *  retired course as current and a renamed course under its old name until someone noticed
 *  by hand. This runs once per TTL (24h), so the whole catalogue costs ~193 calls a day.
 *
 *  One course failing must not cost the other 192 their names, so failures are collected
 *  rather than thrown and simply leave the row as it was — the next refresh retries it.
 *  Nothing is logged here: a registrar outage would mean one near-identical line per course,
 *  so the caller reports the whole run as a single line instead. */
async function syncBulletins(codes: string[]): Promise<NameSyncResult> {
  // Checked once up front: without registrar credentials every one of the lookups would fail
  // the same way, and "no credentials" is a different problem from "registrar is down".
  if (!process.env.REG_API_TOKEN || !process.env.REG_API_ACCOUNT) {
    return { resolved: 0, untitled: 0, closed: 0, failed: [], skipped: "REG_API_TOKEN/REG_API_ACCOUNT not set" };
  }

  const result: NameSyncResult = { resolved: 0, untitled: 0, closed: 0, failed: [] };

  for (let i = 0; i < codes.length; i += NAME_FETCH_CONCURRENCY) {
    await Promise.all(
      codes.slice(i, i + NAME_FETCH_CONCURRENCY).map(async (code) => {
        try {
          const { name, open } = await fetchBulletin(code);
          // A null name means the registrar has no bulletin for this code, or the newest
          // revision left the title blank. Writing it would erase a title we may already
          // hold, so only the open flag moves in that case.
          await prisma.course.update({ where: { code }, data: name ? { name, open } : { open } });
          if (!open) result.closed += 1;
          if (name) result.resolved += 1;
          else result.untitled += 1;
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
  const parts = [`courses: catalogue ${codeCount}`, `names ${r.resolved}`];
  if (r.closed) parts.push(`retired ${r.closed}`);
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
  // Only courses still offered: the refresh below clears `open` on both the codes the faculty
  // catalogue dropped and the ones the registrar reports as retired, so this path and the
  // fresh path answer with the same set. Retired rows stay in the table — history still
  // resolves their names — they just stop being pickable.
  const cached = await prisma.course.findMany({ where: { open: true }, orderBy: { code: "asc" } });
  // Read across every row, retired ones included: taking it off `cached` would mean a table
  // whose courses all happen to be retired looks like it has never synced, and re-swept the
  // whole registrar on every single request.
  const { _max } = await prisma.course.aggregate({ _max: { syncedAt: true } });
  const newestSync = _max.syncedAt;
  if (newestSync && Date.now() - newestSync.getTime() < TTL_MS) {
    return { courses: cached, stale: false, syncedAt: newestSync };
  }

  try {
    const codes = await fetchCourseCodes();
    // Existing rows keep their resolved name — only the sync timestamp moves.
    await prisma.course.createMany({ data: codes.map((code) => ({ code })), skipDuplicates: true });
    await prisma.course.updateMany({ where: { code: { in: codes } }, data: { syncedAt: new Date() } });
    // Codes the catalogue dropped are retired, not deleted. Deleting them would keep the
    // picker honest just the same, but it also throws away their titles — and those are what
    // getCourseName serves when someone opens a years-old dispense whose course is long gone.
    // Retiring costs one boolean and survives a truncated upstream answer: the next good
    // refresh opens them back up, where a delete would have been permanent.
    await prisma.course.updateMany({ where: { code: { notIn: codes } }, data: { open: false } });
    // Names come from a different system than the codes, so this is best-effort: whatever it
    // resolves is a bonus, and the picker is usable on codes alone if the registrar is down.
    logNameSync(codes.length, await syncBulletins(codes));
    const fresh = await prisma.course.findMany({ where: { code: { in: codes }, open: true }, orderBy: { code: "asc" } });
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
    const { name, open } = await fetchBulletin(code);
    // A retirement is worth recording even when the bulletin carries no title — same reason
    // as syncBulletins: write the flag, never blank a title we already hold.
    await prisma.course.upsert({
      where: { code },
      create: { code, name, open },
      update: name ? { name, open } : { open },
    });
    return { code, name, stale: false };
  } catch (err) {
    console.error(`Registrar lookup failed for ${code}, falling back to the bare code:`, err);
    // The code alone still identifies the course well enough to dispense against, so a
    // registrar outage must not block the cart — it just loses the friendly name.
    return { code, name: null, stale: true };
  }
}
