import { apiDelete, apiGet, apiPatch, apiPost } from "./apiClient";
import type {
  CarrierDetectResult,
  Shipment,
  ShipmentCreatePayload,
  ShipmentItem,
  ShipmentUpdatePayload,
} from "../types/shipment";

export interface ShipmentsQuery {
  direction?: string;
  resolution?: string;
  carrier_status?: string;
  q?: string;
  archived?: boolean;
  limit?: number;
  offset?: number;
}

function toQuery(q: ShipmentsQuery): string {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  });
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const detectCarrier = (trackingNumber: string) =>
  apiGet<CarrierDetectResult>(
    `/shipments/detect-carrier?tracking_number=${encodeURIComponent(trackingNumber)}`,
  );

export const listShipments = (q: ShipmentsQuery = {}) =>
  apiGet<Shipment[]>(`/shipments${toQuery(q)}`);

export const getShipment = (id: number, autoRefresh = true) =>
  apiGet<Shipment>(`/shipments/${id}?auto_refresh=${autoRefresh}`);

export const createShipment = (payload: ShipmentCreatePayload) =>
  apiPost<Shipment>("/shipments", payload);

export const updateShipment = (id: number, payload: ShipmentUpdatePayload) =>
  apiPatch<Shipment>(`/shipments/${id}`, payload);

export const refreshShipment = (id: number) =>
  apiPost<Shipment>(`/shipments/${id}/refresh`);

export const resolveShipment = (id: number) =>
  apiPost<Shipment>(`/shipments/${id}/resolve`);

export const cancelShipment = (id: number) =>
  apiPost<Shipment>(`/shipments/${id}/cancel`);

export const archiveShipment = (id: number) =>
  apiPost<Shipment>(`/shipments/${id}/archive`);

export const unarchiveShipment = (id: number) =>
  apiPost<Shipment>(`/shipments/${id}/unarchive`);

export const deleteShipment = (id: number) =>
  apiDelete<void>(`/shipments/${id}`);

export const addShipmentItem = (id: number, assetId: number) =>
  apiPost<ShipmentItem>(`/shipments/${id}/items`, { asset_id: assetId });

export const removeShipmentItem = (id: number, itemId: number) =>
  apiDelete<void>(`/shipments/${id}/items/${itemId}`);
