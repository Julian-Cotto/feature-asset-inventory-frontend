import { useEffect, useState } from "react";

import {
  archiveAsset,
  assignAsset,
  changeAssetStatus,
  collectDefenderForensics,
  getAsset,
  getAssetHistory,
  getIntunePortalUrl,
  listLocations,
  listStatuses,
  syncAssetFromIntune,
  unassignAsset,
  updateAsset,
} from "../services/inventory";
import AssetNetworkAppearances from "../components/AssetNetworkAppearances";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { listUsers } from "../services/users";
import type { IntuneUser } from "../types/user";
import Select from "../components/Select";
import { assetTypeBadgeClass, assetTypeLabel } from "../utils/assetTypeBadge";
import { friendlyModel } from "../utils/friendlyModel";
import { osDisplay } from "../utils/osDisplay";
import { statusBadgeClass, statusLabel } from "../utils/statusBadge";
import { warrantyDisplay } from "../utils/warranty";
import type {
  Asset,
  AssetHistoryEntry,
  AssetStatus,
  Location,
} from "../types/inventory";

interface Props {
  assetId: number;
  onBack: () => void;
  onNetworkClick?: (id: number) => void;
}

export default function AssetDetail({ assetId, onBack, onNetworkClick }: Props) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [history, setHistory] = useState<AssetHistoryEntry[]>([]);
  const [statuses, setStatuses] = useState<AssetStatus[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [assignUpn, setAssignUpn] = useState("");
  const [assignLoc, setAssignLoc] = useState<number | "">("");
  const [users, setUsers] = useState<IntuneUser[]>([]);
  const [statusTo, setStatusTo] = useState("");
  const [intuneSyncing, setIntuneSyncing] = useState(false);
  const [forensicsBusy, setForensicsBusy] = useState(false);
  const [overrideModelDraft, setOverrideModelDraft] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  async function handleCollectForensics() {
    if (!asset) return;
    const ok = await confirm({
      title: "Collect forensics on this device?",
      message:
        "Triggers Microsoft Defender to gather an investigation (forensic) package on the device. The collection runs async on Defender's side and can take several minutes. The user may see a Defender notification on their machine.",
      tone: "warning",
      confirmLabel: "Trigger",
    });
    if (!ok) return;
    setForensicsBusy(true);
    try {
      await toast.run(() => collectDefenderForensics(asset.id), {
        pending: "Triggering Defender forensics collection…",
        success: (r) =>
          `Defender accepted the request (status: ${r.status ?? "submitted"})`,
        error: "Forensics request failed",
      });
    } catch {
      // toast already surfaced the error
    } finally {
      setForensicsBusy(false);
    }
  }

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
    // Users dropdown for the Assign panel — best-effort, ignored on failure.
    listUsers().then(setUsers).catch(() => {});
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
    try {
      await toast.run(() => syncAssetFromIntune(asset.id), {
        pending: "Syncing from Intune + Defender…",
        success: (res) => {
          if (!res.found) return "Not found in Intune yet.";
          if (res.changed.length === 0) return "Already up to date.";
          return `Synced. Updated: ${res.changed.join(", ")}`;
        },
        error: "Intune sync failed",
      });
      void reload();
    } catch {
      // toast.run already surfaced the error.
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
      toast.notify({
        kind: "danger",
        title: "Could not open Intune portal",
        detail: e instanceof Error ? e.message : String(e),
      });
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

      <h2 className="heading-2 mt-3">
        {asset.asset_tag ?? asset.serial_number}{" "}
        <span className="text-muted text-sm">({asset.asset_type})</span>
      </h2>

      {asset.intune_synced_at && (
        <p className="text-muted text-xs">
          Last Intune sync: {new Date(asset.intune_synced_at).toLocaleString()}
        </p>
      )}

      {(() => {
        const warranty = warrantyDisplay(asset);
        const warrantyCls =
          warranty.variant === "success"
            ? "badge badge-success"
            : warranty.variant === "danger"
              ? "badge badge-danger"
              : "badge badge-warning";
        const locationName =
          asset.location_id !== null
            ? locations.find((l) => l.id === asset.location_id)?.name ??
              String(asset.location_id)
            : null;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
            <section className="card card-body stack">
              <span className="eyebrow">Identity</span>
              <KV k="Serial" v={asset.serial_number} mono />
              <KV k="Tag" v={asset.asset_tag ?? "—"} mono />
              <div className="field">
                <span className="eyebrow">Type</span>
                <span>
                  <span className={assetTypeBadgeClass(asset.asset_type)}>
                    {assetTypeLabel(asset.asset_type)}
                  </span>
                </span>
              </div>
              <div className="field">
                <span className="eyebrow">Status</span>
                <span className="cluster" style={{ gap: "0.3rem" }}>
                  <span className={statusBadgeClass(asset.status_code)}>
                    {statusLabel(asset.status_code)}
                  </span>
                  {asset.reserved_by_kind && (
                    <span
                      className="badge badge-warning"
                      title={`Reserved by ${asset.reserved_by_kind} ${asset.reserved_by_label ?? ""}`}
                    >
                      {asset.reserved_by_kind === "deployment"
                        ? "deploy"
                        : "ship"}
                    </span>
                  )}
                </span>
              </div>
            </section>

            <section className="card card-body stack">
              <span className="eyebrow">Hardware</span>
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
              <div className="field">
                <span className="eyebrow">Warranty</span>
                <span className="cluster" style={{ gap: "0.4rem" }}>
                  <span className={warrantyCls}>{warranty.label}</span>
                  {warranty.date && (
                    <span className="text-muted text-xs">{warranty.date}</span>
                  )}
                </span>
              </div>
            </section>

            <section className="card card-body stack">
              <span className="eyebrow">Assignment</span>
              <KV k="Assigned" v={asset.assigned_upn ?? "—"} />
              <KV k="Location" v={locationName ?? "—"} />
              <KV
                k="Network"
                v={
                  asset.network_id && asset.network_name ? (
                    <button
                      type="button"
                      className="btn btn-link btn-sm"
                      onClick={() =>
                        asset.network_id !== null &&
                        onNetworkClick?.(asset.network_id)
                      }
                      style={{ padding: 0 }}
                      title="Open network"
                    >
                      {asset.network_name}
                    </button>
                  ) : (
                    "—"
                  )
                }
              />
              <KV
                k="Onboarded"
                v={
                  asset.onboarded_at
                    ? new Date(asset.onboarded_at).toLocaleDateString()
                    : "—"
                }
              />
              {isArchived && (
                <KV
                  k="Archived"
                  v={
                    asset.archived_at
                      ? new Date(asset.archived_at).toLocaleString()
                      : "—"
                  }
                />
              )}
            </section>
          </div>
        );
      })()}

      {isComputer && asset.intune_id && (
        <section className="card card-body stack mt-4">
          <span className="eyebrow">Intune</span>
          <Grid>
            <KV k="Device name" v={asset.intune_device_name ?? "—"} />
            <KV k="Managed by" v={asset.intune_managed_by ?? "—"} />
            <KV k="Ownership" v={asset.intune_ownership ?? "—"} />
            <KV k="Compliance" v={asset.intune_compliance ?? "—"} />
            <KV k="Primary user" v={asset.assigned_upn ?? "—"} />
            <KV
              k="MAC address"
              v={asset.mac_address ?? "—"}
              mono
              title={
                asset.mac_address
                  ? "Sourced from Intune wiFiMacAddress / ethernetMacAddress"
                  : "Run an Intune sync to populate"
              }
            />
            <KV
              k="Last check-in"
              v={
                asset.intune_last_check_in
                  ? new Date(asset.intune_last_check_in).toLocaleString()
                  : "—"
              }
            />
          </Grid>
        </section>
      )}

      {isComputer && asset.intune_synced_at && (
        <section className="card card-body stack mt-4">
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <span className="eyebrow">Defender for Endpoint</span>
            {asset.defender_id && !isArchived && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void handleCollectForensics()}
                disabled={forensicsBusy}
                title="Trigger Defender to gather an investigation package on this device. Async — completes on Defender's side."
              >
                {forensicsBusy ? "Triggering…" : "Collect forensics"}
              </button>
            )}
          </div>
          {!asset.defender_id ? (
            <DefenderStub asset={asset} />
          ) : (
            <Grid>
              <KV
                k="Health"
                v={asset.defender_health_status ?? "—"}
                valueClass={healthClass(asset.defender_health_status)}
              />
              <KV
                k="Risk score"
                v={asset.defender_risk_score ?? "—"}
                valueClass={riskClass(asset.defender_risk_score)}
              />
              <KV
                k="Exposure"
                v={asset.defender_exposure_level ?? "—"}
                valueClass={riskClass(asset.defender_exposure_level)}
              />
              <KV
                k="Onboarding"
                v={asset.defender_onboarding_status ?? "—"}
              />
              <KV k="AV status" v={asset.defender_av_status ?? "—"} />
              <KV k="OS build" v={asset.defender_os_build ?? "—"} />
              <KV k="Last IP" v={asset.defender_last_ip ?? "—"} mono />
              <KV
                k="Last seen by Defender"
                v={
                  asset.defender_last_seen_at
                    ? new Date(asset.defender_last_seen_at).toLocaleString()
                    : "—"
                }
              />
              <KV
                k="Tags"
                v={(() => {
                  try {
                    const arr = asset.defender_tags
                      ? (JSON.parse(asset.defender_tags) as string[])
                      : [];
                    return arr.length ? arr.join(", ") : "—";
                  } catch {
                    return asset.defender_tags ?? "—";
                  }
                })()}
              />
              <KV k="Defender ID" v={asset.defender_id} mono />
              <KV
                k="Defender synced"
                v={
                  asset.defender_synced_at
                    ? new Date(asset.defender_synced_at).toLocaleString()
                    : "—"
                }
              />
            </Grid>
          )}
        </section>
      )}

      {!isArchived && (
        <div className="stack-lg mt-6">
          <section className="section-block">
            <h3 className="heading-3">Override model name</h3>
            <p className="text-muted text-sm">
                Set a custom display name for this asset's model. Wins over
                Lenovo's friendly name and the raw model code. Leave blank to
                use the auto-detected name.
              </p>
              <Field label="Override model">
                <div
                  className="cluster"
                  style={{ gap: "0.5rem", flexWrap: "nowrap" }}
                >
                  <input
                    className="input"
                    style={{ flex: 1, minWidth: 0 }}
                    value={overrideModelDraft}
                    onChange={(e) => setOverrideModelDraft(e.target.value)}
                    placeholder="e.g. Pricing Team Workstation"
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ flexShrink: 0 }}
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
                </div>
              </Field>
          </section>

          <section className="section-block">
            <h3 className="heading-3">Assign</h3>
            <div className="form-row">
                <Field label="User">
                  {/* Options are the cached IntuneUser rows from the Users
                      view. If `assigned_upn` is already set but the user
                      isn't in the cache (deleted, or never synced), we
                      prepend a stub option so the value still renders. */}
                  <Select
                    value={assignUpn}
                    onChange={setAssignUpn}
                    placeholder={
                      users.length === 0
                        ? "No users cached — sync from Users tab"
                        : "— pick a user —"
                    }
                    searchable
                    searchPlaceholder="Search name, UPN, mail, title, department…"
                    options={[
                      { value: "", label: "— pick a user —" },
                      ...(assignUpn &&
                      !users.some((u) => u.user_principal_name === assignUpn)
                        ? [{ value: assignUpn, label: `${assignUpn} (not in cache)` }]
                        : []),
                      ...users.map((u) => ({
                        value: u.user_principal_name,
                        label: u.display_name
                          ? `${u.display_name} · ${u.user_principal_name}`
                          : u.user_principal_name,
                      })),
                    ]}
                  />
                </Field>
                <Field label="Location">
                  <Select
                    value={assignLoc === "" ? "" : String(assignLoc)}
                    onChange={(v) => setAssignLoc(v === "" ? "" : Number(v))}
                    placeholder="— location —"
                    searchable
                    searchPlaceholder="Search name, code, city…"
                    options={locations.map((l) => ({
                      value: String(l.id),
                      label: l.name,
                    }))}
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
          </section>

          <section className="section-block">
            <h3 className="heading-3">Change status</h3>
            <div className="cluster">
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

          <section className="section-block">
            <h3 className="heading-3">Archive / offboard</h3>
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
          </section>
        </div>
      )}

      <AssetNetworkAppearances
        assetId={asset.id}
        onNetworkClick={onNetworkClick}
      />

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
  valueClass,
}: {
  k: string;
  v: React.ReactNode;
  mono?: boolean;
  title?: string;
  valueClass?: string;
}) {
  const cls =
    valueClass ?? (mono ? "text-mono" : "text-text");
  return (
    <div className="stack" style={{ gap: 2 }}>
      <span className="eyebrow">{k}</span>
      <span className={cls} title={title}>
        {v}
      </span>
    </div>
  );
}

function DefenderStub({ asset }: { asset: Asset }) {
  // Three diagnostic states based on what the sync did/didn't capture:
  //
  //  1. No aad_device_id  → Intune didn't surface azureADDeviceId on this
  //                         record (rare; usually means device isn't AAD-joined).
  //  2. No defender_synced_at → Defender lookup threw (most likely permission
  //                         missing: AppReg lacks WindowsDefenderATP.Machine.Read.All
  //                         with admin consent).
  //  3. Has defender_synced_at but no defender_id → lookup ran cleanly but
  //                         returned no match — device not onboarded to Defender.
  let title: string;
  let hint: string;
  let tone: "warning" | "info";
  if (!asset.aad_device_id) {
    title = "No Azure AD device ID on this asset";
    hint =
      "Intune didn't return an azureADDeviceId for this record, so we can't look up Defender. Usually means the device isn't AAD-joined.";
    tone = "info";
  } else if (!asset.defender_synced_at) {
    title = "Defender lookup failed";
    hint =
      "The aadDeviceId bridge captured but the Defender API call didn't complete. Most common cause: the Azure AD app registration is missing WindowsDefenderATP.Machine.Read.All (Application) with admin consent. Check the backend logs for `defender_lookup_failed`.";
    tone = "warning";
  } else {
    title = "Not onboarded to Defender";
    hint =
      "Lookup ran and returned no matching machine. This device isn't onboarded to Microsoft Defender for Endpoint.";
    tone = "info";
  }
  return (
    <div className="stack" style={{ gap: "0.5rem" }}>
      <div className={`alert alert-${tone}`}>
        <strong>{title}</strong>
        <div className="text-xs" style={{ marginTop: "0.25rem" }}>
          {hint}
        </div>
      </div>
      <Grid>
        <KV k="aadDeviceId" v={asset.aad_device_id ?? "—"} mono />
        <KV
          k="Last lookup"
          v={
            asset.defender_synced_at
              ? new Date(asset.defender_synced_at).toLocaleString()
              : "— (never)"
          }
        />
      </Grid>
    </div>
  );
}

function healthClass(status: string | null): string {
  if (!status) return "text-text";
  switch (status.toLowerCase()) {
    case "active":
      return "text-success-soft-fg";
    case "inactive":
    case "nosensordata":
    case "nosensordataimpairedcommunication":
      return "text-danger-soft-fg";
    case "impairedcommunication":
      return "text-warning-soft-fg";
    default:
      return "text-text";
  }
}

function riskClass(level: string | null): string {
  if (!level) return "text-text";
  switch (level.toLowerCase()) {
    case "high":
      return "text-danger-soft-fg font-semibold";
    case "medium":
      return "text-warning-soft-fg font-semibold";
    case "low":
    case "informational":
      return "text-primary-soft-fg";
    case "none":
      return "text-success-soft-fg";
    default:
      return "text-text";
  }
}
