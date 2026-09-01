-- BORROWER ไม่ได้มาจาก env list เหมือนอีก 3 role แต่มาจาก claims ที่ provider ส่งมาตอนล็อกอิน
-- พอล็อกอินจบก็ไม่เหลือหลักฐานว่าแถวนี้คือ นศ./บุคลากรคณะ /settings เลยขึ้น "ไม่มีสิทธิ์"
-- ทับคนที่ยืมได้จริง. คอลัมน์นี้จำคำตอบของ roleForProfile ไว้เพื่อ "แสดงผล" อย่างเดียว
-- สิทธิ์จริงยังตัดสินใหม่ทุกครั้งที่ล็อกอิน.
ALTER TABLE "users" ADD COLUMN "isBorrower" BOOLEAN NOT NULL DEFAULT false;
