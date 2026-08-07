-- Drop borrowLimit/borrowable: both were write-only for their whole life. Nothing ever
-- read them to allow or deny a loan, while the edit dialog told SuperAdmins "0 = ห้ามยืม".
-- Every row held the default (0/false), so no configured value is lost here.
-- What actually gates a loan is the piece's status — dispense rejects any SubItem that is
-- not AVAILABLE, and ตั้งใช้ในห้อง (IN_USE) is how a piece is held out of the loan pool.
ALTER TABLE "items" DROP COLUMN "borrowLimit";
ALTER TABLE "items" DROP COLUMN "borrowable";
