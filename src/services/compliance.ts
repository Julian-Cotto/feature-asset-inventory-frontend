import { apiDelete, apiGet, apiPost } from "./apiClient";
import type {
  CheckinExceptions,
  NamingMismatches,
  OffsiteDevices,
} from "../types/compliance";

export interface CheckinExceptionsQuery {
  days?: number;
  include_never?: boolean;
  asset_type?: string;
  location_id?: number;
}

export const getCheckinExceptions = (q: CheckinExceptionsQuery = {}) => {
  const p = new URLSearchParams();
  if (q.days != null) p.set("days", String(q.days));
  if (q.include_never != null) p.set("include_never", String(q.include_never));
  if (q.asset_type) p.set("asset_type", q.asset_type);
  if (q.location_id != null) p.set("location_id", String(q.location_id));
  const qs = p.toString();
  return apiGet<CheckinExceptions>(`/reports/checkin-exceptions${qs ? `?${qs}` : ""}`);
};

export interface OffsiteDevicesQuery {
  mode?: "subnet" | "meraki";
  seen_within_days?: number;
  asset_type?: string;
  public_only?: boolean;
}

export const getOffsiteDevices = (q: OffsiteDevicesQuery = {}) => {
  const p = new URLSearchParams();
  if (q.mode) p.set("mode", q.mode);
  if (q.seen_within_days != null) p.set("seen_within_days", String(q.seen_within_days));
  if (q.asset_type) p.set("asset_type", q.asset_type);
  if (q.public_only) p.set("public_only", "true");
  const qs = p.toString();
  return apiGet<OffsiteDevices>(`/reports/offsite-devices${qs ? `?${qs}` : ""}`);
};

export interface NamingMismatchQuery {
  hard_only?: boolean;
  asset_type?: string;
  location_id?: number;
}

export const getNamingMismatches = (q: NamingMismatchQuery = {}) => {
  const p = new URLSearchParams();
  if (q.hard_only) p.set("hard_only", "true");
  if (q.asset_type) p.set("asset_type", q.asset_type);
  if (q.location_id != null) p.set("location_id", String(q.location_id));
  const qs = p.toString();
  return apiGet<NamingMismatches>(`/reports/naming-mismatch${qs ? `?${qs}` : ""}`);
};

export const ackNamingMismatch = (assetId: number, note?: string) =>
  apiPost<{ ok: boolean }>(`/reports/naming-mismatch/${assetId}/ack`, {
    note: note ?? null,
  });

export const unackNamingMismatch = (assetId: number) =>
  apiDelete<{ ok: boolean }>(`/reports/naming-mismatch/${assetId}/ack`);
