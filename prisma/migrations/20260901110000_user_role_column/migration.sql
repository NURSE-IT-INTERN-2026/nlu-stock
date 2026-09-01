-- บทบาทเคยอยู่ใน env อย่างเดียว แก้ทีต้อง redeploy — superadmin เพิ่มผู้ดูแล/ผู้บริหารเองไม่ได้.
-- คอลัมน์นี้คือค่าที่ตั้งจากหน้า /settings. NULL = ไม่ได้ตั้ง ว่าตาม env/claims เหมือนเดิม
-- ลำดับสิทธิ์ตอนล็อกอิน: env list > คอลัมน์นี้ > claims (ผู้ยืม)
-- env มาก่อนเสมอ เพื่อให้ยังมีทางกู้เมื่อข้อมูลใน DB ถอดสิทธิ์ superadmin ออกจนหมด
-- และ SUPERADMIN ตั้งผ่าน API ไม่ได้ (กัน privilege escalation) — มาจาก env ทางเดียว
ALTER TABLE "users" ADD COLUMN "role" TEXT;
