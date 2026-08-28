import { NextRequest, NextResponse } from "next/server";
import { oauthConfig, signState, OAUTH_STATE_COOKIE } from "@/lib/cmu-oauth";

/** Kick off the OAuth dance: bounce the browser to the provider's consent screen. */
export async function GET(request: NextRequest) {
  const c = oauthConfig();

  // Same guard the login page applies to ?next=: same-origin paths only, since "//host"
  // is protocol-relative and would send the user off-site after signing in.
  const raw = request.nextUrl.searchParams.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  const { token, nonce } = await signState(next);

  const url = new URL(c.authorizeUrl);
  url.searchParams.set("client_id", c.clientId);
  url.searchParams.set("redirect_uri", c.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", c.scope);
  url.searchParams.set("state", token);

  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // matches the 10m state JWT
  });
  return response;
}
