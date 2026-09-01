import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The CSV template download joins `headers` and `example` into two lines of one file
 * (api/settings/import GET). Nothing ties their lengths together, so dropping a column
 * from one and not the other ships a template whose sample row is shifted one field —
 * silently, since both arrays are still valid TS. That is exactly how the setSize
 * removal broke items-bat: 10 headers, 11 example fields, "10" landing under description.
 *
 * ponytail: reads the route source rather than exporting TEMPLATES — an App Router route
 * file may only export handlers and known route config, so exporting it would mean moving
 * TEMPLATES to its own module for one assert. The template count is asserted too, so a
 * reformat that defeats the regex fails loudly instead of vacuously passing.
 */
const SOURCE = "src/app/api/settings/import/route.ts";
const EXPECTED_TEMPLATES = 7;

test("every import CSV template has one example field per header", () => {
  const src = readFileSync(SOURCE, "utf8");
  const body = src.slice(src.indexOf("const TEMPLATES"));
  const re = /"([a-z-]+)":\s*\{\s*headers:\s*(\[[^\]]*\]),\s*example:\s*(\[[^\]]*\]),/g;

  const seen: string[] = [];
  for (const m of body.matchAll(re)) {
    const [, name, headersLit, exampleLit] = m;
    const headers: string[] = JSON.parse(headersLit);
    const example: string[] = JSON.parse(exampleLit);
    seen.push(name);
    assert.equal(
      example.length,
      headers.length,
      `template "${name}": ${headers.length} headers but ${example.length} example fields`,
    );
  }

  assert.equal(
    seen.length,
    EXPECTED_TEMPLATES,
    `parsed ${seen.length} templates (${seen.join(", ")}), expected ${EXPECTED_TEMPLATES} — ` +
      `if a template was added or removed on purpose, update EXPECTED_TEMPLATES; ` +
      `otherwise the literal was reformatted and this check is no longer reading it`,
  );
});
