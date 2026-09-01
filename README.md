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
- login แบบไม่มี password — กรอกอีเมลที่อยู่ใน allowlist (dev มีปุ่มลัด) / บัญชี CMU ใน production

## E2E (playwright-bdd)

ทุกงานของระบบ (23 งาน) เขียนเป็น Gherkin: `e2e/features/*.feature` 1 งาน/ไฟล์ + steps ที่ `e2e/steps/`

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

## เทสอื่น

```bash
npm test          # unit tests (src/lib)
```

## โครงสร้างหลัก

- `prisma/schema.prisma` — data model (ทุก table @@map ชื่อ snake_case)
- `src/app/(dashboard)/` — หน้างาน · `src/app/api/` — route handlers
- `src/lib/` — กติกาคลัง (stock, cases, roles, kits)
- `e2e/` — BDD suite · `docs/` — เอกสารและ ADR
