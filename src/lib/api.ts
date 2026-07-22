/**
 * Shared client-side API functions.
 * Replaces scattered `fetch("/api/...")` calls with typed, centralized functions.
 */

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
      ...init?.headers,
    },
  });
  if (!res.ok) {
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
  return fetch("/api/auth/logout", { method: "POST" });
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
  return request<CategoryOption[]>("/api/categories");
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

export function getUnits() {
  return request<UnitOption[]>("/api/settings/units");
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

export function createDispense(data: Record<string, unknown>) {
  return request<{ count: number }>("/api/dispense", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Kit assembly ───

export interface KitComponentInput {
  componentItemId: string;
  quantity: number; // จำนวนต่อ 1 ชุด
}

export interface AssembleKitPayload {
  name: string;
  issueUnitId: string;
  components: KitComponentInput[];
  assembleQty: number;
}

export function assembleKit(data: AssembleKitPayload) {
  return request<{ kitItemId: string; kitCode: string; assembledQty: number }>("/api/kits", {
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
    imageEvidence?: string | null;
  },
) {
  return request<unknown>(`/api/items/${itemId}/adjust`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateItemStatus(
  itemId: string,
  data: { newStatus: string; subItemId?: string | null; notes?: string | null; imageUrl?: string | null; repairVenue?: "INTERNAL" | "EXTERNAL" | null; repairNote?: string | null },
) {
  return request<unknown>(`/api/items/${itemId}/status`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function bulkUpdateSubItemStatus(
  itemId: string,
  data: { subItemIds: string[]; newStatus: string; notes?: string | null; imageUrl?: string | null },
) {
  return request<{ availableQty: number; totalQty: number }>(`/api/items/${itemId}/status/bulk`, {
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
    category: { name: string; profile: { dispenseType: "CONSUMABLE" | "COUNT" | "ITEM" } };
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
  location: { building: string; floor: string; room: string; detail: string | null } | null;
  item: {
    id: string;
    code: string;
    name: string;
    imageUrl: string | null;
    issueUnit: { name: string };
    category: { name: string; profile: { dispenseType: "CONSUMABLE" | "COUNT" | "ITEM" } };
    location: { building: string; floor: string; room: string; detail: string | null } | null;
    _count: { subItems: number };
  };
}

export function getSubItemsByStatus(status: "IN_USE" | "UNDER_REPAIR" | "DAMAGED") {
  return request<{ subItems: SubItemByStatus[] }>(`/api/sub-items?status=${status}`);
}

export function updateItem(itemId: string, data: Record<string, unknown>) {
  return request<unknown>(`/api/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function getItemHistory(itemId: string, params?: string) {
  const qs = params || "perPage=3";
  return request<{ events: unknown[] }>(`/api/items/${itemId}/history?${qs}`);
}

export function recoverLoss(itemId: string, data: { source: "PIECE" | "ADJUSTMENT"; recordId: string; note?: string }) {
  return request<{ ok: boolean; qty: number }>(`/api/items/${itemId}/recover-loss`, {
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
  return fetch("/api/upload", { method: "POST", body: formData }).then(async (res) => {
    if (!res.ok) throw new ApiError(res.status, "Upload failed");
    return res.json() as Promise<{ url: string }>;
  });
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

export function getDashboardDispenseMonthly() {
  return request<unknown[]>("/api/dashboard/dispense-monthly");
}

export function getDashboardProfileSummary() {
  return request<unknown[]>("/api/dashboard/profile-summary");
}

export function getDashboardRecentDispense() {
  return request<unknown[]>("/api/dashboard/recent-dispense");
}

export function getDashboardRecentReceive() {
  return request<unknown[]>("/api/dashboard/recent-receive");
}

export function getDashboardTopDispense(categoryId?: string, profileId?: string) {
  const qs = new URLSearchParams();
  if (categoryId) qs.set("categoryId", categoryId);
  if (profileId) qs.set("profileId", profileId);
  const q = qs.toString();
  return request<unknown[]>(`/api/dashboard/top-dispense${q ? `?${q}` : ""}`);
}

export function getDashboardUsageBySubject(categoryId?: string, profileId?: string) {
  const qs = new URLSearchParams();
  if (categoryId) qs.set("categoryId", categoryId);
  if (profileId) qs.set("profileId", profileId);
  const q = qs.toString();
  return request<unknown[]>(`/api/dashboard/usage-by-subject${q ? `?${q}` : ""}`);
}

// ─── Reports ───

export function getReport(path: string, params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  return request<unknown>(`/api/reports/${path}${qs}`);
}
