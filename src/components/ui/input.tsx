import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, onKeyDown, onWheel, ...props }: React.ComponentProps<"input">) {
  const isNumber = type === "number"
  // ช่องตัวเลขทุกช่องในระบบเป็นจำนวน/ราคา/เดือน — ไม่มีอันไหนติดลบได้จริง. ห้ามตั้งแต่พิมพ์
  // เพราะ min="0" ห้ามแค่ตอน validate: พิมพ์ -500 ได้เต็มบรรทัดแล้วค่อยโดนเด้งตอนบันทึก.
  // ponytail: อ่านจาก min เอง ไม่ได้ hardcode — ช่องไหนต้องรับค่าติดลบในอนาคตแค่ตั้ง min ติดลบ
  const allowsNegative = Number(props.min) < 0

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // e/E คือ exponent ที่ type=number ยอมรับ ("1e5") — ไม่มีความหมายในช่องพวกนี้เลย
    if (isNumber && (e.key === "e" || e.key === "E" || e.key === "+" || (e.key === "-" && !allowsNegative))) {
      e.preventDefault()
    }
    onKeyDown?.(e)
  }

  // ล้อเมาส์บนช่อง number ที่ focus อยู่จะเปลี่ยนค่าเงียบๆ ระหว่างเลื่อนหน้า — blur ทิ้ง focus
  // ให้หน้าเลื่อนตามปกติแทน. preventDefault ใช้ไม่ได้ เพราะ React ผูก wheel เป็น passive listener.
  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    if (isNumber) e.currentTarget.blur()
    onWheel?.(e)
  }

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      className={cn(
        // ไม่มี py: h-8 หัก border+padding เหลือ content 22px ซึ่งเตี้ยกว่า line box ของ Sarabun
        // (22.86px) — ตัวที่กินขอบล่างอย่าง _ โดน overflow:clip เฉือนหายไปทั้งตัว. input
        // บรรทัดเดียวจัดกลางแนวตั้งให้เองอยู่แล้ว ตัด py ออกได้ความสูงเท่าเดิมและไม่คลิป
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
