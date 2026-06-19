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

/** ใช้แล้วทิ้ง → lot tracking, นับ remaining. */
export function isConsumable(p: ProfileLike | null | undefined): boolean {
  return req(p).dispenseType === "CONSUMABLE";
}

/** ยืม-คืน รายชิ้น → subItems. */
export function isItemTracked(p: ProfileLike | null | undefined): boolean {
  return req(p).dispenseType === "ITEM";
}

// ── Profile-driven item field enforcement (D4) ──

/** Fixed-asset fields only meaningful when profile.assetTracking is true. */
const ASSET_FIELDS = [
  "model", "purchaseDate", "purchasePrice",
  "vendorCompany", "vendorContact", "vendorPhone",
  "warrantyMonths", "maintenanceCycleMonths",
  "lastMaintenanceDate", "nextMaintenanceDate", "manualUrl",
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
  if (!profile.setTracking) {
    data.setSize = 1;
    data.borrowable = false;
  }
  if (profile.dispenseType !== "CONSUMABLE") {
    delete data.storageRequirements;
  }
}

// ── Display labels (server-side; client reads profile.name/icon/color directly) ──

export const DISPENSE_TYPE_LABELS: Record<ProfileLike["dispenseType"], string> = {
  CONSUMABLE: "ใช้แล้วทิ้ง",
  COUNT: "ยืม-คืน นับจำนวน",
  ITEM: "ยืม-คืน รายชิ้น",
};
