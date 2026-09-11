/** Run after npm run build: node --import tsx scripts/security-regression.ts
 * Creates and deletes its own local database; never seeds or resets the development database.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { SignJWT } from "jose";
import { consumeSearchQuota } from "../src/lib/quota";

async function main() {
  const source = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1", "::1", "[::1]"].includes(source.hostname), "Local PostgreSQL required");
  const database = `nlu_security_${randomUUID().replaceAll("-", "")}`;
  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: source.toString() }) });
  const target = new URL(source);
  target.pathname = `/${database}`;
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target.toString() }) });
  const filename = `${randomUUID()}.png`;
  const file = join(process.cwd(), "uploads", filename);
  let server: ChildProcess | undefined;
  let created = false;
  let logs = "";
  const secret = "isolated-security-regression-secret-32-bytes";
  const env = {
    ...process.env, DATABASE_URL: target.toString(), JWT_SECRET: secret,
    SUPERADMIN_EMAILS: "", ADMIN_EMAILS: "", EXECUTIVE_EMAILS: "",
    GOOGLE_GENERATIVE_AI_API_KEY: "security-regression-never-call-provider",
  };
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
    created = true;
    const migrated = spawnSync("node", ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env, encoding: "utf8" });
    assert.equal(migrated.status, 0, migrated.stderr + migrated.stdout);
    console.log("PASS: all migrations apply to an empty isolated database");

    const staff = await db.user.create({ data: { email: "staff@security.test", name: "Staff", role: "ADMIN" } });
    const borrower = await db.user.create({ data: { email: "borrower@security.test", name: "Borrower", isBorrower: true } });
    const results = await Promise.all(Array.from({ length: 30 }, () => db.$transaction((tx) => consumeSearchQuota(tx, staff.id), { timeout: 15000 })));
    assert.equal(results.filter(Boolean).length, 20);
    const minuteKey = `user:${staff.id}:minute`;
    await db.aiSearchLimit.update({ where: { key: minuteKey }, data: { windowStart: new Date(0) } });
    assert.equal(await db.$transaction((tx) => consumeSearchQuota(tx, staff.id)), true);
    await db.aiSearchLimit.update({ where: { key: `user:${staff.id}:day` }, data: { count: 200 } });
    assert.equal(await db.$transaction((tx) => consumeSearchQuota(tx, staff.id)), false);
    await db.aiSearchLimit.update({ where: { key: "global:day" }, data: { count: 2000 } });
    assert.equal(await db.$transaction((tx) => consumeSearchQuota(tx, borrower.id)), false);
    console.log("PASS: concurrent quota, window reset, per-user and global daily caps");

    const item = await db.item.create({ data: {
      code: "SECURITY-TEST", name: "Security fixture", imageUrl: `/uploads/${filename}`,
      category: { create: { name: "Security fixture", profile: { create: { name: "Security fixture", code: "SEC", dispenseType: "COUNT" } } } },
      issueUnit: { create: { name: "security-unit" } },
    } });
    await mkdir(join(process.cwd(), "uploads"), { recursive: true });
    await copyFile("e2e/assets/evidence.png", file);
    const token = async (user: typeof staff, role: string) => new SignJWT({ userId: user.id, email: user.email, name: user.name, role })
      .setProtectedHeader({ alg: "HS256" }).setAudience("nlu-stock:session").setIssuedAt().setExpirationTime("10m")
      .sign(new TextEncoder().encode(secret));
    const staffToken = await token(staff, "ADMIN");
    const borrowerToken = await token(borrower, "BORROWER");
    // Port 0 lets the OS choose a free port; discover it from next start's ready banner.
    server = spawn("node", ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "0"], { env, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout?.on("data", (chunk) => { logs += chunk.toString(); });
    server.stderr?.on("data", (chunk) => { logs += chunk.toString(); });
    const deadline = Date.now() + 30000;
    while (!logs.includes("Ready") && Date.now() < deadline && server.exitCode === null) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const port = logs.match(/127\.0\.0\.1:(\d+)/)?.[1];
    assert.ok(port && logs.includes("Ready"), logs);
    const base = `http://127.0.0.1:${port}/nlu-stock`;
    const request = (path: string, session?: string) => fetch(base + path, {
      redirect: "manual", headers: session ? { Cookie: `session_token=${session}` } : {},
    });
    assert.equal((await request(`/uploads/${filename}`)).status, 401);
    const allowed = await request(`/uploads/${filename}`, staffToken);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("cache-control"), "private, no-store");
    assert.equal((await request(`/uploads/${filename}`, borrowerToken)).status, 200);
    await db.itemStatusLog.create({ data: { itemId: item.id, previousStatus: "AVAILABLE", newStatus: "DAMAGED", changedBy: staff.id, imageUrls: [`/uploads/${filename}`] } });
    assert.equal((await request(`/uploads/${filename}`, borrowerToken)).status, 403);
    assert.equal((await request(`/uploads/${filename}`, staffToken)).status, 200);
    assert.equal((await request(`/uploads/${randomUUID()}.png`, borrowerToken)).status, 403);
    assert.equal((await request("/api/items/search-ai?q=test", borrowerToken)).status, 403);
    assert.equal((await request(`/api/items/search-ai?q=${"x".repeat(501)}`, staffToken)).status, 400);
    assert.equal((await request("/api/items/search-ai?q=test", staffToken)).status, 429);
    await db.$executeRawUnsafe('DROP TABLE "ai_search_limits"');
    assert.equal((await request("/api/items/search-ai?q=test", staffToken)).status, 503);
    // เพดานของ endpoint อื่นนั่งอยู่บนตัวนับตัวเดียวกัน — ตารางหายแล้วต้องปฏิเสธเหมือนกัน
    // ไม่ใช่ปล่อยผ่านเพราะนับไม่ได้ (fail closed). ยิงไปที่ค้นชื่อวิชาเพราะเป็น GET เหมือนกัน
    assert.equal((await request("/api/courses/NU001", staffToken)).status, 503);
    console.log("PASS: HTTP upload permissions/cache, borrower AI denial, length, quota and fail-closed storage across endpoints");

    assert.equal((await request("/api/auth/session", staffToken)).status, 200);
    await db.user.update({ where: { id: staff.id }, data: { role: "EXECUTIVE" } });
    assert.equal((await request("/api/auth/session", staffToken)).status, 401);
    assert.equal((await request(`/uploads/${filename}`, staffToken)).status, 401);
    assert.equal((await request("/api/items", staffToken)).status, 307);
    await db.user.update({ where: { id: borrower.id }, data: { isActive: false } });
    assert.equal((await request(`/uploads/${filename}`, borrowerToken)).status, 401);
    console.log("PASS: real database demotion/disable revokes session, API and file access");
  } finally {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise<void>((resolve) => server!.once("exit", () => resolve()));
    }
    await unlink(file).catch(() => {});
    await db.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
