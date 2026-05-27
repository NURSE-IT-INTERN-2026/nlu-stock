import "dotenv/config";

async function main() {
  // Dynamic import to resolve ESM + adapter from lib singleton
  const { prisma } = await import("../src/lib/prisma");

  // Clean
  await prisma.itemStatusLog.deleteMany();
  await prisma.maintenanceRecord.deleteMany();
  await prisma.stockAdjustment.deleteMany();
  await prisma.dispenseRecord.deleteMany();
  await prisma.receiveRecord.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.subItem.deleteMany();
  await prisma.item.deleteMany();
  await prisma.location.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.categoryType.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.user.deleteMany();

  // Users
  const admin = await prisma.user.create({
    data: { email: "admin@dev", name: "Admin User", role: "ADMIN" },
  });
  const staff = await prisma.user.create({
    data: { email: "staff@dev", name: "Staff User", role: "STAFF" },
  });
  const instructor = await prisma.user.create({
    data: { email: "instructor@dev", name: "Instructor User", role: "INSTRUCTOR" },
  });

  // Units
  const unitNames = ["กล่อง", "ถุง", "ชิ้น", "set", "ชุด", "ห่อ", "เครื่อง", "อัน", "แผง", "กระปุก", "กรัม", "เม็ด", "ซีซี", "ใบ", "แผ่น", "เส้น", "ขวด", "คู่", "เล่ม", "ม้วน"];
  const unitMap = new Map<string, string>();
  for (const name of unitNames) {
    const u = await prisma.unit.create({ data: { name } });
    unitMap.set(name, u.id);
  }
  const unitId = (name: string) => unitMap.get(name)!;

  // Categories (from CSV — 12 หมวด mapped to Category enum)
  const cats = await Promise.all([
    prisma.categoryType.create({ data: { name: "หุ่นสำหรับตรวจร่างกาย", category: "FIXED_ASSET", sortOrder: 1 } }),
    prisma.categoryType.create({ data: { name: "หุ่นทางสูติศาสตร์และนรีเวช", category: "FIXED_ASSET", sortOrder: 2 } }),
    prisma.categoryType.create({ data: { name: "ครุภัณฑ์ทางการแพทย์", category: "FIXED_ASSET", sortOrder: 3 } }),
    prisma.categoryType.create({ data: { name: "เครื่องมือทางอาชีวอนามัย", category: "DURABLE", sortOrder: 4 } }),
    prisma.categoryType.create({ data: { name: "หุ่นทางศัลยศาสตร์", category: "FIXED_ASSET", sortOrder: 5 } }),
    prisma.categoryType.create({ data: { name: "อุปกรณ์ทางออร์โธปิดิกส์", category: "FIXED_ASSET", sortOrder: 6 } }),
    prisma.categoryType.create({ data: { name: "หุ่นฝึกทักษะการทำหัตถการเฉพาะทาง", category: "FIXED_ASSET", sortOrder: 7 } }),
    prisma.categoryType.create({ data: { name: "หุ่นจำลองสถานการณ์ทางการพยาบาลขั้นสูง", category: "FIXED_ASSET", sortOrder: 8 } }),
    prisma.categoryType.create({ data: { name: "หุ่นจำลองสถานการณ์", category: "FIXED_ASSET", sortOrder: 9 } }),
    prisma.categoryType.create({ data: { name: "หุ่นฝึกช่วยฟื้นคืนชีพ", category: "FIXED_ASSET", sortOrder: 10 } }),
    prisma.categoryType.create({ data: { name: "อุปกรณ์อิเล็กทรอนิกส์", category: "DURABLE", sortOrder: 11 } }),
    prisma.categoryType.create({ data: { name: "โสตทัศนูปกรณ์", category: "DURABLE", sortOrder: 12 } }),
  ]);
  // Shorthand aliases for seed items
  const catFixedAsset = cats[0]; // หุ่นสำหรับตรวจร่างกาย
  const catDurable = cats[10];   // อุปกรณ์อิเล็กทรอนิกส์
  const catConsumable = await prisma.categoryType.create({ data: { name: "วัสดุสิ้นเปลือง", category: "CONSUMABLE", sortOrder: 13 } });
  const catBook = await prisma.categoryType.create({ data: { name: "หนังสือ", category: "BOOK", sortOrder: 14 } });

  // Subjects
  await prisma.subject.create({ data: { code: "PHY", name: "ฟิสิกส์" } });
  await prisma.subject.create({ data: { code: "CHEM", name: "เคมี" } });
  await prisma.subject.create({ data: { code: "BIO", name: "ชีววิทยา" } });
  await prisma.subject.create({ data: { code: "NUR", name: "การพยาบาล" } });
  await prisma.subject.create({ data: { code: "MED", name: "แพทย์" } });

  const subjects = await prisma.subject.findMany();
  const phy = subjects.find((s) => s.code === "PHY")!;
  const chem = subjects.find((s) => s.code === "CHEM")!;
  const bio = subjects.find((s) => s.code === "BIO")!;
  const nur = subjects.find((s) => s.code === "NUR")!;
  const med = subjects.find((s) => s.code === "MED")!;

  // Locations: 2 rooms, 4 cabinets, 8 shelves
  const locations = await Promise.all([
    prisma.location.create({ data: { room: "ห้อง A", cabinet: "ตู้ 1", shelf: "ชั้น 1" } }),
    prisma.location.create({ data: { room: "ห้อง A", cabinet: "ตู้ 1", shelf: "ชั้น 2" } }),
    prisma.location.create({ data: { room: "ห้อง A", cabinet: "ตู้ 2", shelf: "ชั้น 1" } }),
    prisma.location.create({ data: { room: "ห้อง A", cabinet: "ตู้ 2", shelf: "ชั้น 2" } }),
    prisma.location.create({ data: { room: "ห้อง B", cabinet: "ตู้ 1", shelf: "ชั้น 1" } }),
    prisma.location.create({ data: { room: "ห้อง B", cabinet: "ตู้ 1", shelf: "ชั้น 2" } }),
    prisma.location.create({ data: { room: "ห้อง B", cabinet: "ตู้ 2", shelf: "ชั้น 1" } }),
    prisma.location.create({ data: { room: "ห้อง B", cabinet: "ตู้ 2", shelf: "ชั้น 2" } }),
  ]);

  // --- Items ---

  // Consumables
  const itemBeaker = await prisma.item.create({
    data: {
      code: "CON-001", name: "Beaker 250ml", nameTh: "บีกเกอร์ 250ml",
      categoryId: catConsumable.id, issueUnitId: unitId("ใบ"), subUnitId: unitId("ใบ"),
      conversionFactor: 1, minThreshold: 10, locationId: locations[0].id,
      totalQty: 100, availableQty: 100,
    },
  });
  const itemTestTube = await prisma.item.create({
    data: {
      code: "CON-002", name: "Test Tube", nameTh: "หลอดทดลอง",
      categoryId: catConsumable.id, issueUnitId: unitId("อัน"), subUnitId: unitId("อัน"),
      conversionFactor: 1, minThreshold: 20, locationId: locations[0].id,
      totalQty: 200, availableQty: 200,
    },
  });
  const itemFilterPaper = await prisma.item.create({
    data: {
      code: "CON-003", name: "Filter Paper", nameTh: "กระดาษกรอง",
      categoryId: catConsumable.id, issueUnitId: unitId("แผ่น"), subUnitId: unitId("แผ่น"),
      conversionFactor: 1, minThreshold: 50, locationId: locations[1].id,
      totalQty: 500, availableQty: 500,
    },
  });
  await prisma.item.create({
    data: {
      code: "CON-004", name: "Copper Wire 1m", nameTh: "ลวดทองแดง 1 เมตร",
      categoryId: catConsumable.id, issueUnitId: unitId("เส้น"), subUnitId: unitId("เส้น"),
      conversionFactor: 1, minThreshold: 5, locationId: locations[2].id,
      totalQty: 30, availableQty: 30,
    },
  });

  // Durables (not tracked individually)
  await prisma.item.create({
    data: {
      code: "DUR-001", name: "Magnifying Glass", nameTh: "แว่นขยาย",
      categoryId: catDurable.id, issueUnitId: unitId("อัน"), subUnitId: unitId("อัน"),
      conversionFactor: 1, minThreshold: 2, locationId: locations[3].id,
      totalQty: 15, availableQty: 15,
    },
  });

  // Durables (tracked individually)
  const itemMicroscope = await prisma.item.create({
    data: {
      code: "DUR-002", name: "Microscope", nameTh: "กล้องจุลทรรศน์",
      categoryId: catDurable.id, trackIndividually: true,
      issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"),
      conversionFactor: 1, minThreshold: 1, locationId: locations[4].id,
      totalQty: 5, availableQty: 5,
    },
  });
  for (let i = 1; i <= 5; i++) {
    await prisma.subItem.create({
      data: {
        itemId: itemMicroscope.id,
        subCode: `DUR-002-${String(i).padStart(3, "0")}`,
        status: "AVAILABLE", condition: "USABLE",
      },
    });
  }

  // Fixed Assets
  const itemProjector = await prisma.item.create({
    data: {
      code: "FIX-001", name: "LCD Projector", nameTh: "โปรเจกเตอร์",
      categoryId: catFixedAsset.id, trackIndividually: true,
      issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"),
      conversionFactor: 1, minThreshold: 1, locationId: locations[5].id,
      totalQty: 3, availableQty: 3,
      serialNumber: "SN-PROJ-001", model: "Epson EB-X51",
      purchaseDate: new Date("2024-01-15"), purchasePrice: 25000,
      vendor: "Thai Tech Co.", warrantyEndDate: new Date("2027-01-15"),
      maintenanceCycleMonths: 6,
    },
  });
  for (let i = 1; i <= 3; i++) {
    await prisma.subItem.create({
      data: {
        itemId: itemProjector.id,
        subCode: `FIX-001-${String(i).padStart(3, "0")}`,
        status: "AVAILABLE", condition: "USABLE",
      },
    });
  }

  const itemCentrifuge = await prisma.item.create({
    data: {
      code: "FIX-002", name: "Centrifuge", nameTh: "เครื่องหมุนเหวี่ยง",
      categoryId: catFixedAsset.id, trackIndividually: true,
      issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"),
      conversionFactor: 1, minThreshold: 1, locationId: locations[6].id,
      totalQty: 2, availableQty: 2,
      serialNumber: "SN-CENT-001", model: "Hettich EBA 20",
      purchaseDate: new Date("2023-06-01"), purchasePrice: 45000,
      vendor: "Lab Supply Co.", warrantyEndDate: new Date("2026-06-01"),
      maintenanceCycleMonths: 12,
      lastMaintenanceDate: new Date("2025-06-01"),
      nextMaintenanceDate: new Date("2026-06-01"),
    },
  });
  for (let i = 1; i <= 2; i++) {
    await prisma.subItem.create({
      data: {
        itemId: itemCentrifuge.id,
        subCode: `FIX-002-${String(i).padStart(3, "0")}`,
        status: "AVAILABLE", condition: "USABLE",
      },
    });
  }

  // Books
  await prisma.item.create({
    data: {
      code: "BOOK-001", name: "Physics Textbook Vol.1", nameTh: "หนังสือเรียนฟิสิกส์ เล่ม 1",
      categoryId: catBook.id, issueUnitId: unitId("เล่ม"), subUnitId: unitId("เล่ม"),
      conversionFactor: 1, minThreshold: 5, locationId: locations[7].id,
      totalQty: 30, availableQty: 30,
    },
  });

  // Items with different statuses for dashboard chart testing
  const itemCheckedOut = await prisma.item.create({
    data: {
      code: "DUR-003", name: "Digital Multimeter", nameTh: "มัลติมิเตอร์ดิจิทัล",
      categoryId: catDurable.id, trackIndividually: true,
      issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"),
      conversionFactor: 1, minThreshold: 1, locationId: locations[0].id,
      totalQty: 4, availableQty: 0, status: "CHECKED_OUT",
    },
  });
  for (let i = 1; i <= 4; i++) {
    await prisma.subItem.create({
      data: {
        itemId: itemCheckedOut.id,
        subCode: `DUR-003-${String(i).padStart(3, "0")}`,
        status: "CHECKED_OUT", condition: "USABLE",
      },
    });
  }

  await prisma.item.create({
    data: {
      code: "CON-005", name: "Broken Thermometer", nameTh: "เทอร์โมมิเตอร์เสีย",
      categoryId: catConsumable.id, issueUnitId: unitId("อัน"), subUnitId: unitId("อัน"),
      conversionFactor: 1, minThreshold: 0, locationId: locations[1].id,
      totalQty: 3, availableQty: 0, status: "DAMAGED",
    },
  });

  const itemUnderRepair = await prisma.item.create({
    data: {
      code: "FIX-003", name: "Spectrum Analyzer", nameTh: "เครื่องวิเคราะห์สเปกตรัม",
      categoryId: catFixedAsset.id, trackIndividually: true,
      issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"),
      conversionFactor: 1, minThreshold: 1, locationId: locations[2].id,
      totalQty: 2, availableQty: 0, status: "UNDER_REPAIR",
      serialNumber: "SN-SA-001", model: "Keysight N9320B",
      purchaseDate: new Date("2022-03-01"), purchasePrice: 120000,
    },
  });
  for (let i = 1; i <= 2; i++) {
    await prisma.subItem.create({
      data: {
        itemId: itemUnderRepair.id,
        subCode: `FIX-003-${String(i).padStart(3, "0")}`,
        status: "UNDER_REPAIR", condition: "DAMAGED",
      },
    });
  }

  await prisma.item.create({
    data: {
      code: "DUR-004", name: "Missing Ruler Set", nameTh: "ไม้บรรทัดหาย",
      categoryId: catDurable.id, issueUnitId: unitId("ชุด"), subUnitId: unitId("ชุด"),
      conversionFactor: 1, minThreshold: 0, locationId: locations[3].id,
      totalQty: 2, availableQty: 0, status: "LOST",
    },
  });

  await prisma.item.create({
    data: {
      code: "FIX-004", name: "Oscilloscope", nameTh: "ออสซิลโลสโคป",
      categoryId: catFixedAsset.id, trackIndividually: true,
      issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"),
      conversionFactor: 1, minThreshold: 1, locationId: locations[4].id,
      totalQty: 1, availableQty: 0, status: "PENDING_MAINTENANCE",
      serialNumber: "SN-OSC-001", model: "Tektronix TBS1052B",
      purchaseDate: new Date("2021-08-15"), purchasePrice: 35000,
      maintenanceCycleMonths: 6,
      lastMaintenanceDate: new Date("2025-11-15"),
      nextMaintenanceDate: new Date("2026-05-15"),
    },
  });

  await prisma.item.create({
    data: {
      code: "CON-006", name: "Expired Reagent", nameTh: "รีเอเจนต์หมดอายุ",
      categoryId: catConsumable.id, issueUnitId: unitId("ขวด"), subUnitId: unitId("ขวด"),
      conversionFactor: 1, minThreshold: 0, locationId: locations[5].id,
      totalQty: 5, availableQty: 0, status: "DISPOSED",
    },
  });

  // Lots for consumables
  const lotB01 = await prisma.lot.create({
    data: {
      itemId: itemBeaker.id, lotNumber: "LOT-B01", quantity: 50,
      expiryDate: new Date("2027-12-31"), receivedDate: new Date("2025-01-10"),
    },
  });
  const lotB02 = await prisma.lot.create({
    data: {
      itemId: itemBeaker.id, lotNumber: "LOT-B02", quantity: 50,
      expiryDate: new Date("2026-08-15"), receivedDate: new Date("2025-05-01"),
    },
  });
  const lotT01 = await prisma.lot.create({
    data: {
      itemId: itemTestTube.id, lotNumber: "LOT-T01", quantity: 200,
      expiryDate: new Date("2028-06-30"), receivedDate: new Date("2025-02-15"),
    },
  });

  // --- Receive Records ---
  const now = new Date();
  const day = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  await prisma.receiveRecord.createMany({
    data: [
      { itemId: itemBeaker.id, lotId: lotB01.id, quantity: 50, receivedBy: admin.id, receivedAt: day(30), notes: "Initial stock" },
      { itemId: itemBeaker.id, lotId: lotB02.id, quantity: 50, receivedBy: staff.id, receivedAt: day(20), notes: "Restock" },
      { itemId: itemTestTube.id, lotId: lotT01.id, quantity: 200, receivedBy: staff.id, receivedAt: day(25) },
      { itemId: itemFilterPaper.id, quantity: 500, receivedBy: admin.id, receivedAt: day(28) },
      { itemId: itemMicroscope.id, quantity: 5, receivedBy: admin.id, receivedAt: day(60) },
      { itemId: itemProjector.id, quantity: 3, receivedBy: admin.id, receivedAt: day(90) },
    ],
  });

  // --- Dispense Records ---

  await prisma.dispenseRecord.createMany({
    data: [
      { itemId: itemBeaker.id, lotId: lotB02.id, quantity: 10, quantitySub: 0, subjectId: phy.id, staffId: staff.id, dispensedAt: day(15), notes: "Physics lab" },
      { itemId: itemBeaker.id, lotId: lotB01.id, quantity: 5, quantitySub: 0, subjectId: chem.id, staffId: staff.id, dispensedAt: day(10), notes: "Chemistry lab" },
      { itemId: itemTestTube.id, lotId: lotT01.id, quantity: 20, quantitySub: 0, subjectId: chem.id, staffId: staff.id, dispensedAt: day(8) },
      { itemId: itemTestTube.id, lotId: lotT01.id, quantity: 15, quantitySub: 0, subjectId: bio.id, staffId: staff.id, dispensedAt: day(5) },
      { itemId: itemTestTube.id, lotId: lotT01.id, quantity: 10, quantitySub: 0, subjectId: phy.id, staffId: staff.id, dispensedAt: day(3) },
      { itemId: itemFilterPaper.id, quantity: 30, quantitySub: 0, subjectId: chem.id, staffId: admin.id, dispensedAt: day(12) },
      { itemId: itemFilterPaper.id, quantity: 25, quantitySub: 0, subjectId: bio.id, staffId: staff.id, dispensedAt: day(7) },
      { itemId: itemBeaker.id, lotId: lotB02.id, quantity: 8, quantitySub: 0, subjectId: bio.id, staffId: staff.id, dispensedAt: day(2) },
      { itemId: itemTestTube.id, lotId: lotT01.id, quantity: 12, quantitySub: 0, staffId: staff.id, dispensedAt: day(1) },
      { itemId: itemBeaker.id, lotId: lotB01.id, quantity: 3, quantitySub: 0, subjectId: phy.id, staffId: admin.id, dispensedAt: day(0) },
    ],
  });

  // --- Low stock items ---
  const itemGloves = await prisma.item.create({
    data: {
      code: "CON-007", name: "Latex Gloves", nameTh: "ถุงมือยาง",
      categoryId: catConsumable.id, issueUnitId: unitId("คู่"), subUnitId: unitId("คู่"),
      conversionFactor: 1, minThreshold: 50, locationId: locations[3].id,
      totalQty: 8, availableQty: 8,
    },
  });
  const itemAlcohol = await prisma.item.create({
    data: {
      code: "CON-008", name: "Alcohol 70%", nameTh: "แอลกอฮอล์ 70%",
      categoryId: catConsumable.id, issueUnitId: unitId("ขวด"), subUnitId: unitId("ขวด"),
      conversionFactor: 1, minThreshold: 10, locationId: locations[2].id,
      totalQty: 3, availableQty: 3,
    },
  });

  // --- Near-expiry lots (within 90 days) ---
  await prisma.lot.create({
    data: {
      itemId: itemGloves.id, lotNumber: "LOT-G01", quantity: 8,
      expiryDate: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000), // 15 days
      receivedDate: day(180),
    },
  });
  await prisma.lot.create({
    data: {
      itemId: itemAlcohol.id, lotNumber: "LOT-A01", quantity: 3,
      expiryDate: new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000), // 45 days
      receivedDate: day(120),
    },
  });
  await prisma.lot.create({
    data: {
      itemId: itemFilterPaper.id, lotNumber: "LOT-F01", quantity: 30,
      expiryDate: new Date(now.getTime() + 75 * 24 * 60 * 60 * 1000), // 75 days
      receivedDate: day(90),
    },
  });

  // --- Maintenance Records ---
  await prisma.maintenanceRecord.createMany({
    data: [
      {
        itemId: itemCentrifuge.id, type: "PREVENTIVE", result: "AVAILABLE",
        performedAt: day(60), performedBy: admin.id,
        description: "Annual preventive maintenance — cleaned and calibrated",
        cost: 2500,
        nextMaintenanceAt: new Date("2026-06-01"),
      },
      {
        itemId: itemProjector.id, type: "PREVENTIVE", result: "AVAILABLE",
        performedAt: day(90), performedBy: staff.id,
        description: "Lamp replacement and lens cleaning",
        cost: 4500,
      },
      {
        itemId: itemUnderRepair.id, type: "CORRECTIVE", result: "NEEDS_MORE_REPAIR",
        performedAt: day(20), performedBy: admin.id,
        issue: "Power supply failure", description: "Replaced PSU, still unstable",
        cost: 8000,
      },
      {
        itemId: itemUnderRepair.id, type: "CORRECTIVE", result: "NEEDS_MORE_REPAIR",
        performedAt: day(5), performedBy: admin.id,
        issue: "Calibration drift", description: "Recalibrated, testing in progress",
        cost: 3500,
      },
      {
        itemId: itemCentrifuge.id, type: "PREVENTIVE", result: "AVAILABLE",
        performedAt: new Date("2025-01-15"), performedBy: admin.id,
        description: "Mid-year checkup",
        cost: 1500,
      },
      {
        itemId: itemProjector.id, type: "CORRECTIVE", result: "AVAILABLE",
        performedAt: new Date("2025-08-10"), performedBy: staff.id,
        issue: "Overheating", description: "Cleaned fan, replaced thermal paste",
        cost: 1200,
      },
    ],
  });

  // --- Status Change Logs ---
  await prisma.itemStatusLog.createMany({
    data: [
      { itemId: itemUnderRepair.id, previousStatus: "AVAILABLE", newStatus: "UNDER_REPAIR", reason: "Power supply failure", changedBy: admin.id, changedAt: day(22) },
      { itemId: itemUnderRepair.id, previousStatus: "UNDER_REPAIR", newStatus: "UNDER_REPAIR", reason: "Still needs repair after first attempt", changedBy: admin.id, changedAt: day(20) },
    ],
  });

  // --- More receives for annual cost report ---
  await prisma.receiveRecord.createMany({
    data: [
      { itemId: itemGloves.id, quantity: 100, receivedBy: staff.id, receivedAt: day(100), notes: "Bulk order" },
      { itemId: itemAlcohol.id, quantity: 50, receivedBy: staff.id, receivedAt: day(80) },
    ],
  });

  // --- 2026 Purchases (for Annual Cost report) ---
  const itemBalance = await prisma.item.create({
    data: {
      code: "FIX-005", name: "Analytical Balance", nameTh: "เครื่องชั่งวิเคราะห์",
      categoryId: catFixedAsset.id, trackIndividually: true,
      issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"),
      conversionFactor: 1, minThreshold: 1, locationId: locations[6].id,
      totalQty: 1, availableQty: 1,
      serialNumber: "SN-BA-001", model: "Mettler Toledo ME204",
      purchaseDate: new Date("2026-02-10"), purchasePrice: 65000,
      vendor: "Science Instruments Co.", warrantyEndDate: new Date("2029-02-10"),
      maintenanceCycleMonths: 12,
    },
  });
  await prisma.subItem.create({
    data: { itemId: itemBalance.id, subCode: "FIX-005-001", status: "AVAILABLE", condition: "USABLE" },
  });

  const itemPhMeter = await prisma.item.create({
    data: {
      code: "FIX-006", name: "pH Meter", nameTh: "เครื่องวัด pH",
      categoryId: catFixedAsset.id, trackIndividually: true,
      issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"),
      conversionFactor: 1, minThreshold: 1, locationId: locations[7].id,
      totalQty: 2, availableQty: 2,
      serialNumber: "SN-PH-001", model: "Hanna HI5222",
      purchaseDate: new Date("2026-03-05"), purchasePrice: 28000,
      vendor: "Lab Supply Co.", warrantyEndDate: new Date("2029-03-05"),
      maintenanceCycleMonths: 6,
    },
  });
  for (let i = 1; i <= 2; i++) {
    await prisma.subItem.create({
      data: { itemId: itemPhMeter.id, subCode: `FIX-006-${String(i).padStart(3, "0")}`, status: "AVAILABLE", condition: "USABLE" },
    });
  }

  const itemHotplate = await prisma.item.create({
    data: {
      code: "FIX-007", name: "Hot Plate Stirrer", nameTh: "เตาไฟฟ้าผสมแม่เหล็ก",
      categoryId: catFixedAsset.id, trackIndividually: true,
      issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"),
      conversionFactor: 1, minThreshold: 1, locationId: locations[0].id,
      totalQty: 3, availableQty: 3,
      serialNumber: "SN-HP-001", model: "IKA C-Mag HS7",
      purchaseDate: new Date("2026-04-20"), purchasePrice: 18500,
      vendor: "Thai Tech Co.", warrantyEndDate: new Date("2028-04-20"),
      maintenanceCycleMonths: 12,
    },
  });
  for (let i = 1; i <= 3; i++) {
    await prisma.subItem.create({
      data: { itemId: itemHotplate.id, subCode: `FIX-007-${String(i).padStart(3, "0")}`, status: "AVAILABLE", condition: "USABLE" },
    });
  }

  // --- Additional Items (20 more) ---

  // More consumables
  const itemPetriDish = await prisma.item.create({
    data: {
      code: "CON-009", name: "Petri Dish", nameTh: "จานเพาะเชื้อ",
      categoryId: catConsumable.id, issueUnitId: unitId("ใบ"), subUnitId: unitId("ใบ"),
      conversionFactor: 1, minThreshold: 30, locationId: locations[0].id,
      totalQty: 100, availableQty: 100,
    },
  });

  const itemSyringe = await prisma.item.create({
    data: {
      code: "CON-010", name: "Syringe 10ml", nameTh: "กระบอกฉีดยา 10ml",
      categoryId: catConsumable.id, issueUnitId: unitId("อัน"), subUnitId: unitId("อัน"),
      conversionFactor: 1, minThreshold: 20, locationId: locations[1].id,
      totalQty: 80, availableQty: 80,
    },
  });

  const itemCotton = await prisma.item.create({
    data: {
      code: "CON-011", name: "Cotton Balls", nameTh: "สำลี",
      categoryId: catConsumable.id, issueUnitId: unitId("ถุง"), subUnitId: unitId("ถุง"),
      conversionFactor: 1, minThreshold: 10, locationId: locations[2].id,
      totalQty: 25, availableQty: 25,
    },
  });

  const itemBandage = await prisma.item.create({
    data: {
      code: "CON-012", name: "Elastic Bandage", nameTh: "ผ้าพันแผลยืด",
      categoryId: catConsumable.id, issueUnitId: unitId("ม้วน"), subUnitId: unitId("ม้วน"),
      conversionFactor: 1, minThreshold: 15, locationId: locations[3].id,
      totalQty: 40, availableQty: 40,
    },
  });

  const itemDisinfectant = await prisma.item.create({
    data: {
      code: "CON-013", name: "Disinfectant Spray", nameTh: "น้ำยาฆ่าเชื้อ",
      categoryId: catConsumable.id, issueUnitId: unitId("ขวด"), subUnitId: unitId("ขวด"),
      conversionFactor: 1, minThreshold: 5, locationId: locations[4].id,
      totalQty: 12, availableQty: 12,
    },
  });

  const itemSlide = await prisma.item.create({
    data: {
      code: "CON-014", name: "Microscope Slide", nameTh: "สไลด์กล้องจุลทรรศน์",
      categoryId: catConsumable.id, issueUnitId: unitId("แผ่น"), subUnitId: unitId("แผ่น"),
      conversionFactor: 1, minThreshold: 50, locationId: locations[5].id,
      totalQty: 200, availableQty: 200,
    },
  });

  // More durables
  const itemStethoscope = await prisma.item.create({
    data: {
      code: "DUR-005", name: "Stethoscope", nameTh: "เครื่องฟังเสียงหัวใจ",
      categoryId: catDurable.id, trackIndividually: true,
      issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"),
      conversionFactor: 1, minThreshold: 2, locationId: locations[6].id,
      totalQty: 8, availableQty: 8,
    },
  });
  for (let i = 1; i <= 8; i++) {
    await prisma.subItem.create({
      data: { itemId: itemStethoscope.id, subCode: `DUR-005-${String(i).padStart(3, "0")}`, status: "AVAILABLE", condition: "USABLE" },
    });
  }

  const itemSphygmomanometer = await prisma.item.create({
    data: {
      code: "DUR-006", name: "Sphygmomanometer", nameTh: "เครื่องวัดความดันโลหิต",
      categoryId: catDurable.id, trackIndividually: true,
      issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"),
      conversionFactor: 1, minThreshold: 2, locationId: locations[7].id,
      totalQty: 6, availableQty: 6,
    },
  });
  for (let i = 1; i <= 6; i++) {
    await prisma.subItem.create({
      data: { itemId: itemSphygmomanometer.id, subCode: `DUR-006-${String(i).padStart(3, "0")}`, status: "AVAILABLE", condition: "USABLE" },
    });
  }

  const itemThermometer = await prisma.item.create({
    data: {
      code: "DUR-007", name: "Digital Thermometer", nameTh: "เทอร์โมมิเตอร์ดิจิทัล",
      categoryId: catDurable.id, issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"),
      conversionFactor: 1, minThreshold: 5, locationId: locations[0].id,
      totalQty: 20, availableQty: 20,
    },
  });

  // More fixed assets
  const itemBloodPressure = await prisma.item.create({
    data: {
      code: "FIX-008", name: "Blood Pressure Monitor", nameTh: "เครื่องตรวจวัดความดันอัตโนมัติ",
      categoryId: catFixedAsset.id, trackIndividually: true,
      issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"),
      conversionFactor: 1, minThreshold: 1, locationId: locations[1].id,
      totalQty: 2, availableQty: 2,
      serialNumber: "SN-BP-001", model: "Omron HEM-7320",
      purchaseDate: new Date("2025-06-15"), purchasePrice: 8500,
      vendor: "Med Supply Co.", warrantyEndDate: new Date("2027-06-15"),
      maintenanceCycleMonths: 12,
    },
  });
  for (let i = 1; i <= 2; i++) {
    await prisma.subItem.create({
      data: { itemId: itemBloodPressure.id, subCode: `FIX-008-${String(i).padStart(3, "0")}`, status: "AVAILABLE", condition: "USABLE" },
    });
  }

  const itemEcg = await prisma.item.create({
    data: {
      code: "FIX-009", name: "ECG Machine", nameTh: "เครื่อง ECG",
      categoryId: catFixedAsset.id, trackIndividually: true,
      issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"),
      conversionFactor: 1, minThreshold: 1, locationId: locations[2].id,
      totalQty: 1, availableQty: 1,
      serialNumber: "SN-ECG-001", model: "GE MAC 2000",
      purchaseDate: new Date("2024-09-01"), purchasePrice: 150000,
      vendor: "Med Supply Co.", warrantyEndDate: new Date("2027-09-01"),
      maintenanceCycleMonths: 6,
      lastMaintenanceDate: new Date("2025-12-01"),
      nextMaintenanceDate: new Date("2026-06-01"),
    },
  });
  await prisma.subItem.create({
    data: { itemId: itemEcg.id, subCode: "FIX-009-001", status: "AVAILABLE", condition: "USABLE" },
  });

  // More books
  await prisma.item.create({
    data: {
      code: "BOOK-002", name: "Anatomy Atlas", nameTh: "แอนะตอมมี่ แอตลาส",
      categoryId: catBook.id, issueUnitId: unitId("เล่ม"), subUnitId: unitId("เล่ม"),
      conversionFactor: 1, minThreshold: 3, locationId: locations[3].id,
      totalQty: 10, availableQty: 10,
    },
  });

  await prisma.item.create({
    data: {
      code: "BOOK-003", name: "Chemistry Lab Manual", nameTh: "คู่มือปฏิบัติการเคมี",
      categoryId: catBook.id, issueUnitId: unitId("เล่ม"), subUnitId: unitId("เล่ม"),
      conversionFactor: 1, minThreshold: 5, locationId: locations[4].id,
      totalQty: 25, availableQty: 25,
    },
  });

  await prisma.item.create({
    data: {
      code: "BOOK-004", name: "Nursing Procedures Guide", nameTh: "คู่มือการพยาบาล",
      categoryId: catBook.id, issueUnitId: unitId("เล่ม"), subUnitId: unitId("เล่ม"),
      conversionFactor: 1, minThreshold: 5, locationId: locations[5].id,
      totalQty: 15, availableQty: 15,
    },
  });

  // Additional consumable with conversion factor
  const itemGauze = await prisma.item.create({
    data: {
      code: "CON-015", name: "Gauze Pad", nameTh: "ผ้าก๊อซ",
      categoryId: catConsumable.id, issueUnitId: unitId("แผง"), subUnitId: unitId("แผ่น"),
      conversionFactor: 10, minThreshold: 20, locationId: locations[6].id,
      totalQty: 60, availableQty: 60,
    },
  });

  const itemMask = await prisma.item.create({
    data: {
      code: "CON-016", name: "Surgical Mask", nameTh: "หน้ากากอนามัย",
      categoryId: catConsumable.id, issueUnitId: unitId("กล่อง"), subUnitId: unitId("อัน"),
      conversionFactor: 50, minThreshold: 5, locationId: locations[7].id,
      totalQty: 20, availableQty: 20,
    },
  });

  // Additional lots for new consumables
  const lotP01 = await prisma.lot.create({
    data: {
      itemId: itemPetriDish.id, lotNumber: "LOT-P01", quantity: 100,
      expiryDate: new Date("2027-06-30"), receivedDate: day(45),
    },
  });
  const lotS01 = await prisma.lot.create({
    data: {
      itemId: itemSyringe.id, lotNumber: "LOT-S01", quantity: 80,
      expiryDate: new Date("2028-01-31"), receivedDate: day(30),
    },
  });
  const lotCt01 = await prisma.lot.create({
    data: {
      itemId: itemCotton.id, lotNumber: "LOT-CT01", quantity: 25,
      expiryDate: new Date("2027-03-15"), receivedDate: day(60),
    },
  });
  const lotGz01 = await prisma.lot.create({
    data: {
      itemId: itemGauze.id, lotNumber: "LOT-GZ01", quantity: 60,
      expiryDate: new Date("2027-09-30"), receivedDate: day(40),
    },
  });

  // --- Additional Receive Records (7 more) ---
  await prisma.receiveRecord.createMany({
    data: [
      { itemId: itemPetriDish.id, lotId: lotP01.id, quantity: 100, receivedBy: staff.id, receivedAt: day(45), notes: "New stock" },
      { itemId: itemSyringe.id, lotId: lotS01.id, quantity: 80, receivedBy: staff.id, receivedAt: day(30) },
      { itemId: itemCotton.id, lotId: lotCt01.id, quantity: 25, receivedBy: admin.id, receivedAt: day(60) },
      { itemId: itemGauze.id, lotId: lotGz01.id, quantity: 60, receivedBy: staff.id, receivedAt: day(40) },
      { itemId: itemStethoscope.id, quantity: 8, receivedBy: admin.id, receivedAt: day(50), notes: "New purchase" },
      { itemId: itemSphygmomanometer.id, quantity: 6, receivedBy: admin.id, receivedAt: day(55) },
      { itemId: itemEcg.id, quantity: 1, receivedBy: admin.id, receivedAt: day(120), notes: "Major equipment" },
    ],
  });

  // --- Additional Dispense Records (20 more) ---
  await prisma.dispenseRecord.createMany({
    data: [
      { itemId: itemPetriDish.id, lotId: lotP01.id, quantity: 15, quantitySub: 0, subjectId: bio.id, staffId: staff.id, dispensedAt: day(25), notes: "Bacteria culture lab" },
      { itemId: itemPetriDish.id, lotId: lotP01.id, quantity: 10, quantitySub: 0, subjectId: med.id, staffId: staff.id, dispensedAt: day(18) },
      { itemId: itemSyringe.id, lotId: lotS01.id, quantity: 12, quantitySub: 0, subjectId: nur.id, staffId: staff.id, dispensedAt: day(22), notes: "Injection practice" },
      { itemId: itemSyringe.id, lotId: lotS01.id, quantity: 8, quantitySub: 0, subjectId: med.id, staffId: admin.id, dispensedAt: day(14) },
      { itemId: itemCotton.id, lotId: lotCt01.id, quantity: 5, quantitySub: 0, subjectId: nur.id, staffId: staff.id, dispensedAt: day(16) },
      { itemId: itemCotton.id, lotId: lotCt01.id, quantity: 3, quantitySub: 0, subjectId: bio.id, staffId: staff.id, dispensedAt: day(9) },
      { itemId: itemGauze.id, lotId: lotGz01.id, quantity: 8, quantitySub: 0, subjectId: nur.id, staffId: staff.id, dispensedAt: day(11) },
      { itemId: itemGauze.id, lotId: lotGz01.id, quantity: 5, quantitySub: 0, subjectId: med.id, staffId: admin.id, dispensedAt: day(6) },
      { itemId: itemSlide.id, quantity: 30, quantitySub: 0, subjectId: bio.id, staffId: staff.id, dispensedAt: day(20) },
      { itemId: itemSlide.id, quantity: 20, quantitySub: 0, subjectId: chem.id, staffId: staff.id, dispensedAt: day(13) },
      { itemId: itemThermometer.id, quantity: 5, quantitySub: 0, subjectId: nur.id, staffId: staff.id, dispensedAt: day(17) },
      { itemId: itemThermometer.id, quantity: 3, quantitySub: 0, subjectId: phy.id, staffId: staff.id, dispensedAt: day(4) },
      { itemId: itemMask.id, quantity: 3, quantitySub: 0, subjectId: nur.id, staffId: staff.id, dispensedAt: day(19) },
      { itemId: itemMask.id, quantity: 2, quantitySub: 0, subjectId: med.id, staffId: admin.id, dispensedAt: day(10) },
      { itemId: itemDisinfectant.id, quantity: 2, quantitySub: 0, subjectId: bio.id, staffId: staff.id, dispensedAt: day(15) },
      { itemId: itemDisinfectant.id, quantity: 1, quantitySub: 0, subjectId: chem.id, staffId: staff.id, dispensedAt: day(7) },
      { itemId: itemBeaker.id, lotId: lotB01.id, quantity: 6, quantitySub: 0, subjectId: nur.id, staffId: staff.id, dispensedAt: day(1) },
      { itemId: itemTestTube.id, lotId: lotT01.id, quantity: 8, quantitySub: 0, subjectId: med.id, staffId: admin.id, dispensedAt: day(0) },
      { itemId: itemFilterPaper.id, quantity: 15, quantitySub: 0, subjectId: phy.id, staffId: staff.id, dispensedAt: day(3) },
      { itemId: itemPetriDish.id, lotId: lotP01.id, quantity: 20, quantitySub: 0, subjectId: nur.id, staffId: staff.id, dispensedAt: day(2) },
    ],
  });

  // --- Additional Maintenance Records (4 more) ---
  await prisma.maintenanceRecord.createMany({
    data: [
      {
        itemId: itemEcg.id, type: "PREVENTIVE", result: "AVAILABLE",
        performedAt: day(70), performedBy: admin.id,
        description: "Biannual calibration check",
        cost: 5000,
      },
      {
        itemId: itemCentrifuge.id, type: "CORRECTIVE", result: "AVAILABLE",
        performedAt: day(35), performedBy: staff.id,
        issue: "Rotor vibration", description: "Replaced rotor bearings",
        cost: 6500,
      },
      {
        itemId: itemBloodPressure.id, type: "PREVENTIVE", result: "AVAILABLE",
        performedAt: day(45), performedBy: admin.id,
        description: "Annual accuracy check",
        cost: 800,
      },
      {
        itemId: itemPhMeter.id, type: "PREVENTIVE", result: "AVAILABLE",
        performedAt: day(25), performedBy: staff.id,
        description: "Initial setup calibration",
        cost: 1200,
      },
    ],
  });

  console.log("Seed completed!");
  console.log({ users: 3, categories: 16, subjects: 5, locations: 8, items: 35, subItems: 47, lots: 10, receives: 15, dispenses: 30, maintenanceRecords: 10, statusLogs: 2 });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
