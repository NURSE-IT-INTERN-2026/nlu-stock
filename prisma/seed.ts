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

  // Categories
  const catConsumable = await prisma.categoryType.create({
    data: { name: "วัสดุสิ้นเปลือง", category: "CONSUMABLE", sortOrder: 1 },
  });
  const catDurable = await prisma.categoryType.create({
    data: { name: "วัสดุคงทน", category: "DURABLE", sortOrder: 2 },
  });
  const catFixedAsset = await prisma.categoryType.create({
    data: { name: "ครุภันธุ์", category: "FIXED_ASSET", sortOrder: 3 },
  });
  const catBook = await prisma.categoryType.create({
    data: { name: "หนังสือ", category: "BOOK", sortOrder: 4 },
  });

  // Subjects
  await prisma.subject.create({ data: { code: "PHY", name: "ฟิสิกส์" } });
  await prisma.subject.create({ data: { code: "CHEM", name: "เคมี" } });
  await prisma.subject.create({ data: { code: "BIO", name: "ชีววิทยา" } });

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
      categoryId: catConsumable.id, issueUnit: "ใบ", subUnit: "ใบ",
      conversionFactor: 1, minThreshold: 10, locationId: locations[0].id,
      totalQty: 100, availableQty: 100,
    },
  });
  const itemTestTube = await prisma.item.create({
    data: {
      code: "CON-002", name: "Test Tube", nameTh: "หลอดทดลอง",
      categoryId: catConsumable.id, issueUnit: "อัน", subUnit: "อัน",
      conversionFactor: 1, minThreshold: 20, locationId: locations[0].id,
      totalQty: 200, availableQty: 200,
    },
  });
  const itemFilterPaper = await prisma.item.create({
    data: {
      code: "CON-003", name: "Filter Paper", nameTh: "กระดาษกรอง",
      categoryId: catConsumable.id, issueUnit: "แผ่น", subUnit: "แผ่น",
      conversionFactor: 1, minThreshold: 50, locationId: locations[1].id,
      totalQty: 500, availableQty: 500,
    },
  });
  await prisma.item.create({
    data: {
      code: "CON-004", name: "Copper Wire 1m", nameTh: "ลวดทองแดง 1 เมตร",
      categoryId: catConsumable.id, issueUnit: "เส้น", subUnit: "เส้น",
      conversionFactor: 1, minThreshold: 5, locationId: locations[2].id,
      totalQty: 30, availableQty: 30,
    },
  });

  // Durables (not tracked individually)
  await prisma.item.create({
    data: {
      code: "DUR-001", name: "Magnifying Glass", nameTh: "แว่นขยาย",
      categoryId: catDurable.id, issueUnit: "อัน", subUnit: "อัน",
      conversionFactor: 1, minThreshold: 2, locationId: locations[3].id,
      totalQty: 15, availableQty: 15,
    },
  });

  // Durables (tracked individually)
  const itemMicroscope = await prisma.item.create({
    data: {
      code: "DUR-002", name: "Microscope", nameTh: "กล้องจุลทรรศน์",
      categoryId: catDurable.id, trackIndividually: true,
      issueUnit: "เครื่อง", subUnit: "เครื่อง",
      conversionFactor: 1, minThreshold: 1, locationId: locations[4].id,
      totalQty: 5, availableQty: 5,
    },
  });
  for (let i = 1; i <= 5; i++) {
    await prisma.subItem.create({
      data: {
        itemId: itemMicroscope.id,
        subCode: `DUR-002-${String(i).padStart(3, "0")}`,
        status: "AVAILABLE", condition: "ดี",
      },
    });
  }

  // Fixed Assets
  const itemProjector = await prisma.item.create({
    data: {
      code: "FIX-001", name: "LCD Projector", nameTh: "โปรเจกเตอร์",
      categoryId: catFixedAsset.id, trackIndividually: true,
      issueUnit: "เครื่อง", subUnit: "เครื่อง",
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
        status: "AVAILABLE", condition: "ดี",
      },
    });
  }

  const itemCentrifuge = await prisma.item.create({
    data: {
      code: "FIX-002", name: "Centrifuge", nameTh: "เครื่องหมุนเหวี่ยง",
      categoryId: catFixedAsset.id, trackIndividually: true,
      issueUnit: "เครื่อง", subUnit: "เครื่อง",
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
        status: "AVAILABLE", condition: "ดี",
      },
    });
  }

  // Books
  await prisma.item.create({
    data: {
      code: "BOOK-001", name: "Physics Textbook Vol.1", nameTh: "หนังสือเรียนฟิสิกส์ เล่ม 1",
      categoryId: catBook.id, issueUnit: "เล่ม", subUnit: "เล่ม",
      conversionFactor: 1, minThreshold: 5, locationId: locations[7].id,
      totalQty: 30, availableQty: 30,
    },
  });

  // Lots for consumables
  await prisma.lot.create({
    data: {
      itemId: itemBeaker.id, lotNumber: "LOT-B01", quantity: 50,
      expiryDate: new Date("2027-12-31"), receivedDate: new Date("2025-01-10"),
    },
  });
  await prisma.lot.create({
    data: {
      itemId: itemBeaker.id, lotNumber: "LOT-B02", quantity: 50,
      expiryDate: new Date("2026-08-15"), receivedDate: new Date("2025-05-01"),
    },
  });
  await prisma.lot.create({
    data: {
      itemId: itemTestTube.id, lotNumber: "LOT-T01", quantity: 200,
      expiryDate: new Date("2028-06-30"), receivedDate: new Date("2025-02-15"),
    },
  });

  console.log("Seed completed!");
  console.log({ users: 3, categories: 4, subjects: 3, locations: 8, items: 9, subItems: 10, lots: 3 });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
