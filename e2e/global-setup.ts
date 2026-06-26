import { Client } from "pg";
import { SignJWT } from "jose";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test", override: true });

const DB_URL = process.env.DATABASE_URL!;
const JWT_SECRET = process.env.JWT_SECRET!;
const AUTH_DIR = "e2e/.auth";
const AUTH_FILE = `${AUTH_DIR}/admin.json`;

async function ensureDatabase() {
  const u = new URL(DB_URL);
  const dbName = u.pathname.slice(1);
  u.pathname = "/postgres"; // maintenance connection
  const client = new Client({ connectionString: u.toString() });
  await client.connect();
  // CREATE DATABASE has no IF NOT EXISTS; ignore the error when it already exists.
  await client
    .query(`CREATE DATABASE "${dbName}" WITH OWNER "${u.username}"`)
    .catch(() => {});
  await client.end();
}

/**
 * Reset the test DB by hand: DROP SCHEMA public CASCADE then recreate it and
 * enable pgvector. We can't use `prisma migrate reset` because it drops the
 * schema (and with it the vector extension) before applying the 0_init
 * migration, which declares `embedding vector(768)`.
 */
async function resetSchema() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  await db.query(`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.query(`CREATE SCHEMA public`);
  await db.query(`CREATE EXTENSION IF NOT EXISTS vector`);
  await db.end();
}

async function adminUserId() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  const { rows } = await c.query(
    `SELECT id, email, name, role FROM users WHERE email = 'admin@nlu.ac.th'`
  );
  await c.end();
  return rows[0];
}

export default async function globalSetup() {
  await ensureDatabase();
  await resetSchema();

  const consent = { ...process.env, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" };
  // Sync schema.prisma → test DB directly. The 0_init migration is stale (no
  // category_profiles / DispenseType-era tables); dev uses `db push` too.
  // db push handles the pgvector embedding column since the extension is enabled.
  execSync("npx prisma db push --accept-data-loss", { stdio: "inherit", env: consent });
  execSync("npx prisma db seed", { stdio: "inherit", env: consent });

  const admin = await adminUserId();
  if (!admin) throw new Error("Seed did not create admin@nlu.ac.th");

  const token = await new SignJWT({
    userId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .setIssuedAt()
    .sign(new TextEncoder().encode(JWT_SECRET));

  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(
    AUTH_FILE,
    JSON.stringify({
      cookies: [
        {
          name: "session_token",
          value: token,
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    })
  );
}
