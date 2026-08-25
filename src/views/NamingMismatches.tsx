import { useEffect, useMemo, useState } from "react";
import { RefreshCw, UserX } from "lucide-react";

import Select from "../components/Select";
import { StatTile, StatTileRow } from "../components/StatTile";
import { useToast } from "../components/ToastProvider";
import { AccentPill } from "../components/visual";
import {
  ackNamingMismatch,
  getNamingMismatches,
  unackNamingMismatch,
} from "../services/compliance";
import { listLocations } from "../services/inventory";
import { locationLabel } from "../utils/locationLabel";
import type { Location } from "../types/inventory";
import type { NamingMismatches } from "../types/compliance";

interface Props {
  onAssetClick?: (id: number) => void;
}

const SCOPE_TYPES = ["laptop", "desktop", "thin_client"];

export default function NamingMismatches({ onAssetClick }: Props) {
  const toast = useToast();
  const [data, setData] = useState<NamingMismatches | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAck, setBusyAck] = useState<number | null>(null);

  const [reason, setReason] = useState<"" | "mismatch" | "fuzzy">("");
  const [assetType, setAssetType] = useState("");
  const [locationId, setLocationId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [showAcked, setShowAcked] = useState(false);

  const reload = () => {
    setLoading(true);
    return getNamingMismatches({
      asset_type: assetType || undefined,
      location_id: locationId ? Number(locationId) : undefined,
    })
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetType, locationId]);

  useEffect(() => {
    void listLocations().then(setLocations).catch(() => setLocations([]));
  }, []);

  const doAck = async (assetId: number, acked: boolean) => {
    setBusyAck(assetId);
    try {
      await toast.run(
        () => (acked ? unackNamingMismatch(assetId) : ackNamingMismatch(assetId)),
        {
          pending: acked ? "Restoring…" : "Acknowledging…",
          success: acked ? "Restored to the report" : "Acknowledged",
          error: "Failed",
        },
      );
      void reload();
    } catch {
      /* toast surfaced */
    } finally {
      setBusyAck(null);
    }
  };

  const needle = search.trim().toLowerCase();
  const rows = useMemo(() => {
    let r = data?.rows ?? [];
    if (!showAcked) r = r.filter((x) => !x.acknowledged);
    if (reason) r = r.filter((x) => x.reason === reason);
    if (needle)
      r = r.filter((x) =>
        [x.intune_device_name, x.assigned_upn, x.user_display, x.serial_number]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(needle)),
      );
    return r;
  }, [data, reason, needle, showAcked]);

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <UserX size={20} strokeWidth={1.75} />
          <h2 className="heading-2" style={{ margin: 0 }}>
            Naming mismatches
          </h2>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void reload()}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} strokeWidth={1.75} />
          Refresh
        </button>
      </div>

      <p className="text-muted text-sm" style={{ margin: 0 }}>
        Computers whose Intune device name doesn't match the assigned user
        (e.g. <span className="font-mono">hrg-jdoe</span> should belong to{" "}
        <span className="font-mono">jdoe@…</span>). Company prefix is ignored;
        the user token comes from the UPN and the display name.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <StatTileRow>
        <StatTile label="Flagged" value={data?.total ?? 0} tone={(data?.total ?? 0) > 0 ? "warning" : "success"} />
        <StatTile
          label="Hard mismatches"
          value={data?.mismatch_count ?? 0}
          tone={(data?.mismatch_count ?? 0) > 0 ? "danger" : "neutral"}
        />
        <StatTile
          label="Fuzzy (review)"
          value={data?.fuzzy_count ?? 0}
          tone={(data?.fuzzy_count ?? 0) > 0 ? "warning" : "neutral"}
        />
        <StatTile label="Acknowledged" value={data?.acknowledged_count ?? 0} tone="neutral" />
      </StatTileRow>

      <section className="section-block">
        <span className="eyebrow">Filters</span>
        <div className="cluster" style={{ gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <input
            className="input input-sm"
            placeholder="Search device / user / serial…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <label className="stack" style={{ gap: 2 }}>
            <span className="text-xs text-muted">Severity</span>
            <select
              className="input input-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value as "" | "mismatch" | "fuzzy")}
            >
              <option value="">All</option>
              <option value="mismatch">Hard mismatch</option>
              <option value="fuzzy">Fuzzy</option>
            </select>
          </label>
          <label className="stack" style={{ gap: 2 }}>
            <span className="text-xs text-muted">Asset type</span>
            <select
              className="input input-sm"
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
            >
              <option value="">All computers</option>
              {SCOPE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <div className="stack" style={{ gap: 2, minWidth: 240 }}>
            <span className="text-xs text-muted">Location</span>
            <Select
              value={locationId}
              onChange={setLocationId}
              placeholder="All locations"
              searchable
              searchPlaceholder="Filter by name / code / city"
              options={[
                { value: "", label: "All locations" },
                ...locations.map((l) => ({
                  value: String(l.id),
                  label: locationLabel(l),
                })),
              ]}
            />
          </div>
          <label className="cluster" style={{ gap: "0.4rem", whiteSpace: "nowrap" }}>
            <input
              type="checkbox"
              checked={showAcked}
              onChange={(e) => setShowAcked(e.target.checked)}
            />
            <span className="text-sm">Show acknowledged</span>
          </label>
        </div>
      </section>

      <div className="card">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Device name</th>
                <th>Serial</th>
                <th>Type</th>
                <th>Assigned to</th>
                <th>Expected</th>
                <th>Found</th>
                <th>Severity</th>
                <th>Location</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.asset_id}
                  className="row-clickable"
                  onClick={() => onAssetClick?.(r.asset_id)}
                  style={{ opacity: r.acknowledged ? 0.55 : 1 }}
                >
                  <td>
                    <span className="font-mono text-xs">{r.intune_device_name}</span>
                  </td>
                  <td>
                    <span className="font-mono text-xs">{r.asset_tag ?? r.serial_number}</span>
                  </td>
                  <td>
                    <AccentPill value={r.asset_type} />
                  </td>
                  <td>
                    <div className="stack" style={{ gap: 0 }}>
                      <span>{r.user_display ?? r.assigned_upn}</span>
                      {r.user_display && (
                        <span className="font-mono text-xs text-muted">{r.assigned_upn}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="font-mono text-xs">{r.expected ?? "—"}</span>
                  </td>
                  <td>
                    <span className="font-mono text-xs">{r.actual}</span>
                  </td>
                  <td>
                    {r.acknowledged ? (
                      <span
                        className="badge"
                        title={r.ack_note ?? "Acknowledged exception"}
                      >
                        acknowledged
                      </span>
                    ) : r.reason === "mismatch" ? (
                      <span className="badge badge-danger">mismatch</span>
                    ) : (
                      <span className="badge badge-warning">fuzzy</span>
                    )}
                  </td>
                  <td>{r.location_name ?? <span className="text-muted">—</span>}</td>
                  <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busyAck === r.asset_id}
                      onClick={() => void doAck(r.asset_id, r.acknowledged)}
                      title={
                        r.acknowledged
                          ? "Restore to the report"
                          : "Acknowledge as a known-good exception"
                      }
                    >
                      {busyAck === r.asset_id
                        ? "…"
                        : r.acknowledged
                          ? "Restore"
                          : "Acknowledge"}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    {loading
                      ? "Loading…"
                      : (data?.total ?? 0) === 0
                        ? "No naming mismatches — every assigned computer matches its user."
                        : "No rows match the current filter."}
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
