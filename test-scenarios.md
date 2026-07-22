# Test Scenarios — Dispense / Borrow / Return Flows

เอกสารสำหรับ AI agent (Chrome DevTools MCP) เดินเทสจริงบนเบราว์เซอร์ + ตรวจ DB
เน้น flow เบิก (consumable) / ยืม (tracked) / คืน (return) และจุด quantity drift

---

## Environment

### App
- **Base URL**: `http://localhost:3000` (รัน `npm run dev` แล้วดู port จริงจาก output)
- Next.js App Router, route group `(dashboard)` ไม่ปรากฏใน URL (เช่น `src/app/(dashboard)/dispense/page.tsx` → `/dispense`)

### Seed data (ต้องทำก่อนเทส)
```bash
# ต้องมี DATABASE_URL + JWT_SECRET ใน .env และโฟลเดอร์ CSV/ ที่ root
npx prisma db seed     # เทียบเท่า npx tsx prisma/seed.ts
```
ไม่มี npm script `seed` — ใช้ `npx prisma db seed` โดยตรง
Seed สร้าง user 4 คน (ดูด้านล่าง) + พัสดุตามรูปแบบโค้ด `NLU-{PROFILE}-{NNN}` + demo loan 6 กลุ่ม

### Login (passwordless — ไม่มี password)
- หน้า `/login` มีปุ่ม quick-login 4 ปุ่ม: **Admin / Staff / Instructor / Student**
- คลิกปุ่ม = login ทันที ไม่ต้องกรอก password (backend ไม่ตรวจ password เลย)
- ใช้ **Staff** (`staff@nlu.ac.th`, role STAFF) สำหรับเทสเบิก/ยืม/คืน เพราะ INSTRUCTOR ถูก block จาก write routes (403), CHILDREN เข้า dashboard ไม่ได้

| ปุ่ม | email | role |
|---|---|---|
| Admin | admin@nlu.ac.th | ADMIN |
| Staff | staff@nlu.ac.th | STAFF |
| Instructor | instructor@nlu.ac.th | INSTRUCTOR |
| Student | children@nlu.ac.th | CHILDREN |

- Cookie session: `session_token` (httpOnly — อ่านจาก `document.cookie` ไม่ได้)
- ตรวจ login state: `GET /api/auth/session` → 200 `{ user: { email } }`

### พัสดุอ้างอิงในเทส (ค้นด้วย `code`, ห้ามใช้ id เพราะ cuid เปลี่ยนทุก reseed)
| code | profile / dispenseType | trackIndividually | lots | ใช้ใน |
|---|---|---|---|---|
| `NLU-CON-006` ขึ้นไป | CON / CONSUMABLE | false | **ไม่มี lot** | Scenario 1 (drift) |
| `NLU-CON-001`..`005` | CON / CONSUMABLE | false | มี lot | (เปรียบเทียบ) |
| `NLU-KRU-001`, `NLU-KRU-002` | KRU / ITEM | **true** | — | Scenario 2,3,4,5,6 (tracked) |
| `NLU-DUR-001`.. | DUR / COUNT | false | ไม่มี | (count loan) |

> หมายเหตุ: ELE แชร์ prefix `NLU-KRU-` กับ KRU; BOOK/TOY แชร์ `NLU-BAT-`. บาง sub-item ของ KRU เริ่มต้นเป็น DAMAGED/UNDER_REPAIR/LOST จาก CSV — เทสต้องเลือก sub ที่ status=AVAILABLE เท่านั้น

### DB access (raw SQL — รันได้เลย)
Column เป็น **camelCase** ต้อง quote ด้วย double-quote (`"availableQty"`); table เป็น snake_case (`items`, `sub_items`, `dispense_records`, `lots`, `item_status_logs`, `maintenance_records`, `users`). Enum เปรียบเทียบด้วย single-quote string (`'ON_LOAN'`).

รันผ่าน heredoc (หลีกเลี่ยงปัญหา shell quoting):
```bash
psql "$DATABASE_URL" <<'SQL'
SELECT code, "availableQty", "totalQty", status FROM items WHERE code = 'NLU-CON-006';
SQL
```
ถ้าไม่มี `psql`: ใช้ Prisma runner แทน
```bash
npx tsx -e '(async()=>{const {PrismaClient}=await import("./src/generated/prisma/client");const {PrismaPg}=await import("@prisma/adapter-pg");const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});try{const r=await p.item.findUnique({where:{code:"NLU-CON-006"},select:{availableQty:true,totalQty:true,status:true}});console.log(JSON.stringify(r));}finally{await p.$disconnect();}})()'
```

### Cart persistence (สำคัญต่อ cleanup)
- Cart เก็บใน `localStorage` key `dispense-cart` — ข้าม reload/navigate
- **ระหว่าง scenario**: กดปุ่ม `ล้าง` บน `/cart` หรือ `localStorage.removeItem("dispense-cart")` ไม่งั้นของเดิมติดมาทำให้เทสเพี้ยน

### Navigation labels (อ้างอิงตอนคลิก)
- Bottom tab (mobile): หน้าหลัก / พัสดุ / แจ้งเตือน / เบิก / รับเข้า
- Header cart icon: aria-label `ดูตะกร้า`
- `/receive` มี 4 tab (`?tab=`): `receive`(รับเข้าพัสดุ) / `in_use`(คืนเข้าพัสดุ) / `return`(รับคืน) / `repair`(รับซ่อม)

---

## Scenario 1 — เบิก consumable ที่ไม่มี lot (ตรวจ quantity ลดถูกและไม่ drift)

### Precondition
- Login ในฐานะ Staff
- มีพัสดุ consumable ไม่มี lot: `NLU-CON-006` ขึ้นไป (`category.profile.code='CON'`, `lots: {none: {}}`)
- บันทึก `availableQty` ก่อนเทส:
```bash
psql "$DATABASE_URL" <<'SQL'
SELECT code, "availableQty", "totalQty", status FROM items WHERE code = 'NLU-CON-006';
SQL
```
เก็บค่า `oldQty = availableQty` และ `oldTotal = totalQty`

### Steps
1. ไป `/dispense` (tab เบิก)
2. พิมพ์ `NLU-CON-006` ในช่องค้นหา (placeholder `ค้นหารหัส / ชื่อพัสดุ…`)
3. บนการ์ดของ `NLU-CON-006` กดปุ่ม `เพิ่ม` (ปุ่ม gradient pill)
4. ปรับจำนวนเป็น **2** ด้วยปุ่ม `เพิ่มจำนวน` (aria-label `เพิ่มจำนวน`) — หรือเหลือ 1 ก็ได้แต่ต้องจำค่าที่ตั้งไว้เป็น `Q`
5. กดไอคอนตะกร้า (aria-label `ดูตะกร้า`) → `/cart`
6. กดปุ่ม `ยืนยันการเบิก` (floating dock)
7. ใน dialog `ยืนยันการเบิก`:
   - เลือก `ใช้ใน *` → `รายวิชา` (placeholder `เลือกการใช้งาน`)
   - ช่อง `ผู้รับ` พิมพ์ `เทส drift`
   - `กำหนดคืน (optional)` ปล่อยว่าง
8. กด `ยืนยันเบิก` (disabled จนกว่าจะเลือก usageType; มี spinner ตอนส่ง)

### Expected
**UI level**
- Toast สำเร็จ: `เบิกพัสดุสำเร็จ 1 รายการ`
- กลับไป `/dispense`, ตะกร้าว่าง
- การ์ด `NLU-CON-006` แสดง `เหลือ {oldQty - Q}` (badge `เหลือ N`)

**DB level**
```bash
psql "$DATABASE_URL" <<'SQL'
SELECT code, "availableQty", "totalQty", status FROM items WHERE code = 'NLU-CON-006';
-- expect: availableQty = oldQty - Q, totalQty = oldTotal (ไม่เปลี่ยน), status = 'AVAILABLE'

-- ตรวจ dispense record ที่สร้าง
SELECT id, "loanGroupId", "subItemId", "lotId", quantity, "resolvedQty", "returnedAt", "returnCondition"
FROM dispense_records
WHERE "itemId" = (SELECT id FROM items WHERE code='NLU-CON-006')
ORDER BY "dispensedAt" DESC LIMIT 1;
-- expect: quantity = Q, resolvedQty = 0, returnedAt IS NULL, returnCondition IS NULL (consumable = ใช้แล้วทิ้ง ไม่มีการคืน)

-- control: consumable ไม่มี lot ตัวอื่นต้องไม่ถูก wipe เป็น 0
SELECT code, "availableQty" FROM items WHERE code = 'NLU-CON-007';
-- expect: availableQty ไม่เปลี่ยนจากก่อนเทส
SQL
```

### Known failure points
- **`src/lib/stock.ts:84`** — guard `if (lotSum._count > 0)` ป้องกัน consumable ไม่มี lot ถูก set `availableQty = SUM(lots) = 0`. ถ้า guard หาย → `NLU-CON-006` จะถูก wipe เป็น 0 หลังเบิก (เพราะ dispense branch C เรียก `recomputeItemCounts` ที่ route.ts:133)
- **`src/app/api/dispense/route.ts:123-134`** — branch COUNT/lot-less: decrement `availableQty` + เรียก recompute. ถ้าลืม decrement หรือ recompute พัง → drift
- `src/app/api/dispense/route.ts:116-122` — optimistic-lock underflow error `available quantity underflow (counter out of sync with lots)`

### Cleanup
```bash
psql "$DATABASE_URL" <<'SQL'
-- คืน availableQty และลบ dispense record ที่เทสสร้าง
UPDATE items SET "availableQty" = "availableQty" + <Q> WHERE code = 'NLU-CON-006';
DELETE FROM dispense_records
WHERE "itemId" = (SELECT id FROM items WHERE code='NLU-CON-006')
  AND recipient = 'เทส drift';
SQL
```
ล้างตะกร้า: `localStorage.removeItem("dispense-cart")`

---

## Scenario 2 — ยืม tracked item เดี่ยว (ตรวจ SubItem.status + loanGroupId)

### Precondition
- Login ในฐานะ Staff
- `NLU-KRU-001` (`trackIndividually=true`) มี SubItem status=AVAILABLE อย่างน้อย 1 ตัว
```bash
psql "$DATABASE_URL" <<'SQL'
SELECT s.id, s."subCode", s.status, s.condition
FROM sub_items s
JOIN items i ON s."itemId" = i.id
WHERE i.code = 'NLU-KRU-001'
ORDER BY s."subCode";
SQL
```
เลือก sub ที่ `status='AVAILABLE'` ตัวแรก → จำ `subA.id` และ `subA.subCode` ไว้
- จด `availableQty` ก่อนเทสของ `NLU-KRU-001`

### Steps
1. ไป `/dispense`, ค้น `NLU-KRU-001`
2. กด `เพิ่ม` บนการ์ด → cart จะ auto-pick sub ที่ AVAILABLE ตัวแรก (cart-context.tsx:188-201)
3. ไป `/cart` → ตรวจบรรทัด: มี Sub picker แสดง `{subCode} ({condition})` (ไม่ใช่ lot picker)
4. กด `ยืนยันการเบิก`
5. ใน dialog:
   - เลือก `ใช้ใน *` → `กิจกรรม`
   - `ผู้รับ` พิมพ์ `เทสยืมเดี่ยว`
   - ปล่อย loanType เป็น `ยืม (มีกำหนดคืน)` (default — **ห้าม** กด `ตั้งใช้ในห้อง`)
   - `กำหนดคืน (optional)` ตั้งวันถัดไป
6. กด `ยืนยันเบิก`

### Expected
**UI level**
- Toast `เบิกพัสดุสำเร็จ 1 รายการ`
- ไป `/receive?tab=return` (tab รับคืน) → เห็น loan card ใหม่ ผู้ยืม `เทสยืมเดี่ยว` แสดง `ค้าง 1/1`

**DB level**
```bash
psql "$DATABASE_URL" <<'SQL'
-- SubItem ต้องเป็น ON_LOAN
SELECT "subCode", status FROM sub_items WHERE id = '<subA.id>';
-- expect: status = 'ON_LOAN'

-- DispenseRecord ต้องมี loanGroupId + subItemId + ยังไม่คืน
SELECT "loanGroupId", "subItemId", quantity, "resolvedQty", "returnedAt", "returnCondition", recipient, "dueAt"
FROM dispense_records
WHERE "subItemId" = '<subA.id>'
ORDER BY "dispensedAt" DESC LIMIT 1;
-- expect: loanGroupId IS NOT NULL, subItemId = <subA.id>, quantity=1, resolvedQty=0, returnedAt IS NULL, returnCondition IS NULL, dueAt IS NOT NULL

-- Item counts: availableQty ลด 1 (recompute จาก count(AVAILABLE))
SELECT code, "availableQty", "totalQty", status FROM items WHERE code='NLU-KRU-001';
-- expect: availableQty = oldQty - 1, status = 'ON_LOAN' (deriveStatusFromSubItems — มี ON_LOAN อยู่)

-- audit log
SELECT "previousStatus", "newStatus", reason FROM item_status_logs
WHERE "subItemId" = '<subA.id>' ORDER BY "changedAt" DESC LIMIT 1;
-- expect: previousStatus='AVAILABLE', newStatus='ON_LOAN', reason='เบิก'
SQL
```

### Known failure points
- **`src/app/api/dispense/route.ts:88-105`** — tracked branch: set `SubItem.status` และเรียก `recomputeItemCounts` (route.ts:105). ถ้าลืม recompute → `Item.availableQty` ไม่ลด
- **`src/lib/stock.ts:106-108`** — tracked derive: `availableQty = count(AVAILABLE)`, `totalQty = count(!DISPOSED)`. ถ้านับผิด → drift
- `src/app/api/dispense/route.ts:50-52` — ถ้าส่ง tracked item โดยไม่มี subItemId → error `พัสดุติดตามรายชิ้นต้องเลือก SubItem ก่อนเบิก`

### Cleanup
```bash
psql "$DATABASE_URL" <<'SQL'
UPDATE sub_items SET status = 'AVAILABLE' WHERE id = '<subA.id>';
DELETE FROM dispense_records WHERE "subItemId" = '<subA.id>' AND recipient = 'เทสยืมเดี่ยว';
DELETE FROM item_status_logs WHERE "subItemId" = '<subA.id>' AND reason = 'เบิก';
-- recompute ด้วยมือ: availableQty = count(AVAILABLE) ของ item
UPDATE items SET "availableQty" = (SELECT COUNT(*) FROM sub_items WHERE "itemId"=items.id AND status='AVAILABLE'),
                 status = 'AVAILABLE'
WHERE code = 'NLU-KRU-001';
SQL
```
ล้างตะกร้า

---

## Scenario 3 — ยืมหลายชิ้นพร้อมกันใน loanGroupId เดียว

### Precondition
- Login ในฐานะ Staff
- `NLU-KRU-002` มี SubItem AVAILABLE อย่างน้อย **2** ตัว
```bash
psql "$DATABASE_URL" <<'SQL'
SELECT s.id, s."subCode", s.status FROM sub_items s
JOIN items i ON s."itemId"=i.id WHERE i.code='NLU-KRU-002' AND s.status='AVAILABLE'
ORDER BY s."subCode";
SQL
```

### Steps
1. ไป `/dispense`, ค้น `NLU-KRU-002`
2. กด `เพิ่ม` ครั้งที่ 1 → เพิ่ม sub ตัวที่ 1 เป็นบรรทัด cart แยก
3. กด `เพิ่ม`/`เพิ่มจำนวน` อีกครั้งบนการ์ด → เพิ่ม sub ตัวที่ 2 เป็นบรรทัด cart แยก (แต่ละ tap = sub ตัวใหม่ qty 1, ไม่ใช่ qty increment)
   - ถ้า sub หมด → toast `ไม่มีหน่วยย่อยให้เบิกเพิ่ม`
4. ไป `/cart` → ตรวจมี 2 บรรทัด แต่ละบรรทัดมี Sub picker คนละตัว
5. กด `ยืนยันการเบิก`
6. ใน dialog: `ใช้ใน *` → `อื่นๆ` → พิมพ์ `รวมกลุ่มเทส` ในช่อง `ระบุการใช้งาน...`, `ผู้รับ` = `กลุ่มทดสอบ`, loanType = `ยืม (มีกำหนดคืน)`
7. กด `ยืนยันเบิก`

### Expected
**UI level**
- Toast `เบิกพัสดุสำเร็จ 2 รายการ`
- `/receive?tab=return` → เห็น **1 loan card** ผู้ยืม `กลุ่มทดสอบ` แสดง `2 รายการ` และ `ค้าง 2/2` (group รวมเป็นการ์ดเดียวเพราะ loanGroupId เดียวกัน)

**DB level**
```bash
psql "$DATABASE_URL" <<'SQL'
-- ทุกบรรทัดของการยืมครั้งนี้ต้อง share loanGroupId เดียวกัน + แยก subItemId
SELECT "loanGroupId", "subItemId", "subCode", quantity, "resolvedQty", "returnedAt"
FROM dispense_records dr
JOIN sub_items s ON dr."subItemId" = s.id
WHERE recipient = 'กลุ่มทดสอบ'
ORDER BY "subCode";
-- expect: 2 แถว, loanGroupId เหมือนกันทั้งสองแถว, subItemId ต่างกัน, quantity=1, resolvedQty=0, returnedAt IS NULL

-- ทั้ง 2 sub เป็น ON_LOAN
SELECT s."subCode", s.status FROM sub_items s
JOIN items i ON s."itemId"=i.id
WHERE i.code='NLU-KRU-002' AND s."subCode" IN ('<subCode1>','<subCode2>');
-- expect: status='ON_LOAN' ทั้งคู่

-- Item: availableQty ลด 2
SELECT code, "availableQty", status FROM items WHERE code='NLU-KRU-002';
-- expect: availableQty = oldQty - 2, status='ON_LOAN'
SQL
```

### Known failure points
- **`src/app/api/dispense/route.ts:22`** — `loanGroupId = randomUUID()` สร้างครั้งเดียวต่อ POST, stamp ทุก record. ถ้าสร้างใน loop → แต่ละบรรทัดคนละ group → return screen แยกการ์ด
- `src/components/dispense/cart-context.tsx:188-201` — auto-pick next AVAILABLE sub; ถ้าเลือกซ้ำ → 2 บรรทัดชี้ sub เดียวกัน (UI ป้องกันด้วยการ disable พร้อม suffix ` (อยู่ในตะกร้า)` ที่ cart/page.tsx:216-220)
- `src/app/api/dispense/route.ts:58` — ถ้า sub ถูกยืมแล้วจะ block (ดู Scenario 5)

### Cleanup
```bash
psql "$DATABASE_URL" <<'SQL'
UPDATE sub_items SET status='AVAILABLE'
WHERE id IN (SELECT "subItemId" FROM dispense_records WHERE recipient='กลุ่มทดสอบ');
DELETE FROM item_status_logs WHERE "subItemId" IN (SELECT "subItemId" FROM dispense_records WHERE recipient='กลุ่มทดสอบ') AND reason='เบิก';
DELETE FROM dispense_records WHERE recipient='กลุ่มทดสอบ';
UPDATE items SET "availableQty"=(SELECT COUNT(*) FROM sub_items WHERE "itemId"=items.id AND status='AVAILABLE'), status='AVAILABLE'
WHERE code='NLU-KRU-002';
SQL
```
ล้างตะกร้า

---

## Scenario 4 — คืนของพร้อมระบุ condition รายชิ้น (per-unit condition)

### Precondition
- มี loan ที่ยืม tracked 2 ชิ้นใน loanGroupId เดียว (ใช้ผลจาก Scenario 3 หรือยืมใหม่ตาม Steps ของ Scenario 3 ก่อน)
- จด `loanGroupId`, `subItemId` ทั้ง 2 ตัว (`subB` จะคืนปกติ, `subC` จะคืนชำรุด)
```bash
psql "$DATABASE_URL" <<'SQL'
SELECT "loanGroupId", "subItemId", s."subCode" FROM dispense_records dr
JOIN sub_items s ON dr."subItemId"=s.id WHERE recipient='กลุ่มทดสอบ';
SQL
```

### Steps
1. ไป `/receive?tab=return` (tab รับคืน)
2. คลิก loan card ผู้ยืม `กลุ่มทดสอบ` → เข้าหน้า detail (ReturnLoanDetail)
3. บนแถว `subB`: ติ๊ก checkbox → เลือก condition chip **`ปกติ`**
4. บนแถว `subC`: ติ๊ก checkbox → เลือก condition chip **`ชำรุด`**
   - ช่อง note พิมพ์ `จอแตก` (placeholder `ระบุความเสียหาย เช่น จอแตก`)
   - กด `แนบรูป` และอัปโหลดรูป (hint `แนบรูปหลักฐาน (บังคับสำหรับชำรุด/สูญหาย)` — **บังคับ** ถ้าไม่แนบปุ่มบันทึก disabled)
5. (ถ้ามี) กรอก `หมายเหตุการคืนโดยรวม (ถ้ามี)` = `ทดสอบ per-unit`
6. กด `บันทึก` (sticky bar; disabled จนกว่า canSave = มี selection + evidence ครบ)
7. ใน AlertDialog `ยืนยันการบันทึกคืน` → กด `ยืนยันบันทึก`
   - body แสดง: `จะบันทึกคืน 2 ชิ้น (ปกติ 1, ชำรุด 1, สูญหาย 0)`

### Expected
**UI level**
- Toast `บันทึกการคืนเรียบร้อย`
- กลับไป list รับคืน → loan card หายไป (คืนครบแล้ว) หรือแสดง `คืนครบ`
- แถว `subC` ใน detail แสดง badge `คืนแล้ว`

**DB level**
```bash
psql "$DATABASE_URL" <<'SQL'
-- subB (ปกติ): status AVAILABLE
SELECT "subCode", status FROM sub_items WHERE id='<subB.subItemId>';
-- expect: status='AVAILABLE'

-- subC (ชำรุด): status UNDER_REPAIR (DAMAGED → UNDER_REPAIR ที่ returns route.ts:102)
SELECT "subCode", status FROM sub_items WHERE id='<subC.subItemId>';
-- expect: status='UNDER_REPAIR'

-- DispenseRecord ทั้ง 2 คืนครบ
SELECT "subItemId", "resolvedQty", "returnedAt", "returnCondition"
FROM dispense_records WHERE "loanGroupId"='<loanGroupId>';
-- expect: 2 แถว, resolvedQty=1, returnedAt IS NOT NULL
--   subB → returnCondition='AVAILABLE'
--   subC → returnCondition='DAMAGED'

-- audit logs
SELECT s."subCode", l."newStatus", l.reason FROM item_status_logs l
JOIN sub_items s ON l."subItemId"=s.id WHERE l."subItemId" IN ('<subB.subItemId>','<subC.subItemId>')
ORDER BY l."changedAt" DESC LIMIT 2;
-- expect: subB newStatus='AVAILABLE' reason='คืนเข้าสู่ระบบ'
--        subC newStatus='UNDER_REPAIR' reason ขึ้นต้นด้วย 'คืนพร้อมระบุ:'

-- MaintenanceRecord draft สำหรับ subC (ชำรุด)
SELECT type, result, issue FROM maintenance_records WHERE "subItemId"='<subC.subItemId>';
-- expect: type='CORRECTIVE', result='NEEDS_MORE_REPAIR', issue มี note 'จอแตก'

-- Item status: มี UNDER_REPAIR อยู่ → status='UNDER_REPAIR' (priority 5 > ON_LOAN 3)
SELECT code, status, "availableQty" FROM items WHERE code='NLU-KRU-002';
-- expect: status='UNDER_REPAIR', availableQty = count(AVAILABLE) (เพิ่ม 1 จาก subB ที่กลับมา)
SQL
```

### Known failure points
- **`src/lib/returns.ts:36-38`** — block `if (sub.status !== ItemStatus.ON_LOAN)`. ถ้า sub เป็น IN_USE (จาก loanType=INUSE) → throw `Sub-item is not on loan (status: IN_USE)` (ดู Scenario 7)
- **`src/lib/returns.ts:46`** — update `SubItem.status` เท่านั้น **ไม่แตะ `SubItem.condition`**. ถ้าเทส assert ที่ `condition` จะ fail — ใช้ `status` + `DispenseRecord.returnCondition` + `ItemStatusLog.reason` แทน
- `src/components/receive/return-loan-detail.tsx:47-51` — condition options ปกติ/ชำรุด/สูญหาย (เฉพาะ AVAILABLE/DAMAGED/LOST, ไม่มี UNDER_REPAIR ใน batch route)
- `src/components/receive/return-loan-detail.tsx:527` — photo บังคับสำหรับ ชำรุด/สูญหาย; `บันทึก` disabled ถ้าขาด
- `src/app/api/returns/route.ts:102` — DAMAGED → UNDER_REPAIR mapping; `:118-131` สร้าง MaintenanceRecord draft

### Cleanup
```bash
psql "$DATABASE_URL" <<'SQL'
UPDATE sub_items SET status='AVAILABLE' WHERE id IN ('<subB.subItemId>','<subC.subItemId>');
DELETE FROM maintenance_records WHERE "subItemId"='<subC.subItemId>';
DELETE FROM item_status_logs WHERE "subItemId" IN ('<subB.subItemId>','<subC.subItemId>');
DELETE FROM dispense_records WHERE "loanGroupId"='<loanGroupId>';
UPDATE items SET "availableQty"=(SELECT COUNT(*) FROM sub_items WHERE "itemId"=items.id AND status='AVAILABLE'), status='AVAILABLE'
WHERE code='NLU-KRU-002';
SQL
```

---

## Scenario 5 — Edge: ยืม SubItem ที่ถูกยืมอยู่แล้ว (ต้อง block)

### Precondition
- มี SubItem ที่ `status='ON_LOAN'` อยู่แล้ว (ใช้ผลจาก Scenario 2: `subA` ของ `NLU-KRU-001`, หรือ demo loan จาก seed)
```bash
psql "$DATABASE_URL" <<'SQL'
SELECT s.id, s."subCode", s.status, i.code FROM sub_items s
JOIN items i ON s."itemId"=i.id WHERE s.status='ON_LOAN' AND i.code='NLU-KRU-001' LIMIT 1;
SQL
```
จด `subA.id`, `subA.subCode`, `itemId`

### Steps
**ส่วน A — ตรวจ UI ป้องกัน**
1. ไป `/dispense`, ค้น `NLU-KRU-001`, กด `เพิ่ม` หลายครั้งจนครบ sub ที่ AVAILABLE
2. ไป `/cart` → เปิด Sub picker → ตรวจว่า `subA` (ON_LOAN) **ไม่อยู่ในตัวเลือก** หรือ disabled (เฉพาะ AVAILABLE เท่านั้นที่เลือกได้)

**ส่วน B — ตรวจ API block ตรงๆ (reproduce ด้วยการเรียกตรง)**
3. รันใน console ของ browser (DevTools) หรือ curl:
```bash
curl -s -X POST http://localhost:3000/api/dispense \
  -H "Content-Type: application/json" \
  -H "Cookie: session_token=<cookie จาก login>" \
  -d '{"items":[{"itemId":"<itemId>","subItemId":"<subA.id>","quantity":1}],"usageType":"OTHER","recipient":"พยายามยืมซ้ำ"}'
```

### Expected
**UI level (ส่วน A)**
- Sub picker แสดงเฉพาะ sub ที่ AVAILABLE; `subA` ที่ ON_LOAN ไม่ปรากฏเป็นตัวเลือกที่เลือกได้ (ถ้าอยู่ในตะกร้าแล้วจะ disabled พร้อม suffix ` (อยู่ในตะกร้า)`)

**API level (ส่วน B)**
- HTTP 400, body: `{ "error": "Sub-item <subCode> is not available (status: ON_LOAN)" }`
- ไม่มี DispenseRecord ใหม่ถูกสร้าง, `subA.status` ยัง ON_LOAN เหมือนเดิม

**DB level**
```bash
psql "$DATABASE_URL" <<'SQL'
SELECT COUNT(*) FROM dispense_records WHERE recipient='พยายามยืมซ้ำ';
-- expect: 0 (ไม่มี record ถูกสร้าง)
SQL
```

### Known failure points
- **`src/app/api/dispense/route.ts:58`** — `if (sub.status !== ItemStatus.AVAILABLE) throw new Error(\`Sub-item ${sub.subCode} is not available (status: ${sub.status})\`)`. ถ้าเงื่อนไขนี้หาย → ยืมทับ, double-booking, 2 loanGroupId ชี้ sub เดียวกัน
- `src/components/dispense/cart-context.tsx:188-201` — auto-pick ควรข้าม sub ที่ไม่ AVAILABLE; ถ้าไม่กรอง → อาจ auto-pick sub ที่ ON_LOAN แล้วติด block ที่ API
- `src/app/api/dispense/route.ts:50-52` — tracked โดยไม่มี subItemId → error อีกกรณี

### Cleanup
ไม่สร้าง state ใหม่ (block แล้ว) — แค่ล้างตะกร้าและ (ถ้ามี) ลบ cart localStorage. ถ้า Scenario 2 ยังไม่ cleanup ให้ทำตาม cleanup ของ Scenario 2

---

## Scenario 6 — Edge: คืนบางชิ้นจาก loanGroupId เดียวกัน (ไม่คืนหมด)

### Precondition
- มี loan ยืม tracked 2 ชิ้นใน loanGroupId เดียวกัน (ยืมใหม่ตาม Scenario 3, ผู้ยืม `กลุ่มทดสอบ 6` เพื่อไม่สับสนกับ Scenario 4)
```bash
psql "$DATABASE_URL" <<'SQL'
SELECT "loanGroupId", "subItemId", s."subCode" FROM dispense_records dr
JOIN sub_items s ON dr."subItemId"=s.id WHERE recipient='กลุ่มทดสอบ 6';
-- จด loanGroupId, subD (จะคืน), subE (จะทิ้งไว้)
SQL
```

### Steps
1. ไป `/receive?tab=return`
2. คลิก loan card `กลุ่มทดสอบ 6` → detail
3. ติ๊กเฉพาะ `subD` → เลือก `ปกติ` (ไม่ติ๊ก `subE`)
4. กด `บันทึก` → `ยืนยันบันทึก`

### Expected
**UI level**
- Toast `บันทึกการคืนเรียบร้อย`
- กลับไป list → loan card **ยังอยู่** แสดง `ค้าง 1/2` (คืนยังไม่ครบ)
- ใน detail: แถว `subD` badge `คืนแล้ว` (disabled), แถว `subE` ยังเปิดให้คืนได้

**DB level**
```bash
psql "$DATABASE_URL" <<'SQL'
-- subD คืนแล้ว
SELECT "subCode", status FROM sub_items WHERE id='<subD.subItemId>';
-- expect: status='AVAILABLE'
SELECT "resolvedQty", "returnedAt", "returnCondition" FROM dispense_records WHERE "subItemId"='<subD.subItemId>';
-- expect: resolvedQty=1, returnedAt IS NOT NULL, returnCondition='AVAILABLE'

-- subE ยังไม่คืน
SELECT "subCode", status FROM sub_items WHERE id='<subE.subItemId>';
-- expect: status='ON_LOAN'
SELECT "resolvedQty", "returnedAt" FROM dispense_records WHERE "subItemId"='<subE.subItemId>';
-- expect: resolvedQty=0, returnedAt IS NULL

-- loanGroupId ยังอยู่ (อยู่บน record ไม่ใช่ sub) — ทั้ง 2 record share group เดิม
SELECT "subItemId","resolvedQty","returnedAt" FROM dispense_records WHERE "loanGroupId"='<loanGroupId>';
-- expect: 2 แถว, คืน 1 ค้าง 1

-- Item: availableQty เพิ่ม 1 (subD กลับ), subE ยัง ON_LOAN → status='ON_LOAN'
SELECT code, "availableQty", status FROM items WHERE code='NLU-KRU-002';
-- expect: availableQty = oldQty + 1, status='ON_LOAN'
SQL
```

### Known failure points
- `src/app/api/returns/route.ts:107-115` — `resolveSubItemReturn` resolve **เฉพาะ entry ที่ส่งมา**; record อื่นใน group ไม่ถูกแตะ. ถ้า logic พยายาม resolve ทั้ง group → คืนเกิน
- `src/app/api/returns/route.ts:134-137` — `recomputeItemCounts` ทุก affected item; ต้องนับ availableQty ใหม่ถูก (เพิ่ม 1 ไม่ใช่ 2)
- `src/components/receive/return-panel.tsx:174-213` — group card คำนวณ `ค้าง {outstanding}/{total}` จาก SUM(resolvedQty)/SUM(quantity) ข้าม record ใน group. ถ้าคำนวณผิด → แสดงผิด
- **`src/lib/returns.ts:36-38`** — ถ้าพยายามคืน `subE` ซ้ำหลังคืนแล้วจะ block (status != ON_LOAN)

### Cleanup
```bash
psql "$DATABASE_URL" <<'SQL'
UPDATE sub_items SET status='AVAILABLE' WHERE id IN ('<subD.subItemId>','<subE.subItemId>');
DELETE FROM item_status_logs WHERE "subItemId" IN ('<subD.subItemId>','<subE.subItemId>');
DELETE FROM dispense_records WHERE "loanGroupId"='<loanGroupId>';
UPDATE items SET "availableQty"=(SELECT COUNT(*) FROM sub_items WHERE "itemId"=items.id AND status='AVAILABLE'), status='AVAILABLE'
WHERE code='NLU-KRU-002';
SQL
```

---

## Scenario 7 — Edge: ตั้งใช้ในห้อง (INUSE) คืนผ่าน tab "คืนเข้าพัสดุ" ไม่ใช่ tab "รับคืน"

> Sharp edge: loanType=INUSE ตั้ง `SubItem.status=IN_USE` (dispense/route.ts:90-93) แต่ `resolveSubItemReturn` block ทุกอย่างที่ไม่ใช่ ON_LOAN (returns.ts:36) → คืนผ่าน tab รับคืนไม่ได้ ต้องใช้ tab คืนเข้าพัสดุ (in_use) แทน

### Precondition
- `NLU-KRU-001` มี SubItem AVAILABLE อย่างน้อย 1 (`subF`)

### Steps
1. ไป `/dispense`, ค้น `NLU-KRU-001`, กด `เพิ่ม`
2. `/cart` → `ยืนยันการเบิก`
3. ใน dialog: `ใช้ใน *` → `อื่นๆ`, `ผู้รับ` = `ใช้ในห้องเทส`, **กด toggle `ตั้งใช้ในห้อง`** (ไม่ใช่ `ยืม (มีกำหนดคืน)`) → ช่อง `กำหนดคืน` จะหายไป
4. กด `ยืนยันเบิก`
5. ไป `/receive?tab=return` (tab รับคืน) → **ไม่เห็น** loan นี้ (เพราะ sub เป็น IN_USE ไม่ใช่ ON_LOAN และถูกกรอง)
6. ไป `/receive?tab=in_use` (tab คืนเข้าพัสดุ) → เห็น `subF` กดปุ่ม `รับเข้า` → AlertDialog `ยืนยันการรับเข้า` → กด `ยืนยัน`

### Expected
**UI level**
- หลังเบิก: toast `เบิกพัสดุสำเร็จ 1 รายการ`
- tab รับคืน: ไม่มี loan ของ `ใช้ในห้องเทส`
- tab คืนเข้าพัสดุ: มี `subF` แสดง, กด `รับเข้า` แล้ว toast `บันทึกเรียบร้อย`

**DB level**
```bash
psql "$DATABASE_URL" <<'SQL'
-- หลังเบิก: IN_USE
SELECT "subCode", status FROM sub_items WHERE id='<subF.id>';
-- expect: status='IN_USE'
SELECT "loanGroupId","returnedAt","returnCondition" FROM dispense_records WHERE "subItemId"='<subF.id>' ORDER BY "dispensedAt" DESC LIMIT 1;
-- expect: dueAt IS NULL (INUSE ไม่มีกำหนดคืน), returnedAt IS NULL

-- หลัง "รับเข้า": AVAILABLE
SELECT "subCode", status FROM sub_items WHERE id='<subF.id>';
-- expect: status='AVAILABLE'
SQL
```

### Known failure points
- **`src/lib/returns.ts:36-38`** — `if (sub.status !== ItemStatus.ON_LOAN) throw`. IN_USE จะ throw `Sub-item is not on loan (status: IN_USE)` ถ้าไปคืนผ่าน `/api/returns` หรือ `/api/items/[id]/return` โดยตรง
- `src/app/api/dispense/route.ts:90-93` — `newStatus = inRoom ? IN_USE : ON_LOAN`; `:23` dueAt=null เมื่อ INUSE
- ถ้า agent พยายามคืน INUSE ผ่าน tab รับคืน → จะ block / error. นี่คือเหตุผลที่ต้องใช้ tab คืนเข้าพัสดุ (SubItemStatusPanel actionLabel `รับเข้า`)

### Cleanup
```bash
psql "$DATABASE_URL" <<'SQL'
UPDATE sub_items SET status='AVAILABLE' WHERE id='<subF.id>';
DELETE FROM item_status_logs WHERE "subItemId"='<subF.id>';
DELETE FROM dispense_records WHERE "subItemId"='<subF.id>' AND recipient='ใช้ในห้องเทส';
UPDATE items SET "availableQty"=(SELECT COUNT(*) FROM sub_items WHERE "itemId"=items.id AND status='AVAILABLE'), status='AVAILABLE'
WHERE code='NLU-KRU-001';
SQL
```

---

## Scenario 8 — FIFO lot: เบิก consumable ตัด lot หมดอายุเร็วสุดก่อน

> Bug เงียบ: ถ้า FIFO sort ผิด/หาย ระบบไม่ error แต่ของเก่าจะค้างสต็อกนานผิดปกติ. ต้องเช็คว่า `DispenseRecord.lotId` ตัดจาก lot ที่ควรตัดก่อนจริง

### Precondition
- Login ในฐานะ Staff
- ใช้ `NLU-CON-008` — fresh seed เป็น lot-less: `availableQty=1, totalQty=1, status=AVAILABLE` (verified หลัง `npx tsx prisma/seed.ts`). ไม่ทับ Scenario 1 (ใช้ `NLU-CON-006`)
- เพิ่ม 3 lot วันหมดอายุต่างกันผ่าน SQL:
```bash
psql "$DATABASE_URL" <<'SQL'
-- capture old qty ก่อน (fresh seed: avail=1, total=1)
SELECT code, "availableQty", "totalQty" FROM items WHERE code='NLU-CON-008';

-- ใส่ 3 lot: A หมดอายุเร็วสุด, B กลาง, C ไม่มีวันหมดอายุ (nulls: last)
-- NOTE: lots.id เป็น TEXT NOT NULL ไม่มี DB default (cuid() เป็น default ระดับ Prisma client เท่านั้น — migration บรรทัด 147) → ต้องใส่ id เองด้วย gen_random_uuid()::text (verified รันได้)
INSERT INTO lots (id, "itemId","lotNumber","expiryDate","receivedQty","remainingQty","receivedDate","createdAt","updatedAt") VALUES
 (gen_random_uuid()::text, (SELECT id FROM items WHERE code='NLU-CON-008'), 'FIFO-A', CURRENT_DATE + INTERVAL '5 days',  10, 10, CURRENT_DATE, now(), now()),
 (gen_random_uuid()::text, (SELECT id FROM items WHERE code='NLU-CON-008'), 'FIFO-B', CURRENT_DATE + INTERVAL '30 days', 10, 10, CURRENT_DATE, now(), now()),
 (gen_random_uuid()::text, (SELECT id FROM items WHERE code='NLU-CON-008'), 'FIFO-C', NULL,                             10, 10, CURRENT_DATE, now(), now());
UPDATE items SET "availableQty"=30, "totalQty"=30 WHERE code='NLU-CON-008';

-- ยืนยันลำดับ sort ที่ API จะส่งกลับ (orderBy expiryDate asc nulls last → dispense/items/route.ts:52)
SELECT "lotNumber","expiryDate","remainingQty" FROM lots
WHERE "itemId"=(SELECT id FROM items WHERE code='NLU-CON-008') AND "remainingQty">0
ORDER BY "expiryDate" ASC NULLS LAST;
-- expect ลำดับ: FIFO-A, FIFO-B, FIFO-C (null ท้าย)
SQL
```
จด `lotId` ของ FIFO-A (`SELECT id FROM lots WHERE "lotNumber"='FIFO-A' AND "itemId"=(SELECT id FROM items WHERE code='NLU-CON-008')`) — จะเทียบกับ `DispenseRecord.lotId` ที่เขียนที่ `dispense/route.ts:72`

### Steps
1. ไป `/dispense`, ค้น `NLU-CON-008` (ช่อง placeholder `ค้นหารหัส / ชื่อพัสดุ…` // dispense/page.tsx:191)
2. กด `เพิ่ม` บนการ์ด // dispense/page.tsx:343 → cart auto-pick lot แรก `item.lots[0]` = FIFO-A // cart-context.tsx:172 (sort มาจาก `dispense/items/route.ts:52` `expiryDate asc nulls last`)
3. ปรับจำนวนเป็น **4** (`Q=4`) ด้วยปุ่ม `เพิ่มจำนวน` // dispense/page.tsx:326
4. ไป `/cart` → บรรทัดนี้มี **lot picker** (เพราะ >1 lot, SelectValue `เลือก Lot` // cart/page.tsx:176) แสดง `FIFO-A` เลือกอยู่ — **ห้ามเปลี่ยน lot** (ทิ้งไว้ตาม auto-pick เพื่อเทส FIFO จริง)
5. กด `ยืนยันการเบิก` // cart/page.tsx floating dock → dialog: `ใช้ใน *` → `รายวิชา` // cart/page.tsx:373, `ผู้รับ` = `FIFO เทส` // cart/page.tsx:396 → กด `ยืนยันเบิก` // cart/page.tsx:433

### Expected
**UI level**
- Toast `เบิกพัสดุสำเร็จ 1 รายการ` // cart/page.tsx:63
- การ์ด `NLU-CON-008` แสดง `เหลือ 26` (badge `เหลือ {N}` // dispense/page.tsx:277-279; 30 - 4)

**DB level**
```bash
psql "$DATABASE_URL" <<'SQL'
-- DispenseRecord.lotId ตัดจาก FIFO-A จริง (lotId เขียนที่ dispense/route.ts:72)
SELECT "lotId", quantity, "resolvedQty", "returnedAt"
FROM dispense_records
WHERE recipient='FIFO เทส' ORDER BY "dispensedAt" DESC LIMIT 1;
-- expect: lotId = <FIFO-A.id>, quantity=4, resolvedQty=0, returnedAt IS NULL

-- lot ที่ถูกตัดต้องเป็น FIFO-A เท่านั้น; B/C ไม่เปลี่ยน (decrement ที่ dispense/route.ts:108-111)
SELECT "lotNumber","remainingQty" FROM lots
WHERE "itemId"=(SELECT id FROM items WHERE code='NLU-CON-008')
ORDER BY "expiryDate" ASC NULLS LAST;
-- expect: FIFO-A=6, FIFO-B=10, FIFO-C=10

-- item: availableQty ลด 4 (item.updateMany decrement ที่ dispense/route.ts:116-119; Branch B ไม่เรียก recompute — branch จบที่ :122)
-- totalQty ไม่เปลี่ยน (by design: totalQty = cumulative received − write-off เท่านั้น // schema.prisma:189-191 + stock.ts:72-76)
SELECT code, "availableQty","totalQty",status FROM items WHERE code='NLU-CON-008';
-- expect: availableQty=26, totalQty=30, status='AVAILABLE'
SQL
```

### Known failure points
- **`src/app/api/dispense/items/route.ts:52`** — `orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }]`. ถ้า sort หาย/เป็น desc/nullsFirst → `item.lots[0]` ผิด → auto-pick lot ผิด → ของเก่าค้างสต็อก (bug เงียบ ไม่ error)
- **`src/components/dispense/cart-context.tsx:172`** — `const lot = item.lots[0]` ไม่ sort ซ้ำในนี่ แล้วแต่ API ส่งมา. ถ้าใครเปลี่ยน API ให้ไม่ sort → FIFO พังที่นี่
- `src/app/api/dispense/route.ts:106-122` — Branch B: decrement `lot.remainingQty` + `item.availableQty` คู่กัน (ทั้งคู่ต้องลด Q). ถ้าลืมอันใดอันหนึ่ง → drift ระหว่าง lot กับ item
- ถ้า user เปลี่ยน lot ใน cart picker (`cart/page.tsx:176`) → lotId ตามที่เลือก ไม่ใช่ FIFO — นี่คือเหตุผลที่ Steps ห้ามเปลี่ยน

### Cleanup
```bash
psql "$DATABASE_URL" <<'SQL'
DELETE FROM dispense_records WHERE recipient='FIFO เทส';
DELETE FROM lots WHERE "itemId"=(SELECT id FROM items WHERE code='NLU-CON-008')
  AND "lotNumber" IN ('FIFO-A','FIFO-B','FIFO-C');
-- คืนเป็น lot-less เหมือนเดิม (availableQty กลับ oldQty)
UPDATE items SET "availableQty"=<oldQty>, "totalQty"=<oldQty> WHERE code='NLU-CON-008';
SQL
```
ล้างตะกร้า

---

## Scenario 9 — COUNT loan: คืนพร้อม write-off (ชำรุด/สูญหาย)

> ครอบ item type COUNT (DUR) ที่ยังไม่ได้เทส. Return path จัดการ quantity ไม่ใช่ per-unit status — เสี่ยงอสมมาตร: AVAILABLE คืนเพิ่ม `availableQty` แต่ write-off ลด `totalQty` (ถ้าสลับ → stock inflate/deflate)

### Precondition
- Login ในฐานะ Staff
- `NLU-DUR-003` (`dispenseType=COUNT`, `trackIndividually=false`, ไม่มี lot, ไม่มี sub). Fresh seed: `availableQty=148, totalQty=148, status=AVAILABLE` (verified หลัง `npx tsx prisma/seed.ts`; avail==total → ไม่มี loan ค้าง). ถ้า DB dirty ให้ reseed ก่อน
```bash
psql "$DATABASE_URL" <<'SQL'
SELECT code, "availableQty","totalQty",status FROM items WHERE code='NLU-DUR-003';
SQL
```
(fresh seed 148 ≥ 3 ไม่ต้อง fallback; ถ้า dirty ให้ reseed หรือใช้ `NLU-DUR-004` = 140/140)
- **ยืมก่อน** (สร้าง count loan เปิดไว้): ไป `/dispense` → ค้น `NLU-DUR-003` → กด `เพิ่ม` // dispense/page.tsx:343 → ปรับเป็น **3** (`เพิ่มจำนวน` // dispense/page.tsx:326) → `/cart` → กด `ยืนยันการเบิก` → dialog `ใช้ใน *`=`กิจกรรม` // cart/page.tsx:373, `ผู้รับ`=`writeoff เทส` // cart/page.tsx:396, loanType default `ยืม (มีกำหนดคืน)` (COUNT ไม่มี toggle) → กด `ยืนยันเบิก` // cart/page.tsx:433
  - ผล: dispense Branch C // dispense/route.ts:123-134 — `item.availableQty` decrement 3 (route.ts:125-128), DispenseRecord ไม่มี subItemId/lotId (route.ts:71-72), `recomputeItemCounts` (route.ts:133) → status `ON_LOAN`
- ยืนยัน loan เปิดอยู่:
```bash
psql "$DATABASE_URL" <<'SQL'
SELECT id, quantity, "resolvedQty", "returnedAt" FROM dispense_records
WHERE recipient='writeoff เทส' ORDER BY "dispensedAt" DESC LIMIT 1;
-- expect: quantity=3, resolvedQty=0, returnedAt IS NULL; จด dispenseRecordId
-- item หลังยืม (fresh seed 148/148): availableQty=145, totalQty=148, status='ON_LOAN' (dispense Branch C // dispense/route.ts:125-128,133)
SQL
```

### Steps
1. ไป `/receive?tab=return` (tab รับคืน) — list กรอง dispenseType IN COUNT,ITEM + returnedAt null // api/returns/route.ts:13-15
2. คลิก loan card `writeoff เทส` // return-panel.tsx:174-213 → detail. ใช้ CountStepper (record ไม่มี subItem) // return-loan-detail.tsx:547
3. กด `คืนทั้งหมด` // return-loan-detail.tsx:587 → total = 3 (แสดง `3 / 3 คืนแล้ว` // :580-581)
4. กด pill **`มีของชำรุด`** // return-loan-detail.tsx:607 (toggleDamaged :568) → ชิ้นชำรุด = 1, ปกติ = 2. ปรับ minus/plus ของแถว `ชำรุด` // :628 ให้เป็น 1 ถ้าค่าไม่ใช่ 1
5. เช็ค live breakdown: `ปกติ 2 · ชำรุด 1 · สูญหาย 0` // return-loan-detail.tsx:636
6. `รูปภาพรวมการคืน (ถ้ามี)` → กด `เพิ่มรูป` // return-loan-detail.tsx:337-361 อัปโหลดรูป (บังคับเพราะมีชำรุด — ถ้าไม่แนบ `บันทึก` disabled, sticky bar แดง `ต้องแนบรูปหลักฐานชิ้นที่ชำรุด/สูญหาย` // :381-386)
7. กด `บันทึก` // return-loan-detail.tsx:390 → AlertDialog `ยืนยันการบันทึกคืน` (body: `จะบันทึกคืน 3 ชิ้น (ปกติ 2, ชำรุด 1, สูญหาย 0)` // :394-410) → กด `ยืนยันบันทึก`

### Expected
> UI แยก legs 2 call ตามลำดับ AVAILABLE ก่อน DAMAGED (array `[AVAILABLE, DAMAGED, LOST]` filter qty>0 // return-loan-detail.tsx:218-222, await ทีละ leg :223-231; `returnItem` → `POST /api/items/${itemId}/return` // api.ts:413-425). แต่ละ leg = transaction แยก

**UI level**
- Toast `บันทึกการคืนเรียบร้อย` // return-loan-detail.tsx:233
- กลับ list รับคืน → loan card หายไป (คืนครบ 3/3)

**DB level**
```bash
psql "$DATABASE_URL" <<'SQL'
-- item: AVAILABLE คืน 2 → availableQty กลับ +2; write-off 1 → totalQty ลด 1
SELECT code, "availableQty","totalQty",status FROM items WHERE code='NLU-DUR-003';
-- expect (fresh seed 148/148): availableQty=147 (148−3 dispense +2 leg AVAILABLE // return/route.ts:74)
--                               totalQty=147  (148−1 leg DAMAGED write-off // return/route.ts:78)
--                               status='AVAILABLE' (avail==total → deriveNonTrackedStatus // stock.ts:38)

-- DispenseRecord ปิดแล้ว (leg DAMAGED ทำ resolvedQty 2→3 ≥ quantity → returnedAt set // return/route.ts:107-118,114)
SELECT quantity, "resolvedQty", "returnedAt", "returnCondition"
FROM dispense_records WHERE recipient='writeoff เทส';
-- expect: quantity=3, resolvedQty=3, returnedAt IS NOT NULL, returnCondition='DAMAGED' (leg สุดท้าย // return/route.ts:109,115)

-- StockAdjustment 1 แถว จาก leg DAMAGED // return/route.ts:79-89 (lotId null: item ไม่มี lot)
SELECT delta, reason, "lotId", "previousQty","newQty" FROM stock_adjustments
WHERE "itemId"=(SELECT id FROM items WHERE code='NLU-DUR-003')
ORDER BY "adjustedAt" DESC LIMIT 1;
-- expect: delta=-1, reason='DAMAGED_PENDING_REPAIR' // return/route.ts:77, "lotId" IS NULL, previousQty=148, newQty=147

-- MaintenanceRecord draft สำหรับชำรุด // return/route.ts:92-104 (subItemId null: count item ไม่มี sub)
SELECT type, result, "subItemId" FROM maintenance_records
WHERE "itemId"=(SELECT id FROM items WHERE code='NLU-DUR-003')
ORDER BY "createdAt" DESC LIMIT 1;
-- expect: type='CORRECTIVE', result='NEEDS_MORE_REPAIR', "subItemId" IS NULL
SQL
```

### Known failure points
- **`src/app/api/items/[id]/return/route.ts:74`** — AVAILABLE: `availableQty: { increment: qty }`. ถ้าสลับไป increment totalQty → คืนปกติไม่กลับสต็อก
- **`src/app/api/items/[id]/return/route.ts:78`** — write-off: `totalQty: { decrement: qty }`. ถ้าสลับไป decrement availableQty → availableQty ลดผิด (double-count กับ dispense)
- **`src/app/api/items/[id]/return/route.ts:77,79-89`** — StockAdjustment delta=-qty, reason LOST/DAMAGED_PENDING_REPAIR. ถ้าลืม → audit gap
- **`src/app/api/items/[id]/return/route.ts:92-104`** — DAMAGED สร้าง MaintenanceRecord draft. ถ้าลืม → ชำรุดไม่เข้าคิวซ่อม
- **`src/app/api/items/[id]/return/route.ts:107-118`** — `resolvedQty` สะสม, `returnedAt` set เมื่อ `resolvedQty >= quantity`, `returnCondition` (UNDER_REPAIR→DAMAGED). ถ้า resolvedQty คำนวณผิด → loan ไม่ปิด/ปิดก่อนกำหนด
- **`src/components/receive/return-loan-detail.tsx:215-232`** — แยก legs ยิงทีละครั้ง (AVAILABLE/DAMAGED/LOST). ถ้ารวมเป็น call เดียวผิด status → backend ทำ branch ผิด
- อสมมาตรเสี่ยง: AVAILABLE เพิ่ม availableQty แต่ write-off ลด totalQty — คนละ field. นี่คือจุดที่ต้อง verify มากสุดใน scenario นี้

### Cleanup
```bash
psql "$DATABASE_URL" <<'SQL'
-- ลบ record ที่เทสสร้าง (adjustment/maintenance/dispense) แล้ว set item กลับ fresh seed
DELETE FROM maintenance_records WHERE "itemId"=(SELECT id FROM items WHERE code='NLU-DUR-003')
  AND "createdAt" > now() - INTERVAL '1 hour';
DELETE FROM stock_adjustments WHERE "itemId"=(SELECT id FROM items WHERE code='NLU-DUR-003')
  AND reason='DAMAGED_PENDING_REPAIR' AND delta=-1
  AND "adjustedAt" > now() - INTERVAL '1 hour';
DELETE FROM dispense_records WHERE recipient='writeoff เทส';
-- หลังลบ dispense record: availableQty/totalQty ยังค้างที่ 147/147 (leg AVAILABLE+DAMAGED) → set กลับ 148/148
UPDATE items SET "availableQty"=148, "totalQty"=148, status='AVAILABLE'
WHERE code='NLU-DUR-003';
SQL
```
ล้างตะกร้า

> **Race condition (optimistic-lock)** ไม่อยู่ในไฟล์นี้ — แยกทำเป็น `test-race-condition.js` ที่ใช้ `Promise.all` ยิง `POST /api/dispense` พร้อมกัน 2 ครั้งไปที่ SubItem เดียวกัน แล้วเช็ค DB ว่ามี record ซ้ำหรือไม่ (Chrome DevTools MCP เดินเป็นลำดับ ทำ concurrent ยาก)

---

## Test Report Template

กรอกหลังรันเทสจริงเสร็จ (ส่งคืน file นี้หรือ log แนบท้าย):

> **ผลรันจริง (ครั้งล่าสุด):** รันด้วย **Playwright + Chromium (headless)** บน dev server `localhost:3000`, fresh seed (`npx tsx prisma/seed.ts`). chrome-devtools MCP ไม่ได้เชื่อมใน session → ใช้ Playwright แทน (browser จริง, click label จริงตาม Steps, เช็ค DB จริง). **9/9 PASS**

| Scenario | Pass/Fail | หมายเหตุ | ไฟล์ที่เกี่ยวข้องถ้า fail |
|---|---|---|---|
| 1 — เบิก consumable ไม่มี lot (drift) | ✅ PASS | avail 7→5 (exp 5), total ไม่เปลี่ยน, dr.qty=2 — ไม่ drift | — |
| 2 — ยืม tracked เดี่ยว (status + loanGroupId) | ✅ PASS | sub.status=ON_LOAN, loanGroupId set, DispenseRecord.subItemId ตรง | — |
| 3 — ยืมหลายชิ้น loanGroupId เดียว | ✅ PASS | 2 records share loanGroupId เดียวกัน, ทั้งคู่ ON_LOAN | — |
| 4 — คืนพร้อม per-unit condition | ✅ PASS | คืน 2 ชิ้น: cond AVAILABLE + DAMAGED แยกชิ้น, MaintenanceRecord CORRECTIVE | — |
| 5 — Edge: ยืม sub ที่ถูกยืมแล้ว (block) | ✅ PASS | API คืน 400 `Sub-item C01 is not available (status: ON_LOAN)` | — |
| 6 — Edge: คืนบางชิ้นจาก loanGroupId | ✅ PASS | คืน 1 (resolved=1, returnedAt set), ค้าง 1 (resolved=0), loanGroupId เดียวกัน | — |
| 7 — Edge: INUSE คืนผ่าน tab คืนเข้าพัสดุ | ✅ PASS | sub IN_USE → AVAILABLE หลังกด รับเข้า (tab รับคืนไม่โชว์ IN_USE จริง) | — |
| 8 — FIFO lot ตัดของเก่าก่อน | ✅ PASS | DispenseRecord.lotId=FIFO-A, lots A=6/B=10/C=10, item 26/30 | — |
| 9 — COUNT loan คืน write-off (ชำรุด) | ✅ PASS | item avail-1/total-1, dr cond DAMAGED resolved=3, StockAdjustment delta-1 DAMAGED_PENDING_REPAIR, MaintenanceRecord CORRECTIVE/subItemId null | — |

### หมายเหตุทั่วไปหลังรัน
- **รันด้วย**: Playwright 1.61 + Chromium headless, viewport 1280×800 (desktop — `lg:hidden` ซ่อน bottom-nav กัน selector ชน), login ผ่าน UI (ปุ่ม Staff), dev server `localhost:3000`, DB เช็คผ่าน `pg` Pool (raw SQL)
- **Seed version / commit**: `npx tsx prisma/seed.ts` (fresh — 3 users / 918 items / 1131 subItems) บน commit `fac4f49`
- **เวลาเริ่ม–จบ**: รันครบ 9 scenario ~3–4 นาที (รวม reseed)
- **พบ drift ระหว่าง UI กับ DB หรือไม่**: ไม่พบ — UI กับ DB ตรงกันทุก scenario
- **สิ่งที่ต้องระวังตอนรันซ้ำ (ไม่ใช่ bug ของระบบ แต่เป็น selector/UI detail)**:
  - ต้องใช้ viewport desktop (≥1024) มิฉะนั้น bottom-nav ปุ่ม `รับเข้า` (→/receive) ชนกับ row action `รับเข้า` ใน tab คืนเข้าพัสดุ → สลับ tab ผิด (Scenario 7)
  - `getByRole("button",{name:"รับเข้า"})` ต้อง `exact:true` (ไม่งั้น match substring เจอ tab `รับเข้าพัสดุ`)
  - TrackedRows: คลิก row toggle button (parent ของ checkbox) ไม่ใช่ checkbox ตรงๆ (checkbox `pointer-events-none`); เลือกแล้ว default เป็น `ปกตí` อัตโนมัติ
  - ระหว่าง scenario ต้อง clear cart (`localStorage.removeItem("dispense-cart")`) มิฉะนั้นของเดิมติดมา
- **จุดที่ต้องเช็คซ้ำเมื่อโค้ดเปลี่ยน (regression hot spots — ที่ผ่านมาทำงานถูกทั้งหมด)**:
  - `src/lib/stock.ts:84` (lotCount guard) — Scenario 1 ผ่าน = guard ยังอยู่
  - `src/app/api/dispense/route.ts:58` (already-borrowed block) — Scenario 5 ผ่าน = block ทำงาน
  - `src/app/api/dispense/route.ts:106-122` (consumable+lot dual decrement) — Scenario 8 ผ่าน = lot+item ลดคู่กันถูก
  - `src/app/api/dispense/items/route.ts:52` (FIFO lot sort — expiryDate asc nulls last) — Scenario 8 ผ่าน = sort ถูก FIFO-A ก่อน
  - `src/components/dispense/cart-context.tsx:172` (lots[0] auto-pick) — Scenario 8 ผ่าน = auto-pick ตัด lot แรก
  - `src/app/api/items/[id]/return/route.ts:74,78` (COUNT: AVAILABLE increment availableQty vs write-off decrement totalQty) — Scenario 9 ผ่าน = ไม่สลับ field
  - `src/lib/returns.ts:36-38` (IN_USE/!ON_LOAN block) — Scenario 7 ผ่าน = INUSE คืนทาง tab คืนเข้าพัสดุ ไม่ใช่ tab รับคืน
- **สคริปต์รัน**: `e2e-run-scenarios.mjs` (ลบแล้วหลังรัน — เป็น artifact ชั่วคราว ไม่ได้ commit)
- **สถานะ DB**: reseed คืน fresh หลังรันเสร็จ
