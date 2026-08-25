import { apiDelete, apiFetch, apiGet, apiPost } from "./apiClient";

export interface AccessProfile {
  token: string;
  name: string | null;
  description: string | null;
  enabled: boolean;
}

export interface AxisController {
  id: string;
  label: string;
  configured: boolean;
  base_url: string;
  network_id: number | null;
  network_name: string | null;
}

export interface Badge {
  token: string;
  controller_id: string;
  controller_label: string | null;
  axis_token: string;
  user_token: string | null;
  axis_full_name: string | null;
  axis_first_name: string | null;
  axis_last_name: string | null;
  axis_user_description: string | null;
  card_nr: string | null;
  facility_code: string | null;
  pin: string | null;
  card_value: string | null;
  enabled: boolean;
  status: string | null;
  description: string | null;
  valid_from: string | null;
  valid_to: string | null;
  access_profile_tokens: string[];
  access_profiles: AccessProfile[];
  linked_intune_user_upn: string | null;
  linked_at: string | null;
  linked_by_upn: string | null;
  synced_at: string;
  created_at: string;
  archived_at: string | null;
}

export interface BadgeListResult {
  total: number;
  rows: Badge[];
}

export interface ControllerSyncOut {
  controller_id: string;
  label: string;
  skipped: boolean;
  unreachable: boolean;
  fetched_credentials: number;
  fetched_users: number;
  fetched_profiles: number;
  matched_users: number;
  unmatched_users: number;
  created: number;
  updated: number;
  archived: number;
  errors: string[];
}

export interface BadgeSyncResult {
  controllers: ControllerSyncOut[];
  total_credentials: number;
  total_users: number;
  created: number;
  updated: number;
  archived: number;
  errors: string[];
}

export interface BadgesQuery {
  search?: string;
  enabled?: boolean;
  linked?: boolean;
  facility_code?: string;
  controller?: string;
  include_archived?: boolean;
  limit?: number;
  offset?: number;
}

export const listBadges = (q: BadgesQuery = {}) => {
  const params = new URLSearchParams();
  if (q.search) params.set("search", q.search);
  if (q.enabled !== undefined) params.set("enabled", String(q.enabled));
  if (q.linked !== undefined) params.set("linked", String(q.linked));
  if (q.facility_code) params.set("facility_code", q.facility_code);
  if (q.controller) params.set("controller", q.controller);
  if (q.include_archived) params.set("include_archived", "true");
  params.set("limit", String(q.limit ?? 200));
  params.set("offset", String(q.offset ?? 0));
  return apiGet<BadgeListResult>(`/badges?${params.toString()}`);
};

export const getBadge = (token: string) =>
  apiGet<Badge>(`/badges/${encodeURIComponent(token)}`);

export const listControllers = () =>
  apiGet<AxisController[]>("/badges/controllers");

export const syncBadges = (controllerIds?: string[]) => {
  const path = controllerIds && controllerIds.length
    ? `/badges/sync?controllers=${encodeURIComponent(controllerIds.join(","))}`
    : "/badges/sync";
  return apiPost<BadgeSyncResult>(path, {});
};

export const linkBadge = (token: string, upn: string | null) =>
  apiFetch<Badge>(`/badges/${encodeURIComponent(token)}/link`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upn }),
  });

export interface AxisUserUpdate {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  description?: string | null;
}

export const updateAxisUser = (token: string, payload: AxisUserUpdate) =>
  apiFetch<Badge>(`/badges/${encodeURIComponent(token)}/axis-user`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export interface BadgeCreatePayload {
  controller_id: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  card_nr?: string | null;
  facility_code?: string | null;
  pin?: string | null;
  description?: string | null;
  enabled?: boolean;
  access_profile_tokens?: string[];
}

export const createBadge = (payload: BadgeCreatePayload) =>
  apiPost<Badge>("/badges", payload);

export type RemoveUserStrategy = "auto" | "always" | "never";

export interface BadgeDeleteResult {
  badge_token: string;
  credential_removed: boolean;
  user_removed: boolean;
  other_credentials_for_user: number;
}

export const deleteBadge = (token: string, removeUser: RemoveUserStrategy = "auto") =>
  apiDelete<BadgeDeleteResult>(
    `/badges/${encodeURIComponent(token)}?remove_user=${removeUser}`,
  );

export interface BulkResult {
  requested: number;
  updated: number;
  skipped: number;
  errors: { token?: string; error: string }[];
}

export const bulkSetBadgesEnabled = (tokens: string[], enabled: boolean) =>
  apiPost<BulkResult>("/badges/bulk-set-enabled", { tokens, enabled });

export const unlinkBadge = (token: string) =>
  apiDelete<Badge>(`/badges/${encodeURIComponent(token)}/link`);

export const listAccessProfiles = () =>
  apiGet<AccessProfile[]>("/badges/access-profiles");

export type AxisTopologyKind =
  | "schedule"
  | "door"
  | "door_configuration"
  | "access_point"
  | "authentication_profile"
  | "id_point"
  | "id_point_configuration"
  | "access_controller"
  | "access_profile";

export interface AxisTopologyObject {
  id: string;
  controller_id: string;
  controller_label: string | null;
  kind: AxisTopologyKind;
  axis_token: string;
  name: string | null;
  description: string | null;
  raw: Record<string, unknown> | null;
  synced_at: string;
  archived_at: string | null;
}

export const listTopology = (params: {
  controller?: string;
  kind?: AxisTopologyKind;
  includeArchived?: boolean;
}) => {
  const q = new URLSearchParams();
  if (params.controller) q.set("controller", params.controller);
  if (params.kind) q.set("kind", params.kind);
  if (params.includeArchived) q.set("include_archived", "true");
  const qs = q.toString();
  return apiGet<AxisTopologyObject[]>(
    `/badges/topology${qs ? `?${qs}` : ""}`,
  );
};

export const listWritableKinds = () =>
  apiGet<AxisTopologyKind[]>("/badges/topology/writable-kinds");

export const createTopologyObject = (
  controllerId: string,
  kind: AxisTopologyKind,
  payload: Record<string, unknown>,
) =>
  apiPost<AxisTopologyObject>(
    `/badges/topology/${encodeURIComponent(controllerId)}/${encodeURIComponent(kind)}`,
    { payload },
  );

export const updateTopologyObject = (
  controllerId: string,
  kind: AxisTopologyKind,
  token: string,
  payload: Record<string, unknown>,
) =>
  apiFetch<AxisTopologyObject>(
    `/badges/topology/${encodeURIComponent(controllerId)}/${encodeURIComponent(kind)}/${encodeURIComponent(token)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    },
  );

export const deleteTopologyObject = (
  controllerId: string,
  kind: AxisTopologyKind,
  token: string,
) =>
  apiDelete<void>(
    `/badges/topology/${encodeURIComponent(controllerId)}/${encodeURIComponent(kind)}/${encodeURIComponent(token)}`,
  );
