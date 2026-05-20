import { apiFetch, apiFetchBlob } from "./apiClient";

export interface LocatorDevice {
  asset_id: number;
  serial_number: string;
  asset_type: string;
  manufacturer: string | null;
  model: string | null;
  override_model: string | null;
  series: string | null;
  generation: string | null;
  effective_model: string;
  os: string | null;
  os_version: string | null;
  status_code: string;
  assigned_upn: string | null;
  location_name: string | null;
  intune_device_name: string | null;
  defender_last_ip: string | null;
  network_id: number | null;
  network_name: string | null;
  network_subnet: string | null;
  mac_address: string | null;
  matched_vlan_id: number | null;
  matched_vlan_name: string | null;
  matched_token: string;
  seen_networks: SeenNetworkRef[];
}

export interface SeenNetworkRef {
  network_id: number;
  network_name: string;
  last_seen_at: string | null;
  ip: string | null;
  vlan: number | null;
}

export interface LocatorGroup {
  network_id: number | null;
  network_name: string | null;
  network_subnet: string | null;
  devices: LocatorDevice[];
}

export interface LocatorResult {
  tokens: string[];
  matched: number;
  groups: LocatorGroup[];
}

function qs(tokens: string[], includeArchived: boolean): string {
  const params = new URLSearchParams();
  params.set("q", tokens.join(","));
  if (includeArchived) params.set("include_archived", "true");
  return params.toString();
}

export const locateAssets = (
  tokens: string[],
  includeArchived = false,
): Promise<LocatorResult> =>
  apiFetch<LocatorResult>(
    `/assets/locator?${qs(tokens, includeArchived)}`,
    { method: "GET" },
  );

/** Download CSV or XLSX. Triggers a browser save via a transient anchor. */
export async function downloadLocatorExport(
  tokens: string[],
  fmt: "csv" | "xlsx",
  includeArchived = false,
): Promise<void> {
  const params = qs(tokens, includeArchived);
  const path = `/assets/locator?${params}&format=${fmt}`;
  const { blob, filename } = await apiFetchBlob(path, { method: "GET" });
  const fallback = `asset-locator.${fmt}`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename ?? fallback;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}
