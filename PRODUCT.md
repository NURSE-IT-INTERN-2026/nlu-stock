# PRODUCT.md — NLU Stock

## Register
product

## What it is
ระบบจัดการครุภัณฑ์และวัสดุของสถาบันการพยาบาลเพื่อการศึกษาและวิจัยแห่งชาติ (NLU)
Asset and inventory management system for a Thai nursing education institute.

## Users
Roles are NOT stored in the database — they come from env allowlists of emails
(`src/lib/roles.ts`). An email on no list cannot sign in at all.

- **SUPERADMIN** (ผู้ดูแลระบบ): everything, plus ตั้งค่า — items master, categories, units, locations, users, borrow limits
- **ADMIN** (ผู้ดูแล): all stock work — รับเข้า, รับคืน, แจ้งชำรุด, ปรับยอด, บำรุงรักษา, เบิก/ยืม, รายงาน. No ตั้งค่า
- **EXECUTIVE** (ผู้บริหาร): เบิก/ยืม and reports only. Every other write is refused

## Primary tasks (by frequency)
1. Receive items into stock (stock-in)
2. Dispense items to instructors
3. Browse / search items
4. Manage items master (add, edit, deactivate)
5. Reports and export

## Brand personality
ชัดเจน, เชื่อถือได้, ใช้งานง่าย — institutional but approachable. Thai-language first.

## Anti-references
- Consumer e-commerce (too casual)
- Heavy ERP (too corporate, dense)
- Generic SaaS cream/beige (anonymous)

## Accessibility
Thai language primary. Keyboard navigation important for staff workflows.
Color is not the only indicator of state.

## Design principles
1. Task over decoration — every element serves the current task
2. Status always visible — stock levels, pending requests, item state surfaced immediately
3. Error prevention over recovery — validate early (code duplicates, name conflicts), not after save
