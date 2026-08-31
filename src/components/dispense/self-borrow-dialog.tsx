"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { HandCoins, X, Loader2, CalendarClock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DIALOG_SHELL, DIALOG_BODY, Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxField, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { selfBorrow, getCourses, type CourseOption } from "@/lib/api";
import { USAGE_TYPE_OPTIONS } from "@/lib/constants";
import { fmtDate, TH_DATETIME, TH_DATE } from "@/lib/format";
import { DatePicker } from "@/components/ui/date-picker";
import { selfBorrowDueAt, SELF_BORROW_DEFAULT_DAYS, SELF_BORROW_MAX_DAYS } from "@/lib/self-borrow";

// ยืมเอง confirm step. Same shell as station-in-room-dialog next door, and for the same
// reason: this takes stock off a shelf the moment it is confirmed, so it gets a step the
// user has to mean, not a button that fires on the first tap.
//
// It asks far less than the cart's ข้อมูลการเบิก-ยืม dialog — ใช้ใน/รายวิชา/ผู้รับ/กำหนดคืน are
// staff bookkeeping about someone else's loan. Here the borrower IS the recipient, the due
// date is fixed at +24h, and the only open question is how many.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemCode: string;
  itemName: string;
  issueUnit: string;
  /** 1 for tracked items — the piece is chosen by the server, not the borrower. */
  max: number;
  isTracked: boolean;
  /** สิ้นเปลือง = เบิกใช้: no due date, and the word "ยืม" would be a lie on the button. */
  isConsume: boolean;
  /** The exact copy being borrowed, when the page is showing one. Omitted on the item page,
   *  where the server picks a free piece instead. */
  subItemId?: string | null;
  onDone: () => void;
}

export function SelfBorrowDialog({
  open, onOpenChange, itemId, itemCode, itemName, issueUnit, max, isTracked, isConsume, subItemId, onDone,
}: Props) {
  const verb = isConsume ? "เบิก" : "ยืม";
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [usageType, setUsageType] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState<string | null>(null);
  const [activity, setActivity] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  // The picker edits a DATE, but what ships is a day COUNT — the server owns the clock, and
  // whole days keep the promise literal: 1 วัน = 24 ชม. จากตอนนี้, not "sometime tomorrow".
  const [days, setDays] = useState(SELF_BORROW_DEFAULT_DAYS);
  const dayStr = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString("en-CA"); // "YYYY-MM-DD" local
  };
  const dueDateStr = dayStr(days);

  const needsCourse = usageType === "COURSE";
  const needsActivity = usageType === "ACTIVITY" || usageType === "OTHER";
  const activityLabel = usageType === "OTHER" ? "เอาไปทำอะไร / ใครขอ" : "ระบุกิจกรรมที่นำไปใช้";

  // Same deal as the cart: fetched only once รายวิชา is actually picked. It is the one field
  // that reaches outside the building, and most borrows are not for a course.
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

  const errors: Record<string, string | null> = {
    usageType: usageType ? null : "เลือกการใช้งาน",
    ...(needsCourse ? { courseCode: courseCode ? null : "เลือกรายวิชา" } : {}),
    ...(needsActivity ? { activity: activity.trim() ? null : activityLabel } : {}),
  };
  const canConfirm = Object.values(errors).every((v) => !v);
  // Computed once per render rather than pinned in state: the dialog can sit open while the
  // clock moves, and a stale "คืนภายใน" would be a promise the API does not keep.
  const dueAt = selfBorrowDueAt(days);

  const close = (o: boolean) => {
    if (!o) {
      setQty(1);
      setUsageType(""); setCourseCode(""); setCourseName(null); setActivity(""); setShowErrors(false);
      setDays(SELF_BORROW_DEFAULT_DAYS);
    }
    onOpenChange(o);
  };

  const handleSubmit = async () => {
    if (!canConfirm) { setShowErrors(true); return; }
    setSubmitting(true);
    try {
      await selfBorrow({
        itemId,
        subItemId,
        quantity: qty,
        usageType,
        courseCode: needsCourse ? courseCode : null,
        // The course NAME is snapshotted, not looked up at read time — history has to stay
        // readable when the registrar is down, and a renamed course must not rewrite it.
        usageNote: needsCourse ? courseName : activity.trim(),
        ...(isConsume ? {} : { days }),
      });
      toast.success(isConsume ? "เบิกสำเร็จ" : `ยืมสำเร็จ · คืนภายใน ${fmtDate(dueAt, TH_DATETIME)}`);
      close(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${verb}ไม่สำเร็จ`);
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent showCloseButton={false} className="max-w-[calc(100%-2rem)] sm:max-w-[460px] gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">{verb}พัสดุ</DialogTitle>
        <DialogDescription className="sr-only">{itemCode} · {itemName}</DialogDescription>

        <div className={DIALOG_SHELL}>
          {/* Header band */}
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HandCoins className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-foreground">{verb}พัสดุ</p>
                <p className="text-xs text-muted-foreground truncate"><span className="font-mono">{itemCode}</span> · {itemName}</p>
              </div>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={() => close(false)}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
              aria-label="ปิด"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className={cn(DIALOG_BODY, "bg-secondary/40 px-6 py-6")}>
            <fieldset disabled={submitting} className="m-0 min-w-0 space-y-5 border-0">
              {isTracked ? (
                <p className="text-sm text-muted-foreground">{verb}ได้ครั้งละ 1 {issueUnit}</p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="borrow-qty" required>จำนวน</Label>
                  <Input
                    id="borrow-qty"
                    type="number"
                    min={1}
                    max={max}
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, Math.min(Number(e.target.value) || 1, max)))}
                    className="h-10 text-foreground bg-card"
                  />
                  <p className="text-xs text-muted-foreground">{verb}ได้สูงสุด {max} {issueUnit}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="borrow-usage" id="borrow-usage-label" required>ใช้ใน</Label>
                <Select value={usageType} onValueChange={(v) => v !== null && setUsageType(v)}>
                  <SelectTrigger id="borrow-usage" aria-labelledby="borrow-usage-label" aria-invalid={showErrors && !!errors.usageType} className="w-full bg-card text-sm">
                    <SelectValue placeholder="เลือกการใช้งาน">
                      {USAGE_TYPE_OPTIONS.find((o) => o.value === usageType)?.label ?? "เลือกการใช้งาน"}
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
                    value={courseItems.find((i) => i.value === courseCode) ?? null}
                    onValueChange={(item: { value: string; label: string } | null) => {
                      setCourseCode(item?.value ?? "");
                      setCourseName(courses.find((c) => c.code === item?.value)?.name ?? null);
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
                    value={activity}
                    onChange={(e) => setActivity(e.target.value)}
                    aria-invalid={showErrors && !!errors.activity}
                    className="bg-card"
                  />
                  {showErrors && errors.activity && <FieldError>{errors.activity}</FieldError>}
                </div>
              )}

              {/* กำหนดคืน is fixed, so it is stated rather than asked — but stated plainly,
                  because it is the one thing the borrower is agreeing to. สิ้นเปลืองไม่มีบรรทัดนี้
                  เลย: เบิกแล้วไม่กลับ การโชว์กำหนดคืนคือสัญญาที่ระบบไม่ได้บันทึกไว้. */}
              {!isConsume && (
                <div className="space-y-2">
                  <Label htmlFor="borrow-due" required>กำหนดคืน</Label>
                  <DatePicker
                    id="borrow-due"
                    value={dueDateStr}
                    // Whole days out from today, so today itself is not offerable — a loan due
                    // at some hour that has already passed is not a loan anyone can keep.
                    min={dayStr(1)}
                    clearable={false}
                    onChange={(next) => {
                      if (!next) return;
                      // Compare dates at local midnight; differencing the raw strings would
                      // trip over month ends and DST.
                      const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                      const picked = new Date(`${next}T00:00:00`);
                      const diff = Math.round((midnight(picked) - midnight(new Date())) / 86_400_000);
                      setDays(Math.min(Math.max(diff, 1), SELF_BORROW_MAX_DAYS));
                    }}
                    className="bg-card"
                  />
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="mt-px size-3.5 shrink-0" />
                    <span>คืนภายใน {days * 24} ชั่วโมง — {fmtDate(dueAt, TH_DATETIME)} น. (ยืมได้นานสุด {SELF_BORROW_MAX_DAYS} วัน)</span>
                  </p>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                กดยืนยันแล้วระบบจะตัดสต็อกทันที
                {!isConsume && " · นำของมาคืนที่งานพัสดุ เจ้าหน้าที่เป็นผู้ปิดรายการให้"}
              </p>
            </fieldset>
          </div>

          {/* Footer band */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
            <Button variant="ghost" disabled={submitting} onClick={() => close(false)}>ยกเลิก</Button>
            {/* Not disabled on invalid: a dead button says nothing about which field is
                missing. Clicking it turns the messages on instead. */}
            <Button disabled={submitting || max <= 0} onClick={() => void handleSubmit()}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              ยืนยันการ{verb}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ponytail: third copy of this three-line helper (cart/page.tsx and station-in-room-dialog
// have their own). Promote it to components/ui when a fourth caller shows up.
function FieldError({ children }: { children: ReactNode }) {
  return <p role="alert" className="text-xs text-destructive">{children}</p>;
}
