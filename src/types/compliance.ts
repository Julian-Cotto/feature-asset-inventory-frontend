// Compliance / device-hygiene report types — mirror the backend
// report_service payloads.

export interface CheckinExceptionRow {
  asset_id: number;
  serial_number: string;
  asset_tag: string | null;
  intune_device_name: string | null;
  asset_type: string;
  assigned_upn: string | null;
  location_id: number | null;
  location_name: string | null;
  compliance: string | null;
  last_check_in: string | null;
  days_since: number | null;
  never_checked_in: boolean;
}

export interface CheckinExceptions {
  days: number;
  include_never: boolean;
  total: number;
  never_checked_in: number;
  rows: CheckinExceptionRow[];
}

export type OffsiteMode = "subnet" | "meraki";

export interface OffsiteDeviceRow {
  asset_id: number;
  serial_number: string;
  asset_tag: string | null;
  intune_device_name: string | null;
  asset_type: string;
  assigned_upn: string | null;
  defender_last_ip: string;
  is_public_ip: boolean;
  defender_last_seen_at: string | null;
  inhouse_ip: string | null;
  inhouse_last_seen_at: string | null;
  location_id: number | null;
  location_name: string | null;
}

export interface OffsiteDevices {
  mode: OffsiteMode;
  total: number;
  index_count: number;
  index_label: string;
  rows: OffsiteDeviceRow[];
}

export type NamingReason = "mismatch" | "fuzzy";

export interface NamingMismatchRow {
  asset_id: number;
  serial_number: string;
  asset_tag: string | null;
  intune_device_name: string | null;
  asset_type: string;
  assigned_upn: string | null;
  user_display: string | null;
  expected: string | null;
  actual: string;
  reason: NamingReason;
  acknowledged: boolean;
  ack_note: string | null;
  location_id: number | null;
  location_name: string | null;
}

export interface NamingMismatches {
  total: number;
  mismatch_count: number;
  fuzzy_count: number;
  acknowledged_count: number;
  rows: NamingMismatchRow[];
}
