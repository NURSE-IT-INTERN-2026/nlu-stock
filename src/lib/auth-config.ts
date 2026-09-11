export const COOKIE_NAME = "session_token";

/**
 * `aud` values that keep the two JWT kinds this app signs from ever standing in for each other.
 *
 * Both are HS256 over JWT_SECRET, and the OAuth `state` one is deliberately handed to the
 * browser inside a URL — so "the signature checks out" says nothing about what a token is FOR.
 * Verifying the audience makes that structural rather than a rule someone has to remember:
 * a third JWT added later is rejected everywhere until its own audience is spelled out.
 */
export const SESSION_AUD = "nlu-stock:session";
export const OAUTH_STATE_AUD = "nlu-stock:oauth-state";

/** HS256 คีย์เดียวของระบบ — ถือทั้ง session cookie และ OAuth state */
const MIN_SECRET_LENGTH = 32;

/**
 * ความยาวคือด่านเดียวที่โค้ดวัดได้ แต่มันพอจะกันเคสที่เกิดขึ้นจริง: ค่าใน .env.example
 * ("dev-secret-change-in-prod", 25 ตัว) ถูกคัดลอกไปเป็นค่าจริงแล้วไม่มีใครกลับมาแก้ —
 * และไฟล์นั้นอยู่ใน git ใครอ่านรีโปได้ก็ปั้น token SUPERADMIN ได้ ขอแค่เดาอีเมลใน
 * SUPERADMIN_EMAILS ถูก (validateSessionToken เทียบ role กับ allowlist แต่ไม่มีทางรู้ว่า
 * token มาจากเรา). ตัดที่ความยาวจึงคัดค่าที่คัดลอกมาทิ้งไปด้วยในตัว
 *
 * ตรงนี้คือด่านที่ทุก request เดินผ่าน (proxy เรียก validateSessionToken ก่อนทุกหน้า) —
 * secret อ่อนจึงพังตั้งแต่ request แรกหลัง deploy ไม่ใช่ตอนใครสักคนเผลอล็อกอิน
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET ต้องยาวอย่างน้อย ${MIN_SECRET_LENGTH} ตัวอักษร (ตอนนี้ ${secret.length}) — ` +
        `สร้างใหม่ด้วย: node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))'`,
    );
  }
  return new TextEncoder().encode(secret);
}
