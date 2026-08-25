import { apiGet } from "./apiClient";

export type EntityType =
  | "badge"
  | "software"
  | "location"
  | "deployment"
  | "shipment"
  | "network"
  | "sim"
  | "repair"
  | "transfer"
  | "disposal"
  | "loan";

export interface EntityHistoryEntry {
  id: number;
  entity_type: EntityType;
  entity_id: string;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  actor_upn: string | null;
  notes: string | null;
  occurred_at: string;
}

export const listEntityHistory = (
  entity_type: EntityType,
  entity_id: string | number,
  limit = 100,
) =>
  apiGet<EntityHistoryEntry[]>(
    `/history/${encodeURIComponent(entity_type)}/${encodeURIComponent(String(entity_id))}?limit=${limit}`,
  );
