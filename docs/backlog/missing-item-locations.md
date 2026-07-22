# Data completeness — Item location ไม่ครบ

## ปัญหา

591 จาก 918 Items (64%) มี `locationId` ชี้ไปที่ **default fallback** ที่ seed
สร้างไว้ (`อาคาร 2 / ชั้น 4 / ห้อง 402`, id `cmrkbb2hn0017lcxwaykidcmg`) — ไม่ใช่
ตำแหน่งจริง เพราะตอน import/generate ข้อมูลต้นฉบับไม่มี room ระบุมา ก็เลย
ตกลง default หมด (ดู `prisma/seed.ts:215` `defaultLocId` + ทุกจุดที่ใช้เป็น
fallback: บรรทัด 281, 380, 452, 513, 575, 605, 657).

แยกตามหมวด (profile):

| Profile | Items ที่ชี้ default |
|---------|--------------------:|
| BAT (หนังสือและของเล่น) | 305 |
| DUR (วัสดุคงทน)          | 244 |
| KRU (ครุภัณฑ์)           |  32 |
| KIT (อุปกรณ์ประกอบวิชา)   |   9 |
| CON (วัสดุสิ้นเปลือง)      |   1 |
| **รวม**                | **591** |

## ผลกระทบ

Sub-item ของ items เหล่านี้จะแสดง **"ไม่ระบุที่ตั้ง"** ใน UI แทนที่จะมีตำแหน่งจริง
(เพราะ backfill `scripts/backfill-subitem-location.ts` ตั้งใจข้าม parent ที่เป็น
default ไว้) จนกว่าจะมีคนไปสำรวจของจริงแล้วกรอกเข้าระบบ.

## Action item

ต้องมีรอบสำรวจสถานที่จริง (physical audit) แล้วอัปเดต location ทีละ Item/SubItem
ผ่าน UI ปกติ — **ไม่ใช่งานที่แก้ด้วยโค้ด/script ได้** เพราะไม่มี source of truth
อื่นมาเติมให้อัตโนมัติ.

## Priority / Owner

- Priority: <!-- TODO -->
- Owner: <!-- TODO -->
