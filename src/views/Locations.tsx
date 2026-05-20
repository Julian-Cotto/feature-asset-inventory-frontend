import { useEffect, useState } from "react";
import { MapPin, Plus, RefreshCw, Trash2, Warehouse } from "lucide-react";

import Select from "../components/Select";
import {
  createLocation,
  deleteLocation,
  listLocations,
  syncLocationsFromSnowflake,
  updateLocation,
  type LocationSyncResult,
} from "../services/inventory";
import type { Location, LocationType } from "../types/inventory";
import { useAlert, useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { AccentPill, Avatar, SectionHeader } from "../components/visual";

export default function Locations() {
  const confirm = useConfirm();
  const alertModal = useAlert();
  const toast = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("warehouse");
  const [address, setAddress] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<LocationSyncResult | null>(null);

  const doSync = async () => {
    const ok = await confirm({
      title: "Sync locations from Snowflake?",
      message:
        "Pulls open corporate locations from CORPORATE.LOCATIONS_ALL_V and upserts into the local table. Locations missing from Snowflake are deactivated, not deleted.",
      tone: "info",
      confirmLabel: "Run",
    });
    if (!ok) return;
    setSyncing(true);
    try {
      const r = await toast.run(() => syncLocationsFromSnowflake(), {
        pending: "Syncing locations from Snowflake…",
        success: (rr) =>
          `Snowflake sync: ${rr.created} created, ${rr.updated} updated, ${rr.deactivated} deactivated`,
        error: "Snowflake sync failed",
      });
      setSyncResult(r);
      void reload();
    } catch {
      // toast surfaced the error
    } finally {
      setSyncing(false);
    }
  };

  const reload = () =>
    listLocations(true)
      .then(setLocations)
      .catch((e) => setError(e.message));

  useEffect(() => {
    void reload();
  }, []);

  const create = async () => {
    setError(null);
    try {
      await createLocation({
        code: code.trim(),
        name: name.trim(),
        type,
        address: address || null,
      });
      setCode("");
      setName("");
      setAddress("");
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  const activeCount = locations.filter((l) => l.is_active).length;
  const totalCount = locations.length;

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Locations</h2>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void doSync()}
          disabled={syncing}
          title="Pull corporate locations from Snowflake"
        >
          <RefreshCw
            size={14}
            className={syncing ? "animate-spin" : ""}
            strokeWidth={1.75}
          />
          {syncing ? "Syncing…" : "Sync from Snowflake"}
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {syncResult && (
        <div className="alert alert-info">
          Snowflake sync: <strong>{syncResult.created}</strong> created,{" "}
          <strong>{syncResult.updated}</strong> updated,{" "}
          {syncResult.unchanged} unchanged, {syncResult.deactivated}{" "}
          deactivated, {syncResult.errors.length} errors. Fetched{" "}
          {syncResult.fetched} rows.
        </div>
      )}

      <div className="card card-body stack">
        <SectionHeader
          icon={<Plus size={16} />}
          title="Add location"
          tint="amber"
        />
        <div className="form-row">
          <div className="field" style={{ flex: 1 }}>
            <label className="label">Code</label>
            <input
              className="input"
              placeholder="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label className="label">Name</label>
            <input
              className="input"
              placeholder="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field" style={{ minWidth: "10rem" }}>
            <label className="label">Type</label>
            <Select
              value={type}
              onChange={(v) => setType(v as LocationType)}
              options={[
                { value: "warehouse", label: "warehouse" },
                { value: "site", label: "site" },
              ]}
            />
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label className="label">Address</label>
            <input
              className="input"
              placeholder="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="field" style={{ alignSelf: "flex-end" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void create()}
              disabled={!code || !name}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="card card-body stack">
        <SectionHeader
          icon={<MapPin size={16} />}
          title="Locations"
          tint="info"
          right={
            <span className="text-xs text-muted">
              <span className="text-success-soft-fg font-medium">
                {activeCount}
              </span>{" "}
              active / {totalCount} total
            </span>
          }
        />
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Type</th>
                <th>Address</th>
                <th>Active</th>
                <th className="col-sticky-right" />
              </tr>
            </thead>
            <tbody>
              {locations.map((l) => (
                <tr key={l.id} style={{ opacity: l.is_active ? 1 : 0.55 }}>
                  <td>
                    <div
                      className="cluster"
                      style={{ gap: "0.625rem", flexWrap: "nowrap" }}
                    >
                      <Avatar seed={l.code} name={l.name} />
                      <div
                        className="stack"
                        style={{ gap: 1, minWidth: 0 }}
                      >
                        <span className="font-medium truncate">{l.name}</span>
                        <span className="font-mono text-xs text-muted truncate">
                          {l.code}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className="cluster"
                      style={{ gap: "0.375rem", flexWrap: "nowrap" }}
                    >
                      {l.type === "warehouse" ? (
                        <Warehouse
                          size={12}
                          className="text-info-soft-fg shrink-0"
                          aria-hidden
                        />
                      ) : (
                        <MapPin
                          size={12}
                          className="text-success-soft-fg shrink-0"
                          aria-hidden
                        />
                      )}
                      <AccentPill value={l.type} />
                    </span>
                  </td>
                  <td className="text-muted text-sm">{l.address ?? "—"}</td>
                  <td>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={l.is_active}
                      onChange={async (e) => {
                        await updateLocation(l.id, {
                          is_active: e.target.checked,
                        });
                        void reload();
                      }}
                      aria-label={`Toggle ${l.name} active`}
                    />
                  </td>
                  <td className="col-sticky-right">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title="Delete location"
                      aria-label="Delete location"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Delete location?",
                          message: `Delete "${l.name}"? This cannot be undone.`,
                          tone: "danger",
                          confirmLabel: "Delete",
                        });
                        if (!ok) return;
                        try {
                          await deleteLocation(l.id);
                          void reload();
                        } catch (err) {
                          await alertModal({
                            title: "Delete failed",
                            message:
                              err instanceof Error ? err.message : String(err),
                            tone: "danger",
                          });
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {locations.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    No locations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
