import type { Asset, AssetType } from "./inventory";

export type ShipmentDirection = "outbound" | "inbound";
export type ShipmentCarrier = "ups" | "fedex" | "other";
export type ShipmentCarrierStatus =
  | "pending"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception"
  | "unknown";
export type ShipmentResolution = "open" | "resolved" | "cancelled";

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

export interface ShipmentItem {
  id: number;
  shipment_id: number;
  asset_id: number;
  asset: Asset | null;
  notes: string | null;
  created_at: string;
}

export interface ShipmentEvent {
  id: number;
  shipment_id: number;
  occurred_at: string;
  status: ShipmentCarrierStatus;
  location: string | null;
  description: string | null;
  created_at: string;
}

export interface Shipment {
  id: number;
  tracking_number: string;
  carrier: ShipmentCarrier;
  direction: ShipmentDirection;
  description: string | null;
  carrier_status: ShipmentCarrierStatus;
  resolution: ShipmentResolution;

  from_location_id: number | null;
  from_address_line1: string | null;
  from_address_line2: string | null;
  from_city: string | null;
  from_state: string | null;
  from_postal_code: string | null;
  from_country: string | null;

  to_location_id: number | null;
  to_address_line1: string | null;
  to_address_line2: string | null;
  to_city: string | null;
  to_state: string | null;
  to_postal_code: string | null;
  to_country: string | null;

  notes: string | null;
  last_polled_at: string | null;
  last_poll_error: string | null;
  resolved_at: string | null;
  resolved_by_upn: string | null;
  cancelled_at: string | null;
  cancelled_by_upn: string | null;

  created_at: string;
  updated_at: string;
  created_by_upn: string | null;
  updated_by_upn: string | null;

  items: ShipmentItem[];
  events: ShipmentEvent[];
}

export interface ShipmentCreatePayload {
  tracking_number: string;
  carrier: ShipmentCarrier;
  direction: ShipmentDirection;
  description?: string | null;
  notes?: string | null;
  from_location_id?: number | null;
  from_address?: AddressInput | null;
  to_location_id?: number | null;
  to_address?: AddressInput | null;
  asset_ids?: number[];
  auto_assign?: AutoAssignRequest[];
}

export interface ShipmentUpdatePayload {
  description?: string | null;
  notes?: string | null;
  direction?: ShipmentDirection | null;
}

export interface CarrierDetectResult {
  carrier: ShipmentCarrier;
}
