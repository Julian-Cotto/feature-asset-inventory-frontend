import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  MapPin,
  Plus,
  Truck,
} from "lucide-react";

import { listAssets } from "../services/inventory";
import {
  addDeploymentItem,
  archiveDeployment,
  cancelDeployment,
  completeDeployment,
  deleteDeployment,
  getDeployment,
  removeDeploymentItem,
  startDeployment,
  unarchiveDeployment,
} from "../services/deployments";
import type { Asset } from "../types/inventory";
import type { Deployment, DeploymentStatus } from "../types/deployment";
import { useConfirm } from "../components/ConfirmProvider";
import { AccentPill, Avatar, SectionHeader } from "../components/visual";
import { friendlyModel } from "../utils/friendlyModel";

interface Props {
  deploymentId: number;
  onBack: () => void;
  onShipmentClick?: (shipmentId: number) => void;
}

const STATUS_LABEL: Record<DeploymentStatus, string> = {
  planning: "Planning",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

function statusBadgeClass(s: DeploymentStatus): string {
  switch (s) {
    case "completed":
      return "badge badge-success";
    case "cancelled":
      return "badge badge-danger";
    case "in_progress":
      return "badge badge-soft";
    default:
      return "badge";
  }
}

function formatTargetAddress(d: Deployment): string {
  const parts = [
    d.target_address_line1,
    d.target_address_line2,
    [d.target_city, d.target_state].filter(Boolean).join(", "),
    d.target_postal_code,
    d.target_country,
  ].filter(Boolean) as string[];
  return parts.join(" · ") || "—";
}

export default function DeploymentDetail({
  deploymentId,
  onBack,
  onShipmentClick,
}: Props) {
  const confirm = useConfirm();
  const [d, setD] = useState<Deployment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [assetSearch, setAssetSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Asset[]>([]);

  const load = async () => {
    try {
      setD(await getDeployment(deploymentId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId]);

  const runSearch = useMemo(
    () => async (term: string) => {
      if (!term.trim()) {
        setSearchResults([]);
        return;
      }
      try {
        const results = await listAssets({ q: term, limit: 20 });
        setSearchResults(results);
      } catch {
        /* noop */
      }
    },
    [],
  );

  useEffect(() => {
    const t = window.setTimeout(() => void runSearch(assetSearch), 250);
    return () => window.clearTimeout(t);
  }, [assetSearch, runSearch]);

  async function handleAddItem(asset: Asset, force = false) {
    try {
      await addDeploymentItem(deploymentId, {
        asset_id: asset.id,
        force,
      });
      setAssetSearch("");
      setSearchResults([]);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to add asset";
      // Detect movable-conflict on a planning deployment — offer override
      if (
        msg.includes("planning") &&
        msg.toLowerCase().includes("force") &&
        !force
      ) {
        const ok = await confirm({
          title: "Move asset?",
          message: `${msg}\n\nMove the asset to this deployment instead?`,
          tone: "warning",
          confirmLabel: "Move",
        });
        if (ok) {
          await handleAddItem(asset, true);
          return;
        }
      }
      setError(msg);
    }
  }

  async function handleRemoveItem(itemId: number) {
    const ok = await confirm({
      title: "Remove asset?",
      message: "Remove this asset from the deployment?",
      tone: "warning",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await removeDeploymentItem(deploymentId, itemId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    }
  }

  async function doStart() {
    try {
      await startDeployment(deploymentId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Start failed");
    }
  }

  async function doComplete() {
    const ok = await confirm({
      title: "Complete deployment?",
      message: "Asset locations will be updated to the target location.",
      tone: "info",
      confirmLabel: "Complete",
    });
    if (!ok) return;
    try {
      await completeDeployment(deploymentId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Complete failed");
    }
  }

  async function doCancel() {
    const ok = await confirm({
      title: "Cancel deployment?",
      message: "Asset reservations will be released. This cannot be undone.",
      tone: "danger",
      confirmLabel: "Cancel deployment",
      cancelLabel: "Keep",
    });
    if (!ok) return;
    try {
      await cancelDeployment(deploymentId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    }
  }

  async function doArchive() {
    try {
      if (d?.archived_at) await unarchiveDeployment(deploymentId);
      else await archiveDeployment(deploymentId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive failed");
    }
  }

  async function doDelete() {
    const ok = await confirm({
      title: "Delete deployment?",
      message:
        "Permanently delete this deployment and its item list. Linked shipments will be unlinked (not deleted). Cannot be undone.",
      tone: "danger",
      confirmLabel: "Delete forever",
    });
    if (!ok) return;
    try {
      await deleteDeployment(deploymentId);
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (!d) {
    return (
      <div className="stack">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          ← Back
        </button>
        {error ? (
          <div className="alert alert-error">{error}</div>
        ) : (
          <p className="text-muted">Loading…</p>
        )}
      </div>
    );
  }

  const isPlanning = d.status === "planning";
  const isInProgress = d.status === "in_progress";
  const isOpen = isPlanning || isInProgress;

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <div className="cluster">
          {isPlanning && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void doStart()}
              disabled={d.items.length === 0}
              title={
                d.items.length === 0
                  ? "Add at least one asset before starting"
                  : ""
              }
            >
              Start
            </button>
          )}
          {isInProgress && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void doComplete()}
            >
              Complete
            </button>
          )}
          {isOpen && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => void doCancel()}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void doArchive()}
            title={d.archived_at ? "Restore from archive" : "Hide from default list"}
          >
            {d.archived_at ? "Unarchive" : "Archive"}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => void doDelete()}
            title="Permanently delete"
          >
            Delete
          </button>
        </div>
      </div>

      <div
        className="card card-body cluster"
        style={{ gap: "0.875rem", alignItems: "center" }}
      >
        <Avatar seed={d.name} name={d.name} />
        <div className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
          <div
            className="cluster"
            style={{ gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}
          >
            <span className="heading-2" style={{ margin: 0 }}>
              {d.name}
            </span>
            <span className={statusBadgeClass(d.status)}>
              {STATUS_LABEL[d.status]}
            </span>
            {d.archived_at && (
              <span className="badge badge-danger">Archived</span>
            )}
          </div>
          <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            {d.type && <AccentPill value={d.type} />}
            {d.target_date && (
              <span className="text-xs text-muted">
                target {new Date(d.target_date).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="stack" style={{ gap: 2, alignItems: "flex-end" }}>
          <span className="text-xs eyebrow">Assets</span>
          <span
            className={
              "badge " +
              (d.items.length > 0 ? "badge-success" : "badge-neutral")
            }
            style={{ fontSize: "0.875rem" }}
          >
            {d.items.length}
          </span>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card card-body stack">
        <SectionHeader
          icon={<MapPin size={16} />}
          title="Target"
          tint="info"
        />
        {d.description && <p className="text-sm">{d.description}</p>}
        <div className="grid-2 text-sm">
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">Location</span>
            <span className="text-sm">{formatTargetAddress(d)}</span>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">Date</span>
            <span className="text-sm">
              {d.target_date
                ? new Date(d.target_date).toLocaleDateString()
                : "—"}
            </span>
          </div>
        </div>
        {d.notes && (
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">Notes</span>
            <p className="text-sm text-muted">{d.notes}</p>
          </div>
        )}
      </div>

      {isPlanning && (
        <div className="card card-body stack">
          <SectionHeader
            icon={<Plus size={16} />}
            title="Add asset"
            tint="amber"
          />
          <input
            className="input"
            value={assetSearch}
            onChange={(e) => setAssetSearch(e.target.value)}
            placeholder="Search by tag / serial / model…"
          />
          {searchResults.length > 0 && (
            <ul className="stack" style={{ gap: "0.375rem" }}>
              {searchResults.map((a) => (
                <li
                  key={a.id}
                  className="cluster row-clickable"
                  style={{
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    padding: "0.5rem 0.625rem",
                    borderRadius: 8,
                    background: "rgb(var(--color-bg) / 0.4)",
                    cursor: "pointer",
                  }}
                  onClick={() => void handleAddItem(a)}
                >
                  <div
                    className="cluster"
                    style={{ gap: "0.625rem", flexWrap: "nowrap", minWidth: 0 }}
                  >
                    <Avatar
                      seed={a.serial_number}
                      name={a.asset_tag ?? a.serial_number}
                    />
                    <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                      <span className="font-medium truncate">
                        {a.asset_tag ?? a.serial_number}
                      </span>
                      <span className="font-mono text-xs text-muted truncate">
                        {a.manufacturer} {friendlyModel(a)}
                      </span>
                    </div>
                  </div>
                  <div className="cluster" style={{ gap: 4 }}>
                    <AccentPill value={a.asset_type} />
                    {a.assigned_upn && (
                      <span
                        className="badge badge-warning"
                        title={`Currently assigned to ${a.assigned_upn}`}
                      >
                        assigned
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card card-body stack">
        <SectionHeader
          icon={<Boxes size={16} />}
          title={`Assets (${d.items.length})`}
          tint="purple"
        />
        {d.items.length === 0 ? (
          <p className="text-muted text-sm">No assets assigned yet.</p>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Serial</th>
                  <th>Type</th>
                  <th>Model</th>
                  <th>Status</th>
                  {isPlanning && <th></th>}
                </tr>
              </thead>
              <tbody>
                {d.items.map((item) => {
                  const seed =
                    item.asset?.serial_number ?? String(item.id);
                  const name =
                    item.asset?.asset_tag ??
                    item.asset?.serial_number ??
                    "—";
                  return (
                    <tr key={item.id}>
                      <td>
                        <div
                          className="cluster"
                          style={{ gap: "0.625rem", flexWrap: "nowrap" }}
                        >
                          <Avatar seed={seed} name={name} />
                          <span className="font-medium truncate">
                            {item.asset?.asset_tag ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td className="font-mono">{item.asset?.serial_number}</td>
                      <td>
                        <AccentPill value={item.asset?.asset_type ?? null} />
                      </td>
                      <td>
                        {item.asset?.manufacturer}{" "}
                        {item.asset ? friendlyModel(item.asset) : ""}
                      </td>
                      <td>
                        <AccentPill value={item.asset?.status_code ?? null} />
                      </td>
                      {isPlanning && (
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => void handleRemoveItem(item.id)}
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card-body stack">
        <SectionHeader
          icon={<Truck size={16} />}
          title={`Shipments (${d.shipments.length})`}
          tint="teal"
        />
        {d.shipments.length === 0 ? (
          <p className="text-muted text-sm">
            No shipments linked. Create or link one from the Shipments tab.
          </p>
        ) : (
          <ul className="stack" style={{ gap: "0.5rem" }}>
            {d.shipments.map((s) => (
              <li
                key={s.id}
                className={onShipmentClick ? "row-clickable" : ""}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.5rem 0.625rem",
                  borderRadius: 8,
                  background: "rgb(var(--color-bg) / 0.4)",
                  cursor: onShipmentClick ? "pointer" : undefined,
                }}
                onClick={() => onShipmentClick?.(s.id)}
              >
                <div
                  className="cluster"
                  style={{ gap: "0.625rem", flexWrap: "nowrap", minWidth: 0 }}
                >
                  <Avatar seed={s.tracking_number} name={s.carrier.toUpperCase()} />
                  <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                    <span className="font-mono truncate">
                      {s.tracking_number}
                    </span>
                    <div
                      className="cluster"
                      style={{ gap: 4, flexWrap: "wrap" }}
                    >
                      <AccentPill value={s.carrier.toUpperCase()} />
                      <AccentPill value={s.direction} />
                    </div>
                  </div>
                </div>
                <span className="badge">{s.carrier_status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

