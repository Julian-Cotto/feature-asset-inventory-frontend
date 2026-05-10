import { useEffect, useMemo, useState } from "react";

import { listAssets } from "../services/inventory";
import {
  addDeploymentItem,
  cancelDeployment,
  completeDeployment,
  getDeployment,
  removeDeploymentItem,
  startDeployment,
} from "../services/deployments";
import type { Asset } from "../types/inventory";
import type { Deployment, DeploymentStatus } from "../types/deployment";
import { useConfirm } from "../components/ConfirmProvider";
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
          ← Back
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
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Header */}
      <div className="card">
        <div className="card-body stack">
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <h2 className="heading-2">{d.name}</h2>
            <div className="cluster">
              {d.type && <span className="badge">{d.type}</span>}
              <span className={statusBadgeClass(d.status)}>
                {STATUS_LABEL[d.status]}
              </span>
            </div>
          </div>
          {d.description && <p>{d.description}</p>}
          <div className="grid-2 text-sm">
            <div>
              <div className="eyebrow">Target location</div>
              <div className="text-muted">{formatTargetAddress(d)}</div>
            </div>
            <div>
              <div className="eyebrow">Target date</div>
              <div className="text-muted">
                {d.target_date
                  ? new Date(d.target_date).toLocaleDateString()
                  : "—"}
              </div>
            </div>
          </div>
          {d.notes && (
            <div>
              <div className="eyebrow">Notes</div>
              <p className="text-muted text-sm">{d.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <section className="stack">
        <h3 className="heading-3">Assets ({d.items.length})</h3>
        {isPlanning && (
          <div className="card">
            <div className="card-body stack">
              <Field label="Add asset (search by tag / serial / model)">
                <input
                  className="input"
                  value={assetSearch}
                  onChange={(e) => setAssetSearch(e.target.value)}
                  placeholder="Type to search…"
                />
                {searchResults.length > 0 && (
                  <div className="card mt-1">
                    <ul className="list-clean">
                      {searchResults.map((a) => (
                        <li
                          key={a.id}
                          className="row-clickable px-3 py-2 border-b border-border"
                          onClick={() => void handleAddItem(a)}
                        >
                          <span className="font-mono">{a.serial_number}</span>{" "}
                          · {a.asset_type} · {a.manufacturer}{" "}
                          {friendlyModel(a)}{" "}
                          {a.assigned_upn && (
                            <span
                              className="badge badge-warning"
                              title={`Currently assigned to ${a.assigned_upn}`}
                            >
                              assigned
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Field>
            </div>
          </div>
        )}
        <div className="card">
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Asset tag</th>
                  <th>Serial</th>
                  <th>Type</th>
                  <th>Model</th>
                  <th>Status</th>
                  {isPlanning && <th></th>}
                </tr>
              </thead>
              <tbody>
                {d.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.asset?.asset_tag ?? "—"}</td>
                    <td className="font-mono">{item.asset?.serial_number}</td>
                    <td>{item.asset?.asset_type}</td>
                    <td>
                      {item.asset?.manufacturer}{" "}
                      {item.asset ? friendlyModel(item.asset) : ""}
                    </td>
                    <td>
                      <span className="badge">{item.asset?.status_code}</span>
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
                ))}
              </tbody>
            </table>
          </div>
          {d.items.length === 0 && (
            <p className="text-muted text-sm p-4">No assets assigned yet.</p>
          )}
        </div>
      </section>

      {/* Shipments */}
      <section className="stack">
        <h3 className="heading-3">Shipments ({d.shipments.length})</h3>
        {d.shipments.length === 0 ? (
          <p className="text-muted text-sm">
            No shipments linked. Create or link one from the Shipments tab.
          </p>
        ) : (
          <ul className="list-clean stack">
            {d.shipments.map((s) => (
              <li
                key={s.id}
                className={`card card-body ${onShipmentClick ? "cursor-pointer transition-colors hover:bg-surface-muted" : ""}`}
                onClick={() => onShipmentClick?.(s.id)}
              >
                <div className="cluster" style={{ justifyContent: "space-between" }}>
                  <div className="cluster">
                    <span className="font-mono">{s.tracking_number}</span>
                    <span className="badge">{s.carrier.toUpperCase()}</span>
                    <span className="badge">{s.direction}</span>
                  </div>
                  <span className="badge">{s.carrier_status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
