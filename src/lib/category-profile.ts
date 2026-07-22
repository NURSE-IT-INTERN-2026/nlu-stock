/**
 * Derive helpers for CategoryProfile. Single source of truth for all behavior
 * that used to branch on the Category enum.
 *
 * Used by both server and client. A profile object is passed in (typically from
 * an `include: { profile: true }` query). If null → throws, so a missing
 * profileId surfaces loudly instead of silently degrading.
 */

export interface ProfileLike {
  dispenseType: "CONSUMABLE" | "COUNT" | "ITEM";
  assetTracking: boolean;
  setTracking: boolean;
}

function req(p: ProfileLike | null | undefined): ProfileLike {
  if (!p) {
    throw new Error(
      "category-profile: profile is null — profileId not backfilled or missing include",
    );
  }
  return p;
}

/** ยืม-คืน รายชิ้น → subItems. */
export function isItemTracked(p: ProfileLike | null | undefined): boolean {
  return req(p).dispenseType === "ITEM";
}

// ── Profile-driven item field enforcement (D4) ──

/** Procurement/warranty fields only meaningful when profile.assetTracking is true. */
const ASSET_FIELDS = [
  "model", "purchaseDate", "purchasePrice",
  "vendorCompany", "vendorContact", "vendorPhone",
  "warrantyMonths", "manualUrl",
] as const;

/**
 * Maintenance is not a ครุภัณฑ์-only concern — วัสดุคงทน and หนังสือ/ของเล่น get
 * repaired and serviced too, so they own a cycle. Only consumables are excluded:
 * they're used up, never maintained.
 */
const MAINTENANCE_FIELDS = [
  "maintenanceCycleMonths", "lastMaintenanceDate", "nextMaintenanceDate",
] as const;

/**
 * Strip/clamp item payload fields the profile doesn't permit, so stored data
 * can't drift from what the form exposes. Mutates in place; Prisma skips
 * deleted keys. Call after parsing, before the write.
 */
export function sanitizeItemByProfile(
  profile: ProfileLike | null | undefined,
  data: Record<string, unknown>,
): void {
  if (!profile) return;
  if (!profile.assetTracking) {
    for (const f of ASSET_FIELDS) delete data[f];
  }
  if (profile.dispenseType === "CONSUMABLE") {
    for (const f of MAINTENANCE_FIELDS) delete data[f];
  }
  if (!profile.setTracking) {
    data.setSize = 1;
    data.borrowable = false;
  }
  if (profile.dispenseType !== "CONSUMABLE") {
    delete data.storageRequirements;
  }
}
