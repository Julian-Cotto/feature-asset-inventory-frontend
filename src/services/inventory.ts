import { apiDelete, apiGet, apiPatch, apiPost } from "./apiClient";
import type {
  Asset,
  AssetAssignPayload,
  AssetCreatePayload,
  AssetHistoryEntry,
  AssetStatus,
  AssetStatusChangePayload,
  AssetStatusCreatePayload,
  DashboardStats,
  IntuneSyncResponse,
  Location,
  LocationCreatePayload,
  LookupResult,
} from "../types/inventory";

// statuses
export const listStatuses = (includeInactive = false) =>
  apiGet<AssetStatus[]>(`/statuses?include_inactive=${includeInactive}`);

export const createStatus = (payload: AssetStatusCreatePayload) =>
  apiPost<AssetStatus>("/statuses", payload);

export const updateStatus = (
  code: string,
  payload: Partial<AssetStatusCreatePayload>,
) => apiPatch<AssetStatus>(`/statuses/${encodeURIComponent(code)}`, payload);

// locations
export const listLocations = (includeInactive = false) =>
  apiGet<Location[]>(`/locations?include_inactive=${includeInactive}`);

export const getLocation = (id: number) =>
  apiGet<Location>(`/locations/${id}`);

export const createLocation = (payload: LocationCreatePayload) =>
  apiPost<Location>("/locations", payload);

export const updateLocation = (
  id: number,
  payload: Partial<LocationCreatePayload>,
) => apiPatch<Location>(`/locations/${id}`, payload);

export const deleteLocation = (id: number) =>
  apiDelete<void>(`/locations/${id}`);

// assets
export interface AssetsQuery {
  q?: string;
  asset_type?: string;
  status_code?: string;
  location_id?: number;
  assigned_upn?: string;
  model?: string;
  manufacturer?: string;
  include_archived?: boolean;
  available_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface AssetFacetRow {
  asset_type: string;
  manufacturer: string | null;
  model: string | null;
  series: string | null;
  generation: string | null;
  count: number;
}

export interface AssetFacets {
  models: AssetFacetRow[];
}

export const getAssetFacets = (availableOnly = false) =>
  apiGet<AssetFacets>(
    `/assets/facets${availableOnly ? "?available_only=true" : ""}`,
  );

function toQuery(q: AssetsQuery): string {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  });
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const listAssets = (q: AssetsQuery = {}) =>
  apiGet<Asset[]>(`/assets${toQuery(q)}`);

export const getAsset = (id: number) => apiGet<Asset>(`/assets/${id}`);

export const lookupAssetBySerial = (serial: string) =>
  apiGet<Asset>(`/assets/lookup?serial=${encodeURIComponent(serial)}`);

export const onboardAsset = (payload: AssetCreatePayload) =>
  apiPost<Asset>("/assets", payload);

export interface BulkLocationResult {
  updated: number;
  unchanged: number;
  skipped: number;
  errors: { asset_id: number | null; error: string }[];
}

export const bulkSetLocation = (
  asset_ids: number[],
  location_id: number | null,
) =>
  apiPost<BulkLocationResult>("/assets/bulk-location", {
    asset_ids,
    location_id,
  });

export const updateAsset = (
  id: number,
  payload: Partial<AssetCreatePayload>,
) => apiPatch<Asset>(`/assets/${id}`, payload);

export const assignAsset = (id: number, payload: AssetAssignPayload) =>
  apiPost<Asset>(`/assets/${id}/assign`, payload);

export const unassignAsset = (id: number) =>
  apiPost<Asset>(`/assets/${id}/unassign`, {});

export const changeAssetStatus = (
  id: number,
  payload: AssetStatusChangePayload,
) => apiPost<Asset>(`/assets/${id}/status`, payload);

export const archiveAsset = (id: number, notes?: string) =>
  apiPost<Asset>(`/assets/${id}/archive`, { notes });

export const getAssetHistory = (id: number) =>
  apiGet<AssetHistoryEntry[]>(`/assets/${id}/history`);

// vendor lookup (Lenovo / Meraki / UPC / Intune merge) — best-effort
export const lookupDevice = (code: string) =>
  apiGet<LookupResult>(`/lookup?code=${encodeURIComponent(code)}`);

// Intune — on-demand sync + portal deep link
export const syncAssetFromIntune = (assetId: number) =>
  apiPost<IntuneSyncResponse>(`/assets/${assetId}/intune/sync`);

export const getIntunePortalUrl = (assetId: number) =>
  apiGet<{ url: string }>(`/assets/${assetId}/intune/portal-url`);

export interface IntuneBulkSyncResult {
  total_devices: number;
  created: number;
  updated: number;
  skipped_no_serial: number;
  skipped_non_computer: number;
  errors: { intune_id: string | null; serial: string | null; error: string }[];
}

export const bulkSyncFromIntune = () =>
  apiPost<IntuneBulkSyncResult>(`/intune/bulk-sync`);

export interface VendorRefreshResult {
  checked: number;
  updated: number;
  no_match: number;
  errors: { asset_id: number; serial: string; error: string }[];
}

export const refreshVendorModels = () =>
  apiPost<VendorRefreshResult>(`/assets/vendor-refresh`);

export interface LocationSyncResult {
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  errors: { location_id: string | null; error: string }[];
  dry_run: boolean;
}

export const syncLocationsFromSnowflake = (dryRun = false) =>
  apiPost<LocationSyncResult>(
    `/locations/sync${dryRun ? "?dry_run=true" : ""}`,
  );

// dashboard
export const getDashboardStats = () => apiGet<DashboardStats>(`/stats`);
