import { useEffect, useState } from "react";

import {
  bulkSyncFromIntune,
  bulkSyncFromMeraki,
  countAssets,
  getAssetFilterOptions,
  listAssets,
  listLocations,
  listStatuses,
  refreshVendorModels,
  type AssetFilterOptions,
  type IntuneBulkSyncResult,
  type MerakiBulkSyncResult,
  type VendorRefreshResult,
} from "../services/inventory";
import type { Asset, AssetStatus, Location } from "../types/inventory";
import AssetLocatorPanel from "./AssetLocatorPanel";
import BulkLocationModal from "../components/BulkLocationModal";
import EditAssetModal from "../components/EditAssetModal";
import Select from "../components/Select";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { assetTypeBadgeClass, assetTypeLabel } from "../utils/assetTypeBadge";
import { friendlyModel } from "../utils/friendlyModel";
import { osDisplay } from "../utils/osDisplay";
import { statusBadgeClass, statusLabel } from "../utils/statusBadge";
import { warrantyDisplay } from "../utils/warranty";

interface Props {
  onSelect: (id: number) => void;
  initialStatusCode?: string;
  onNetworkClick?: (id: number) => void;
}

export default function AssetsList({
  onSelect,
  initialStatusCode,
  onNetworkClick,
}: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [statuses, setStatuses] = useState<AssetStatus[]>([]);
  const [q, setQ] = useState("");
  const [statusCode, setStatusCode] = useState(initialStatusCode ?? "");
  const [assetType, setAssetType] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  // Extended filters (collapsible panel). Empty string = "no filter".
  const [locationId, setLocationId] = useState<string>("");
  const [manufacturer, setManufacturer] = useState("");
  const [osFilter, setOsFilter] = useState("");
  const [assignmentState, setAssignmentState] = useState<"" | "assigned" | "unassigned">("");
  const [warrantyState, setWarrantyState] = useState<"" | "on" | "off" | "unknown">("");
  const [defenderHealth, setDefenderHealth] = useState("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState<AssetFilterOptions>({
    manufacturers: [],
    os: [],
    defender_health: [],
  });
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [bulkResult, setBulkResult] = useState<IntuneBulkSyncResult | null>(null);
  const [merakiSyncing, setMerakiSyncing] = useState(false);
  const [merakiResult, setMerakiResult] = useState<MerakiBulkSyncResult | null>(
    null,
  );
  const [vendorRefreshing, setVendorRefreshing] = useState(false);
  const [vendorResult, setVendorResult] = useState<VendorRefreshResult | null>(
    null,
  );
  const [editing, setEditing] = useState<Asset | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLocationOpen, setBulkLocationOpen] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const confirm = useConfirm();
  const toast = useToast();

  function toggleRow(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelectedIds((prev) =>
      prev.size === assets.length
        ? new Set()
        : new Set(assets.map((a) => a.id)),
    );
  }
  const allSelected = assets.length > 0 && selectedIds.size === assets.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  useEffect(() => {
    listStatuses().then(setStatuses).catch((e) => setError(e.message));
    listLocations().then(setLocations).catch(() => {});
    getAssetFilterOptions().then(setFilterOptions).catch(() => {});
  }, []);

  const reload = async () => {
    try {
      const filters = {
        q: q || undefined,
        status_code: statusCode || undefined,
        asset_type: assetType || undefined,
        location_id: locationId ? Number(locationId) : undefined,
        manufacturer: manufacturer || undefined,
        os: osFilter || undefined,
        assignment_state: assignmentState || undefined,
        warranty_state: warrantyState || undefined,
        defender_health: defenderHealth || undefined,
        include_archived: includeArchived,
      };
      const [data, count] = await Promise.all([
        listAssets({ ...filters, limit: pageSize, offset: page * pageSize }),
        countAssets(filters),
      ]);
      setAssets(data);
      setTotal(count.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  };

  useEffect(() => {
    void reload();
  }, [
    statusCode,
    assetType,
    includeArchived,
    page,
    pageSize,
    locationId,
    manufacturer,
    osFilter,
    assignmentState,
    warrantyState,
    defenderHealth,
  ]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [
    statusCode,
    assetType,
    includeArchived,
    q,
    locationId,
    manufacturer,
    osFilter,
    assignmentState,
    warrantyState,
    defenderHealth,
  ]);

  const activeFilterCount =
    (locationId ? 1 : 0) +
    (manufacturer ? 1 : 0) +
    (osFilter ? 1 : 0) +
    (assignmentState ? 1 : 0) +
    (warrantyState ? 1 : 0) +
    (defenderHealth ? 1 : 0);

  function clearMoreFilters() {
    setLocationId("");
    setManufacturer("");
    setOsFilter("");
    setAssignmentState("");
    setWarrantyState("");
    setDefenderHealth("");
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total === 0 ? 0 : page * pageSize + 1;
  const pageEnd = Math.min(total, (page + 1) * pageSize);

  async function doVendorRefresh() {
    const ok = await confirm({
      title: "Refresh vendor warranty + models?",
      message:
        "Pull friendly product names and warranty status from Lenovo and Dell for every Lenovo / Dell / unbranded asset. Doesn't touch Intune.",
      tone: "info",
      confirmLabel: "Run",
    });
    if (!ok) return;
    setVendorRefreshing(true);
    try {
      const result = await toast.run(() => refreshVendorModels(), {
        pending: "Refreshing vendor models + warranty…",
        success: (r) =>
          `Vendor refresh: ${r.updated} updated, ${r.no_match} unchanged, ${r.errors.length} errors`,
        error: "Vendor refresh failed",
      });
      setVendorResult(result);
      void reload();
    } catch {
      // toast surfaced the error
    } finally {
      setVendorRefreshing(false);
    }
  }

  async function doBulkSync() {
    const ok = await confirm({
      title: "Sync all from Intune?",
      message:
        "Pull every Intune managedDevice into inventory. May take a few minutes for large tenants.",
      tone: "info",
      confirmLabel: "Sync all",
    });
    if (!ok) return;
    setBulkSyncing(true);
    try {
      const result = await toast.run(() => bulkSyncFromIntune(), {
        pending: "Bulk-syncing from Intune + Defender…",
        success: (r) =>
          `Intune sync: ${r.created} created, ${r.updated} updated, ${r.skipped_no_serial + r.skipped_non_computer} skipped`,
        error: "Bulk sync failed",
      });
      setBulkResult(result);
      void reload();
    } catch {
      // toast surfaced the error
    } finally {
      setBulkSyncing(false);
    }
  }

  async function doMerakiSync() {
    const ok = await confirm({
      title: "Sync all from Meraki?",
      message:
        "Pull every firewall / switch / AP from the configured Meraki organization. Cameras and sensors are skipped.",
      tone: "info",
      confirmLabel: "Sync all",
    });
    if (!ok) return;
    setMerakiSyncing(true);
    try {
      const result = await toast.run(() => bulkSyncFromMeraki(), {
        pending: "Syncing network devices from Meraki…",
        success: (r) =>
          `Meraki sync: ${r.created} created, ${r.updated} updated`,
        error: "Meraki sync failed",
      });
      setMerakiResult(result);
      void reload();
    } catch {
      // toast surfaced the error
    } finally {
      setMerakiSyncing(false);
    }
  }

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Assets</h2>
        <div className="cluster">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void doVendorRefresh()}
            disabled={vendorRefreshing}
            title="Pull friendly product names + warranty status from Lenovo and Dell"
          >
            {vendorRefreshing ? "Refreshing vendor warranty…" : "Refresh Vendor Warranty"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void doBulkSync()}
            disabled={bulkSyncing}
            title="Pull every Intune managedDevice into the inventory"
          >
            {bulkSyncing ? "Syncing all from Intune…" : "Sync all from Intune"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void doMerakiSync()}
            disabled={merakiSyncing}
            title="Pull all firewalls / switches / APs from the Meraki org"
          >
            {merakiSyncing ? "Syncing all from Meraki…" : "Sync all from Meraki"}
          </button>
        </div>
      </div>

      {merakiResult && (
        <div className="alert alert-info">
          <div>
            Meraki sync: <strong>{merakiResult.created}</strong> created,{" "}
            <strong>{merakiResult.updated}</strong> updated,{" "}
            {merakiResult.unchanged} unchanged,{" "}
            {merakiResult.skipped_non_network} skipped (non-network),{" "}
            {merakiResult.errors.length} errors. Total devices fetched:{" "}
            {merakiResult.total_devices}.
          </div>
          {merakiResult.errors.length > 0 && (
            <details className="text-xs mt-1">
              <summary>Show errors ({merakiResult.errors.length})</summary>
              <ul className="list-clean stack mt-1">
                {merakiResult.errors.slice(0, 20).map((e, i) => (
                  <li key={i} className="text-mono">
                    {e.serial ?? "?"}: {e.error}
                  </li>
                ))}
                {merakiResult.errors.length > 20 && (
                  <li className="text-muted">
                    …{merakiResult.errors.length - 20} more
                  </li>
                )}
              </ul>
            </details>
          )}
        </div>
      )}

      {vendorResult && (
        <div className="alert alert-info">
          <div>
            Vendor refresh: <strong>{vendorResult.updated}</strong> updated,{" "}
            {vendorResult.no_match} unchanged / no match,{" "}
            {vendorResult.errors.length} errors. Checked:{" "}
            {vendorResult.checked} assets.
          </div>
          {vendorResult.errors.length > 0 && (
            <details className="text-xs mt-1">
              <summary>Show errors ({vendorResult.errors.length})</summary>
              <ul className="list-clean stack mt-1">
                {vendorResult.errors.slice(0, 20).map((e, i) => (
                  <li key={i} className="text-mono">
                    #{e.asset_id} {e.serial}: {e.error}
                  </li>
                ))}
                {vendorResult.errors.length > 20 && (
                  <li className="text-muted">
                    …{vendorResult.errors.length - 20} more
                  </li>
                )}
              </ul>
            </details>
          )}
        </div>
      )}

      {bulkResult && (
        <div className="alert alert-info">
          <div>
            Intune bulk sync: <strong>{bulkResult.created}</strong> created,{" "}
            <strong>{bulkResult.updated}</strong> updated,{" "}
            {bulkResult.skipped_no_serial} skipped (no serial),{" "}
            {bulkResult.skipped_non_computer} skipped (non-computer chassis),{" "}
            {bulkResult.errors.length} errors. Total devices fetched:{" "}
            {bulkResult.total_devices}.
          </div>
          {bulkResult.errors.length > 0 && (
            <details className="text-xs mt-1">
              <summary>Show errors ({bulkResult.errors.length})</summary>
              <ul className="list-clean stack mt-1">
                {bulkResult.errors.slice(0, 20).map((e, i) => (
                  <li key={i} className="text-mono">
                    {e.serial ?? e.intune_id ?? "?"}: {e.error}
                  </li>
                ))}
                {bulkResult.errors.length > 20 && (
                  <li className="text-muted">
                    …{bulkResult.errors.length - 20} more
                  </li>
                )}
              </ul>
            </details>
          )}
        </div>
      )}

      <AssetLocatorPanel
        onAssetClick={onSelect}
        onNetworkClick={onNetworkClick}
      />

      <div className="toolbar">
        <input
          className="input"
          placeholder="Search tag, serial, device name, model, OS, UPN, IDs…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void reload()}
          style={{ flex: 1, minWidth: "16rem" }}
        />
        <Select
          value={statusCode}
          onChange={setStatusCode}
          placeholder="All statuses"
          options={[
            { value: "", label: "All statuses" },
            ...statuses.map((s) => ({ value: s.code, label: s.label })),
          ]}
        />
        <Select
          value={assetType}
          onChange={setAssetType}
          placeholder="All types"
          options={[
            { value: "", label: "All types" },
            { value: "laptop", label: "Laptop" },
            { value: "desktop", label: "Desktop" },
            { value: "thin_client", label: "Thin client" },
            { value: "gateway", label: "Firewall" },
            { value: "switch", label: "Switch" },
            { value: "ap", label: "AP" },
          ]}
        />

        <label className="checkbox-row">
          <input
            type="checkbox"
            className="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          Include archived
        </label>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setShowMoreFilters((s) => !s)}
          title="Filter by location, manufacturer, OS, assignment, warranty, Defender health"
        >
          {showMoreFilters ? "Hide filters" : "More filters"}
          {activeFilterCount > 0 && (
            <span
              className="badge badge-soft"
              style={{ marginLeft: "0.4rem" }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void reload()}
        >
          Search
        </button>
      </div>

      {showMoreFilters && (
        <div className="card card-body stack">
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <span className="eyebrow">More filters</span>
            {activeFilterCount > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={clearMoreFilters}
              >
                Clear all
              </button>
            )}
          </div>
          <div className="form-row" style={{ flexWrap: "wrap" }}>
            <div className="field" style={{ minWidth: "12rem", flex: 1 }}>
              <label className="label">Location</label>
              <Select
                value={locationId}
                onChange={setLocationId}
                placeholder="Any location"
                searchable
                searchPlaceholder="Filter locations…"
                options={locations.map((l) => ({
                  value: String(l.id),
                  label: l.name,
                }))}
              />
            </div>
            <div className="field" style={{ minWidth: "10rem", flex: 1 }}>
              <label className="label">Manufacturer</label>
              <Select
                value={manufacturer}
                onChange={setManufacturer}
                placeholder="Any manufacturer"
                searchable
                searchPlaceholder="Filter manufacturers…"
                options={filterOptions.manufacturers.map((m) => ({
                  value: m,
                  label: m,
                }))}
              />
            </div>
            <div className="field" style={{ minWidth: "10rem", flex: 1 }}>
              <label className="label">Operating system</label>
              <Select
                value={osFilter}
                onChange={setOsFilter}
                placeholder="Any OS"
                searchable
                searchPlaceholder="Filter OS…"
                options={filterOptions.os.map((o) => ({ value: o, label: o }))}
              />
            </div>
            <div className="field" style={{ minWidth: "9rem", flex: 1 }}>
              <label className="label">Assignment</label>
              <Select
                value={assignmentState}
                onChange={(v) =>
                  setAssignmentState(v as "" | "assigned" | "unassigned")
                }
                placeholder="Any"
                options={[
                  { value: "", label: "Any" },
                  { value: "assigned", label: "Assigned" },
                  { value: "unassigned", label: "Unassigned" },
                ]}
              />
            </div>
            <div className="field" style={{ minWidth: "9rem", flex: 1 }}>
              <label className="label">Warranty</label>
              <Select
                value={warrantyState}
                onChange={(v) =>
                  setWarrantyState(v as "" | "on" | "off" | "unknown")
                }
                placeholder="Any"
                options={[
                  { value: "", label: "Any" },
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                  { value: "unknown", label: "Unknown" },
                ]}
              />
            </div>
            <div className="field" style={{ minWidth: "10rem", flex: 1 }}>
              <label className="label">Defender health</label>
              <Select
                value={defenderHealth}
                onChange={setDefenderHealth}
                placeholder="Any"
                options={[
                  { value: "", label: "Any" },
                  ...filterOptions.defender_health.map((h) => ({
                    value: h,
                    label: h,
                  })),
                ]}
              />
            </div>
          </div>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {/* Card list — phone only (<sm) */}
      <ul className="list-clean stack sm:hidden">
        {assets.map((a) => (
          <li
            key={a.id}
            className="card card-body cursor-pointer transition-colors hover:bg-surface-muted"
            onClick={() => onSelect(a.id)}
          >
            <div className="cluster" style={{ justifyContent: "space-between" }}>
              <div className="cluster" style={{ minWidth: 0 }}>
                <span className="font-semibold truncate">
                  {a.intune_device_name
                    ? `${a.intune_device_name} - ${a.serial_number}`
                    : a.serial_number}
                </span>
                <span className={statusBadgeClass(a.status_code)}>
                  {statusLabel(a.status_code)}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(a);
                }}
              >
                Edit
              </button>
            </div>
            {a.asset_tag && (
              <div className="text-muted text-xs font-mono mt-1">
                Tag: {a.asset_tag}
              </div>
            )}
            <div className="cluster mt-1" style={{ gap: "0.4rem" }}>
              <span className={assetTypeBadgeClass(a.asset_type)}>
                {assetTypeLabel(a.asset_type)}
              </span>
              <span
                className="text-sm truncate"
                style={{ maxWidth: "20ch" }}
                title={`${a.manufacturer ?? ""} ${friendlyModel(a)}`.trim()}
              >
                {a.manufacturer ?? ""} {friendlyModel(a)}
              </span>
            </div>
            {(a.os || a.assigned_upn) && (
              <div className="text-muted text-xs mt-1">
                {a.os ? osDisplay(a.os, a.os_version) : ""}
                {a.os && a.assigned_upn ? " · " : ""}
                {a.assigned_upn ?? ""}
              </div>
            )}
            {(() => {
              const w = warrantyDisplay(a);
              const cls =
                w.variant === "success"
                  ? "badge badge-success"
                  : w.variant === "danger"
                    ? "badge badge-danger"
                    : "badge badge-warning";
              return (
                <div className="cluster mt-1" style={{ gap: "0.4rem" }}>
                  <span className={cls}>Warranty {w.label}</span>
                  {w.date && (
                    <span className="text-muted text-xs">{w.date}</span>
                  )}
                </div>
              );
            })()}
          </li>
        ))}
        {assets.length === 0 && (
          <li className="card card-body text-muted text-sm">No assets.</li>
        )}
      </ul>

      {selectedIds.size > 0 && (
        <div
          className="alert alert-info cluster"
          style={{ justifyContent: "space-between" }}
        >
          <span>
            <strong>{selectedIds.size}</strong> asset
            {selectedIds.size === 1 ? "" : "s"} selected
          </span>
          <div className="cluster">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setBulkLocationOpen(true)}
            >
              Set location
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {/* Table — tablet+ (sm and up) */}
      <div className="card hidden sm:block">
        <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "2rem" }}>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  aria-label="Select all"
                  onClick={(e) => e.stopPropagation()}
                />
              </th>
              <th>Device name</th>
              <th>Tag</th>
              <th>Serial</th>
              <th>Type</th>
              <th>Model</th>
              <th>OS</th>
              <th>Warranty</th>
              <th>Status</th>
              <th>Location</th>
              <th>Assigned</th>
              <th className="col-sticky-right"></th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr
                key={a.id}
                className="row-clickable"
                onClick={() => onSelect(a.id)}
              >
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={selectedIds.has(a.id)}
                    onChange={() => toggleRow(a.id)}
                    aria-label={`Select ${a.serial_number}`}
                  />
                </td>
                <td className="font-medium">
                  {a.intune_device_name ?? "—"}
                </td>
                <td>{a.asset_tag ?? "—"}</td>
                <td className="font-mono max-w-[10ch]">
                  <span
                    className="block truncate"
                    title={a.serial_number}
                  >
                    {a.serial_number}
                  </span>
                </td>
                <td>
                  <span className={assetTypeBadgeClass(a.asset_type)}>
                    {assetTypeLabel(a.asset_type)}
                  </span>
                </td>
                <td className="max-w-[22ch]">
                  <span
                    className="block truncate"
                    title={`${a.manufacturer ?? ""} ${friendlyModel(a)}`.trim()}
                  >
                    {a.manufacturer ?? ""} {friendlyModel(a)}
                  </span>
                </td>
                <td className="max-w-[11ch]">
                  <span
                    className="block truncate"
                    title={`${a.os ?? ""} ${a.os_version ?? ""}`.trim() || undefined}
                  >
                    {osDisplay(a.os, a.os_version)}
                  </span>
                </td>
                <td>
                  {(() => {
                    const w = warrantyDisplay(a);
                    const cls =
                      w.variant === "success"
                        ? "badge badge-success"
                        : w.variant === "danger"
                          ? "badge badge-danger"
                          : "badge badge-warning";
                    return (
                      <span className="cluster" style={{ gap: "0.4rem" }}>
                        <span className={cls}>{w.label}</span>
                        {w.date && (
                          <span className="text-muted text-xs">{w.date}</span>
                        )}
                      </span>
                    );
                  })()}
                </td>
                <td>
                  <span className="cluster" style={{ gap: "0.3rem" }}>
                    <span className={statusBadgeClass(a.status_code)}>
                      {statusLabel(a.status_code)}
                    </span>
                    {a.reserved_by_kind && (
                      <span
                        className="badge badge-warning"
                        title={`Reserved by ${a.reserved_by_kind} ${a.reserved_by_label ?? ""}`}
                      >
                        {a.reserved_by_kind === "deployment"
                          ? "deploy"
                          : "ship"}
                      </span>
                    )}
                  </span>
                </td>
                <td className="max-w-[18ch]">
                  {a.location_name ? (
                    <span
                      className="block truncate"
                      title={a.location_code ?? a.location_name}
                    >
                      {a.location_name}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="max-w-[25ch]">
                  {a.assigned_upn ? (
                    <span className="block truncate" title={a.assigned_upn}>
                      {a.assigned_upn}
                    </span>
                  ) : (
                    <span className="text-muted italic">unassigned</span>
                  )}
                </td>
                <td className="col-sticky-right">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(a);
                    }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {assets.length === 0 && (
          <p className="text-muted text-sm p-4">No assets.</p>
        )}
      </div>

      <div
        className="cluster"
        style={{ justifyContent: "space-between", marginTop: "0.25rem" }}
      >
        <span className="text-sm text-text-muted">
          {pageStart}–{pageEnd} of {total}
        </span>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <Select
            value={String(pageSize)}
            onChange={(v) => {
              setPageSize(Number(v));
              setPage(0);
            }}
            options={[
              { value: "25", label: "25 / page" },
              { value: "50", label: "50 / page" },
              { value: "100", label: "100 / page" },
              { value: "200", label: "200 / page" },
            ]}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ← Prev
          </button>
          <span className="text-sm">
            Page <strong>{page + 1}</strong> / {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Next →
          </button>
        </div>
      </div>

      {editing && (
        <EditAssetModal
          asset={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}

      {bulkLocationOpen && (
        <BulkLocationModal
          assetIds={Array.from(selectedIds)}
          onCancel={() => setBulkLocationOpen(false)}
          onApplied={() => {
            setBulkLocationOpen(false);
            setSelectedIds(new Set());
            void reload();
          }}
        />
      )}
    </div>
  );
}
