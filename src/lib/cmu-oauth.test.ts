// CSRF-state check for the OAuth login bounce. No framework — run with: npm test
// The state pair is the only thing standing between a signed-in user and being walked
// onto an attacker's account, so both halves have to be load-bearing: a forged/tampered
// state must fail the signature, and a replayed one must fail the nonce compare.
import assert from "node:assert";
// Safe to set after import: the secret is read inside getJwtSecret() on every call.
import { signState, readState, pickEmail, pickName, callbackUri } from "@/lib/cmu-oauth";

process.env.JWT_SECRET ||= "test-secret-for-oauth-state-at-least-32-bytes";
process.env.CMU_REDIRECT_URI = "http://localhost:3000/nlu-stock/api/auth/cmu/callback";
process.env.CMU_OAUTH_ORIGINS = "https://tunnel.example.dev, https://lan.example.net/";

async function main() {
  // Round trip: the ?next= destination survives so a QR scan resumes where it left off.
  const ok = await signState("/items/NLU-BAT-001?copy=C02");
  assert.deepEqual(await readState(ok.token, ok.nonce), { next: "/items/NLU-BAT-001?copy=C02" });

  // Nonce cookie missing entirely — an attacker can hand over a state param but cannot
  // write an httpOnly cookie into the victim's browser.
  assert.equal(await readState(ok.token, undefined), null);

  // Nonce present but from a different login attempt.
  const other = await signState("/");
  assert.equal(await readState(ok.token, other.nonce), null);
  assert.equal(await readState(other.token, ok.nonce), null);

  // Signature must hold: flipping a character in the payload invalidates the whole state.
  const [header, payload, sig] = ok.token.split(".");
  const flipped = payload.slice(0, -1) + (payload.at(-1) === "A" ? "B" : "A");
  assert.equal(await readState([header, flipped, sig].join("."), ok.nonce), null);

  // Garbage in, null out — never a throw, the callback turns null into a friendly redirect.
  assert.equal(await readState("not-a-jwt", ok.nonce), null);
  assert.equal(await readState("", ok.nonce), null);

  // ── claim picking ──
  // Two providers, two vocabularies. Neither shape is guaranteed by us, so both are
  // pinned here: a rename on either side should fail loudly rather than silently sign
  // people in as their own email prefix.
  const cmu = {
    cmuitaccount: "Somchai.J@cmu.ac.th",
    firstname_TH: "สมชาย",
    lastname_TH: "ใจดี",
    firstname_EN: "Somchai",
    lastname_EN: "Jaidee",
  };
  assert.equal(pickEmail(cmu), "somchai.j@cmu.ac.th"); // lower-cased for the allowlist
  assert.equal(pickName(cmu), "สมชาย ใจดี"); // Thai wins over English

  const entra = {
    email: "somchai.j@cmu.ac.th",
    given_name: "Somchai",
    family_name: "Jaidee",
    name: "somchai.j@cmu.ac.th",
  };
  assert.equal(pickEmail(entra), "somchai.j@cmu.ac.th");
  assert.equal(pickName(entra), "Somchai Jaidee"); // the name pair beats the `name` claim

  // English-only account still gets a real name.
  assert.equal(pickName({ firstname_EN: "Ann", lastname_EN: "Lee" }), "Ann Lee");
  // Half a pair is still a name, not a blank.
  assert.equal(pickName({ firstname_TH: "สมชาย", lastname_TH: "" }), "สมชาย");

  // A `name` that is really the address is not a name — the caller falls back instead.
  assert.equal(pickName({ name: "somchai.j@cmu.ac.th" }), null);
  assert.equal(pickName({}), null);

  // No address anywhere = no login. Never invent one.
  assert.equal(pickEmail({ name: "Somchai" }), null);
  assert.equal(pickEmail({}), null);

  // ── callback URI ──
  // redirect_uri is the one OAuth parameter an attacker would want to steer: it decides
  // where the authorization code lands. The allowlist and the proxy headers in front of it
  // are what keep a client-supplied Host header from choosing it.
  const h = (init: Record<string, string> = {}) => new Headers(init);
  const LOCAL = "http://localhost:3000";
  const CB = "/nlu-stock/api/auth/cmu/callback";
  const CONFIGURED = process.env.CMU_REDIRECT_URI!;

  // No proxy headers: the request origin is used as-is.
  assert.equal(callbackUri(h(), LOCAL), LOCAL + CB);
  // CMU_REDIRECT_URI's origin is allowed without naming it in CMU_OAUTH_ORIGINS.
  assert.equal(callbackUri(h({ host: "localhost:3000" }), "http://elsewhere"), LOCAL + CB);

  // Behind a TLS-terminating proxy (ngrok) the socket is plain http and the real scheme
  // lives in a header. Reading the socket would build an http:// URI that no longer matches
  // what was registered with the provider.
  assert.equal(
    callbackUri(h({ "x-forwarded-proto": "https", "x-forwarded-host": "tunnel.example.dev" }), LOCAL),
    "https://tunnel.example.dev" + CB,
  );
  // x-forwarded-host absent → `host`, which is what the proxy rewrote.
  assert.equal(
    callbackUri(h({ "x-forwarded-proto": "https", host: "tunnel.example.dev" }), LOCAL),
    "https://tunnel.example.dev" + CB,
  );
  // Chained proxies append; the client-facing hop is the first entry.
  assert.equal(
    callbackUri(h({ "x-forwarded-proto": "https, http", "x-forwarded-host": "tunnel.example.dev, inner" }), LOCAL),
    "https://tunnel.example.dev" + CB,
  );
  // A trailing slash in the env entry must not stop it matching.
  assert.equal(
    callbackUri(h({ "x-forwarded-proto": "https", host: "lan.example.net" }), LOCAL),
    "https://lan.example.net" + CB,
  );

  // Fail closed. An unlisted origin never becomes the redirect_uri; it falls back to the
  // configured one, which the provider accepts, so the code goes nowhere useful to anyone.
  assert.equal(callbackUri(h({ host: "evil.example.com" }), LOCAL), CONFIGURED);
  assert.equal(
    callbackUri(h({ "x-forwarded-proto": "https", "x-forwarded-host": "evil.example.com" }), LOCAL),
    CONFIGURED,
  );
  // Scheme is part of the origin — http:// against an https:// entry is a different origin.
  assert.equal(
    callbackUri(h({ "x-forwarded-proto": "http", host: "tunnel.example.dev" }), LOCAL),
    CONFIGURED,
  );
  // A listed origin is not a substring match.
  assert.equal(
    callbackUri(h({ "x-forwarded-proto": "https", host: "tunnel.example.dev.evil.com" }), LOCAL),
    CONFIGURED,
  );

  console.log("cmu-oauth state + claims + callback uri: ok");
}

main();
