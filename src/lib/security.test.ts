import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signToken, validateSessionToken } from "./auth";
import { prisma } from "./prisma";
import { uploadFilename, readStoredUpload } from "./upload-files";
import { getJwtSecret } from "./auth-config";
import { verifyToken } from "./auth";
import { crossSiteWrite } from "@/proxy";

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

test("a JWT secret short enough to be the one from .env.example is refused, not used", async () => {
  const real = process.env.JWT_SECRET;
  try {
    // ค่าที่เคยอยู่จริงทั้งใน .env และ .env.example — ไฟล์หลังอยู่ใน git
    for (const weak of ["", "dev-secret-change-in-prod", "x".repeat(31)]) {
      process.env.JWT_SECRET = weak;
      assert.throws(() => getJwtSecret(), /JWT_SECRET/);
    }
    process.env.JWT_SECRET = "x".repeat(32);
    assert.equal(getJwtSecret().length, 32);
  } finally {
    process.env.JWT_SECRET = real;
  }
});

test("secret ที่ตั้งผิดร้องออกมา ไม่ถูกกลืนเป็น 'token ไม่ผ่าน'", async () => {
  // ถ้า getJwtSecret() อยู่ใน try ของ verifyToken ด่านความยาวจะกลายเป็น null เงียบๆ —
  // deploy ที่ตั้งค่าผิดจะแสดงตัวเป็น "ทุกคนถูกเด้งไปหน้าล็อกอิน" ไม่ใช่ "ตั้งค่าผิด"
  const real = process.env.JWT_SECRET;
  try {
    process.env.JWT_SECRET = "dev-secret-change-in-prod";
    await assert.rejects(() => verifyToken("ไม่ต้องเป็น token จริง"), /JWT_SECRET/);
  } finally {
    process.env.JWT_SECRET = real;
  }
});

test("การเขียนที่มาจากเว็บอื่นถูกปฏิเสธ แม้จะเป็นซับโดเมนพี่น้องที่ SameSite=Lax ปล่อยผ่าน", () => {
  const ours = "https://nlu-stock.cmu.ac.th";
  const tunnel = "https://abc123.ngrok.app";
  const allowed = [ours, tunnel];

  // เคสที่ฟีเจอร์นี้มีอยู่เพื่อกัน: Lax นับที่ cmu.ac.th ซับโดเมนอื่นจึงส่งคุกกี้มาด้วยได้
  assert.equal(crossSiteWrite("POST", "https://someone-else.cmu.ac.th", allowed), true);
  assert.equal(crossSiteWrite("POST", "https://evil.example", allowed), true);
  // iframe แบบ sandbox / หน้าที่มาจาก data: URL ส่ง Origin: null
  assert.equal(crossSiteWrite("POST", "null", allowed), true);
  // host เดียวกันแต่คนละพอร์ตหรือคนละ scheme คือคนละ origin
  assert.equal(crossSiteWrite("POST", "http://localhost:3001", ["http://localhost:3000"]), true);
  assert.equal(crossSiteWrite("POST", "http://nlu-stock.cmu.ac.th", allowed), true);

  // เหตุผลที่ไม่เทียบกับ host header: มันมาจากลูกค้า ผู้โจมตีที่กรอกได้ทั้ง Origin และ
  // X-Forwarded-Host จะผ่านด่านที่เทียบสองค่านั้นกันเองเสมอ. รายการนี้มาจาก env เท่านั้น
  assert.equal(crossSiteWrite("POST", "https://evil.example", ["https://evil.example"]), false);

  // หน้าจอของเราเอง — ต้องผ่านทุก method ที่เขียนได้ รวม tunnel ที่ตั้งไว้ใน CMU_OAUTH_ORIGINS
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    assert.equal(crossSiteWrite(method, ours, allowed), false);
  }
  assert.equal(crossSiteWrite("POST", tunnel, allowed), false);

  // อ่านอย่างเดียวไม่ต้องกัน และคำขอที่ไม่มี Origin ก็ไม่ใช่เบราว์เซอร์ของเหยื่อ
  assert.equal(crossSiteWrite("GET", "https://evil.example", allowed), false);
  assert.equal(crossSiteWrite("HEAD", "https://evil.example", allowed), false);
  assert.equal(crossSiteWrite("POST", null, allowed), false);
});
