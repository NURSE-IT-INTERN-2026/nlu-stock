---
target: src/app/(dashboard)/cart/page.tsx
total_score: 25
p0_count: 1
p1_count: 4
timestamp: 2026-07-16T08-37-58Z
slug: src-app-dashboard-cart-page-tsx
---
# Critique — `/cart` (ยืนยันการเบิก)

Synthesized from design review (Assessment A) + deterministic scan (Assessment B). Browser automation unavailable — visual claims from code inspection.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | spinner + fieldset lock ดี แต่ไม่มี aria-live ประกาศ submitting state |
| 2 | Match real world | 3 | Thai-first ดี แต่ "ผู้รับ" placeholder กำกวม (คน vs ห้อง), loanType scope ไม่ชัด |
| 3 | User control & freedom | 2 | clear/delete confirm มี แต่ไม่มี undo หลังเบิก |
| 4 | Consistency & standards | 2 | h-11 back button ขัด h-8; text-[11px] ต่ำกว่า label floor; footer backdrop-blur |
| 5 | Error prevention | 3 | validate-on-submit + focus-first-invalid + qty clamp + min date แข็ง ขาด final review ก่อนตัดสต็อก |
| 6 | Recognition over recall | 3 | field/select โชว์หมด แต่ loanType-scope เป็นภาระจำ |
| 7 | Flexibility & efficiency | 2 | ไม่มี Enter/⌘Enter submit (ไม่มี <form>), ไม่มี recurring template |
| 8 | Aesthetic & minimalist | 3 | 2-pane สะอาด form โชว์ตลอด เพิ่ม clutter เล็กน้อย vs modal เดิม |
| 9 | Error recovery | 2 | toast + redirect ไม่มี undo ทันที (มี returns flow แยก แต่ไม่ frictionless) |
| 10 | Help & docs | 2 | tooltip เดียว hover-only ไม่มี hint ฝั่ง durable recipient กำกวม |
| **Total** | | **25/40** | **Acceptable (band 20–27)** |

## Anti-Patterns Verdict

**LLM:** ไม่ slop. Linear/Stripe-fluent user ไว้ใจได้. absolute bans ผ่านครบ — ไม่มี side-stripe / gradient-text / floating-glass / hero-metric / eyebrow / numbered-marker / second-font. modal-as-first-thought ถูกแก้แล้ว (เปลี่ยน inline). 3 จุดหยุดสังเกตเล็ก: h-11 back button, text-[11px] Thai, loanType scope ไม่ legible.

**Deterministic scan (detect.mjs):** clean `[]`, exit 0. ไม่จับเพิ่ม.

**Visual overlays:** browser automation unavailable — ไม่มี overlay.

## Overall Impression
2-pane confirm ที่ใช้งานได้จริง ไม่ slop; มี craft ใน grouping/validation/responsive table. สิ่งกั้นจาก "Good": (1) สุดยอด click ของแอป (ตัดสต็อก) ไม่มี safety net/undo, (2) loanType global toggle กำกวม + อาจไม่ตรงจริง mixed cart, (3) mobile เอา form ไว้ล่าง list ทำ form ไม่ reachable.

## What's Working
1. consumable/durable grouping + status-tinted icon chips + count = textbook status-not-decoration.
2. inline validation + focus-first-invalid + aria-invalid/describedby = จริง ไม่ใช่ silent disable.
3. desktop table-fixed sticky header → mobile stacked meta line = responsive craft.

## Priority Issues

**[P0] สุดยอด click ตัดสต็อก ไม่มี safety net**
ยืนยันการเบิก ตัดสต็อกทันที + เขียน dispense records. footer โชว์แค่ count ไม่ใช่ itemized review; ไม่มี confirm สรุป ไม่มี undo ทันที (มี returns flow แยก แต่ไม่ใช่ frictionless). nursing institute = wrong dispense = missing asset — highest-stakes click ได้ friction น้อยสุด. Fix: undo window 5–8s บน success toast (Gmail-style) ดีกว่า confirm dialog ที่คน click through. Cmd: harden.

**[P1] loanType global toggle กำกวม + อาจไม่ตรงจริง mixed cart**
label "วัสดุคงทน นำไปใช้แบบไหน?" ไม่บอกว่าใช้กับทุกชิ้น; cart ผสม (ยืม + ตั้งในห้อง) ทำไม่ถูกใน transaction เดียว. pre-existing — modal เดิมก็ toggle เดียวกัน; schema มี loanType ต่อ record (memory `inuse-loan-type-column`). Fix: label ชัด ("วัสดุคงทน X รายการ ทั้งหมด?") หรือ per-row loanType (default ยืม). verify API ก่อน. Cmd: clarify.

**[P1] mobile form อยู่ล่าง cart list ยาว**
form aside อยู่หลังทุก row; 15-item cart ดัน "ผู้รับ" ลง ~15 scroll. Casey (one-handed/interrupted) หลุด; footer submit เห็น แต่ field ที่จะกรอกไม่เห็น. Fix: anchor-jump "กรอกข้อมูลการเบิก ↓" ใน footer หรือ collapse cart เป็น chip ตอนเลื่อนถึง form. Cmd: layout.

**[P1] h-11 back button กลับด้าน hierarchy + ขัด h-8**
"กลับหน้าเบิก" h-11 ใหญ่กว่า primary "ยืนยันการเบิก" h-8 → back > commit. Fix: default h-8 หรือ ghost/chevron-back. Cmd: polish.

**[P1] loanType radiogroup ผิด WAI-ARIA keyboard contract**
role=radiogroup/radio มี แต่ ไม่มี arrow-key handler + roving tabindex; Tab วนสองปุ่ม arrow ไม่ทำงาน. SR user คาดหวัง radio มาตรฐาน. Fix: onKeyDown arrow (←↑→↓) + roving tabindex (tabindex 0 เลือก, -1 อื่น). Cmd: harden.

**P2 minors:** text-[11px]→text-xs (SectionHeader subtitle + mobile meta); hover-only tooltip "ตัดสต็อกทันที" → inline copy + เพิ่ม hint ฝั่ง durable; ไม่มี `<form>` → Enter/⌘Enter submit; qty ± size-7 (28px) ต่ำกว่ามาตรฐาน; footer backdrop-blur → solid bg-background; room ยัดใน notes (pipe string) = data-model smell.

## Persona Red Flags
- **Sam (keyboard/SR):** radiogroup arrow ไม่ทำงาน; ไม่มี `<form>` Enter submit ไม่ได้; qty ± ไม่มี aria-describedby ผูกชื่อ item; submitting ไม่ announce (no aria-live).
- **Casey (mobile/interrupted):** form อยู่ล่าง list ยาว; qty ± 28px; mobile ไม่เห็น count breakdown (`hidden sm:block`); tooltip hover-only จับไม่ได้บน touch.
- **Alex (power):** ไม่มี keyboard submit; ไม่มี recurring-dispense template; ไม่มี batch qty/delete; lot/sub-item เปลี่ยนได้ pointer-only.
- **ครูผู้สอน/Instructor (non-tech Thai):** "วัสดุคงทน" = jargon; "ผู้รับ" กำกวม คน vs ห้อง; text-[11px] subtitle คือคำอธิบายที่จำเป็นแต่อ่านยากสุด; durable section ไม่มี hint ว่า "ต้องคืน" คืออะไร.

## Minor Observations
- footer blur ซ้อน opacity 2 ชั้น (เลือกอันเดียว)
- aria-hidden middot บน meta line = SR hygiene ดี (เก็บ)
- empty state มีแค่ "กลับหน้าเบิก" ไม่มี recent-items shortcut
- clear dialog `showCloseButton=false` = ดี บังคับเลือก
- room ยัด notes = data-model smell (reporting จะเจ็บ)
- footer summary ซ้อนกับ grouped list count (redundant)
- ไม่มี breadcrumb/page context

## Questions to Consider
1. loanType global ทำไม? per-row (default ยืม) จะละลาย scope-ambiguity + ตรงจริง mixed cart — เสียเพิ่ม 1 control/row. global = architectural shortcut หรือ workflow จริง?
2. pre-confirm dialog vs post-hoc undo? page คือ review surface อยู่แล้ว → undo 6s ปลอดภัยกว่า + friction น้อยกว่า confirm ที่คน click through?
3. mobile ควร collapse cart ตอนถึง form? cart → chip "15 รายการ · แตะเพื่อดู" พอ user ถึง "ข้อมูลการเบิก" → form เป็น primary, list เป็น reference.
