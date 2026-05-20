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
