import { apiGet, apiPatch, apiPost } from "./apiClient";
import type {
  NetworkSim,
  Sim,
  SimCreatePayload,
  SimListResult,
  SimSyncResult,
  SimUpdatePayload,
} from "../types/sim";

export interface SimListFilters {
  q?: string;
  status?: string;
  carrier?: string;
  network_id?: number;
  unassigned_only?: boolean;
  include_archived?: boolean;
}

const toQuery = (filters: SimListFilters): string => {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.carrier) params.set("carrier", filters.carrier);
  if (filters.network_id != null) params.set("network_id", String(filters.network_id));
  if (filters.unassigned_only) params.set("unassigned_only", "true");
  if (filters.include_archived) params.set("include_archived", "true");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

export const listSims = (filters: SimListFilters = {}) =>
  apiGet<SimListResult>(`/sims${toQuery(filters)}`);

export const getSim = (id: number) => apiGet<Sim>(`/sims/${id}`);

export const createSim = (payload: SimCreatePayload) =>
  apiPost<Sim>("/sims", payload);

export const updateSim = (id: number, payload: SimUpdatePayload) =>
  apiPatch<Sim>(`/sims/${id}`, payload);

export const assignSim = (id: number, networkId: number | null) =>
  apiPost<Sim>(`/sims/${id}/assign`, { network_id: networkId });

export const unassignSim = (id: number) =>
  apiPost<Sim>(`/sims/${id}/unassign`);

export const archiveSim = (id: number) => apiPost<Sim>(`/sims/${id}/archive`);

export const unarchiveSim = (id: number) =>
  apiPost<Sim>(`/sims/${id}/unarchive`);

export const syncSims = () => apiPost<SimSyncResult>("/sims/sync");

export const listSimsForNetwork = (networkId: number) =>
  apiGet<NetworkSim[]>(`/networks/${networkId}/sims`);
