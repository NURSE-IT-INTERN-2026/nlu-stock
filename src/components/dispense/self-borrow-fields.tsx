"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxField, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { getCourses, type CourseOption } from "@/lib/api";
import { USAGE_TYPE_OPTIONS } from "@/lib/constants";
import { fmtDate, TH_DATETIME, TH_DATE } from "@/lib/format";
import { selfBorrowDueAt, SELF_BORROW_DEFAULT_DAYS, SELF_BORROW_MAX_DAYS } from "@/lib/self-borrow";

// ใช้ใน / รายวิชา / กิจกรรม / กำหนดคืน — the questions ยืมเอง asks, wherever it is asked from:
// the QR dialog (one item) and หน้าเบิก-ยืม (a whole basket). One copy, because the two
// screens must not drift on which fields are required — /api/borrow enforces one set of rules
// and a second copy of this form would be a second opinion about them.

export interface SelfBorrowForm {
  usageType: string;
  courseCode: string;
  /** Snapshotted with the loan — history must stay readable when the registrar is down. */
  courseName: string | null;
  activity: string;
  days: number;
}

export const emptySelfBorrowForm: SelfBorrowForm = {
  usageType: "",
  courseCode: "",
  courseName: null,
  activity: "",
  days: SELF_BORROW_DEFAULT_DAYS,
};

export function activityLabelFor(usageType: string): string {
  return usageType === "OTHER" ? "เอาไปทำอะไร / ใครขอ" : "ระบุกิจกรรมที่นำไปใช้";
}

/** Same shape the dialog used inline: field → message, or null when it is fine. */
export function selfBorrowErrors(f: SelfBorrowForm): Record<string, string | null> {
  const needsCourse = f.usageType === "COURSE";
  const needsActivity = f.usageType === "ACTIVITY" || f.usageType === "OTHER";
  return {
    usageType: f.usageType ? null : "เลือกการใช้งาน",
    ...(needsCourse ? { courseCode: f.courseCode ? null : "เลือกรายวิชา" } : {}),
    ...(needsActivity ? { activity: f.activity.trim() ? null : activityLabelFor(f.usageType) } : {}),
  };
}

/** The half of the /api/borrow body this form owns. `days` is dropped by the caller when the
 *  whole basket is สิ้นเปลือง — เบิกใช้ never comes back, so it has no กำหนดคืน. */
export function selfBorrowUsagePayload(f: SelfBorrowForm) {
  const needsCourse = f.usageType === "COURSE";
  return {
    usageType: f.usageType,
    courseCode: needsCourse ? f.courseCode : null,
    usageNote: needsCourse ? f.courseName : f.activity.trim(),
  };
}

/** Whole days out from today as "YYYY-MM-DD" local — what the DatePicker speaks. */
export function dayStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

interface Props {
  value: SelfBorrowForm;
  onChange: (next: SelfBorrowForm) => void;
  showErrors: boolean;
  /** false = ทั้งตะกร้าเป็นของสิ้นเปลือง: no กำหนดคืน row at all. */
  showDue: boolean;
}

export function SelfBorrowFields({ value, onChange, showErrors, showDue }: Props) {
  const set = (patch: Partial<SelfBorrowForm>) => onChange({ ...value, ...patch });
  const needsCourse = value.usageType === "COURSE";
  const needsActivity = value.usageType === "ACTIVITY" || value.usageType === "OTHER";
  const activityLabel = activityLabelFor(value.usageType);
  const errors = selfBorrowErrors(value);

  // Fetched only once รายวิชา is actually picked. It is the one field that reaches outside the
  // building, and most borrows are not for a course.
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [courseApiError, setCourseApiError] = useState<string | null>(null);
  const coursesRequested = useRef(false);
  const loadCourses = useCallback(async () => {
    setCoursesLoading(true);
    try {
      const d = await getCourses();
      setCourses(d.courses);
      setCourseApiError(
        d.stale
          ? `เชื่อมต่อระบบรายวิชาไม่ได้ · กำลังใช้รายชื่อที่บันทึกไว้เมื่อ ${d.syncedAt ? fmtDate(d.syncedAt, TH_DATE) : "ก่อนหน้านี้"}`
          : null,
      );
    } catch {
      setCourseApiError("เชื่อมต่อระบบรายวิชาไม่ได้ — แจ้งผู้ดูแลระบบ");
    } finally {
      setCoursesLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!needsCourse || coursesRequested.current) return;
    coursesRequested.current = true;
    void loadCourses();
  }, [needsCourse, loadCourses]);

  const courseItems = useMemo(
    () => courses.map((c) => ({ value: c.code, label: c.name ? `${c.code} — ${c.name}` : c.code })),
    [courses],
  );

  // Computed per render rather than pinned in state: the form can sit open while the clock
  // moves, and a stale "คืนภายใน" would be a promise the API does not keep.
  const dueAt = selfBorrowDueAt(value.days);

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="borrow-usage" id="borrow-usage-label" required>ใช้ใน</Label>
        <Select value={value.usageType} onValueChange={(v) => v !== null && set({ usageType: v })}>
          <SelectTrigger id="borrow-usage" aria-labelledby="borrow-usage-label" aria-invalid={showErrors && !!errors.usageType} className="w-full bg-card text-sm">
            <SelectValue placeholder="เลือกการใช้งาน">
              {USAGE_TYPE_OPTIONS.find((o) => o.value === value.usageType)?.label ?? "เลือกการใช้งาน"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {USAGE_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showErrors && errors.usageType && <FieldError>{errors.usageType}</FieldError>}
      </div>

      {needsCourse && (
        <div className="space-y-2">
          <Label htmlFor="borrow-course" id="borrow-course-label" required>รายวิชา</Label>
          {/* Typed filtering, not a plain Select — the registrar hands back a couple of
              hundred courses and nobody should scroll that to find one code. */}
          <Combobox
            items={courseItems}
            value={courseItems.find((i) => i.value === value.courseCode) ?? null}
            onValueChange={(item: { value: string; label: string } | null) => {
              set({
                courseCode: item?.value ?? "",
                courseName: courses.find((c) => c.code === item?.value)?.name ?? null,
              });
            }}
            disabled={coursesLoading || courses.length === 0}
          >
            <ComboboxField>
              <ComboboxInput
                id="borrow-course"
                aria-labelledby="borrow-course-label"
                aria-invalid={showErrors && !!errors.courseCode}
                placeholder={coursesLoading ? "กำลังโหลดรายวิชา..." : "พิมพ์รหัสหรือชื่อวิชา"}
              />
            </ComboboxField>
            <ComboboxContent>
              <ComboboxEmpty>ไม่พบรายวิชาที่ค้นหา</ComboboxEmpty>
              <ComboboxList>
                {(item: { value: string; label: string }) => (
                  <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          {/* Warning, not an error — the borrow still goes through on a stale list. */}
          {courseApiError && (
            <p role="status" className="flex items-start gap-1.5 text-xs text-warning-700 dark:text-warning-200">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              <span>{courseApiError}</span>
            </p>
          )}
          {showErrors && errors.courseCode && <FieldError>{errors.courseCode}</FieldError>}
        </div>
      )}

      {needsActivity && (
        <div className="space-y-2">
          <Label htmlFor="borrow-activity" required>{activityLabel}</Label>
          <Textarea
            id="borrow-activity"
            rows={2}
            value={value.activity}
            onChange={(e) => set({ activity: e.target.value })}
            aria-invalid={showErrors && !!errors.activity}
            className="bg-card"
          />
          {showErrors && errors.activity && <FieldError>{errors.activity}</FieldError>}
        </div>
      )}

      {/* กำหนดคืน is picked in days, so it is stated as well as asked — it is the one thing the
          borrower is agreeing to. สิ้นเปลืองไม่มีบรรทัดนี้เลย: เบิกแล้วไม่กลับ การโชว์กำหนดคืน
          คือสัญญาที่ระบบไม่ได้บันทึกไว้. */}
      {showDue && (
        <div className="space-y-2">
          <Label htmlFor="borrow-due" required>กำหนดคืน</Label>
          <DatePicker
            id="borrow-due"
            value={dayStr(value.days)}
            // Whole days out from today, so today itself is not offerable — a loan due at some
            // hour that has already passed is not a loan anyone can keep.
            min={dayStr(1)}
            clearable={false}
            onChange={(next) => {
              if (!next) return;
              // Compare dates at local midnight; differencing the raw strings would trip over
              // month ends and DST.
              const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
              const picked = new Date(`${next}T00:00:00`);
              const diff = Math.round((midnight(picked) - midnight(new Date())) / 86_400_000);
              set({ days: Math.min(Math.max(diff, 1), SELF_BORROW_MAX_DAYS) });
            }}
            className="bg-card"
          />
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="mt-px size-3.5 shrink-0" />
            <span>คืนภายใน {value.days * 24} ชั่วโมง — {fmtDate(dueAt, TH_DATETIME)} น.</span>
          </p>
        </div>
      )}
    </>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  return <p role="alert" className="text-xs text-destructive">{children}</p>;
}
