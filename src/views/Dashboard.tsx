import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ClockAlert,
  Cpu,
  ShieldCheck,
  Truck,
} from "lucide-react";

import Bars from "../components/Bars";
import Donut from "../components/Donut";
import Sparkline from "../components/Sparkline";
import {
  getDashboardStats,
  listAssets,
  listStatuses,
} from "../services/inventory";
import type {
  Asset,
  AssetStatus,
  DashboardStats,
} from "../types/inventory";
import { assetTypeLabel } from "../utils/assetTypeBadge";
import { friendlyModel } from "../utils/friendlyModel";
import { statusLabel } from "../utils/statusBadge";

interface Props {
  onStatusClick?: (statusCode: string) => void;
  onAssetClick?: (assetId: number) => void;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}

export default function Dashboard({ onStatusClick, onAssetClick }: Props) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statuses, setStatuses] = useState<AssetStatus[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getDashboardStats(),
      listStatuses(),
      listAssets({ limit: 10 }),
    ])
      .then(([s, st, a]) => {
        setStats(s);
        setStatuses(st);
        setAssets(a);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!stats) return <p className="text-muted">Loading dashboard…</p>;

  const onboardSeries = stats.onboards_30d.map((p) => p.count);
  const warrantySeries = stats.warranty_changes_30d.map((p) => p.count);

  const totalWarranty = stats.warranty.on + stats.warranty.off;
  const warrantyPct =
    totalWarranty > 0 ? Math.round((stats.warranty.on / totalWarranty) * 100) : 0;
  const warrantyTone =
    warrantyPct >= 70
      ? "stat-card-spark-success"
      : warrantyPct >= 40
        ? "stat-card-spark-warning"
        : "stat-card-spark-danger";

  const intuneTone =
    stats.intune.stale_7d_count > 50
      ? "stat-card-spark-warning"
      : stats.intune.stale_7d_count > 0
        ? "stat-card-spark"
        : "stat-card-spark-success";

  const shipDepActive =
    stats.shipments.open + stats.deployments.in_progress + stats.deployments.planning;

  const counts: Record<string, number> = {};
  stats.assets.by_status.forEach((s) => {
    counts[s.code] = s.count;
  });

  return (
    <div className="stack-lg">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Total assets</span>
            <Boxes size={16} className="text-text-muted" strokeWidth={1.75} />
          </div>
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <span className="stat-card-value">{stats.assets.total}</span>
            <Sparkline values={onboardSeries} className="stat-card-spark" />
          </div>
          <span className="stat-card-sub">
            {stats.assets.by_type
              .map((t) => `${t.count} ${t.type}`)
              .join(" · ")}
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Warranty health</span>
            <ShieldCheck
              size={16}
              className="text-text-muted"
              strokeWidth={1.75}
            />
          </div>
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <span className="stat-card-value">{warrantyPct}%</span>
            <Sparkline values={warrantySeries} className={warrantyTone} />
          </div>
          <span className="stat-card-sub">
            {stats.warranty.on} on · {stats.warranty.off} off ·{" "}
            {stats.warranty.unknown} unknown
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Intune sync</span>
            <Cpu size={16} className="text-text-muted" strokeWidth={1.75} />
          </div>
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <span className="stat-card-value">{stats.intune.synced_count}</span>
            <Sparkline values={onboardSeries} className={intuneTone} />
          </div>
          <span className="stat-card-sub">
            Last sync {relativeTime(stats.intune.last_bulk_sync_at)} ·{" "}
            {stats.intune.stale_7d_count} stale &gt;7d
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Shipments + deployments</span>
            <Truck size={16} className="text-text-muted" strokeWidth={1.75} />
          </div>
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <span className="stat-card-value">{shipDepActive}</span>
          </div>
          <span className="stat-card-sub">
            {stats.shipments.open} open shipments ·{" "}
            {stats.deployments.in_progress} in progress ·{" "}
            {stats.deployments.planning} planning
          </span>
        </div>
      </div>

      {/* Alert tiles */}
      {(stats.warranty.expiring_30d > 0 ||
        stats.warranty.off > 0 ||
        stats.intune.stale_7d_count > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stats.warranty.expiring_30d > 0 && (
            <button
              type="button"
              className="alert-tile alert-tile-warning text-left"
              onClick={() => onStatusClick?.("")}
            >
              <ClockAlert size={20} className="alert-tile-icon" />
              <div className="alert-tile-body">
                <span className="alert-tile-title">
                  {stats.warranty.expiring_30d} warranty expiring in 30d
                </span>
                <span className="alert-tile-sub">
                  {stats.warranty.expiring_60d} within 60d ·{" "}
                  {stats.warranty.expiring_90d} within 90d
                </span>
              </div>
            </button>
          )}
          {stats.warranty.off > 0 && (
            <button
              type="button"
              className="alert-tile alert-tile-danger text-left"
              onClick={() => onStatusClick?.("")}
            >
              <AlertTriangle size={20} className="alert-tile-icon" />
              <div className="alert-tile-body">
                <span className="alert-tile-title">
                  {stats.warranty.off} assets out of warranty
                </span>
                <span className="alert-tile-sub">
                  Plan replacement / extension
                </span>
              </div>
            </button>
          )}
          {stats.intune.stale_7d_count > 0 && (
            <button
              type="button"
              className="alert-tile alert-tile-info text-left"
              onClick={() => onStatusClick?.("")}
            >
              <Cpu size={20} className="alert-tile-icon" />
              <div className="alert-tile-body">
                <span className="alert-tile-title">
                  {stats.intune.stale_7d_count} stale Intune check-ins
                </span>
                <span className="alert-tile-sub">
                  No check-in in &gt;7 days
                </span>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Charts row — visual summaries */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {(() => {
          const statusColors: Record<string, string> = {
            in_warehouse: "rgb(var(--color-primary))",
            assigned: "rgb(var(--color-success))",
            in_repair: "rgb(var(--color-warning))",
            lost: "rgb(var(--color-danger))",
            retired: "rgb(var(--color-text-muted))",
          };
          const slices = stats.assets.by_status.map((s) => ({
            label: statusLabel(s.code),
            value: s.count,
            color: statusColors[s.code] ?? "rgb(var(--color-text-muted))",
          }));
          return (
            <div className="card card-body stack">
              <span className="eyebrow">Assets by status</span>
              <div className="cluster" style={{ gap: "1rem" }}>
                <Donut
                  slices={slices}
                  centerLabel={String(stats.assets.total)}
                  centerSub="total"
                />
                <ul className="list-clean stack" style={{ gap: "0.4rem" }}>
                  {slices.map((s) => (
                    <li
                      key={s.label}
                      className="cluster"
                      style={{ gap: "0.5rem" }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: s.color,
                        }}
                      />
                      <span className="text-sm">{s.label}</span>
                      <span className="text-sm text-text-muted ml-auto">
                        {s.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })()}

        {(() => {
          const slices = [
            {
              label: "On",
              value: stats.warranty.on,
              color: "rgb(var(--color-success))",
            },
            {
              label: "Off",
              value: stats.warranty.off,
              color: "rgb(var(--color-danger))",
            },
            {
              label: "Unknown",
              value: stats.warranty.unknown,
              color: "rgb(var(--color-warning))",
            },
          ];
          const total = slices.reduce((s, x) => s + x.value, 0);
          const pct =
            total > 0 ? Math.round((stats.warranty.on / total) * 100) : 0;
          return (
            <div className="card card-body stack">
              <span className="eyebrow">Warranty health</span>
              <div className="cluster" style={{ gap: "1rem" }}>
                <Donut
                  slices={slices}
                  centerLabel={`${pct}%`}
                  centerSub="on"
                />
                <ul className="list-clean stack" style={{ gap: "0.4rem" }}>
                  {slices.map((s) => (
                    <li
                      key={s.label}
                      className="cluster"
                      style={{ gap: "0.5rem" }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: s.color,
                        }}
                      />
                      <span className="text-sm">{s.label}</span>
                      <span className="text-sm text-text-muted ml-auto">
                        {s.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="text-xs text-text-muted">
                {stats.warranty.expiring_30d} expiring in 30d ·{" "}
                {stats.warranty.expiring_60d} in 60d ·{" "}
                {stats.warranty.expiring_90d} in 90d
              </div>
            </div>
          );
        })()}

        {(() => {
          const typeColors: Record<string, string> = {
            laptop: "rgb(var(--color-primary))",
            desktop: "rgb(var(--color-success))",
            thin_client: "rgb(var(--color-warning))",
            ap: "rgb(var(--color-primary))",
            switch: "rgb(var(--color-warning))",
            gateway: "rgb(var(--color-danger))",
          };
          const bars = stats.assets.by_type.map((t) => ({
            label: assetTypeLabel(t.type),
            value: t.count,
            color: typeColors[t.type] ?? "rgb(var(--color-primary))",
          }));
          return (
            <div className="card card-body stack">
              <span className="eyebrow">Assets by type</span>
              {bars.length > 0 ? (
                <Bars bars={bars} />
              ) : (
                <span className="text-text-muted text-sm">No data</span>
              )}
            </div>
          );
        })()}
      </div>

      {/* Onboards over time */}
      <div className="card card-body stack">
        <div className="cluster" style={{ justifyContent: "space-between" }}>
          <span className="eyebrow">Onboards · last 30 days</span>
          <span className="text-sm text-text-muted">
            {onboardSeries.reduce((s, x) => s + x, 0)} total
          </span>
        </div>
        <div className="text-primary" style={{ width: "100%" }}>
          <Sparkline
            values={onboardSeries}
            width={1200}
            height={72}
            className="w-full"
          />
        </div>
        <div
          className="cluster text-xs text-text-muted"
          style={{ justifyContent: "space-between" }}
        >
          <span>{stats.onboards_30d[0]?.date.slice(5) ?? ""}</span>
          <span>
            {stats.onboards_30d[stats.onboards_30d.length - 1]?.date.slice(5) ??
              ""}
          </span>
        </div>
      </div>

      {/* Status breakdown (existing) */}
      <section className="stack">
        <h3 className="heading-3">By status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {statuses.map((s) => {
            const clickable = !!onStatusClick;
            return (
              <button
                key={s.code}
                type="button"
                className={`stat text-left ${clickable ? "cursor-pointer transition-all hover:border-primary hover:shadow-md hover:-translate-y-0.5" : ""}`}
                onClick={() => onStatusClick?.(s.code)}
                disabled={!clickable}
              >
                <span className="stat-label">{s.label}</span>
                <span className="stat-value">{counts[s.code] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Recent assets */}
      <section className="stack">
        <h3 className="heading-3">Recent assets</h3>
        <ul className="list-clean stack">
          {assets.slice(0, 10).map((a) => {
            const clickable = !!onAssetClick;
            return (
              <li
                key={a.id}
                className={`card card-body ${clickable ? "cursor-pointer transition-colors hover:bg-surface-muted" : ""}`}
                onClick={() => onAssetClick?.(a.id)}
              >
                <div className="cluster">
                  <span className="font-semibold">
                    {a.intune_device_name
                      ? `${a.intune_device_name} · ${a.serial_number}`
                      : (a.asset_tag ?? a.serial_number)}
                  </span>
                  <span className="text-muted">·</span>
                  <span className="text-muted">{a.asset_type}</span>
                  <span className="badge">{a.status_code}</span>
                  {a.manufacturer || a.model ? (
                    <span className="text-muted text-sm">
                      {a.manufacturer ?? ""} {friendlyModel(a)}
                    </span>
                  ) : null}
                  {a.assigned_upn ? (
                    <span className="text-muted">{a.assigned_upn}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
