export type AssetType =
  | "laptop"
  | "desktop"
  | "thin_client"
  | "ap"
  | "switch"
  | "gateway";

export type LookupSource = "meraki" | "lenovo" | "upc" | "unknown";

export interface LookupResult {
  code: string;
  source: LookupSource;
  assetType: AssetType | null;
  manufacturer: string | null;
  model: string | null;
  series: string | null;
  generation: string | null;
  cpu: string | null;
  os: string | null;
  osVersion: string | null;
  intuneId: string | null;
  assignedUpn: string | null;
  raw: unknown;
  cached: boolean;
  error: string | null;
}

export interface IntuneSyncResponse {
  asset: Asset;
  found: boolean;
  changed: string[];
}
export type LocationType = "warehouse" | "site";

export interface AssetStatus {
  code: string;
  label: string;
  is_terminal: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface Location {
  id: number;
  code: string;
  name: string;
  type: LocationType;
  address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  is_active: boolean;
}

export interface Asset {
  id: number;
  asset_tag: string | null;
  serial_number: string;
  asset_type: AssetType;
  manufacturer: string | null;
  model: string | null;
  override_model: string | null;
  series: string | null;
  generation: string | null;
  cpu: string | null;
  os: string | null;
  os_version: string | null;
  status_code: string;
  location_id: number | null;
  location_name: string | null;
  location_code: string | null;
  assigned_upn: string | null;
  assigned_at: string | null;
  onboarded_at: string;
  archived_at: string | null;
  notes: string | null;
  intune_id: string | null;
  intune_synced_at: string | null;
  intune_device_name: string | null;
  intune_managed_by: string | null;
  intune_ownership: string | null;
  intune_compliance: string | null;
  intune_last_check_in: string | null;
  warranty_active: boolean | null;
  warranty_end_date: string | null;
  warranty_synced_at: string | null;
}

export interface SeriesPoint {
  date: string;
  count: number;
}

export interface DashboardStats {
  assets: {
    total: number;
    by_status: { code: string; count: number }[];
    by_type: { type: string; count: number }[];
  };
  warranty: {
    on: number;
    off: number;
    unknown: number;
    expiring_30d: number;
    expiring_60d: number;
    expiring_90d: number;
  };
  intune: {
    last_bulk_sync_at: string | null;
    stale_7d_count: number;
    synced_count: number;
  };
  shipments: {
    open: number;
    in_transit: number;
    exception: number;
  };
  deployments: {
    planning: number;
    in_progress: number;
    completed_30d: number;
  };
  onboards_30d: SeriesPoint[];
  warranty_changes_30d: SeriesPoint[];
}

export interface AssetHistoryEntry {
  id: number;
  asset_id: number;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  performed_by_upn: string | null;
  performed_at: string;
  notes: string | null;
}

export interface AssetCreatePayload {
  asset_tag?: string | null;
  serial_number: string;
  asset_type: AssetType;
  manufacturer?: string | null;
  model?: string | null;
  override_model?: string | null;
  series?: string | null;
  generation?: string | null;
  cpu?: string | null;
  os?: string | null;
  os_version?: string | null;
  status_code?: string;
  location_id?: number | null;
  notes?: string | null;
  intune_id?: string | null;
}

export interface AssetAssignPayload {
  assigned_upn?: string | null;
  location_id?: number | null;
  notes?: string | null;
}

export interface AssetStatusChangePayload {
  status_code: string;
  notes?: string | null;
}

export interface LocationCreatePayload {
  code: string;
  name: string;
  type: LocationType;
  address?: string | null;
  is_active?: boolean;
}

export interface AssetStatusCreatePayload {
  code: string;
  label: string;
  is_terminal?: boolean;
  sort_order?: number;
  is_active?: boolean;
}
