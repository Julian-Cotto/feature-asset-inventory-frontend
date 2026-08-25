import { useEffect, useState } from "react";
import { ClockAlert, RefreshCw } from "lucide-react";

import Select from "../components/Select";
import { StatTile, StatTileRow } from "../components/StatTile";
import { AccentPill, FreshnessCell } from "../components/visual";
import { getCheckinExceptions } from "../services/compliance";
import { listLocations } from "../services/inventory";
import { locationLabel } from "../utils/locationLabel";
import type { Location } from "../types/inventory";
import type { CheckinExceptions } from "../types/compliance";

interface Props {
  onAssetClick?: (id: number) => void;
}

const ASSET_TYPES = [
  "laptop",
  "desktop",
  "thin_client",
  "ap",
  "switch",
  "gateway",
  "pos_aio",
  "pos_thin_client",
  "pos_tablet",
  "card_reader",
  "printer_office",
  "printer_receipt",
];

function complianceTone(c: string | null): string {
  if (!c) return "badge";
  const v = c.toLowerCase();
  if (v === "compliant") return "badge badge-success";
  if (v === "noncompliant" || v === "non_compliant") return "badge badge-danger";
  return "badge badge-warning";
}

export default function CheckinExceptions({ onAssetClick }: Props) {
  const [data, setData] = useState<CheckinExceptions | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [days, setDays] = useState(7);
  const [includeNever, setIncludeNever] = useState(true);
  const [assetType, setAssetType] = useState("");
  const [locationId, setLocationId] = useState<string>("");

  const reload = () => {
    setLoading(true);
    return getCheckinExceptions({
      days,
      include_never: includeNever,
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
  }, [days, includeNever, assetType, locationId]);

  useEffect(() => {
    void listLocations().then(setLocations).catch(() => setLocations([]));
  }, []);

  const rows = data?.rows ?? [];
  const stale = data ? data.total - data.never_checked_in : 0;

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <ClockAlert size={20} strokeWidth={1.75} />
          <h2 className="heading-2" style={{ margin: 0 }}>
            Check-in exceptions
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
        Intune-managed devices whose last check-in is older than the window
        below. Adjust the day threshold to widen or narrow the exceptions.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <StatTileRow>
        <StatTile
          label={`Exceptions (>${days}d)`}
          value={data?.total ?? 0}
          tone={(data?.total ?? 0) > 0 ? "danger" : "success"}
        />
        <StatTile label={`Stale >${days}d`} value={stale} tone="warning" />
        <StatTile
          label="Never checked in"
          value={data?.never_checked_in ?? 0}
          tone={(data?.never_checked_in ?? 0) > 0 ? "danger" : "neutral"}
        />
      </StatTileRow>

      <section className="section-block">
        <span className="eyebrow">Filters</span>
        <div className="cluster" style={{ gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="stack" style={{ gap: 2 }}>
            <span className="text-xs text-muted">Older than (days)</span>
            <input
              className="input input-sm"
              type="number"
              min={0}
              max={365}
              value={days}
              onChange={(e) => setDays(Math.max(0, Number(e.target.value) || 0))}
              style={{ width: 110 }}
            />
          </label>
          <label className="stack" style={{ gap: 2 }}>
            <span className="text-xs text-muted">Asset type</span>
            <select
              className="input input-sm"
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
            >
              <option value="">All types</option>
              {ASSET_TYPES.map((t) => (
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
              checked={includeNever}
              onChange={(e) => setIncludeNever(e.target.checked)}
            />
            <span className="text-sm">Include never-checked-in</span>
          </label>
        </div>
      </section>

      <div className="card">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Serial</th>
                <th>Type</th>
                <th>Assigned to</th>
                <th>Location</th>
                <th>Compliance</th>
                <th>Last check-in</th>
                <th>Days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.asset_id}
                  className="row-clickable"
                  onClick={() => onAssetClick?.(r.asset_id)}
                >
                  <td>{r.intune_device_name ?? <span className="text-muted">—</span>}</td>
                  <td>
                    <span className="font-mono text-xs">{r.asset_tag ?? r.serial_number}</span>
                  </td>
                  <td>
                    <AccentPill value={r.asset_type} />
                  </td>
                  <td>
                    {r.assigned_upn ?? <span className="text-muted">unassigned</span>}
                  </td>
                  <td>{r.location_name ?? <span className="text-muted">—</span>}</td>
                  <td>
                    <span className={complianceTone(r.compliance)}>
                      {r.compliance ?? "unknown"}
                    </span>
                  </td>
                  <td>
                    {r.never_checked_in ? (
                      <span className="badge badge-danger">never</span>
                    ) : (
                      <FreshnessCell iso={r.last_check_in} />
                    )}
                  </td>
                  <td>
                    {r.days_since != null ? (
                      <span
                        style={{
                          color:
                            r.days_since >= 30
                              ? "rgb(var(--color-danger))"
                              : "rgb(var(--color-warning))",
                          fontWeight: 600,
                        }}
                      >
                        {r.days_since}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    {loading
                      ? "Loading…"
                      : `No Intune devices are stale beyond ${days} day${days === 1 ? "" : "s"}.`}
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
