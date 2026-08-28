import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret } from "./auth-config";

/** Nonce half of the CSRF pair. The other half rides in the signed `state` param. */
export const OAUTH_STATE_COOKIE = "oauth_state";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export function oauthConfig() {
  return {
    clientId: required("CMU_CLIENT_ID"),
    clientSecret: required("CMU_CLIENT_SECRET"),
    // Must match what is registered with the provider byte for byte, basePath included,
    // or the provider rejects the exchange with redirect_uri_mismatch.
    redirectUri: required("CMU_REDIRECT_URI"),
    authorizeUrl: required("CMU_OAUTH_URL"),
    tokenUrl: required("CMU_TOKEN_URL"),
    /** Optional. Unset = read the email out of the id_token instead. */
    userinfoUrl: process.env.CMU_USERINFO_URL || "",
    scope: process.env.CMU_SCOPE || "openid profile email",
  };
}

// ─── CSRF state ───
// Signed JWT in the `state` param + matching nonce in an httpOnly cookie. Either half alone
// is useless: a forged state fails the signature, and a replayed state fails the nonce
// compare. Without this an attacker can walk a signed-in user onto *their* account.

export async function signState(next: string) {
  const nonce = crypto.randomUUID();
  const token = await new SignJWT({ nonce, next })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .setIssuedAt()
    .sign(getJwtSecret());
  return { token, nonce };
}

export async function readState(state: string, nonceCookie: string | undefined) {
  if (!nonceCookie) return null;
  try {
    const { payload } = await jwtVerify(state, getJwtSecret());
    if (payload.nonce !== nonceCookie) return null;
    const next = typeof payload.next === "string" ? payload.next : "/";
    return { next };
  } catch {
    return null;
  }
}

// ─── Code exchange ───

export interface TokenResponse {
  access_token?: string;
  id_token?: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const c = oauthConfig();
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: c.redirectUri,
      client_id: c.clientId,
      client_secret: c.clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  return res.json();
}

// The claims differ by provider, so try a list rather than pinning one spelling and
// breaking the moment the other provider answers. Entra's id_token says `email` /
// `given_name` / `family_name`; CMU's basicinfo says `cmuitaccount` / `firstname_TH`.
const EMAIL_CLAIMS = ["email", "mail", "userPrincipalName", "preferred_username", "cmuitaccount"];

// Thai first — this is what staff see on every record they touch. English is the fallback
// for accounts with no Thai name on file.
const NAME_PAIRS = [
  ["firstname_TH", "lastname_TH"],
  ["firstname_EN", "lastname_EN"],
  ["given_name", "family_name"],
];
const NAME_SINGLES = ["name", "displayName", "cmuitaccount_name"];

function str(claims: Record<string, unknown>, key: string): string {
  const v = claims[key];
  return typeof v === "string" ? v.trim() : "";
}

export function pickEmail(claims: Record<string, unknown>): string | null {
  for (const key of EMAIL_CLAIMS) {
    const v = str(claims, key);
    if (v.includes("@")) return v.toLowerCase();
  }
  return null;
}

/** Display name, or null when the provider sent nothing usable. */
export function pickName(claims: Record<string, unknown>): string | null {
  for (const [first, last] of NAME_PAIRS) {
    const full = `${str(claims, first)} ${str(claims, last)}`.trim();
    if (full) return full;
  }
  for (const key of NAME_SINGLES) {
    // A provider that puts the address in `name` has told us nothing a name column wants.
    const v = str(claims, key);
    if (v && !v.includes("@")) return v;
  }
  return null;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) return {};
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

export interface OAuthProfile {
  email: string;
  name: string | null;
}

export async function fetchProfile(tokens: TokenResponse): Promise<OAuthProfile | null> {
  const c = oauthConfig();
  let claims: Record<string, unknown> | null = null;

  if (c.userinfoUrl && tokens.access_token) {
    const res = await fetch(c.userinfoUrl, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!res.ok) throw new Error(`Userinfo failed (${res.status})`);
    claims = await res.json();
  } else if (tokens.id_token) {
    // ponytail: id_token read without verifying its signature. It arrived over a direct
    // server-to-server TLS POST to the token endpoint, which OIDC §3.1.3.7 accepts for the
    // authorization-code flow. If an id_token ever reaches us via the browser instead, this
    // must become a jose createRemoteJWKSet + jwtVerify against the provider's JWKS.
    claims = decodeJwtPayload(tokens.id_token);
  }
  if (!claims) return null;

  const email = pickEmail(claims);
  return email ? { email, name: pickName(claims) } : null;
}
