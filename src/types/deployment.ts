import type { Asset, AssetType } from "./inventory";
import type { Shipment } from "./shipment";

export type DeploymentStatus =
  | "planning"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface AddressInput {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

export interface AutoAssignRequest {
  asset_type: AssetType;
  quantity: number;
  model?: string | null;
  manufacturer?: string | null;
}

export interface DeploymentItem {
  id: number;
  deployment_id: number;
  asset_id: number;
  asset: Asset | null;
  role: string | null;
  notes: string | null;
  created_at: string;
}

export interface Deployment {
  id: number;
  name: string;
  type: string | null;
  status: DeploymentStatus;
  description: string | null;
  notes: string | null;
  target_date: string | null;

  target_location_id: number | null;
  target_address_line1: string | null;
  target_address_line2: string | null;
  target_city: string | null;
  target_state: string | null;
  target_postal_code: string | null;
  target_country: string | null;

  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  archived_at: string | null;
  completed_by_upn: string | null;
  cancelled_by_upn: string | null;
  archived_by_upn: string | null;

  created_at: string;
  updated_at: string;
  created_by_upn: string | null;
  updated_by_upn: string | null;

  items: DeploymentItem[];
  shipments: Shipment[];
}

export interface DeploymentCreatePayload {
  name: string;
  type?: string | null;
  description?: string | null;
  notes?: string | null;
  target_date?: string | null;
  target_location_id?: number | null;
  target_address?: AddressInput | null;
  asset_ids?: number[];
  auto_assign?: AutoAssignRequest[];
}

export interface DeploymentItemAddPayload {
  asset_id: number;
  role?: string | null;
  notes?: string | null;
  force?: boolean;
}

export interface DeploymentItemAddResult {
  item: DeploymentItem;
  released_from_deployment_id: number | null;
}
