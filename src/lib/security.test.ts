import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signToken, validateSessionToken } from "./auth";
import { prisma } from "./prisma";
import { uploadFilename, readStoredUpload } from "./upload-files";

process.env.JWT_SECRET = "security-regression-secret-at-least-32-bytes";
process.env.SUPERADMIN_EMAILS = "root@security.test";
process.env.ADMIN_EMAILS = "";
process.env.EXECUTIVE_EMAILS = "";

test("signed sessions lose access after grant removal, demotion, disable or deletion", async () => {
  const claims = { userId: "security-test", email: "staff@security.test", name: "Staff", role: "ADMIN" as const };
  const token = await signToken(claims);
  let row: { email: string; name: string; role: string | null; isActive: boolean; isBorrower: boolean } | null = {
    email: claims.email, name: "Current name", role: "ADMIN", isActive: true, isBorrower: false,
  };
  const original = prisma.user.findUnique;
  prisma.user.findUnique = (async () => row) as unknown as typeof original;
  try {
    assert.equal((await validateSessionToken(token))?.name, "Current name");
    row.role = "EXECUTIVE";
    assert.equal(await validateSessionToken(token), null);
    row.role = null;
    assert.equal(await validateSessionToken(token), null);
    row.role = "ADMIN";
    row.isActive = false;
    assert.equal(await validateSessionToken(token), null);
    row = null;
    assert.equal(await validateSessionToken(token), null);
  } finally { prisma.user.findUnique = original; }
});

test("borrower claims remain valid without a stored staff grant; env revocation is immediate", async () => {
  const claims = { userId: "security-test", email: "student@security.test", name: "Student", role: "BORROWER" as const };
  const row = { ...claims, role: null, isActive: true, isBorrower: true };
  const original = prisma.user.findUnique;
  prisma.user.findUnique = (async () => row) as unknown as typeof original;
  try {
    assert.equal((await validateSessionToken(await signToken(claims)))?.role, "BORROWER");
    assert.equal(await validateSessionToken(await signToken({ ...claims, role: "ADMIN" })), null);
    row.email = "root@security.test";
    const root = await signToken({ ...claims, email: row.email, role: "SUPERADMIN" });
    assert.equal((await validateSessionToken(root))?.role, "SUPERADMIN");
    process.env.SUPERADMIN_EMAILS = "";
    assert.equal(await validateSessionToken(root), null);
  } finally { prisma.user.findUnique = original; }
});

test("upload reader rejects traversal, sibling-prefix escape and symlinks but reads a normal upload", async () => {
  const name = "12345678-1234-1234-1234-123456789abc.png";
  for (const path of [["..", "uploads-backup", name], [`../uploads-backup/${name}`], [".."], [name, "extra"], [`..\\${name}`], [`${name}\0`]]) {
    assert.equal(uploadFilename(path), null);
  }
  const directory = await mkdtemp(join(tmpdir(), "nlu-upload-security-"));
  try {
    await writeFile(join(directory, name), "fixture");
    assert.equal((await readStoredUpload(directory, name)).toString(), "fixture");
    const link = "abcdef12-1234-1234-1234-123456789abc.png";
    await symlink(join(directory, name), join(directory, link));
    await assert.rejects(readStoredUpload(directory, link));
    await assert.rejects(readStoredUpload(directory, `../uploads-backup/${name}`));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
