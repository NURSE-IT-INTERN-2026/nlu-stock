// Lifecycle-rule check. No framework — run with: npx tsx src/lib/status-utils.test.ts
// Guards the one invariant the whole ชำรุด → ส่งซ่อม → รับซ่อม flow rests on: you cannot
// skip a step, and only SUPERADMIN may withdraw a ชำรุด report.
import assert from "node:assert";
import { canTransition, allowedTargets } from "@/lib/status-utils";

// Step-skipping is refused for everyone.
assert.equal(canTransition("AVAILABLE", "UNDER_REPAIR"), false, "ต้องแจ้งชำรุดก่อนส่งซ่อม");
assert.equal(canTransition("AVAILABLE", "DAMAGED"), true);
assert.equal(canTransition("DAMAGED", "UNDER_REPAIR"), true);
assert.equal(canTransition("UNDER_REPAIR", "AVAILABLE"), true);
assert.equal(canTransition("UNDER_REPAIR", "DISPOSED"), true);

// The repair-details self-edit (ภายใน → ภายนอก) — status doesn't move but it's a real edge.
assert.equal(canTransition("UNDER_REPAIR", "UNDER_REPAIR"), true);
assert.equal(canTransition("AVAILABLE", "AVAILABLE"), false, "ไม่มี self-edge อื่นนอกจาก UNDER_REPAIR");

// ยกเลิกคำขอชำรุด is ADMIN-only, and it's the ONLY edge a role unlocks.
assert.equal(canTransition("DAMAGED", "AVAILABLE"), false);
assert.equal(canTransition("DAMAGED", "AVAILABLE", { isSuperAdmin: true }), true);
assert.equal(canTransition("DAMAGED", "LOST", { isSuperAdmin: true }), false, "ADMIN ก็ข้ามขั้นไม่ได้");

// Written-off can be undone (mirror of เรียกคืน): both LOST and DISPOSED → AVAILABLE.
assert.equal(canTransition("DISPOSED", "AVAILABLE"), true, "ยกเลิกตัดจำหน่ายแล้วคืนได้");
assert.equal(canTransition("DISPOSED", "AVAILABLE", { isSuperAdmin: true }), true);
assert.equal(canTransition("LOST", "AVAILABLE"), true, "เจอของที่หายแล้วคืนได้");
// Still terminal to anything but AVAILABLE.
assert.equal(canTransition("DISPOSED", "DAMAGED"), false);
assert.equal(canTransition("DISPOSED", "LOST"), false);

// allowedTargets adds the admin edge without duplicating.
assert.deepEqual([...allowedTargets("DAMAGED")].sort(), ["DISPOSED", "UNDER_REPAIR"]);
assert.deepEqual([...allowedTargets("DAMAGED", { isSuperAdmin: true })].sort(), ["AVAILABLE", "DISPOSED", "UNDER_REPAIR"]);

console.log("status-utils: all assertions passed");
