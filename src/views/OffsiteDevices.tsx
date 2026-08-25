import { useEffect, useState } from "react";
import { Globe, RefreshCw } from "lucide-react";

import { StatTile, StatTileRow } from "../components/StatTile";
import { AccentPill, FreshnessCell } from "../components/visual";
import { getOffsiteDevices } from "../services/compliance";
import type { OffsiteDevices, OffsiteMode } from "../types/compliance";

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

const SEEN_WINDOWS = [
  { value: "", label: "Any time" },
  { value: "1", label: "Last 24h" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];

export default function OffsiteDevices({ onAssetClick }: Props) {
  const [data, setData] = useState<OffsiteDevices | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<OffsiteMode>("subnet");
  const [seenWithin, setSeenWithin] = useState("");
  const [assetType, setAssetType] = useState("");
  const [publicOnly, setPublicOnly] = useState(false);

  const reload = () => {
    setLoading(true);
    return getOffsiteDevices({
      mode,
      seen_within_days: seenWithin ? Number(seenWithin) : undefined,
      asset_type: assetType || undefined,
      public_only: publicOnly || undefined,
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
  }, [mode, seenWithin, assetType, publicOnly]);

  const rows = data?.rows ?? [];
  const publicCount = rows.filter((r) => r.is_public_ip).length;

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <Globe size={20} strokeWidth={1.75} />
          <h2 className="heading-2" style={{ margin: 0 }}>
            Offsite devices
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
        {mode === "subnet"
          ? "Devices whose last Defender-reported IP isn't inside any known in-house VLAN subnet — i.e. currently remote / off the corporate network."
          : "Devices whose last Defender-reported IP differs from the IP the in-house network (latest Meraki sighting for the device's MAC) last saw — i.e. moved since the corporate network last observed them."}
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      {data && data.index_count === 0 && (
        <div className="alert alert-warning">
          No {data.index_label} are indexed yet — sync Meraki{" "}
          {mode === "subnet" ? "networks" : "clients"} first, or offsite status
          can't be determined.
        </div>
      )}

      <StatTileRow>
        <StatTile
          label="Offsite devices"
          value={data?.total ?? 0}
          tone={(data?.total ?? 0) > 0 ? "warning" : "success"}
        />
        <StatTile
          label="On a public IP"
          value={publicCount}
          tone={publicCount > 0 ? "danger" : "neutral"}
        />
        <StatTile
          label={`${data?.index_label ?? "subnets"} indexed`}
          value={data?.index_count ?? 0}
          tone="neutral"
        />
      </StatTileRow>

      <section className="section-block">
        <span className="eyebrow">Filters</span>
        <div className="cluster" style={{ gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="stack" style={{ gap: 2 }}>
            <span className="text-xs text-muted">Definition</span>
            <select
              className="input input-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value as OffsiteMode)}
            >
              <option value="subnet">Off known subnet</option>
              <option value="meraki">≠ last in-house IP (Meraki)</option>
            </select>
          </label>
          <label className="stack" style={{ gap: 2 }}>
            <span className="text-xs text-muted">Last seen</span>
            <select
              className="input input-sm"
              value={seenWithin}
              onChange={(e) => setSeenWithin(e.target.value)}
            >
              {SEEN_WINDOWS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
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
          <label className="stack" style={{ gap: 2 }}>
            <span className="text-xs text-muted">IP scope</span>
            <select
              className="input input-sm"
              value={publicOnly ? "public" : "all"}
              onChange={(e) => setPublicOnly(e.target.value === "public")}
              title="Public-only drops private off-subnet IPs (unindexed corp subnets / home LANs)"
            >
              <option value="all">Any off-network IP</option>
              <option value="public">Public IP only</option>
            </select>
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
                <th>Last Defender IP</th>
                {mode === "meraki" && <th>Last in-house IP</th>}
                <th>Last seen</th>
                <th>Home location</th>
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
                  <td>
                    <span className="cluster" style={{ gap: "0.375rem" }}>
                      <span className="font-mono text-xs">{r.defender_last_ip}</span>
                      {r.is_public_ip ? (
                        <span className="badge badge-danger">public</span>
                      ) : (
                        <span className="badge">private</span>
                      )}
                    </span>
                  </td>
                  {mode === "meraki" && (
                    <td>
                      <span className="font-mono text-xs">{r.inhouse_ip ?? "—"}</span>
                    </td>
                  )}
                  <td>
                    <FreshnessCell iso={r.defender_last_seen_at} />
                  </td>
                  <td>{r.location_name ?? <span className="text-muted">—</span>}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={mode === "meraki" ? 8 : 7}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    {loading
                      ? "Loading…"
                      : data && data.index_count === 0
                        ? `No ${data.index_label} indexed — can't determine offsite devices.`
                        : mode === "meraki"
                          ? "No devices have moved since the in-house network last saw them."
                          : "No offsite devices — every reporting device is on a known subnet."}
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
