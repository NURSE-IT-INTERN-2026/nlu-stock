"use client";

import { cn } from "@/lib/utils";
import { tokenText, type Token } from "./report-kit";

export interface SummaryStat {
  label: string;
  value: string | number;
  /** Colours the **number** with its event colour — not the card. Omit and the number reads in
   *  the default text colour, which is what a stat with nothing to flag should look like. */
  token?: Token;
  /** One line under the number saying what it is counted from. Every headline number on a
   *  report is a slice of something bigger, and a report that doesn't say which slice is how
   *  "มูลค่าคงเหลือรวม" came to read as the value of the whole storeroom when it was three items. */
  hint?: string;
  /** Sits opposite the label, on the same line. */
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warning" | "danger";
  /** Makes the card a button. A total that can be broken down should say so by being
   *  pressable — "ใช้ไปแล้ว ฿12,400" raises "ใช้อะไรไป" and the answer is one click away. */
  onClick?: () => void;
}

const TONES: Record<NonNullable<SummaryStat["tone"]>, string> = {
  default: "",
  warning: "text-warning-700 dark:text-warning-200",
  danger: "text-destructive dark:text-danger-400",
};

/** The two-line answer a tab owes the reader before its table: what am I looking at, and how
 *  much of it is there. Shared so all report tabs answer in the same shape.
 *
 *  flex-wrap ที่ทุกใบยืดได้ ไม่ใช่ grid สามคอลัมน์ตายตัว: จำนวนการ์ดต่างกันทุก tab (2 ถึง 5 ใบ
 *  และ ค่าใช้จ่ายรายปี เปลี่ยนจำนวนตาม segment ที่เลือก) — กริดตายตัวจึงทิ้งรูโหว่ครึ่งแถวไว้
 *  เกือบทุกหน้า. basis คือความกว้างที่การ์ดขอ ไม่ใช่ที่มันได้: ใบไหนพอลงแถวเดียวกันก็ลง แล้ว
 *  ยืดเติมจนเต็มความกว้าง แถวสุดท้ายจึงไม่มีวันเหลือช่องว่าง ไม่ว่าจะกี่ใบหรือจอกว้างเท่าไร.
 *
 *  สีของ token อยู่ที่ "ตัวเลข" อย่างเดียว ไม่ใช่ที่พื้นหรือขอบการ์ด — ในหน้าเดียวกันมีชิป segment
 *  ที่ใช้พื้นทึบเป็นสัญญาณว่า "อันนี้ถูกเลือกอยู่" ถ้าการ์ดข้อมูลก็ทาสีพื้นด้วย สีจะแปลว่าสองอย่าง
 *  พร้อมกันแล้วอ่านไม่ออกว่าอันไหนคือสถานะ อันไหนคือหมวด. โครงของหน้าเป็นหน้าที่ของ surface
 *  กับระยะห่าง. */
export function ReportSummary({ stats }: { stats: SummaryStat[] }) {
  return (
    <div className="flex flex-wrap gap-2 sm:gap-3">
      {stats.map((s) => {
        const Tag = s.onClick ? "button" : "div";
        return (
        <Tag
          key={s.label}
          {...(s.onClick ? { type: "button" as const, onClick: s.onClick } : {})}
          // พื้นการ์ดเดียวกับ <Card> ของแอปเป๊ะ: bg-card + เงานุ่ม ไม่มีเส้นขอบ. เดิมการ์ดพวกนี้
          // เป็น "กรอบสีเข้ม + พื้นสีจาง" ของ token ตัวเอง ซึ่งไปชนกับชิป segment ที่เลือกอยู่
          // (พื้นทึบ + ตัวหนังสือขาว) — สีถูกใช้เป็นทั้ง emphasis และ structure พร้อมกัน
          // การ์ดสรุปเลยอ่านเป็นคนละ component ที่หลุดมาซ้อนอยู่บนหน้า.
          // ตอนนี้ surface กับ spacing เป็นตัวแบ่งโครง ส่วนสีเหลือหน้าที่เดียวคือเน้น "ตัวเลข".
          className={cn(
            "grow basis-[13rem] rounded-2xl bg-card p-4 text-left shadow-lg shadow-black/[0.04]",
            s.onClick && "cursor-pointer transition-shadow hover:shadow-xl hover:shadow-black/[0.08]",
          )}
        >
          {/* Label row owns the icon, then the number, then the caveat — one reading order at
              every width. The label used to jump to the left of the value on phones, which put
              the numbers down the middle of the column instead of on a line you can scan.
              No uppercase/tracking from the mock: the labels are Thai, where uppercase is a
              no-op and letter-spacing only breaks up the cluster. */}
          <div className={cn("flex items-center justify-between gap-2", s.token && tokenText[s.token])}>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            {s.icon && <s.icon className="size-4 shrink-0" />}
          </div>
          <p
            className={cn(
              "mt-1 text-xl leading-none font-bold tabular-nums",
              s.token ? tokenText[s.token] : TONES[s.tone ?? "default"],
            )}
          >
            {s.value}
          </p>
          {s.hint && <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>}
        </Tag>
        );
      })}
    </div>
  );
}
