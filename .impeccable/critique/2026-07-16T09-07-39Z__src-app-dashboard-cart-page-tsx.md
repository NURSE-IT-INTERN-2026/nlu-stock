---
target: src/app/(dashboard)/cart/page.tsx
total_score: 34
p0_count: 0
p1_count: 2
timestamp: 2026-07-16T09-07-39Z
slug: src-app-dashboard-cart-page-tsx
---
# Critique (re-run) — `/cart` (ยืนยันการเบิก)

Design review (Assessment A) + deterministic scan (Assessment B). Browser unavailable → code inspection.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | submit มี spinner แต่ไม่มี progress "กำลังตัด 2/5" |
| 2 | Match real world | 4 | solid — ไทย วัสดุสิ้นเปลือง/คงทน ถูกต้อง |
| 3 | User control & freedom | 4 | solid — cancel ทั้ง 2 dialog, back nav, "ไม่ย้อนได้" ตรงไป |
| 4 | Consistency & standards | 3 | CTA สองตัวชื่อใกล้กัน "ยืนยันการเบิก" (footer) vs "ยืนยันเบิก" (dialog) |
| 5 | Error prevention | 4 | solid — inline validate + focus-first-invalid + min-date + qty clamp |
| 6 | Recognition over recall | 3 | ผู้รับ free-text (ไม่มี staff directory) — backend-deferred |
| 7 | Flexibility & efficiency | 3 | ⌘/Enter + arrow keys มี แต่ไม่มี "repeat last dispense" |
| 8 | Aesthetic & minimalist | 4 | solid — ไม่มี decoration, หนาแน่นนุ่มนวล |
| 9 | Error recovery | 3 | FieldError กระชับ "ระบุผู้รับ" ไม่มี recovery hint; SR ไม่มี validation live-region |
| 10 | Help & docs | 3 | consequence hints = help เบาๆ (พอใช้สำหรับ task page) |
| **Total** | | **34/40** | **Good (top of band, 28–35)** |

## Anti-Patterns Verdict
**LLM:** ไม่ slop. absolute bans ผ่านครบ. modal-as-first-thought — final confirm dialog = legit destructive gate (carve-out), ไม่ใช่ slop. cart metaphor ดึงไป e-commerce checkout แต่ density + Thai clinical copy + tinted-destructive พากลับมา institutional.

**Deterministic scan:** clean `[]`.

## Overall Impression
architecture แข็ง ไม่ slop; safety net (validation + confirm dialog + warning ตรงไปตรงมา) สร้างดีจริง. เหลือ 3 เรื่องเล็กไป Excellent: (1) ใส่แดงบนปุ่มที่ตัดสต็อกจริง, (2) เปลี่ยนชื่อ CTA ซ้ำ, (3) fieldset → `<form>`. ไม่ต้องแตะ layout.

## What's Working
1. inline validation + focus-first-invalid (no silent disable) = PRODUCT.md principle 3.
2. conditional fields (loanType/room/dueDate/usageNote เฉพาะตอนใช้) = cognitive load ลดจริง.
3. confirm dialog เป็น peak checkpoint: summary + warning ตั้งชื่อ remedy (คืนพัสดุ) ไม่ขู่อย่างเดียว.

## Priority Issues

**[P1] Severity inversion — commit ตัดสต็อก เป็นส้ม, clear cart (กู้คืนได้) เป็นแดง**
action ทำลายสุดในหน้าคือ "ตัดสต็อก" แต่ปุ่ม dialog "ยืนยันเบิก" เป็น orange primary; "ล้างทั้งหมด" ทำลายได้น้อยกว่ากลับเป็น destructive แดง. สีสู้กับ warning ข้างบน. Fix: dialog commit `variant="destructive"` (tinted red, ตาม Tinted-Destructive Rule); เก็บ orange เฉพาะ footer review-trigger. Cmd: colorize.

**[P1] CTA สองตัวชื่อ ยืนยัน~เบิก ทำคนละอย่าง**
"ยืนยันการเบิก" (footer) = เปิด dialog; "ยืนยันเบิก" (dialog) = ตัดสต็อก. อ่านเร็วคลิกทั้งสองคาดว่าเหมือนกัน → เผลอ commit. Fix: footer → "ตรวจสอบและยืนยัน"/"ถัดไป"; เก็บชื่อเด็ด "ตัดสต็อกเลย"/"ยืนยันเบิก" ให้ dialog. Cmd: clarify.

**[P2] ไม่มี `<form>` — submit ใช้ onKeyDown บน fieldset**
ใช้งานได้ (mouse + keyboard path ที่ code คาดไว้) แต่ SR เสีย `form` landmark + ไม่มี implicit submit guarantee. Fix: หุ้ม fieldset ใน `<form onSubmit={handleSubmit}>` + `<button type="submit">`; เก็บ ⌘Enter เป็น convenience. Cmd: harden.

**[P2] "ล้าง" ยังกดได้ตอน submitting**
`fieldset disabled={submitting}` คลุมแค่ form aside; footer "ล้าง" ไม่มี disabled → ล้าง cart ได้กลาง request → dispense สำเร็จแต่ cart ว่าง. Fix: `disabled={submitting}` บนปุ่ม ล้าง. Cmd: harden.

**[P3] ไม่มี SR validation summary live-region**
FieldError = role=alert ต่อ field (ดี) แต่ submit ล้มเหลว SR ได้ยินทีละ error ไม่มี "กรุณากรอก 3 ช่อง". Fix: `aria-live="polite"` summary เหนือ fieldset. Cmd: polish.

*mobile form-reachability = known/deferred (backend-blocked) — ไม่น้ำหนักในรอบนี้.*

## Persona Red Flags
- **Sam (keyboard/SR):** ✅ roving tabindex + arrow keys, focus ring, focus-first-invalid. ⚠️ ไม่มี `<form>` landmark. ⚠️ ไม่มี validation summary live-region.
- **Casey (mobile):** ⚠️ form อยู่ล่าง list (deferred). ⚠️ สองจอ "ยืนยัน" ส้มทั้งคู่ เหมือน loop ไม่ feel ว่าจอสอง final กว่า. ✅ stacked rows หนาแน่นดี.
- **ครูผู้สอน (non-tech Thai):** ⚠️ "ยืนยันการเบิก" vs "ยืนยันเบิก" อ่านเหมือนกัน → เผลอ re-tap หรือลังเล. ⚠️ ผู้รับ free-text พิมพ์ซ้ำทุกวัน (ไม่มี recent recipients).

## Minor Observations
- footer summary text-success/text-info-500 = ตรง section chips (status-not-decoration ครบ) ✅
- CartLotChip render-prop SelectValue = ถูก Base UI (ตรง memory) ✅
- dueAt ถูก force null ตอน inRoom แม้พิมพ์ไว้ — date field หายเงียบ (acceptable)
- empty state อบอุ่นสั้น ✅
- room ยัด notes = backend smell (ไม่ใช่ UI)
- `today` compute รันครั้งเดียว ถ้า tab เปิดข้ามเที่ยงคืน min drift เล็กน้อย (negligible)

## Questions to Consider
1. footer button โกหกเรื่องที่ทำ? บอก "ยืนยันการเบิก" แต่ไม่ยืนยันอะไร เปิด dialog. เปลี่ยนชื่อให้ตรง job → double-confirm จะเหมือน review→commit ไม่ใช่ loop?
2. ทำไมไม่มี undo window? warning ยอมรับว่า remedy คือ คืนพัสดุ. undo 30s จะลบ severity inversion + ลบ dialog ได้ และยังปลอดภัยกว่า. commit ต้อง instant/final เพราะเทคนิคหรือ assumption?
3. cart metaphor คุ้มมั้ย? นี่ supply counter ไม่ใช่ร้าน. 2-pane cart+form+sticky checkout footer = e-commerce echo แรงสุด. reframe เป็น "ใบเบิก" layout จะเปลี่ยนมั้ย หรือ cart ยังมีประสิทธิภาพสุด?
