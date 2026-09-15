import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret, OAUTH_STATE_AUD } from "./auth-config";
import { BASE_PATH } from "./base-path";

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
    // The default callback URI, and the origin that seeds the callbackUri() allowlist. Must
    // match what is registered with the provider byte for byte, basePath included, or the
    // provider rejects the exchange with redirect_uri_mismatch.
    redirectUri: required("CMU_REDIRECT_URI"),
    authorizeUrl: required("CMU_OAUTH_URL"),
    tokenUrl: required("CMU_TOKEN_URL"),
    /** Optional. Unset = read the email out of the id_token instead. */
    userinfoUrl: process.env.CMU_USERINFO_URL || "",
    scope: process.env.CMU_SCOPE || "openid profile email",
  };
}

// ─── Callback URI ───
// The provider only accepts a redirect_uri that is registered against the client id, and
// the token exchange must repeat the exact same string. One env value was enough while the
// app only ever ran on one host; a tunnel (ngrok) or a second machine needs a second URI
// without editing env and re-logging-in every time you switch.

const CALLBACK_PATH = BASE_PATH + "/api/auth/cmu/callback";

/** Origins permitted to receive the callback. CMU_REDIRECT_URI's own origin is always in —
 *  it is the registered one — and CMU_OAUTH_ORIGINS adds tunnels/LAN hosts for testing. */
function allowedOrigins(): string[] {
  const out = [new URL(required("CMU_REDIRECT_URI")).origin];
  for (const raw of (process.env.CMU_OAUTH_ORIGINS ?? "").split(",")) {
    const v = raw.trim().replace(/\/$/, "");
    if (v) out.push(v);
  }
  return out;
}

/**
 * Which callback URI this request should use. Derived from the origin the browser actually
 * reached us on, so localhost and a tunnel work at the same time — but ONLY if that origin
 * is allowlisted: `host` is a client-supplied header, and an attacker who could steer
 * redirect_uri would be pointing the authorization code at themselves. Unknown origin falls
 * back to the configured URI, which fails visibly at the provider rather than silently.
 *
 * Behind a TLS-terminating proxy (ngrok, the faculty server) the socket is plain http and
 * the real scheme/host only exist in headers — read those first or the derived URI says
 * `http://` and no longer matches what was registered.
 */
export function callbackUri(headers: Headers, fallbackOrigin: string): string {
  const first = (v: string | null) => v?.split(",")[0]?.trim() || "";
  const proto = first(headers.get("x-forwarded-proto"));
  const host = first(headers.get("x-forwarded-host")) || first(headers.get("host"));
  const origin = proto && host ? `${proto}://${host}` : fallbackOrigin;
  return allowedOrigins().includes(origin)
    ? origin + CALLBACK_PATH
    : required("CMU_REDIRECT_URI");
}

// ─── CSRF state ───
// Signed JWT in the `state` param + matching nonce in an httpOnly cookie. Either half alone
// is useless: a forged state fails the signature, and a replayed state fails the nonce
// compare. Without this an attacker can walk a signed-in user onto *their* account.

// This token is handed to the browser in a URL, and it is signed with the same secret as the
// session cookie — so it is stamped with its own `aud` and verified against it, and a session
// token can never be replayed as a state (nor a state as a session). See auth-config.
export async function signState(next: string) {
  const nonce = crypto.randomUUID();
  const token = await new SignJWT({ nonce, next })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(OAUTH_STATE_AUD)
    .setExpirationTime("10m")
    .setIssuedAt()
    .sign(getJwtSecret());
  return { token, nonce };
}

export async function readState(state: string, nonceCookie: string | undefined) {
  if (!nonceCookie) return null;
  const secret = getJwtSecret(); // นอก try ด้วยเหตุผลเดียวกับ verifyToken
  try {
    const { payload } = await jwtVerify(state, secret, { audience: OAUTH_STATE_AUD });
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

/** `redirectUri` must be byte-for-byte the one sent to /authorize — the provider compares
 *  them and rejects the exchange otherwise. Callers get it from callbackUri(). */
export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const c = oauthConfig();
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
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
  /** itaccounttype_EN from CMU basicinfo. null when the provider answered from an id_token,
   *  which carries no such claim — roleForProfile then denies anyone not in an env list. */
  accountType: string | null;
  /** organization_code from CMU basicinfo. Same null caveat as accountType. */
  orgCode: string | null;
  /** organization_name_TH from CMU basicinfo. Same null caveat as accountType. */
  orgName: string | null;
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
  if (!email) return null;
  return {
    email,
    name: pickName(claims),
    // CMU basicinfo v3 only. Kept as raw strings — lib/roles decides what they mean, this
    // file just stops throwing them away.
    accountType: str(claims, "itaccounttype_EN") || null,
    orgCode: str(claims, "organization_code") || null,
    orgName: str(claims, "organization_name_TH") || null,
  };
}
