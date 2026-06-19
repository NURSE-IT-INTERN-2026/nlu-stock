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
  isComposite: boolean;
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

/** KIT: dispense → deduct linked component stock. */
export function isComposite(p: ProfileLike | null | undefined): boolean {
  return req(p).isComposite;
}

// ── Display labels (server-side; client reads profile.name/icon/color directly) ──

export const DISPENSE_TYPE_LABELS: Record<ProfileLike["dispenseType"], string> = {
  CONSUMABLE: "ใช้แล้วทิ้ง",
  COUNT: "ยืม-คืน นับจำนวน",
  ITEM: "ยืม-คืน รายชิ้น",
};
