-- ทุกประเภทต้องมีหมวดย่อยอย่างน้อยหนึ่งตัว: Item ผูกกับ categories ไม่ใช่ category_profiles
-- ประเภทที่ไม่มีหมวดย่อยจึงรับพัสดุไม่ได้ และหายไปจากตัวกรองทุกหน้าที่ปั้นรายการประเภทจากหมวดย่อย
-- ตั้งแต่นี้ POST /api/settings/profiles สร้างตัวตั้งต้นให้เอง — ตรงนี้ตามเก็บของเก่า
INSERT INTO "categories" ("id", "name", "sortOrder", "profileId")
SELECT
  gen_random_uuid()::text,
  -- categories.name unique ทั้งตาราง จึงต่อท้ายด้วย code เมื่อชื่อประเภทถูกจองไว้แล้ว
  CASE WHEN EXISTS (SELECT 1 FROM "categories" c WHERE c."name" = p."name")
       THEN p."name" || ' (' || p."code" || ')'
       ELSE p."name" END,
  COALESCE((SELECT MAX("sortOrder") FROM "categories"), 0) + 1,
  p."id"
FROM "category_profiles" p
WHERE NOT EXISTS (SELECT 1 FROM "categories" c WHERE c."profileId" = p."id");
