import { Client } from "pg";
import { SignJWT } from "jose";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";
import { SESSION_AUD } from "../src/lib/auth-config";

dotenv.config({ path: ".env.test", override: true });

const DB_URL = process.env.DATABASE_URL!;
const JWT_SECRET = process.env.JWT_SECRET!;
const AUTH_DIR = "e2e/.auth";
const AUTH_FILE = `${AUTH_DIR}/admin.json`;
const BORROWER_FILE = `${AUTH_DIR}/borrower.json`;

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

// users has no role column any more — roles come from the env allowlists (src/lib/roles.ts),
// so the suite states the role it wants instead of reading it back.
async function userByEmail(email: string) {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  const { rows } = await c.query(`SELECT id, email, name FROM users WHERE email = $1`, [email]);
  await c.end();
  return rows[0];
}

/** One signed-in browser state on disk. Roles are not in the DB (src/lib/roles.ts) — the suite
 *  states the role it wants, exactly as the CMU callback would after reading the claims. */
async function writeAuthFile(
  file: string,
  user: { id: string; email: string; name: string },
  role: string,
) {
  // Must match lib/auth signToken exactly, `aud` included: the app rejects any JWT that is not
  // stamped for a session, because the OAuth `state` token is signed with this same secret and
  // is handed to the browser in a URL. A token minted here without it verifies as garbage and
  // every scenario bounces to /login.
  const token = await new SignJWT({ userId: user.id, email: user.email, name: user.name, role })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(SESSION_AUD)
    .setExpirationTime("24h")
    .setIssuedAt()
    .sign(new TextEncoder().encode(JWT_SECRET));

  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(
    file,
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

export default async function globalSetup() {
  await ensureDatabase();
  await resetSchema();

  const consent = { ...process.env, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" };
  // Sync schema.prisma → test DB directly. The 0_init migration is stale (no
  // category_profiles / DispenseType-era tables); dev uses `db push` too.
  // db push handles the pgvector embedding column since the extension is enabled.
  execSync("npx prisma db push --accept-data-loss", { stdio: "inherit", env: consent });
  execSync("npx prisma db seed", { stdio: "inherit", env: consent });

  const admin = await userByEmail("superadmin@nlu.ac.th");
  if (!admin) throw new Error("Seed did not create superadmin@nlu.ac.th");
  await writeAuthFile(AUTH_FILE, admin, "SUPERADMIN");

  // ยืมเอง ผ่าน QR: BORROWER มาจาก CMU claims ไม่ใช่ env allowlist — เทสจึงปั๊ม session ให้ตรง
  // ตามที่ callback จะออกให้ นศ. ของคณะ แทนที่จะวิ่ง OAuth จริงในเทส
  const borrower = await userByEmail("student@cmu.ac.th");
  if (!borrower) throw new Error("Seed did not create student@cmu.ac.th");
  await writeAuthFile(BORROWER_FILE, borrower, "BORROWER");
}
