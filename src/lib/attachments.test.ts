import { test } from "node:test";
import assert from "node:assert/strict";
import { isUploadUrl, resolveChange, isNoop, isAttachRecordType } from "@/lib/attachments";
import { MAX_EVIDENCE_FILES } from "@/lib/uploads";

const u = (n: number) => `/uploads/00000000-0000-4000-8000-${String(n).padStart(12, "0")}.jpg`;

test("only urls this app stored are accepted", () => {
  assert.equal(isUploadUrl(u(1)), true);
  assert.equal(isUploadUrl("/uploads/00000000-0000-4000-8000-000000000001.pdf"), true);
  // Someone else's origin, rendered by us in an <img src> — the whole reason this check exists.
  assert.equal(isUploadUrl("https://evil.example/x.jpg"), false);
  assert.equal(isUploadUrl("javascript:alert(1)"), false);
  // Path traversal, and a non-allowlisted extension the serve route would guess a type for.
  assert.equal(isUploadUrl("/uploads/../../etc/passwd"), false);
  assert.equal(isUploadUrl("/uploads/00000000-0000-4000-8000-000000000001.svg"), false);
  assert.equal(isUploadUrl(""), false);
  assert.equal(isUploadUrl(null), false);
});

test("recordType is an allowlist, not a table name from the client", () => {
  assert.equal(isAttachRecordType("StockAdjustment"), true);
  assert.equal(isAttachRecordType("User"), false);
  assert.equal(isAttachRecordType(undefined), false);
});

test("add appends and reports exactly what it appended", () => {
  const r = resolveChange([u(1)], { add: [u(2), u(3)] });
  assert.deepEqual(r.next, [u(1), u(2), u(3)]);
  assert.deepEqual(r.added, [u(2), u(3)]);
  assert.deepEqual(r.removed, []);
});

test("remove unlinks and reports it; a url that was never there is ignored", () => {
  const r = resolveChange([u(1), u(2)], { remove: [u(2), u(9)] });
  assert.deepEqual(r.next, [u(1)]);
  assert.deepEqual(r.removed, [u(2)]);
});

test("removing then adding in one call does not trip the cap", () => {
  const full = Array.from({ length: MAX_EVIDENCE_FILES }, (_, i) => u(i + 1));
  const r = resolveChange(full, { remove: [u(1)], add: [u(99)] });
  assert.equal(r.next.length, MAX_EVIDENCE_FILES);
  assert.deepEqual(r.added, [u(99)]);
  assert.deepEqual(r.removed, [u(1)]);
});

test("the cap holds against a client that ignores it", () => {
  const full = Array.from({ length: MAX_EVIDENCE_FILES }, (_, i) => u(i + 1));
  const r = resolveChange(full, { add: [u(98), u(99)] });
  assert.equal(r.next.length, MAX_EVIDENCE_FILES);
  assert.deepEqual(r.added, []);
});

test("a url already attached is not attached twice", () => {
  const r = resolveChange([u(1)], { add: [u(1)] });
  assert.deepEqual(r.next, [u(1)]);
  assert.equal(isNoop(r), true);
});

test("garbage in the payload is dropped, not thrown", () => {
  const r = resolveChange([u(1)], { add: ["https://evil.example/x.jpg", 42], remove: "nope" });
  assert.deepEqual(r.next, [u(1)]);
  assert.equal(isNoop(r), true);
});

test("an untouched edit dialog is a no-op, so nothing is logged", () => {
  assert.equal(isNoop(resolveChange([u(1)], {})), true);
  assert.equal(isNoop(resolveChange([u(1)], { add: [], remove: [] })), true);
});
