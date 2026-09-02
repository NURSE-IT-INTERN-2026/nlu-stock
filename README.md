# NLU Stock

ระบบคลังพัสดุ คณะพยาบาลศาสตร์ มหาวิทยาลัยเชียงใหม่ (NLU) — ของสิ้นเปลือง + ครุภัณฑ์ ยืม-คืน ซ่อม บำรุงรักษา ชุดอุปกรณ์ และรายงาน

ภาพรวมระบบทั้งหมด: `docs/html/nlu-stock-architecture.html` · หลักการออกแบบ: `docs/adr/`

## พัฒนา

```bash
docker compose up -d     # postgres :5433
npm install
npx prisma migrate dev && npx prisma db seed
npm run dev              # http://localhost:3000/nlu-stock
```

- config อยู่ใน `.env` (ดูรายการใน `.env.example`) — `SUPERADMIN_EMAILS` / `ADMIN_EMAILS` ควบคุมสิทธิ์
- login ผ่าน CMU OAuth เป็นหลัก — ช่องกรอกอีเมล + ปุ่มลัดมีเฉพาะตอนรัน dev

## E2E (playwright-bdd)

ทุกงานของระบบ (23 งาน) เขียนเป็น Gherkin: `e2e/features/*.feature` 1 งาน/ไฟล์ + steps ที่ `e2e/steps/`
ไฟล์ 24–27 ไม่ใช่งานใหม่ แต่เป็นสิ่งที่ต้องไม่พัง: `24-guards` (เคสที่ต้องทำไม่ได้), `25-partial-return`,
`26-self-borrow-qr` (ยืมเองในบทบาท BORROWER), `27-history-integrity`

`expectHistory` (`e2e/steps/helpers.ts`) เปิดหน้า **ประวัติ** ของชิ้นนั้น แล้วยันว่า log โผล่จริง
เรียงตามที่กดมา และเปิดดูรายละเอียด/หลักฐานได้ ไม่ใช่เชื่อ toast เขียว —
**ใช้กับ flow ที่ลำดับมีความหมาย** (12, 21, 25, 26) ส่วนที่เหลือยันผลลัพธ์ปลายทาง (สถานะ/ยอดใน DB)

`27-history-integrity` ครอบส่วนที่เหลือแบบไม่ผูกกับข้อความ: ไล่ประวัติของพัสดุทุกตัวที่ suite สร้าง
แล้วยันกติกาที่ต้องจริงเสมอ — ของขยับต้องมี log, ไม่มีค่าดิบหลุดมาบนจอ, เคสปิดแล้วต้องมีวันปิด
เพิ่ม flow ใหม่ก็ครอบให้เองโดยไม่ต้องแก้เทส

```bash
npm run test:e2e    # ทั้งชุด ~3 นาที
```

**เปิด Chrome ให้ดูทุกครั้ง** (headed + slowMo 800ms) — ดู flow จริงตอนวิ่ง

รันบางส่วน / ปรับการแสดงผล:

```bash
npx playwright test 14-send-repair     # ไฟล์เดียว (ชื่อ match ไฟล์ .feature)
npx playwright test --grep "ส่งซ่อม"   # ทุก scenario ที่ชื่อเข้า keyword
npm run test:e2e:ui                    # UI mode — headless เอง (มี viewer ในตัว) รันซ้ำ เห็น timeline ทุก step
HEADLESS=1 npm run test:e2e            # ปิดหน้าต่าง เร็ว (~40s) — สำหรับ CI
SLOWMO=2000 npm run test:e2e           # ช้าลง ~2 วิ/action ดูละเอียดทีละ step
```

**อัตโนมัติทุก run:** seed DB ใหม่ (ต้องมี docker `realnlu-stock-db-1` รันอยู่) + ติด `next dev` ที่ port 4517 เอง
**แก้ .feature / steps แล้ว** ไม่ต้องรัน `bddgen` เอง — `npm run test:e2e` generate ให้ก่อนเสมอ (`e2e/.gen/` อยู่ใน .gitignore)
**Port ติดค้าง:** `lsof -ti :4517 | xargs kill`
**ห้ามรันสอง session พร้อมกัน** — ทุก runner ใช้ `nlu_stock_test` ตัวเดียวและ globalSetup `DROP SCHEMA`
ทุกครั้ง อีก session reseed ทับกลางคัน = user row ที่ token ชี้อยู่หายไป แล้ว requireAuth คืน 401
(`src/lib/api-utils.ts`) ทุก request ที่เหลือ เห็นเป็น fail กระจายมั่วๆ ที่ rerun แล้วหาย
**สอง session:** global-setup ปั๊ม `e2e/.auth/admin.json` (SUPERADMIN, ใช้เป็น default) และ
`borrower.json` (BORROWER) — เรียกผ่าน fixture `borrowerPage` เมื่อต้องเทสในบทบาท นศ.
**ค้นหาแบบ AI** ต้องมี `GOOGLE_GENERATIVE_AI_API_KEY` ใน `.env.test` ไม่มี (หรือ quota เต็ม) สเปคนั้น skip ตัวเอง ไม่ fail

### มีอะไรอยู่บ้าง — 27 ไฟล์ / 40 scenario

**กลุ่ม ก — เริ่มต้น**

| # | ไฟล์ | Scenario | ยันอะไร |
|---|---|---|---|
| 01 | `01-login` | อีเมลในรายชื่อเข้าใช้ได้ | ออก session ให้ role ที่ถูก |
| | | อีเมลนอกทะเบียนเข้าไม่ได้ | fail closed |
| | | สิทธิ์ stockOnly ไม่เห็นเมนูตั้งค่า | เมนูซ่อนตาม role |
| 02 | `02-add-item` | สร้างพัสดุครบทั้งสามแบบการใช้งาน | wizard ออกรหัสให้ทั้ง 3 แบบ · ตาม Code ได้ C01–C03 · อีกสองแบบได้ยอดตั้งต้น · ทั้งสามผูกห้อง แล้วไล่เปิดหน้ารายละเอียดยันทีละตัว |

**กลุ่ม ข — ของเข้าคลัง**

| # | ไฟล์ | Scenario | ยันอะไร |
|---|---|---|---|
| 03 | `03-receive` | รับเข้าสิ้นเปลืองพร้อมราคา | สร้างล็อต + ยอดขึ้น |
| 04 | `04-receive-edit` | แก้ราคาต่อหน่วยย้อนหลัง | PATCH ลง DB จริง + คงอยู่หลัง reload |

**กลุ่ม ค — ของออกจากคลัง**

| # | ไฟล์ | Scenario | ยันอะไร |
|---|---|---|---|
| 05 | `05-search` | ค้นด้วยชื่อ/รหัส | search API + กดเข้าหน้ารายละเอียด |
| | | ค้นด้วยคำพ้องความหมาย | pgvector จริง (query อังกฤษ ชื่อไทย) · skip เองถ้า quota เต็ม |
| 06 | `06-dispense-consumable` | เบิกผ่านตะกร้า | ตัดยอด FEFO |
| 07 | `07-borrow` | ยืมชิ้นว่างพร้อมกำหนดคืน | ชิ้น → ON_LOAN + dueAt |
| 08 | `08-inuse` | ตั้งใช้ในห้อง | loanType INUSE + ผูกห้อง |
| 09 | `09-dispense-template` | บันทึกเทมเพลตแล้วเรียกใช้ | ชุดเบิกสำเร็จรูป |

**กลุ่ม ง — ของกลับเข้าคลัง**

| # | ไฟล์ | Scenario | ยันอะไร |
|---|---|---|---|
| 10 | `10-return-loan` | รับคืนยืมปกติ | สถานะกลับพร้อมใช้ |
| 11 | `11-return-inuse` | คืนเข้าคลังจากตั้งใช้ | ปิดผ่าน status route |
| 12 | `12-return-damaged` | คืนพร้อมสภาพชำรุด | คืน + รอส่งซ่อม + **ประวัติ** (ป้ายบอกสภาพ) |
| 25 | `25-partial-return` | คืน 1 ใน 3 ชิ้นของใบเดียว | ใบ C01 ปิด · C02/C03 ยังค้าง · **ประวัติ** |

**กลุ่ม จ — ของพัง ของหาย การดูแล**

| # | ไฟล์ | Scenario | ยันอะไร |
|---|---|---|---|
| 13 | `13-report-damaged` | แจ้งชำรุดของคงทน | ItemStatusLog |
| 14 | `14-send-repair` | ส่งซ่อมภายใน | UNDER_REPAIR |
| | | ส่งภายนอกของออกจากห้อง | ของออกจากยอด |
| 15 | `15-return-from-repair` | ซ่อมเสร็จใช้ได้ | กลับเข้ายอด + ค่าซ่อม |
| | | ซ่อมไม่ได้จำหน่ายเลย | DISPOSED |
| 16 | `16-maintenance-round` | ทำรอบภายในแล้วรอบถัดไปเลื่อน | nextMaintenanceDate ขยับ |
| | | ส่งภายนอกต้องจอดรอ | PENDING_MAINTENANCE |
| 17 | `17-lost-recall` | บันทึกของหาย | ตัดยอด + เรียกคืนได้ |
| | | งานค้างเกินกำหนดต้องเห็นชัด | หน้าแจ้งเตือน |

**กลุ่ม ฉ — ควบคุมและตรวจสอบ**

| # | ไฟล์ | Scenario | ยันอะไร |
|---|---|---|---|
| 18 | `18-stock-count` | นับได้น้อยกว่าระบบ | ปรับยอดลง |
| | | นับได้มากกว่าระบบ | ปรับยอดขึ้น |
| 19 | `19-adjust-other` | ตัดจำหน่ายออกจากบัญชี | StockAdjustment |
| 20 | `20-move-location` | ย้ายที่จัดเก็บ | ItemMovement |
| 21 | `21-attach-evidence` | แนบรูปตอนแจ้งชำรุด | ไฟล์ขึ้น + **ประวัติ + นับหลักฐาน** |

**กลุ่ม ช/ซ — ชุดอุปกรณ์ · รายงาน**

| # | ไฟล์ | Scenario | ยันอะไร |
|---|---|---|---|
| 22 | `22-kit` | สร้างสูตรและประกอบชุด | BOM + ตัดส่วนประกอบ |
| 23 | `23-reports` | เปิดครบทุกแท็บและดาวน์โหลด | 5 แท็บ + PDF/Excel |

**สิ่งที่ต้องไม่พัง (ไม่ใช่ "งาน")**

| # | ไฟล์ | Scenario | ยันอะไร |
|---|---|---|---|
| 24 | `24-guards` | เบิกเกินจำนวนที่มี | ปฏิเสธ **+ ยอด/ประวัติไม่ขยับ** |
| | | ยืมชิ้นที่ถูกยืมอยู่ | ปฏิเสธ + ไม่เกิดใบที่สอง |
| | | ประกอบชุดของไม่พอ | ปฏิเสธ + ไม่เหลือชุดครึ่งใบ |
| | | ยกเลิกชุดที่ยืมอยู่ | ปฏิเสธ + ชุดยัง ON_LOAN |
| | | ใบรับเข้าแก้ได้แค่ราคา | จำนวนไม่มีช่องให้แก้ |
| 26 | `26-self-borrow-qr` | นศ. สแกน QR แล้วยืมเอง | เดิน `/items/<code>` จริง · ใบลงชื่อ นศ. · **ประวัติ** |
| | | นศ. เข้าหน้าที่ไม่ใช่ของตัวเองไม่ได้ | middleware กัน `/settings` |
| 27 | `27-history-integrity` | ประวัติของพัสดุทุกตัวอ่านได้และครบ | invariant ทุก item · ต้องอยู่ท้ายสุด |

**ประวัติ** ตัวหนา = ใช้ `expectHistory()` · ทุกไฟล์รันเป็น SUPERADMIN ยกเว้น 26 ที่ใช้ `borrowerPage`
`24-guards` เป็นไฟล์เดียวที่ยิง API ตรงไม่ผ่าน UI — เพราะเป็น server guard ที่ UI กันไม่ให้เดินไปถึงอยู่แล้ว

**ยังไม่มีเทสคุม:** branch fallback ของ AI search (บังคับให้เกิดแบบเที่ยงตรงไม่ได้)

## เทสอื่น

```bash
npm test          # unit tests (src/lib)
```

## โครงสร้างหลัก

- `prisma/schema.prisma` — data model (ทุก table @@map ชื่อ snake_case)
- `src/app/(dashboard)/` — หน้างาน · `src/app/api/` — route handlers
- `src/lib/` — กติกาคลัง (stock, cases, roles, kits)
- `e2e/` — BDD suite · `docs/` — เอกสารและ ADR
