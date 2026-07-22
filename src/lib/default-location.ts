/**
 * Seed fallback location id assigned by prisma/seed.ts to every Item whose
 * source row had no room — getOrCreateLocation("อาคาร 2", "ชั้น 4", "402").
 *
 * NOT a real location (it covers ~64% of items across 5 unrelated categories).
 * Any code that copies a parent Item's location onto a SubItem must skip this
 * id so the wrong default isn't baked into every piece.
 *
 * Single source for both runtime (route handlers) and one-off scripts
 * (scripts/backfill-subitem-location.ts) — import from here, don't re-hardcode.
 */
export const DEFAULT_LOCATION_ID = "cmrkbb2hn0017lcxwaykidcmg";
