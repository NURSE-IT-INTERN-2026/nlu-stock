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
ไฟล์ 24–26 ไม่ใช่งานใหม่ แต่เป็นสิ่งที่ต้องไม่พัง: `24-guards` (เคสที่ต้องทำไม่ได้), `25-partial-return`,
`26-self-borrow-qr` (ยืมเองในบทบาท BORROWER)

เทสตาม flow จบด้วยการเปิดหน้า **ประวัติ** ของชิ้นนั้นเสมอ (`expectHistory` ใน `e2e/steps/helpers.ts`) —
ยันว่า log โผล่จริง เรียงตามที่กดมา และเปิดดูรายละเอียด/หลักฐานได้ ไม่ใช่เชื่อ toast เขียว

```bash
npm run test:e2e    # ทั้งชุด ~3 นาที
```

**เปิด Chrome ให้ดูทุกครั้ง** (headed + slowMo 800ms) — ดู flow จริงตอนวิ่ง

รันบางส่วน / ปรับการแสดงผล:

```bash
npx playwright test 14-send-repair     # ไฟล์เดียว (ชื่อ match ไฟล์ .feature)
npx playwright test --grep "ส่งซ่อม"   # ทุก scenario ที่ชื่อเข้า keyword
npm run test:e2e:ui                    # UI mode — รันซ้ำ เห็น timeline ทุก step
HEADLESS=1 npm run test:e2e            # ปิดหน้าต่าง เร็ว (~40s) — สำหรับ CI
SLOWMO=1500 npm run test:e2e           # ช้าลง ดูละเอียด
```

**อัตโนมัติทุก run:** seed DB ใหม่ (ต้องมี docker `realnlu-stock-db-1` รันอยู่) + ติด `next dev` ที่ port 4517 เอง
**แก้ .feature / steps แล้ว** ไม่ต้องรัน `bddgen` เอง — `npm run test:e2e` generate ให้ก่อนเสมอ (`e2e/.gen/` อยู่ใน .gitignore)
**Port ติดค้าง:** `lsof -ti :4517 | xargs kill`
**สอง session:** global-setup ปั๊ม `e2e/.auth/admin.json` (SUPERADMIN, ใช้เป็น default) และ
`borrower.json` (BORROWER) — เรียกผ่าน fixture `borrowerPage` เมื่อต้องเทสในบทบาท นศ.
**ค้นหาแบบ AI** ต้องมี `GOOGLE_GENERATIVE_AI_API_KEY` ใน `.env.test` ไม่มี (หรือ quota เต็ม) สเปคนั้น skip ตัวเอง ไม่ fail

## เทสอื่น

```bash
npm test          # unit tests (src/lib)
```

## โครงสร้างหลัก

- `prisma/schema.prisma` — data model (ทุก table @@map ชื่อ snake_case)
- `src/app/(dashboard)/` — หน้างาน · `src/app/api/` — route handlers
- `src/lib/` — กติกาคลัง (stock, cases, roles, kits)
- `e2e/` — BDD suite · `docs/` — เอกสารและ ADR
