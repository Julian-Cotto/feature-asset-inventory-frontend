import { apiGet } from "./apiClient";

export interface NetworkAppearance {
  network_id: number;
  network_name: string;
  description: string | null;
  ip: string | null;
  vlan: number | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

export interface NetworkAppearancesResponse {
  asset_id: number;
  mac: string | null;
  source: "cache" | "live";
  appearances: NetworkAppearance[];
  note?: string;
}

export const getAssetNetworkAppearances = (
  assetId: number,
  refresh = false,
) =>
  apiGet<NetworkAppearancesResponse>(
    `/assets/${assetId}/network-appearances${refresh ? "?refresh=true" : ""}`,
  );
