import { useEffect, useState } from "react";

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

export default function Locations() {
  const confirm = useConfirm();
  const alertModal = useAlert();
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
    setSyncResult(null);
    setError(null);
    try {
      const r = await syncLocationsFromSnowflake();
      setSyncResult(r);
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
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

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <input placeholder="code" value={code} onChange={(e) => setCode(e.target.value)} />
        <input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
        <div style={{ minWidth: "10rem" }}>
          <Select
            value={type}
            onChange={(v) => setType(v as LocationType)}
            options={[
              { value: "warehouse", label: "warehouse" },
              { value: "site", label: "site" },
            ]}
          />
        </div>
        <input
          placeholder="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button onClick={() => void create()} disabled={!code || !name}>
          Add
        </button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th>Code</th>
            <th>Name</th>
            <th>Type</th>
            <th>Address</th>
            <th>Active</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {locations.map((l) => (
            <tr key={l.id} style={{ borderBottom: "1px solid #eee" }}>
              <td>{l.code}</td>
              <td>{l.name}</td>
              <td>{l.type}</td>
              <td>{l.address ?? ""}</td>
              <td>
                <input
                  type="checkbox"
                  checked={l.is_active}
                  onChange={async (e) => {
                    await updateLocation(l.id, { is_active: e.target.checked });
                    void reload();
                  }}
                />
              </td>
              <td>
                <button
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
                        message: err instanceof Error ? err.message : String(err),
                        tone: "danger",
                      });
                    }
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
