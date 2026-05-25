export const COOKIE_NAME = "session_token";

export function getJwtSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET!);
}
