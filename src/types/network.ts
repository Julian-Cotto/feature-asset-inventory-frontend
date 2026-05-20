export interface NetworkVlan {
  id: number;
  meraki_vlan_id: number;
  name: string | null;
  subnet_cidr: string | null;
  appliance_ip: string | null;
}

export interface Network {
  id: number;
  meraki_network_id: string;
  meraki_org_id: string | null;
  name: string;
  name_override: string | null;
  display_name: string;
  location_id: number | null;
  location_name: string | null;
  subnet_cidr: string | null;
  wan_ip: string | null;
  firewall_ip: string | null;
  corp_vlan_subnet: string | null;
  corp_vlan_gateway_ip: string | null;
  switch_ips: string[];
  product_types: string[];
  timezone: string | null;
  notes: string | null;
  archived_at: string | null;
  meraki_synced_at: string | null;
  asset_count: number;
  vlan_count: number;
  vlans: NetworkVlan[];
  created_at: string;
  updated_at: string;
}

export type NetworkLinkReason =
  | "meraki_serial"
  | "ip_match"
  | "meraki_client"
  | "manual";

export interface NetworkAsset {
  asset_id: number;
  asset_type: string;
  serial_number: string;
  manufacturer: string | null;
  model: string | null;
  device_name: string | null;
  assigned_upn: string | null;
  defender_last_ip: string | null;
  status_code: string;
  link_reason: NetworkLinkReason;
  meraki_last_seen_at?: string | null;
  meraki_last_ip?: string | null;
  meraki_vlan?: number | null;
}

export interface NetworkDetail {
  network: Network;
  networking_equipment: NetworkAsset[];
  client_devices: NetworkAsset[];
}

export interface NetworkUpdatePayload {
  name_override?: string | null;
  location_id?: number | null;
  notes?: string | null;
}

export interface NetworkSyncResult {
  fetched: number;
  created: number;
  updated: number;
  archived: number;
  skipped: number;
  assets_linked: number;
  errors: { meraki_network_id?: string; error: string }[];
}
