import { apiDelete, apiGet, apiPatch, apiPost } from "./apiClient";
import type {
  Software,
  SoftwareAssignment,
  SoftwareAssignmentCreate,
  SoftwareListQuery,
  SoftwareSyncResult,
  SoftwareUpsert,
} from "../types/software";

function buildQs(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export const listSoftware = (query: SoftwareListQuery = {}) =>
  apiGet<Software[]>(`/software${buildQs(query as Record<string, string | number | boolean | undefined>)}`);

export const listSoftwareCategories = () =>
  apiGet<string[]>("/software/categories");

export const getSoftware = (id: number) => apiGet<Software>(`/software/${id}`);

export const createSoftware = (payload: SoftwareUpsert) =>
  apiPost<Software>("/software", payload);

export const updateSoftware = (id: number, payload: SoftwareUpsert) =>
  apiPatch<Software>(`/software/${id}`, payload);

export const archiveSoftware = (id: number) =>
  apiPost<Software>(`/software/${id}/archive`);

export const unarchiveSoftware = (id: number) =>
  apiPost<Software>(`/software/${id}/unarchive`);

export interface SoftwareBulkResult {
  requested: number;
  updated: number;
  skipped: number;
}

export const bulkArchiveSoftware = (ids: number[], archived: boolean) =>
  apiPost<SoftwareBulkResult>("/software/bulk-archive", { ids, archived });

export const syncSoftwareFromIntune = () =>
  apiPost<SoftwareSyncResult>("/software/sync");

export const listAssignments = (softwareId: number) =>
  apiGet<SoftwareAssignment[]>(`/software/${softwareId}/assignments`);

export const addAssignment = (
  softwareId: number,
  payload: SoftwareAssignmentCreate,
) => apiPost<SoftwareAssignment>(`/software/${softwareId}/assignments`, payload);

export const deleteAssignment = (softwareId: number, assignmentId: number) =>
  apiDelete<void>(`/software/${softwareId}/assignments/${assignmentId}`);

export interface SoftwareUserRef {
  id: string;
  display_name: string | null;
  user_principal_name: string | null;
  department: string | null;
  via: "direct" | "group";
}

export interface SoftwareCompanyGroup {
  company: string;
  count: number;
  users: SoftwareUserRef[];
}

export interface SoftwareUsersByCompany {
  groups: SoftwareCompanyGroup[];
  groups_expanded: boolean;
  group_assignment_count: number;
}

export const getSoftwareUsersByCompany = (
  softwareId: number,
  includeGroups = false,
) =>
  apiGet<SoftwareUsersByCompany>(
    `/software/${softwareId}/users-by-company${
      includeGroups ? "?include_groups=true" : ""
    }`,
  );

export interface SoftwareByCompanyRow {
  software_id: number;
  software_name: string;
  source: string;
  total: number;
  counts: Record<string, number>;
}

export interface SoftwareByCompanyMatrix {
  source: string | null;
  companies: string[];
  company_totals: Record<string, number>;
  rows: SoftwareByCompanyRow[];
}

export const getSoftwareByCompanyMatrix = (source?: string) =>
  apiGet<SoftwareByCompanyMatrix>(
    `/reports/software-by-company${source ? `?source=${encodeURIComponent(source)}` : ""}`,
  );
