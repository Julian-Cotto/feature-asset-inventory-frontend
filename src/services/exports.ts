/** Shared download trigger for list-view exports. Calls the matching
 *  GET endpoint with the current filter set, then writes the response
 *  to a hidden anchor so the browser handles save-as. */

import { apiFetchBlob } from "./apiClient";

export type ExportFormat = "csv" | "xlsx";

function triggerDownload(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

async function downloadGet(
  path: string,
  fallbackName: string,
): Promise<void> {
  const { blob, filename } = await apiFetchBlob(path, { method: "GET" });
  triggerDownload(blob, filename ?? fallbackName);
}

// ──────────────────── Assets ────────────────────

export interface AssetsExportQuery {
  q?: string;
  asset_type?: string;
  status_code?: string;
  location_id?: number;
  assigned_upn?: string;
  model?: string;
  manufacturer?: string;
  os?: string;
  assignment_state?: string;
  warranty_state?: string;
  defender_health?: string;
  include_archived?: boolean;
  available_only?: boolean;
}

function buildAssetsQS(q: AssetsExportQuery, fmt: ExportFormat): string {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.asset_type) p.set("asset_type", q.asset_type);
  if (q.status_code) p.set("status_code", q.status_code);
  if (q.location_id !== undefined) p.set("location_id", String(q.location_id));
  if (q.assigned_upn) p.set("assigned_upn", q.assigned_upn);
  if (q.model) p.set("model", q.model);
  if (q.manufacturer) p.set("manufacturer", q.manufacturer);
  if (q.os) p.set("os", q.os);
  if (q.assignment_state) p.set("assignment_state", q.assignment_state);
  if (q.warranty_state) p.set("warranty_state", q.warranty_state);
  if (q.defender_health) p.set("defender_health", q.defender_health);
  if (q.include_archived) p.set("include_archived", "true");
  if (q.available_only) p.set("available_only", "true");
  p.set("format", fmt);
  return p.toString();
}

export const downloadAssetsExport = (
  query: AssetsExportQuery,
  fmt: ExportFormat,
) =>
  downloadGet(
    `/assets/export?${buildAssetsQS(query, fmt)}`,
    `assets.${fmt}`,
  );

// ──────────────────── Badges ────────────────────

export interface BadgesExportQuery {
  search?: string;
  enabled?: boolean;
  linked?: boolean;
  facility_code?: string;
  controller?: string;
  include_archived?: boolean;
}

function buildBadgesQS(q: BadgesExportQuery, fmt: ExportFormat): string {
  const p = new URLSearchParams();
  if (q.search) p.set("search", q.search);
  if (q.enabled !== undefined) p.set("enabled", String(q.enabled));
  if (q.linked !== undefined) p.set("linked", String(q.linked));
  if (q.facility_code) p.set("facility_code", q.facility_code);
  if (q.controller) p.set("controller", q.controller);
  if (q.include_archived) p.set("include_archived", "true");
  p.set("format", fmt);
  return p.toString();
}

export const downloadBadgesExport = (
  query: BadgesExportQuery,
  fmt: ExportFormat,
) =>
  downloadGet(
    `/badges/export?${buildBadgesQS(query, fmt)}`,
    `badges.${fmt}`,
  );

// ──────────────────── Simple-filter views ────────────────────

function withFormat(path: string, fmt: ExportFormat, extra?: URLSearchParams) {
  const p = extra ?? new URLSearchParams();
  p.set("format", fmt);
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${p.toString()}`;
}

export const downloadUsersExport = (fmt: ExportFormat) =>
  downloadGet(withFormat("/users/export", fmt), `users.${fmt}`);

export interface SoftwareExportQuery {
  q?: string;
  category?: string;
  source?: string;
  include_archived?: boolean;
}

export const downloadSoftwareExport = (q: SoftwareExportQuery, fmt: ExportFormat) => {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.category) p.set("category", q.category);
  if (q.source) p.set("source", q.source);
  if (q.include_archived) p.set("include_archived", "true");
  return downloadGet(withFormat("/software/export", fmt, p), `software.${fmt}`);
};

export interface GroupsExportQuery {
  q?: string;
  managed_only?: boolean;
}

export const downloadGroupsExport = (q: GroupsExportQuery, fmt: ExportFormat) => {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.managed_only !== undefined) p.set("managed_only", String(q.managed_only));
  return downloadGet(withFormat("/groups/export", fmt, p), `groups.${fmt}`);
};

export const downloadNetworksExport = (
  fmt: ExportFormat,
  includeArchived = false,
) => {
  const p = new URLSearchParams();
  if (includeArchived) p.set("include_archived", "true");
  return downloadGet(withFormat("/networks/export", fmt, p), `networks.${fmt}`);
};

export interface SimsExportQuery {
  q?: string;
  status?: string;
  carrier?: string;
  include_archived?: boolean;
}

export const downloadSimsExport = (q: SimsExportQuery, fmt: ExportFormat) => {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.status) p.set("status", q.status);
  if (q.carrier) p.set("carrier", q.carrier);
  if (q.include_archived) p.set("include_archived", "true");
  return downloadGet(withFormat("/sims/export", fmt, p), `sims.${fmt}`);
};

export const downloadLocationsExport = (
  fmt: ExportFormat,
  includeInactive = false,
) => {
  const p = new URLSearchParams();
  if (includeInactive) p.set("include_inactive", "true");
  return downloadGet(withFormat("/locations/export", fmt, p), `locations.${fmt}`);
};

export interface DeploymentsExportQuery {
  status_q?: string;
  type?: string;
  q?: string;
  archived?: boolean;
}

export const downloadDeploymentsExport = (
  q: DeploymentsExportQuery,
  fmt: ExportFormat,
) => {
  const p = new URLSearchParams();
  if (q.status_q) p.set("status_q", q.status_q);
  if (q.type) p.set("type", q.type);
  if (q.q) p.set("q", q.q);
  if (q.archived) p.set("archived", "true");
  return downloadGet(
    withFormat("/deployments/export", fmt, p),
    `deployments.${fmt}`,
  );
};

export interface ShipmentsExportQuery {
  direction?: string;
  resolution?: string;
  carrier_status?: string;
  q?: string;
  archived?: boolean;
}

export const downloadShipmentsExport = (
  q: ShipmentsExportQuery,
  fmt: ExportFormat,
) => {
  const p = new URLSearchParams();
  if (q.direction) p.set("direction", q.direction);
  if (q.resolution) p.set("resolution", q.resolution);
  if (q.carrier_status) p.set("carrier_status", q.carrier_status);
  if (q.q) p.set("q", q.q);
  if (q.archived) p.set("archived", "true");
  return downloadGet(
    withFormat("/shipments/export", fmt, p),
    `shipments.${fmt}`,
  );
};
