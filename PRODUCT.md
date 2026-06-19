# PRODUCT.md — NLU Stock

## Register
product

## What it is
ระบบจัดการครุภัณฑ์และวัสดุของสถาบันการพยาบาลเพื่อการศึกษาและวิจัยแห่งชาติ (NLU)
Asset and inventory management system for a Thai nursing education institute.

## Users
- **ADMIN**: manages items master, categories, units, locations; full access
- **STAFF**: receives stock in, approves dispense requests, manages day-to-day
- **INSTRUCTOR**: requests item dispense for teaching/lab sessions; read-only on most views

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
