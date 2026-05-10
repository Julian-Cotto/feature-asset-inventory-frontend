import { useEffect, useState } from "react";

import {
  archiveAsset,
  assignAsset,
  changeAssetStatus,
  getAsset,
  getAssetHistory,
  getIntunePortalUrl,
  listLocations,
  listStatuses,
  syncAssetFromIntune,
  unassignAsset,
  updateAsset,
} from "../services/inventory";
import { useConfirm } from "../components/ConfirmProvider";
import Select from "../components/Select";
import { friendlyModel } from "../utils/friendlyModel";
import { osDisplay } from "../utils/osDisplay";
import type {
  Asset,
  AssetHistoryEntry,
  AssetStatus,
  Location,
} from "../types/inventory";

interface Props {
  assetId: number;
  onBack: () => void;
}

export default function AssetDetail({ assetId, onBack }: Props) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [history, setHistory] = useState<AssetHistoryEntry[]>([]);
  const [statuses, setStatuses] = useState<AssetStatus[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [assignUpn, setAssignUpn] = useState("");
  const [assignLoc, setAssignLoc] = useState<number | "">("");
  const [statusTo, setStatusTo] = useState("");
  const [intuneSyncing, setIntuneSyncing] = useState(false);
  const [intuneMessage, setIntuneMessage] = useState<string | null>(null);
  const [overrideModelDraft, setOverrideModelDraft] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);
  const confirm = useConfirm();

  const reload = async () => {
    try {
      const [a, h] = await Promise.all([getAsset(assetId), getAssetHistory(assetId)]);
      setAsset(a);
      setHistory(h);
      setStatusTo(a.status_code);
      setOverrideModelDraft(a.override_model ?? "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  };

  useEffect(() => {
    void reload();
    Promise.all([listStatuses(), listLocations()])
      .then(([s, l]) => {
        setStatuses(s);
        setLocations(l);
      })
      .catch((e) => setError(e.message));
  }, [assetId]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!asset) return <p className="text-muted">Loading…</p>;

  const isArchived = asset.archived_at !== null;
  const isComputer =
    asset.asset_type === "laptop" ||
    asset.asset_type === "desktop" ||
    asset.asset_type === "thin_client";

  async function handleIntuneSync() {
    if (!asset) return;
    setIntuneSyncing(true);
    setIntuneMessage(null);
    try {
      const res = await syncAssetFromIntune(asset.id);
      if (!res.found) {
        setIntuneMessage("Not found in Intune. The device may not have enrolled yet.");
      } else if (res.changed.length === 0) {
        setIntuneMessage("In Intune. No new fields to update.");
      } else {
        setIntuneMessage(`Synced from Intune. Updated: ${res.changed.join(", ")}`);
      }
      void reload();
    } catch (e) {
      setIntuneMessage(e instanceof Error ? e.message : "Intune sync failed");
    } finally {
      setIntuneSyncing(false);
    }
  }

  async function handleViewInIntune() {
    if (!asset) return;
    try {
      const { url } = await getIntunePortalUrl(asset.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setIntuneMessage(e instanceof Error ? e.message : "Could not get Intune URL");
    }
  }

  return (
    <div>
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          ← Back
        </button>
        {isComputer && !isArchived && (
          <div className="cluster">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void handleIntuneSync()}
              disabled={intuneSyncing}
            >
              {intuneSyncing ? "Syncing…" : "Sync from Intune"}
            </button>
            {asset.intune_id && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void handleViewInIntune()}
              >
                View in Intune ↗
              </button>
            )}
          </div>
        )}
      </div>

      {intuneMessage && (
        <div className="alert alert-info mt-2">{intuneMessage}</div>
      )}

      <h2 className="heading-2 mt-3">
        {asset.asset_tag ?? asset.serial_number}{" "}
        <span className="text-muted text-sm">({asset.asset_type})</span>
      </h2>

      {asset.intune_synced_at && (
        <p className="text-muted text-xs">
          Last Intune sync: {new Date(asset.intune_synced_at).toLocaleString()}
        </p>
      )}

      <Grid>
        <KV k="Serial" v={asset.serial_number} mono />
        <KV k="Status" v={asset.status_code} />
        <KV k="Manufacturer" v={asset.manufacturer ?? "—"} />
        <KV k="Model" v={friendlyModel(asset)} />
        {asset.model && asset.model !== friendlyModel(asset) && (
          <KV k="Raw model" v={asset.model} mono />
        )}
        <KV
          k="OS"
          v={asset.os ? osDisplay(asset.os, asset.os_version) : "—"}
          title={asset.os_version ?? undefined}
        />
        <KV k="Assigned" v={asset.assigned_upn ?? "—"} />
        <KV
          k="Location"
          v={
            asset.location_id !== null
              ? locations.find((l) => l.id === asset.location_id)?.name ??
                String(asset.location_id)
              : "—"
          }
        />
        <KV k="Onboarded" v={asset.onboarded_at} />
        {isArchived && <KV k="Archived" v={asset.archived_at!} />}
      </Grid>

      {isComputer && asset.intune_id && (
        <section className="card mt-4">
          <div className="card-header">
            <span className="eyebrow">Intune</span>
          </div>
          <div className="card-body">
            <Grid>
              <KV k="Device name" v={asset.intune_device_name ?? "—"} />
              <KV k="Managed by" v={asset.intune_managed_by ?? "—"} />
              <KV k="Ownership" v={asset.intune_ownership ?? "—"} />
              <KV k="Compliance" v={asset.intune_compliance ?? "—"} />
              <KV k="Primary user" v={asset.assigned_upn ?? "—"} />
              <KV
                k="Last check-in"
                v={
                  asset.intune_last_check_in
                    ? new Date(asset.intune_last_check_in).toLocaleString()
                    : "—"
                }
              />
            </Grid>
          </div>
        </section>
      )}

      {!isArchived && (
        <div className="stack-lg mt-6">
          <section className="card">
            <div className="card-header">
              <h3 className="heading-3">Override model name</h3>
            </div>
            <div className="card-body stack">
              <p className="text-muted text-sm">
                Set a custom display name for this asset's model. Wins over
                Lenovo's friendly name and the raw model code. Leave blank to
                use the auto-detected name.
              </p>
              <div className="form-row">
                <Field label="Override model">
                  <input
                    className="input"
                    value={overrideModelDraft}
                    onChange={(e) => setOverrideModelDraft(e.target.value)}
                    placeholder="e.g. Pricing Team Workstation"
                  />
                </Field>
                <Field label=" ">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={
                      savingOverride ||
                      overrideModelDraft.trim() === (asset.override_model ?? "")
                    }
                    onClick={async () => {
                      setSavingOverride(true);
                      try {
                        await updateAsset(asset.id, {
                          override_model: overrideModelDraft.trim() || null,
                        });
                        await reload();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Save failed");
                      } finally {
                        setSavingOverride(false);
                      }
                    }}
                  >
                    {savingOverride ? "Saving…" : "Save"}
                  </button>
                </Field>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h3 className="heading-3">Assign</h3>
            </div>
            <div className="card-body stack">
              <div className="form-row">
                <Field label="User UPN">
                  <input
                    className="input"
                    placeholder="user@upn"
                    value={assignUpn}
                    onChange={(e) => setAssignUpn(e.target.value)}
                  />
                </Field>
                <Field label="Location">
                  <Select
                    value={assignLoc === "" ? "" : String(assignLoc)}
                    onChange={(v) => setAssignLoc(v === "" ? "" : Number(v))}
                    placeholder="— location —"
                    options={[
                      { value: "", label: "— location —" },
                      ...locations.map((l) => ({
                        value: String(l.id),
                        label: l.name,
                      })),
                    ]}
                  />
                </Field>
              </div>
              <div className="cluster">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    await assignAsset(asset.id, {
                      assigned_upn: assignUpn || undefined,
                      location_id: assignLoc === "" ? undefined : Number(assignLoc),
                    });
                    setAssignUpn("");
                    setAssignLoc("");
                    void reload();
                  }}
                  disabled={!assignUpn && assignLoc === ""}
                >
                  Assign
                </button>
                {asset.assigned_upn && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      await unassignAsset(asset.id);
                      void reload();
                    }}
                  >
                    Unassign
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h3 className="heading-3">Change status</h3>
            </div>
            <div className="card-body cluster">
              <div style={{ minWidth: 200, maxWidth: 240 }}>
                <Select
                  value={statusTo}
                  onChange={setStatusTo}
                  options={statuses.map((s) => ({
                    value: s.code,
                    label: s.label,
                  }))}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  await changeAssetStatus(asset.id, { status_code: statusTo });
                  void reload();
                }}
                disabled={statusTo === asset.status_code}
              >
                Update status
              </button>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h3 className="heading-3">Archive / offboard</h3>
            </div>
            <div className="card-body">
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Archive asset?",
                    message: "Archived assets are removed from active inventory.",
                    tone: "danger",
                    confirmLabel: "Archive",
                  });
                  if (!ok) return;
                  await archiveAsset(asset.id);
                  void reload();
                }}
              >
                Archive asset
              </button>
            </div>
          </section>
        </div>
      )}

      <section className="stack mt-6">
        <h3 className="heading-3">History</h3>
        {history.length === 0 ? (
          <p className="text-muted text-sm">No history yet.</p>
        ) : (
          <ul className="list-clean stack">
            {history.map((h) => (
              <li key={h.id} className="card card-body">
                <div className="cluster" style={{ justifyContent: "space-between" }}>
                  <div className="cluster">
                    <span className="badge">{h.event_type}</span>
                    {h.from_value !== null && (
                      <span className="text-muted text-xs">
                        from <code className="text-mono">{h.from_value}</code>
                      </span>
                    )}
                    {h.to_value !== null && (
                      <span className="text-muted text-xs">
                        to <code className="text-mono">{h.to_value}</code>
                      </span>
                    )}
                  </div>
                  <span className="text-muted text-xs">
                    {new Date(h.performed_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-muted text-xs mt-1">
                  by {h.performed_by_upn ?? "—"}
                  {h.notes ? ` · ${h.notes}` : ""}
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

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid-3 mt-3">{children}</div>;
}

function KV({
  k,
  v,
  mono,
  title,
}: {
  k: string;
  v: string;
  mono?: boolean;
  title?: string;
}) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <span className="eyebrow">{k}</span>
      <span className={mono ? "text-mono" : "text-text"} title={title}>
        {v}
      </span>
    </div>
  );
}
