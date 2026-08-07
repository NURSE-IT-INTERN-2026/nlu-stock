// QR payload round-trip. No framework — run with: npx tsx src/lib/qr-code.test.ts
// Guards the one thing the whole scan flow rests on: a printed QR must parse back
// to the code the in-app scanner looks up, and legacy bare-code labels must still work.
import assert from "node:assert";
import { qrUrl, parseScannedCode } from "@/lib/constants";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "";
assert.ok(BASE, "NEXT_PUBLIC_APP_URL must be set to run this test");

// Round-trip: item label.
assert.equal(qrUrl("NLU-BAT-001"), `${BASE}/items/NLU-BAT-001`);
assert.deepEqual(parseScannedCode(qrUrl("NLU-BAT-001")), { code: "NLU-BAT-001", copy: undefined });

// Round-trip: piece label (≥2 copies) keeps the copy.
assert.equal(qrUrl("NLU-BOOK-043", "C01"), `${BASE}/items/NLU-BOOK-043?copy=C01`);
assert.deepEqual(parseScannedCode(qrUrl("NLU-BOOK-043", "C01")), { code: "NLU-BOOK-043", copy: "C01" });

// Single-copy piece passes null → no ?copy=.
assert.equal(qrUrl("NLU-BOOK-043", null), `${BASE}/items/NLU-BOOK-043`);

// Legacy labels printed before the URL switch.
assert.deepEqual(parseScannedCode("NLU-BAT-001"), { code: "NLU-BAT-001" });
assert.deepEqual(parseScannedCode("  NLU-BAT-001  "), { code: "NLU-BAT-001" });
assert.deepEqual(parseScannedCode("NLU-BOOK-043-01"), { code: "NLU-BOOK-043-01" });

// Garbage / foreign QR codes fall through as a plain search string rather than throwing.
assert.deepEqual(parseScannedCode("https://"), { code: "https://" });
assert.deepEqual(parseScannedCode("hello world"), { code: "hello world" });

// Someone else's URL still yields its last path segment — the lookup just won't match.
assert.deepEqual(parseScannedCode("https://evil.example.com/items/NLU-BAT-001"), {
  code: "NLU-BAT-001",
  copy: undefined,
});

console.log("✓ qr-code tests passed");
