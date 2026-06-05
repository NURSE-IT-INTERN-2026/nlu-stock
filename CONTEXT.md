# Glossary

## Category (ประเภทอุปกรณ์)

Top-level classification of items. Four enum values with distinct rules.

### FIXED_ASSET (ครุภัณฑ์)
- **trackIndividually**: `true` always — every piece tracked via SubItem
- **Required fields**: serialNumber, model, brand, purchaseDate, purchasePrice, vendor, warrantyEndDate, maintenanceCycleMonths
- **Maintenance tracking**: preventive/corrective maintenance records with schedule
- **หมวดย่อย (CategoryType)**:
  - หุ่นสำหรับตรวจร่างกาย
  - หุ่นทางสูติศาสตร์และนรีเวช
  - ครุภัณฑ์ทางการแพทย์
  - เครื่องมือทางอาชีวอนามัย
  - หุ่นทางศัลยศาสตร์
  - อุปกรณ์ทางออร์โธปิดิกส์
  - หุ่นฝึกทักษะการทำหัตถการเฉพาะทาง
  - หุ่นจำลองสถานการณ์ทางการพยาบาลขั้นสูง
  - หุ่นจำลองสถานการณ์
  - หุ่นฝึกช่วยฟื้นคืนชีพ
  - อุปกรณ์อิเล็กทรอนิกส์ (iPad, VR headset, Mini PC)
  - โสตทัศนูปกรณ์ (TV, camera, studio set, video conference)
- **Why FIXED_ASSET for electronics**: Every piece has serial number, brand, model, individual location. Behavior identical to ครุภัณฑ์.

### DURABLE (วัสดุคงทน)
- **trackIndividually**: optional — set per Item
  - `true`: individual codes via SubItem, no serial/brand (e.g. toys)
  - `false`: quantity tracking only (e.g. medical instruments, kits)
- **No** fixed asset fields (serial, brand, purchase info)
- **No** maintenance cycle
- **หมวดย่อย (CategoryType)**:
  - วัสดุคงทน — quantity only (SP001-SP250, medical instruments, supplies)
  - ของเล่น — `trackIndividually: true` (หมวดที่ 14: สื่อการสอน/ของเล่นส่งเสริมพัฒนาการ)
  - อุปกรณ์ประกอบวิชา — quantity only, has BOM structure (see Kit/BOM)

### CONSUMABLE (วัสดุสิ้นเปลือง)
- **trackIndividually**: `false` always — quantity + lot tracking only
- **Lot tracking**: required (lot number + expiry date)
- **Storage requirements**: optional field for special storage conditions
- **หมวดย่อย (CategoryType)**:
  - วัสดุสิ้นเปลือง — general consumables
  - ยา — medicines, IV fluids, contraceptives (same lot/expiry rules + storage requirements)

### BOOK (หนังสือ)
- **trackIndividually**: `true` always — every copy tracked via SubItem
- **No** serial number or brand (unlike FIXED_ASSET)
- **หมวดย่อย (CategoryType)**: 13 categories, each is a separate CategoryType
  - หมวด 1: หนังสือชุดส่งเสริมสุขภาพ
  - หมวด 2: หนังสือชุดส่งเสริมสุขภาพและสุขอนามัย
  - หมวด 3: หนังสือชุดส่งเสริมด้านสังคม
  - หมวด 4: หนังสือชุดส่งเสริมด้านคุณธรรม
  - หมวด 5: หนังสือด้านสติปัญญา ความคิด ความรู้ทั่วไป
  - หมวด 6: หนังสือด้านสติปัญญา ตัวเลข ภาษา สี
  - หมวด 7: หนังสือส่งเสริมการเรียนรู้ ด้านประสาทสัมผัส
  - หมวด 8: หนังสือส่งเสริมภาษา
  - หมวด 9: หนังสือส่งเสริมด้านคุณธรรม (นิทานอีสป, นิทานชาดก)
  - หมวด 10: หนังสือแนวการเล่น ส่งเสริมกล้ามเนื้อมัดเล็ก
  - หมวด 11: นิทานเล่มใหญ่
  - หมวด 12: หนังสือสำหรับเยาวชน
  - หมวด 13: คู่มือสำหรับใช้อ้างอิง
- **Why BOOK separate from DURABLE**: Semantically different — books are not equipment. Same tracking behavior (trackIndividually) but distinct category for user-facing clarity.

## Kit / BOM (ชุดอุปกรณ์)

A kit is a DURABLE item composed of multiple component items.

### Stock movement
- **Assemble (จัดชุด)**: deduct component stock → add kit stock
- **Disassemble (แยกชุด)**: deduct kit stock → return component stock
- **Dispense kit**: deduct kit stock
- **Dispense component**: deduct component stock directly
- Components can exist both in individual stock AND in kits simultaneously
- Staff can disassemble a kit anytime → components go back to stock

### Schema concept
```
KitComponent { kitItemId, componentItemId, quantity }
```
- Status: needs implementation design

## trackIndividually

Boolean field on Item that controls tracking mode. Derives from Category rules:
- FIXED_ASSET → forced `true`
- CONSUMABLE → forced `false`
- DURABLE → per-item choice
- BOOK → forced `true`

When `true`, creates SubItems with individual subCodes for per-piece tracking.

## Item Status (สภาพอุปกรณ์)

From CSV data, NLU uses these statuses:
- ปกติ → AVAILABLE
- ปานกลาง → USABLE (minor wear)
- เก่า → OLD
- ชำรุด → DAMAGED

## Location (ที่ตั้ง)

```
Location { building, floor, room, detail? }
```
- `detail`: optional free-text for sub-location (locker, ตู้ชั้น 4, เคาว์เตอร์หน้าห้อง, ตู้เย็น, ด้านหลังชั้น 5)
- Examples: อาคาร 2 / ชั้น 4 / 402 / null, อาคาร 2 / ชั้น 5 / 502 / locker

## Consumable Reporting

No separate quarterly report needed. Lot model provides:
- lot number, quantity, expiryDate, receivedDate
- Query by date range for period-based views
- Near-expiry alerts from expiryDate
- Stock remaining per lot

## Schema Field Decisions (grill session 2026-05-28)

- **`name`** = Thai (primary display). **`nameEn`** = English (renamed from `nameTh`)
- **`model`** = brand+model combined (e.g. "NIHON KOHDEN รุ่น TEC 5600"). Search handles lookup.
- **`serialNumber`** moved from Item → SubItem. Each piece has different serial/gov tag.
- **Vendor** split: `vendorCompany`, `vendorContact`, `vendorPhone` (3 separate fields)
- **`warrantyMonths`** (Int, default 0) replaces `warrantyEndDate`. Compute endDate = purchaseDate + warrantyMonths.
- **Location parsing**: `"อาคาร 2 ชั้น 5"` → building + floor. `"501"` → room. `"Simman 1"`, `"ด้านหลังชั้น 5"` → detail.
- **Grouping for trackIndividually**: strip trailing number from name → Item. SubItems are individual pieces.
- **Copy suffix** (books, toys): `-c1`, `-c2` → same Item, different SubItem.
- **Kit/BOM import deferred** to M14.

## Import Data Sources

7 CSV files in `CSV/` directory + 1 mapping file:
1. ครุภัณฑ์ → FIXED_ASSET (~594 rows, each = SubItem)
2. อุปกรณ์อิเล็กทรอนิกส์ → FIXED_ASSET (~105 rows, each = SubItem)
3. หนังสือ → BOOK (~236 rows, copies = SubItem)
4. ของเล่น → DURABLE + trackIndividually (~210 rows, copies = SubItem)
5. วัสดุคงทน → DURABLE quantity (~250 rows, SP001-SP250)
6. วัสดุสิ้นเปลือง → CONSUMABLE (~194 items, quarterly history as transactions)
7. อุปกรณ์ประกอบวิชา → DURABLE kit items (deferred to M14)
