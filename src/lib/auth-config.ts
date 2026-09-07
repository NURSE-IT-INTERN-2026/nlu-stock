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

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}
