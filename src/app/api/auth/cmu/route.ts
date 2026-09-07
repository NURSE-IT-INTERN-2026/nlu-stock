import { NextRequest, NextResponse } from "next/server";
import { oauthConfig, signState, callbackUri, OAUTH_STATE_COOKIE } from "@/lib/cmu-oauth";

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
  // Derived from the origin this request arrived on, not a fixed env value, so localhost and
  // a tunnel both work. The callback repeats the same computation and must reach the same
  // string — the provider compares them.
  url.searchParams.set("redirect_uri", callbackUri(request.headers, request.nextUrl.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", c.scope);
  url.searchParams.set("state", token);

  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    // See the callback route: TLS is terminated upstream, so the socket protocol says http
    // in production and would strip Secure off the CSRF nonce.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // matches the 10m state JWT
  });
  return response;
}
