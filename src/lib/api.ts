/**
 * Shared client-side API functions.
 * Replaces scattered `fetch("/api/...")` calls with typed, centralized functions.
 */

import { scopeQuery, type DashboardScope } from "@/lib/dashboard-scope";
import type { AttachRecordType } from "@/lib/attachments";

// ─── Error class ───

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      // ponytail: ngrok free serves an HTML warning page instead of JSON without this; no-op on other hosts.
      "ngrok-skip-browser-warning": "any",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    // Session no longer valid (expired, or the user row is gone after a reseed): the
    // JWT still passes middleware but the API rejects it. Bounce to /login so a stale
    // session self-heals into a fresh one instead of looping on failed writes.
    if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/")) {
      window.location.href = "/login";
    }
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Types ───

export interface CategoryOption {
  id: string;
  name: string;
  profile?: ProfileOption | null;
  description?: string | null;
  sortOrder?: number;
  _count?: { items: number };
}

export interface ProfileOption {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  dispenseType: "CONSUMABLE" | "COUNT" | "ITEM";
  assetTracking: boolean;
  setTracking: boolean;
  icon: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  _count?: { subCategories: number; items: number };
}

export interface LocationOption {
  id: string;
  building: string;
  floor: string;
  room: string;
  detail: string | null;
  _count?: { items: number };
  name?: string;
}

export interface UnitOption {
  id: string;
  name: string;
}

export interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

// ─── Auth ───

export function login(email: string, password: string) {
  return request<{ user: unknown }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return fetch("/api/auth/logout", {
    method: "POST",
    headers: { "ngrok-skip-browser-warning": "any" },
  });
}

export function getSession() {
  return request<{ user: unknown }>("/api/auth/session");
}

// ─── Categories ───

export function getCategories() {
  return request<CategoryOption[]>("/api/settings/categories");
}

export function searchCategories(q: string) {
  const qs = new URLSearchParams({ q }).toString();
  return request<CategoryOption[]>(`/api/settings/categories?${qs}`);
}

export function getPublicCategories() {
  // no-store: the dashboard scope picker must see a category the moment it is added,
  // not a browser-cached list from before.
  return request<CategoryOption[]>("/api/categories", { cache: "no-store" });
}

export function createCategory(data: { name: string; profileId: string; description?: string }) {
  return request<CategoryOption>("/api/settings/categories", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCategory(id: string, data: Record<string, unknown>) {
  return request<CategoryOption>(`/api/settings/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteCategory(id: string) {
  return request<void>(`/api/settings/categories/${id}`, { method: "DELETE" });
}

// ─── Category Profiles (ประเภท) ───

export function getProfiles() {
  return request<ProfileOption[]>("/api/settings/profiles");
}

export function createProfile(data: {
  name: string;
  code: string;
  dispenseType: "CONSUMABLE" | "COUNT" | "ITEM";
  assetTracking?: boolean;
  setTracking?: boolean;
  icon?: string;
  color: string;
  description?: string;
}) {
  return request<ProfileOption>("/api/settings/profiles", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateProfile(id: string, data: Record<string, unknown>) {
  return request<ProfileOption>(`/api/settings/profiles/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteProfile(id: string) {
  return request<void>(`/api/settings/profiles/${id}`, { method: "DELETE" });
}

// ─── Locations ───

export function getLocations() {
  return request<LocationOption[]>("/api/settings/locations");
}

export function getPublicLocations() {
  return request<LocationOption[]>("/api/locations");
}

/** Find-or-create a location (building/floor/room/detail) via POST /api/locations. */
export function findOrCreateLocation(data: {
  building: string;
  floor: string;
  room: string;
  detail?: string | null;
}) {
  return request<LocationOption>("/api/locations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function createLocation(data: {
  building: string;
  floor: string;
  room: string;
  detail?: string | null;
}) {
  return request<LocationOption>("/api/settings/locations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateLocation(id: string, data: Record<string, unknown>) {
  return request<LocationOption>(`/api/settings/locations/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteLocation(id: string) {
  return request<void>(`/api/settings/locations/${id}`, { method: "DELETE" });
}

// ─── Units ───

export interface UnitRow extends UnitOption {
  _count?: { items: number; kitBomItems: number };
}

export function getUnits() {
  return request<UnitRow[]>("/api/settings/units");
}

export function createUnit(data: { name: string }) {
  return request<UnitOption>("/api/settings/units", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateUnit(id: string, data: { name: string }) {
  return request<UnitOption>(`/api/settings/units/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteUnit(id: string) {
  return request<void>(`/api/settings/units/${id}`, { method: "DELETE" });
}

// ─── Quick-create item (ADMIN + STAFF) ───

export interface QuickCreateItemPayload {
  code: string;
  name: string;
  categoryId: string;
  issueUnitId: string;
  copyCount?: number;
  setSize?: number;
  initialQty?: number;
  description?: string;
}

export function quickCreateItem(data: QuickCreateItemPayload) {
  return request<{
    id: string;
    code: string;
    name: string;
    nameEn: string | null;
    trackIndividually: boolean;
    category: { name: string; category: string };
    issueUnit: { id: string; name: string };
    location: { building: string; floor: string; room: string; detail: string | null } | null;
  }>("/api/items/quick-create", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Users ───

export function getUsers() {
  return request<UserOption[]>("/api/users");
}

export function getSettingsUsers() {
  return request<UserOption[]>("/api/settings/users");
}

export function updateSettingsUser(id: string, data: Record<string, unknown>) {
  return request<UserOption>(`/api/settings/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function createSettingsUser(data: Record<string, unknown>) {
  return request<UserOption>("/api/settings/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteSettingsUser(id: string) {
  return request<void>(`/api/settings/users/${id}`, { method: "DELETE" });
}

// ─── Items (public) ───

export function getItems(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return request<{ items: unknown[]; total: number; nextCursor?: string | null }>(`/api/items?${qs}`);
}

export function getItem(id: string) {
  return request<unknown>(`/api/items/${id}`);
}

export function getSubItem(itemId: string, subId: string) {
  return request<unknown>(`/api/items/${itemId}/sub-items/${subId}`);
}

// ─── Items (settings) ───

export function getSettingsItems(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return request<{ items: unknown[]; total: number }>(`/api/settings/items?${qs}`);
}

export function getSettingsItem(id: string) {
  return request<unknown>(`/api/settings/items/${id}`);
}

export function saveSettingsItem(data: Record<string, unknown>, id?: string) {
  const url = id ? `/api/settings/items/${id}` : "/api/settings/items";
  const method = id ? "PUT" : "POST";
  return request<unknown>(url, { method, body: JSON.stringify(data) });
}

export function deleteSettingsItem(id: string) {
  return request<void>(`/api/settings/items/${id}`, { method: "DELETE" });
}

// ─── Dispense ───

export function searchDispenseItems(params: {
  q?: string;
  categoryId?: string;
  profileId?: string;
  building?: string;
  floor?: string;
  room?: string;
  detail?: string;
  perPage?: string;
  page?: string;
}) {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v)
      .map(([k, v]) => [k, v!]),
  ).toString();
  return request<{ items: unknown[]; total: number }>(`/api/dispense/items?${qs}`);
}

export function searchItemsAI(params: { q: string; limit?: number }) {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  return request<{
    items: Array<{
      id: string;
      code: string;
      name: string;
      categoryName: string;
      categoryType: string;
      similarity: number;
    }>;
    total: number;
  }>(`/api/items/search-ai?${qs}`);
}

export interface CourseOption {
  code: string;
  name: string | null;
}

/** `stale` = the CMU upstream was unreachable and this is the last-known-good list. */
export function getCourses() {
  return request<{ courses: CourseOption[]; stale: boolean; syncedAt: string | null }>("/api/courses");
}

export function getCourseName(code: string) {
  return request<CourseOption & { stale: boolean }>(`/api/courses/${encodeURIComponent(code)}`);
}

export function createDispense(data: Record<string, unknown>) {
  return request<{ count: number }>("/api/dispense", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Dispense templates (shared, reusable cart sets) ───

export interface TemplateSummary {
  id: string;
  name: string;
  updatedAt: string;
  createdByName: string;
  lineCount: number;
}

// A loaded line's item — same fields buildCartItem needs.
export interface TemplateLineItem {
  id: string;
  code: string;
  name: string;
  imageUrl: string | null;
  isActive: boolean;
  availableQty: number;
  trackIndividually: boolean;
  category: { name: string; profile: { dispenseType: "CONSUMABLE" | "COUNT" | "ITEM" } };
  issueUnit: { name: string };
  lots: { id: string; lotNumber: string; expiryDate: string | null; remainingQty: number }[];
  subItems: { id: string; subCode: string; condition: string | null }[];
  location: { building: string; floor: string; room: string; detail: string | null } | null;
}

export interface TemplateDetail {
  id: string;
  name: string;
  lines: { id: string; quantity: number; unavailable: boolean; item: TemplateLineItem }[];
}

export interface TemplateLineInput {
  itemId: string;
  quantity: number;
}

export function getDispenseTemplates() {
  return request<{ templates: TemplateSummary[] }>("/api/dispense-templates");
}

export function getDispenseTemplate(id: string) {
  return request<TemplateDetail>(`/api/dispense-templates/${id}`);
}

export function createDispenseTemplate(data: { name: string; lines: TemplateLineInput[] }) {
  return request<{ id: string }>("/api/dispense-templates", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateDispenseTemplate(id: string, data: { name?: string; lines?: TemplateLineInput[] }) {
  return request<{ ok: true }>(`/api/dispense-templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteDispenseTemplate(id: string) {
  return request<{ ok: true }>(`/api/dispense-templates/${id}`, { method: "DELETE" });
}

// ─── Kit recipes & sets ───
// A kit Item is the recipe; each assembled set is a SubItem of it. See lib/kits.ts.

export interface KitComponentInput {
  componentItemId: string;
  quantity: number; // จำนวนต่อ 1 ชุด
}

export interface CreateKitPayload {
  name: string;
  issueUnitId: string;
  components: KitComponentInput[];
}

export interface KitComponent {
  itemId: string;
  code: string;
  name: string;
  /** Unit the item's stock is counted in. */
  unitName: string;
  /** Unit the recipe counts in — "5 ชิ้น" out of an item stocked in กล่อง. */
  bomUnitName: string;
  kind: "TRACKED" | "COUNT" | "CONSUMABLE";
  perSet: number;
  availableQty: number;
}

export interface KitDetail {
  kit: { id: string; code: string; name: string; issueUnit: { id: string; name: string } };
  components: KitComponent[];
  unlinked: { id: string; name: string; quantity: number; unit: { name: string } }[];
  sets: {
    id: string;
    subCode: string;
    status: string;
    /** true = ถูกใช้ไปแล้ว ยังไม่มีใครยืนยันว่าของครบ — ยืมไม่ได้จนกว่าจะกดตรวจ. */
    needsCheck: boolean;
    kitContents: { id: string; subCode: string; item: { id: string; code: string; name: string } }[];
  }[];
  maxSets: number;
  unitMismatches: { itemId: string; name: string; bomUnitName: string; unitName: string }[];
}

export function createKitRecipe(data: CreateKitPayload) {
  return request<{ kitItemId: string; kitCode: string }>("/api/kits", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function fetchKit(kitItemId: string) {
  return request<KitDetail>(`/api/kits/${kitItemId}`);
}

export function updateKitBom(kitItemId: string, components: KitComponentInput[]) {
  return request<{ success: true }>(`/api/kits/${kitItemId}`, {
    method: "PATCH",
    body: JSON.stringify({ components }),
  });
}

export function assembleKit(
  kitItemId: string,
  data: { sets: number; picks?: { componentItemId: string; subItemIds: string[] }[] },
) {
  return request<{ assembledQty: number; setSubItemIds: string[] }>(`/api/kits/${kitItemId}/assemble`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface KitSetContents {
  set: { id: string; subCode: string; status: string; needsCheck: boolean; item: { id: string; code: string; name: string } };
  tracked: { id: string; subCode: string; serialNumber: string | null; item: { id: string; code: string; name: string; issueUnit: { name: string } } }[];
  durables: KitComponent[];
  consumables: KitComponent[];
  /** Tracked slots the recipe expects but nothing fills — a piece reported broken left the box. */
  missingTracked: { itemId: string; code: string; name: string; missing: number }[];
}

export function fetchKitSet(subItemId: string) {
  return request<KitSetContents>(`/api/kits/sets/${subItemId}`);
}

/** ยกเลิกชุด — the exit door. Only for a set that is not out on loan. */
export function cancelKitSet(subItemId: string, data: { note?: string }) {
  return request<{ kitItemId: string; setLabel: string; consumables: { name: string; quantity: number; unitName: string }[] }>(
    `/api/kits/sets/${subItemId}`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

/** ยืนยันตรวจชุด — lifts รอตรวจ. Checks nothing and moves no stock; it records that a human looked. */
export function confirmKitSetChecked(subItemId: string, data: { note?: string }) {
  return request<{ kitItemId: string; setLabel: string }>(`/api/kits/sets/${subItemId}/check`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Receive ───

export function createReceive(data: Record<string, unknown>) {
  return request<{ count: number }>("/api/receive", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** แก้ราคาต่อหน่วยของใบรับเข้าย้อนหลัง — null = ลบราคา (ไม่ทราบ), ต่างจาก 0 (ได้มาฟรี). */
export function updateReceiveUnitCost(id: string, unitCost: number | null) {
  return request<{ id: string; unitCost: number | null }>(`/api/receive/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ unitCost }),
  });
}

// ─── Item actions ───

export function adjustStock(
  itemId: string,
  data: {
    shelfCount?: number;
    lotId?: string | null;
    lotCount?: number;
    stockCount?: boolean;
    reason?: string;
    notes?: string | null;
    imageEvidenceUrls?: string[];
  },
) {
  return request<unknown>(`/api/items/${itemId}/adjust`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateItemStatus(
  itemId: string,
  data: { newStatus: string; subItemId?: string | null; notes?: string | null; imageUrls?: string[]; repairVenue?: "INTERNAL" | "EXTERNAL" | null; repairNote?: string | null; damageNote?: string | null },
) {
  return request<unknown>(`/api/items/${itemId}/status`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function returnItem(itemId: string, data: {
  subItemId?: string;
  dispenseRecordId?: string;
  quantity?: number;
  status?: string;
  note?: string | null;
  proofUrls?: string[];
}) {
  return request<unknown>(`/api/items/${itemId}/return`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Open loans (return tab) ───

export interface OpenBorrow {
  id: string; // dispense record id
  quantity: number;
  resolvedQty: number;
  dispensedAt: string;
  usageType: string | null;
  // เหตุผล is rendered from these three (lib/constants recipientLabel), not from `recipient` —
  // that column only still carries a value on rows written before the cart dropped the field.
  courseCode: string | null;
  usageNote: string | null;
  notes: string | null;
  recipient: string | null;
  loanGroupId: string | null;
  dueAt: string | null;
  returnedAt: string | null;
  itemId: string;
  item: {
    id: string;
    code: string;
    name: string;
    imageUrl: string | null;
    issueUnit: { name: string };
    category: { name: string; profile: { code: string; dispenseType: "CONSUMABLE" | "COUNT" | "ITEM" } };
    location: { building: string; floor: string; room: string; detail: string | null } | null;
    _count: { subItems: number };
  };
  subItem: { id: string; subCode: string; name: string | null; serialNumber: string | null } | null;
  staff: { name: string };
}

export function getOpenBorrows() {
  return request<{ records: OpenBorrow[] }>("/api/returns");
}

export type ReturnCondition = "AVAILABLE" | "DAMAGED" | "LOST";

export function returnLoanEntries(data: {
  // A KIT set ignores `status`: it is returned whole and ปกติ, then unpacked (see api/returns).
  entries: { dispenseRecordId: string; subItemId: string; status: ReturnCondition; note?: string; photos?: string[] }[];
  note?: string | null;
  proofUrls?: string[];
}) {
  return request<{ success: boolean; count: number }>("/api/returns", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Sub-items by status (คืนเข้าพัสดุ / รับซ่อม tabs) ───

export interface SubItemByStatus {
  id: string;
  subCode: string;
  notes: string | null;
  repairVenue: "INTERNAL" | "EXTERNAL" | null;
  damageNote: string | null;
  repairNote: string | null;
  // When the piece entered its current UNDER_REPAIR trip — not the last edit to the repair info.
  repairSentAt: string | null;
  location: { building: string; floor: string; room: string; detail: string | null } | null;
  item: {
    id: string;
    code: string;
    name: string;
    imageUrl: string | null;
    issueUnit: { name: string };
    category: { name: string; profile: { code: string; dispenseType: "CONSUMABLE" | "COUNT" | "ITEM" } };
    location: { building: string; floor: string; room: string; detail: string | null } | null;
    maintenanceCycleMonths: number;
    _count: { subItems: number };
  };
}

export function getSubItemsByStatus(status: "IN_USE" | "UNDER_REPAIR" | "DAMAGED") {
  return request<{ subItems: SubItemByStatus[] }>(`/api/sub-items?status=${status}`);
}

/**
 * One open แจ้งชำรุด booking on non-tracked (qty) stock. Same three stages as a tracked piece:
 * `repairSentAt` null = ชำรุด รอส่งซ่อม, set = อยู่ระหว่างซ่อม.
 */
export interface PendingRepairDamage {
  /** The StockAdjustment id — what ส่งซ่อม and รับคืน both act on (maintenance `adjustmentId`). */
  id: string;
  qty: number;
  notes: string | null;
  adjustedAt: string;
  repairSentAt: string | null;
  repairVenue: "INTERNAL" | "EXTERNAL" | null;
  repairNote: string | null;
  /** รูปหลักฐานก่อนส่งซ่อม + เอกสารประกอบ. */
  imageEvidenceUrls: string[];
  by: string;
  item: {
    id: string;
    code: string;
    name: string;
    imageUrl: string | null;
    issueUnit: { name: string };
    location: { building: string; floor: string; room: string; detail: string | null } | null;
    maintenanceCycleMonths: number;
  };
}

/** stage "damaged" = รอส่งซ่อม (alerts), "repair" = อยู่ระหว่างซ่อม (receive tab). */
export function getPendingRepairDamage(stage: "damaged" | "repair") {
  return request<{ rows: PendingRepairDamage[] }>(`/api/repairs?stage=${stage}`);
}

/** ส่งซ่อม a qty damage booking, or edit the details of a trip already under way. */
export function sendQtyDamageToRepair(data: {
  adjustmentId: string;
  venue: "INTERNAL" | "EXTERNAL";
  repairNote: string;
  damageNote?: string;
}) {
  return request<{ ok: boolean }>("/api/repairs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** ยกเลิกคำขอชำรุด on qty stock — puts the units back. SUPERADMIN only. */
export function cancelQtyDamage(data: { adjustmentId: string; note: string }) {
  return request<{ ok: boolean; qty: number }>("/api/repairs", {
    method: "DELETE",
    body: JSON.stringify(data),
  });
}

/** One open นำไปใช้งาน record. Covers both kinds: `subItem` is null for COUNT stock. */
export interface InUseRecord {
  id: string;
  quantity: number;
  resolvedQty: number;
  dispensedAt: string;
  // The recipientLabel inputs — see the select in api/dispense/in-use.
  notes: string | null;
  usageType: string | null;
  courseCode: string | null;
  usageNote: string | null;
  recipient: string | null;
  location: { id: string; building: string; floor: string; room: string; detail: string | null } | null;
  staff: { name: string };
  subItem: { id: string; subCode: string; name: string | null; serialNumber: string | null } | null;
  item: {
    id: string;
    code: string;
    name: string;
    imageUrl: string | null;
    trackIndividually: boolean;
    locationId: string | null;
    issueUnit: { name: string };
    location: { building: string; floor: string; room: string; detail: string | null } | null;
    _count: { subItems: number };
  };
}

/**
 * `scope` is optional and only its ประเภท/หมวดย่อย half is sent — the endpoint is นำไปใช้งาน
 * by definition, so its `tab` would be noise (and, absent, would default the route to
 * CONSUMABLE). Omitting scope keeps the whole-warehouse list /receive คืนเข้าคลัง needs.
 */
export function getInUseRecords(scope?: DashboardScope) {
  const qs = new URLSearchParams();
  if (scope?.profileId) qs.set("profileId", scope.profileId);
  if (scope?.categoryId) qs.set("categoryId", scope.categoryId);
  const q = qs.toString();
  return request<{ records: InUseRecord[] }>(`/api/dispense/in-use${q ? `?${q}` : ""}`);
}

export function returnInUseRecord(
  recordId: string,
  body: { quantity?: number; note?: string | null },
) {
  return request<{ success: boolean; quantity: number }>(
    `/api/dispense/in-use/${recordId}/return`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function updateItem(itemId: string, data: Record<string, unknown>) {
  return request<unknown>(`/api/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/**
 * One repair job still open on an item — the "case" the item's timeline can only be read back
 * into. `kind` says which half of the stock model it came from; the screen treats them alike.
 */
export interface OpenRepairCase {
  kind: "PIECE" | "QTY";
  /** SubItem id (PIECE) or the แจ้งชำรุด StockAdjustment id (QTY). */
  id: string;
  stage: "DAMAGED" | "UNDER_REPAIR";
  subCode: string | null;
  qty: number;
  damageNote: string | null;
  repairVenue: "INTERNAL" | "EXTERNAL" | null;
  repairNote: string | null;
  reportedAt: string | null;
  repairSentAt: string | null;
  by: string | null;
}

/** Open repair jobs on one item, or on one tracked copy when `subItemId` is given. */
export function getOpenRepairs(itemId: string, subItemId?: string) {
  const qs = subItemId ? `?subItemId=${subItemId}` : "";
  return request<{ cases: OpenRepairCase[] }>(`/api/items/${itemId}/open-repairs${qs}`);
}

export function getItemHistory(itemId: string, params?: string) {
  const qs = params || "perPage=3";
  return request<{ events: unknown[] }>(`/api/items/${itemId}/history?${qs}`);
}

/** Put stock back: `kind` LOST = เรียกคืนสูญหาย (default), DAMAGED = รับคืนจากซ่อม. */
export function recoverStock(
  itemId: string,
  data: { source: "PIECE" | "ADJUSTMENT"; recordId: string; note?: string },
) {
  return request<{ ok: boolean; qty: number }>(`/api/items/${itemId}/recover`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Partial update of a sub-item (serial/condition/notes/locationId/imageUrl/images).
 *  STAFF+ route — PUT /api/items/:id/sub-items/:subId. */
export function updateSubItemFields(itemId: string, subId: string, data: Record<string, unknown>) {
  return request<unknown>(`/api/items/${itemId}/sub-items/${subId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function createMaintenance(itemId: string, data: Record<string, unknown>) {
  return request<unknown>(`/api/items/${itemId}/maintenance`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Sub-items ───

export function getSubItems(itemId: string) {
  return request<unknown[]>(`/api/settings/items/${itemId}/sub-items`);
}

export function createSubItem(itemId: string, data: Record<string, unknown>) {
  return request<unknown>(`/api/settings/items/${itemId}/sub-items`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateSubItem(subItemId: string, data: Record<string, unknown>) {
  return request<unknown>(`/api/settings/sub-items/${subItemId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteSubItem(subItemId: string) {
  return request<void>(`/api/settings/sub-items/${subItemId}`, { method: "DELETE" });
}

// ─── Upload ───

export function uploadFile(formData: FormData) {
  return fetch("/api/upload", {
    method: "POST",
    body: formData,
    headers: { "ngrok-skip-browser-warning": "any" },
  }).then(async (res) => {
    if (!res.ok) {
      // The endpoint says exactly why it refused (wrong type, too big, bytes disagree with the
      // declared type); a hardcoded "Upload failed" here would swallow all of it.
      const body = await res.json().catch(() => null);
      throw new ApiError(res.status, body?.error || "อัปโหลดไม่สำเร็จ");
    }
    return res.json() as Promise<{ url: string }>;
  });
}

/** หลักฐานแนบย้อนหลัง — แนบเพิ่ม/ลบ on a record that was written earlier. Returns the array as it
 *  now stands, so the caller renders the server's answer rather than its own optimistic guess. */
export function changeAttachments(data: {
  recordType: AttachRecordType;
  recordId: string;
  add?: string[];
  remove?: string[];
}) {
  return request<{ urls: string[] }>("/api/attachments", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface AttachmentLogEntry {
  id: string;
  url: string;
  action: "ADD" | "REMOVE";
  at: string;
  by: string;
}

/** ประวัติไฟล์แนบ, fetched only when someone opens the popover. */
export function getAttachmentLog(recordType: AttachRecordType, recordId: string) {
  return request<{ entries: AttachmentLogEntry[] }>(
    `/api/attachments?recordType=${recordType}&recordId=${encodeURIComponent(recordId)}`,
  );
}

// ─── Maintenance ───

export function getMaintenanceSummary() {
  return request<{ overdue: number; dueSoon: number; completedThisMonth: number }>(
    "/api/maintenance/summary",
  );
}

// ─── Alerts ───

export function getAlerts() {
  return request<{ lowStock: number; nearExpiry: number; overdueMaintenance: number; overdueReturn: number; damagedPending: number; dueCount: number; total: number; totalItems: number; onLoan: number }>(
    "/api/alerts",
  );
}

// ─── Import ───

export function importRows(type: string, rows: Record<string, string>[]) {
  return request<{ imported: number; errors?: unknown[] }>("/api/settings/import", {
    method: "POST",
    body: JSON.stringify({ type, rows }),
  });
}

// ─── Dashboard ───

// Every widget is scoped by the dashboard tab (DispenseKind — เบิกใช้ / ยืม / นำไปใช้งาน)
// plus its optional ประเภท/หมวดย่อย filter. See lib/dashboard-scope.ts.
const dash = (path: string, scope: DashboardScope) =>
  request<unknown>(`/api/dashboard/${path}${scopeQuery(scope)}`);

export const getDashboardTabSummary = (s: DashboardScope) => dash("tab-summary", s);
export const getDashboardFlowMonthly = (s: DashboardScope) => dash("flow-monthly", s);
export const getDashboardLoanDuration = (s: DashboardScope) => dash("loan-duration", s);
export const getDashboardOutstandingLoans = (s: DashboardScope) => dash("outstanding-loans", s);
export const getDashboardAssetStatus = (s: DashboardScope) => dash("asset-status", s);
export const getDashboardDispenseByUsageMonthly = (s: DashboardScope) => dash("dispense-by-usage-monthly", s);
export const getDashboardRecentDispense = (s: DashboardScope) => dash("recent-dispense", s);
export const getDashboardRecentReceive = (s: DashboardScope) => dash("recent-receive", s);
export const getDashboardTopDispense = (s: DashboardScope) => dash("top-dispense", s);
export const getDashboardTopCourses = (s: DashboardScope) => dash("top-courses", s);
export const getDashboardStationByRoom = (s: DashboardScope) => dash("station-by-room", s);

// Unscoped: the whole-warehouse map above the tabs, grouped by CategoryProfile — it is how
// you pick which tab to open, so it cannot itself depend on the current one.
export function getDashboardProfileSummary() {
  return request<unknown[]>("/api/dashboard/profile-summary");
}

// ─── Reports ───

export function getReport(path: string, params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  return request<unknown>(`/api/reports/${path}${qs}`);
}
