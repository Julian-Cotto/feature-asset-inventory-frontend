import { apiGet, apiPatch, apiPost } from "./apiClient";
import type {
  EntraGroup,
  GroupDetail,
  GroupListQuery,
  GroupSyncResult,
} from "../types/group";

function buildQs(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export const listGroups = (query: GroupListQuery = {}) =>
  apiGet<EntraGroup[]>(`/groups${buildQs(query as Record<string, string | number | boolean | undefined>)}`);

export const getGroup = (id: string) =>
  apiGet<GroupDetail>(`/groups/${encodeURIComponent(id)}`);

export const syncAllGroups = () => apiPost<GroupSyncResult>("/groups/sync");

export const syncOneGroup = (id: string) =>
  apiPost<EntraGroup>(`/groups/${encodeURIComponent(id)}/sync`);

export const setGroupManaged = (id: string, isManaged: boolean) =>
  apiPatch<EntraGroup>(`/groups/${encodeURIComponent(id)}/managed`, {
    is_managed: isManaged,
  });
