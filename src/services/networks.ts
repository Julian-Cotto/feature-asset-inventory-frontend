import { apiGet, apiPatch, apiPost } from "./apiClient";
import type {
  Network,
  NetworkDetail,
  NetworkSyncResult,
  NetworkUpdatePayload,
} from "../types/network";

export const listNetworks = (includeArchived = false) =>
  apiGet<Network[]>(`/networks?include_archived=${includeArchived}`);

export const getNetwork = (id: number) =>
  apiGet<NetworkDetail>(`/networks/${id}`);

export const updateNetwork = (id: number, payload: NetworkUpdatePayload) =>
  apiPatch<Network>(`/networks/${id}`, payload);

export const syncNetworks = () =>
  apiPost<NetworkSyncResult>("/networks/sync");

export const relinkNetworkAssets = () =>
  apiPost<{ assets_linked: number }>("/networks/relink-assets");
