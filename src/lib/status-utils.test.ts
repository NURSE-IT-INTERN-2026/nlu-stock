// Lifecycle-rule check. No framework — run with: npx tsx src/lib/status-utils.test.ts
// Guards the one invariant the whole ชำรุด → ส่งซ่อม → รับซ่อม flow rests on: you cannot
// skip a step, and only ADMIN may withdraw a ชำรุด report.
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
assert.equal(canTransition("DAMAGED", "AVAILABLE", { isAdmin: true }), true);
assert.equal(canTransition("DAMAGED", "LOST", { isAdmin: true }), false, "ADMIN ก็ข้ามขั้นไม่ได้");

// Written-off is terminal.
assert.equal(canTransition("DISPOSED", "AVAILABLE"), false);
assert.equal(canTransition("DISPOSED", "AVAILABLE", { isAdmin: true }), false);
assert.equal(canTransition("LOST", "AVAILABLE"), true, "เจอของที่หายแล้วคืนได้");

// allowedTargets adds the admin edge without duplicating.
assert.deepEqual([...allowedTargets("DAMAGED")].sort(), ["DISPOSED", "UNDER_REPAIR"]);
assert.deepEqual([...allowedTargets("DAMAGED", { isAdmin: true })].sort(), ["AVAILABLE", "DISPOSED", "UNDER_REPAIR"]);

console.log("status-utils: all assertions passed");
