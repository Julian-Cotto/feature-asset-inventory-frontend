import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";

import Bars from "../components/Bars";
import Donut from "../components/Donut";
import Sparkline from "../components/Sparkline";
import Dashboard from "./Dashboard";
import PeopleReportView from "./reports/PeopleReport";
import SecurityReportView from "./reports/SecurityReport";
import SoftwareReportView from "./reports/SoftwareReport";
import {
  getActivityReport,
  getFleetReport,
  getIntuneReport,
  getShipmentsReport,
  getStockReport,
  getWarrantyReport,
} from "../services/inventory";
import type {
  ActivityReport,
  FleetReport,
  IntuneReport,
  ShipmentsReport,
  StockReport,
  WarrantyReport,
} from "../types/reports";

type SubTab =
  | "overview"
  | "fleet"
  | "security"
  | "warranty"
  | "stock"
  | "software"
  | "people"
  | "shipments"
  | "intune"
  | "activity";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "fleet", label: "Fleet" },
  { key: "security", label: "Security" },
  { key: "warranty", label: "Warranty" },
  { key: "stock", label: "Stock" },
  { key: "software", label: "Software" },
  { key: "people", label: "People" },
  { key: "shipments", label: "Shipments" },
  { key: "intune", label: "Intune" },
  { key: "activity", label: "Activity" },
];

const COLORS = {
  primary: "rgb(var(--color-primary))",
  success: "rgb(var(--color-success))",
  warning: "rgb(var(--color-warning))",
  danger: "rgb(var(--color-danger))",
  muted: "rgb(var(--color-text-muted))",
};

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

interface ReportsProps {
  onStatusClick?: (statusCode: string) => void;
  onAssetClick?: (assetId: number) => void;
  onSoftwareClick?: (softwareId: number) => void;
  onGroupClick?: (groupId: string) => void;
  onUserClick?: (userId: string) => void;
  onLaunchWallboard?: () => void;
}

export default function Reports({
  onStatusClick,
  onAssetClick,
  onSoftwareClick,
  onGroupClick,
  onUserClick,
  onLaunchWallboard,
}: ReportsProps) {
  const [tab, setTab] = useState<SubTab>("overview");

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Dashboard</h2>
        {onLaunchWallboard && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onLaunchWallboard}
            title="Open the rotating wallboard view (designed for unattended monitors)"
          >
            <Monitor size={14} strokeWidth={1.75} />
            Launch wallboard
          </button>
        )}
      </div>
      <nav className="tabs">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={tab === t.key ? "tab tab-active" : "tab"}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <Dashboard
          onStatusClick={onStatusClick}
          onAssetClick={onAssetClick}
        />
      )}
      {tab === "fleet" && <FleetView />}
      {tab === "security" && (
        <SecurityReportView onAssetClick={onAssetClick} />
      )}
      {tab === "warranty" && <WarrantyView />}
      {tab === "stock" && <StockView />}
      {tab === "software" && (
        <SoftwareReportView
          onOpenSoftware={onSoftwareClick}
          onOpenGroup={onGroupClick}
        />
      )}
      {tab === "people" && <PeopleReportView onOpenUser={onUserClick} />}
      {tab === "shipments" && <ShipmentsView />}
      {tab === "intune" && <IntuneView />}
      {tab === "activity" && <ActivityView />}
    </div>
  );
}

// ────────────────────────── Fleet ──────────────────────────

function FleetView() {
  const [data, setData] = useState<FleetReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getFleetReport()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <p className="text-muted">Loading…</p>;

  return (
    <div className="stack-lg">
      <section className="stack-lg">
        <h2 className="text-lg font-semibold">Devices</h2>
        <FleetSliceView slice={data} showWin10Alert />
      </section>
      <hr className="border-border" />
      <section className="stack-lg">
        <h2 className="text-lg font-semibold">Network Equipment</h2>
        <FleetSliceView slice={data.network} showWin10Alert={false} />
      </section>
    </div>
  );
}

function FleetSliceView({
  slice,
  showWin10Alert,
}: {
  slice: import("../types/reports").FleetSlice;
  showWin10Alert: boolean;
}) {
  const osPalette: Record<string, string> = {
    "Windows 11": COLORS.success,
    "Windows 10": COLORS.warning,
    "Windows Server": COLORS.primary,
    macOS: COLORS.primary,
    Linux: COLORS.muted,
    Unknown: COLORS.muted,
  };
  const osSlices = slice.os.map((r) => ({
    label: r.label,
    value: r.count,
    color: osPalette[r.label] ?? COLORS.muted,
  }));
  const totalAssets = osSlices.reduce((s, x) => s + x.value, 0);
  if (totalAssets === 0) {
    return <p className="text-muted">No assets in this category.</p>;
  }

  return (
    <div className="stack-lg">
      {showWin10Alert && slice.win10_count > 0 && (
        <div className="alert-tile alert-tile-warning">
          <span className="alert-tile-icon">⚠️</span>
          <div className="alert-tile-body">
            <span className="alert-tile-title">
              {slice.win10_count} assets on Windows 10
            </span>
            <span className="alert-tile-sub">
              Win 10 EOL Oct 2025 — schedule upgrade plan
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="card card-body stack">
          <span className="eyebrow">OS distribution</span>
          <div className="cluster" style={{ gap: "1rem" }}>
            <Donut
              slices={osSlices}
              centerLabel={String(totalAssets)}
              centerSub="assets"
            />
            <Legend slices={osSlices} />
          </div>
        </div>

        <div className="card card-body stack">
          <span className="eyebrow">Compliance</span>
          <Bars
            bars={slice.compliance.map((r) => ({
              label: r.label,
              value: r.count,
              color:
                r.label === "compliant"
                  ? COLORS.success
                  : r.label.includes("noncompliant")
                    ? COLORS.danger
                    : COLORS.warning,
            }))}
          />
        </div>

        <div className="card card-body stack">
          <span className="eyebrow">Asset age</span>
          <Bars
            bars={slice.age_buckets.map((r) => ({
              label: r.label,
              value: r.count,
              color:
                r.label === "5+y"
                  ? COLORS.danger
                  : r.label === "4-5y"
                    ? COLORS.warning
                    : COLORS.primary,
            }))}
            labelWidth="3.5rem"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card card-body stack">
          <span className="eyebrow">Manufacturer mix</span>
          <Bars
            bars={slice.manufacturer.slice(0, 10).map((r) => ({
              label: r.label,
              value: r.count,
            }))}
          />
        </div>
        <div className="card card-body stack">
          <span className="eyebrow">Top models</span>
          <Bars
            bars={slice.top_models.map((r) => ({
              label: r.label,
              value: r.count,
            }))}
            labelWidth="11rem"
          />
        </div>
      </div>
    </div>
  );
}

// ────────────────────────── Warranty ──────────────────────────

function WarrantyView() {
  const [data, setData] = useState<WarrantyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getWarrantyReport()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <p className="text-muted">Loading…</p>;

  return (
    <div className="stack-lg">
      <div className="card card-body stack">
        <span className="eyebrow">Warranty expirations · next 12 months</span>
        {data.calendar_12m.length === 0 ? (
          <span className="text-text-muted text-sm">
            No active warranties expiring in the next year.
          </span>
        ) : (
          <Bars
            bars={data.calendar_12m.map((p) => ({
              label: p.month,
              value: p.count,
              color:
                p.count > 20
                  ? COLORS.danger
                  : p.count > 10
                    ? COLORS.warning
                    : COLORS.primary,
            }))}
            labelWidth="5rem"
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card card-body stack">
          <span className="eyebrow">Out of warranty · by location</span>
          {data.out_by_location.length === 0 ? (
            <span className="text-text-muted text-sm">None.</span>
          ) : (
            <Bars
              bars={data.out_by_location.slice(0, 12).map((r) => ({
                label: r.location,
                value: r.count,
                color: COLORS.danger,
              }))}
              labelWidth="9rem"
            />
          )}
        </div>

        <div className="card card-body stack">
          <span className="eyebrow">
            Replacement candidates ({data.replacement_candidates.length})
          </span>
          <span className="text-xs text-text-muted">
            Out of warranty AND onboarded &gt; 3 years ago
          </span>
          <ul className="list-clean stack sm:hidden" style={{ maxHeight: "20rem", overflowY: "auto" }}>
            {data.replacement_candidates.map((r) => (
              <li key={r.asset_id} className="card card-body">
                <div className="font-mono text-xs truncate">{r.serial_number}</div>
                <div className="text-sm mt-1">
                  {r.manufacturer} {r.model}
                </div>
                <div className="text-muted text-xs mt-1">
                  Onboarded: {fmtDate(r.onboarded_at)}
                </div>
                {r.assigned_upn && (
                  <div className="text-muted text-xs mt-1">{r.assigned_upn}</div>
                )}
              </li>
            ))}
            {data.replacement_candidates.length === 0 && (
              <li className="card card-body text-muted text-sm">None.</li>
            )}
          </ul>
          <div className="scroll-x hidden sm:block" style={{ maxHeight: "20rem" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Serial</th>
                  <th>Model</th>
                  <th>Onboarded</th>
                  <th>Assigned</th>
                </tr>
              </thead>
              <tbody>
                {data.replacement_candidates.map((r) => (
                  <tr key={r.asset_id}>
                    <td className="font-mono text-xs">{r.serial_number}</td>
                    <td>
                      {r.manufacturer} {r.model}
                    </td>
                    <td>{fmtDate(r.onboarded_at)}</td>
                    <td>{r.assigned_upn ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────── Stock ──────────────────────────

function StockView() {
  const [data, setData] = useState<StockReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getStockReport()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <p className="text-muted">Loading…</p>;

  return (
    <div className="stack-lg">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Planning"
          value={data.deployment_pipeline.counts.planning ?? 0}
        />
        <Stat
          label="In progress"
          value={data.deployment_pipeline.counts.in_progress ?? 0}
        />
        <Stat
          label="Completed 30d"
          value={data.deployment_pipeline.counts.completed_30d ?? 0}
        />
        <Stat
          label="Avg cycle (days)"
          value={data.deployment_avg_cycle_days ?? "—"}
        />
      </div>

      <div className="card card-body stack">
        <span className="eyebrow">
          Stock by model ({data.stock_by_model.length} groups)
        </span>
        <ul className="list-clean stack sm:hidden">
          {data.stock_by_model.map((r, i) => (
            <li key={i} className="card card-body">
              <div className="cluster" style={{ justifyContent: "space-between" }}>
                <span className="font-semibold truncate">
                  {(r.manufacturer ?? "—")} {(r.model ?? "—")}
                </span>
                <span className="badge badge-soft">{r.count} avail</span>
              </div>
              <div className="text-muted text-xs mt-1">{r.asset_type}</div>
            </li>
          ))}
          {data.stock_by_model.length === 0 && (
            <li className="card card-body text-muted text-sm">No stock.</li>
          )}
        </ul>
        <div className="scroll-x hidden sm:block" style={{ maxHeight: "24rem" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Manufacturer</th>
                <th>Model</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              {data.stock_by_model.map((r, i) => (
                <tr key={i}>
                  <td>{r.asset_type}</td>
                  <td>{r.manufacturer ?? "—"}</td>
                  <td>{r.model ?? "—"}</td>
                  <td className="font-semibold">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-body stack">
        <span className="eyebrow">Stale stock · oldest first</span>
        <ul className="list-clean stack sm:hidden">
          {data.stale_stock.map((r) => {
            const tone =
              (r.days_at_warehouse ?? 0) > 90
                ? "badge badge-danger"
                : (r.days_at_warehouse ?? 0) > 60
                  ? "badge badge-warning"
                  : "badge badge-soft";
            return (
              <li key={r.asset_id} className="card card-body">
                <div className="cluster" style={{ justifyContent: "space-between" }}>
                  <span className="font-mono text-xs truncate">{r.serial_number}</span>
                  <span className={tone}>{r.days_at_warehouse ?? "—"}d</span>
                </div>
                <div className="text-muted text-xs mt-1">
                  {r.asset_type} · {r.manufacturer} {r.model}
                </div>
              </li>
            );
          })}
          {data.stale_stock.length === 0 && (
            <li className="card card-body text-muted text-sm">None.</li>
          )}
        </ul>
        <div className="scroll-x hidden sm:block" style={{ maxHeight: "24rem" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Serial</th>
                <th>Type</th>
                <th>Model</th>
                <th>Days at warehouse</th>
              </tr>
            </thead>
            <tbody>
              {data.stale_stock.map((r) => (
                <tr key={r.asset_id}>
                  <td className="font-mono text-xs">{r.serial_number}</td>
                  <td>{r.asset_type}</td>
                  <td>
                    {r.manufacturer} {r.model}
                  </td>
                  <td>
                    <span
                      className={
                        (r.days_at_warehouse ?? 0) > 90
                          ? "badge badge-danger"
                          : (r.days_at_warehouse ?? 0) > 60
                            ? "badge badge-warning"
                            : "badge badge-soft"
                      }
                    >
                      {r.days_at_warehouse ?? "—"}d
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {(["planning", "in_progress"] as const).map((key) => {
          const samples = data.deployment_pipeline.samples[key] ?? [];
          return (
            <div key={key} className="card card-body stack">
              <span className="eyebrow">{key.replace("_", " ")} deployments</span>
              {samples.length === 0 ? (
                <span className="text-text-muted text-sm">None.</span>
              ) : (
                <ul className="list-clean stack" style={{ gap: "0.4rem" }}>
                  {samples.map((d) => (
                    <li key={d.id} className="text-sm">
                      #{d.id} · {d.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────── Shipments ──────────────────────────

function ShipmentsView() {
  const [data, setData] = useState<ShipmentsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getShipmentsReport()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <p className="text-muted">Loading…</p>;

  const funnelOrder = [
    "pending",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "exception",
    "unknown",
  ];
  const orderedFunnel = funnelOrder
    .map((k) => data.funnel.find((f) => f.label === k))
    .filter(Boolean) as { label: string; count: number }[];

  return (
    <div className="stack-lg">
      <div className="card card-body stack">
        <span className="eyebrow">Open shipment funnel</span>
        <Bars
          bars={orderedFunnel.map((f) => ({
            label: f.label,
            value: f.count,
            color:
              f.label === "exception"
                ? COLORS.danger
                : f.label === "delivered"
                  ? COLORS.success
                  : COLORS.primary,
          }))}
          labelWidth="9rem"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card card-body stack">
          <span className="eyebrow">Carrier mix (open)</span>
          <Bars
            bars={data.carrier_counts.map((r) => ({
              label: r.label,
              value: r.count,
            }))}
          />
        </div>
        <div className="card card-body stack">
          <span className="eyebrow">Direction (open)</span>
          <Bars
            bars={data.direction.map((r) => ({
              label: r.label,
              value: r.count,
              color: r.label === "inbound" ? COLORS.success : COLORS.primary,
            }))}
          />
        </div>
      </div>

      <div className="card card-body stack">
        <span className="eyebrow">
          Late shipments ({data.late.length}) · open &gt; 14 days
        </span>
        {data.late.length === 0 ? (
          <span className="text-text-muted text-sm">All clear.</span>
        ) : (
          <>
          <ul className="list-clean stack sm:hidden" style={{ maxHeight: "20rem", overflowY: "auto" }}>
            {data.late.map((r) => (
              <li key={r.shipment_id} className="card card-body">
                <div className="cluster" style={{ justifyContent: "space-between" }}>
                  <span className="font-mono text-xs truncate">{r.tracking_number}</span>
                  <span className="badge badge-warning">{r.days_open}d</span>
                </div>
                <div className="text-muted text-xs mt-1">
                  {r.carrier} · {r.direction}
                </div>
                <div className="text-xs mt-1">{r.carrier_status}</div>
              </li>
            ))}
          </ul>
          <div className="scroll-x hidden sm:block" style={{ maxHeight: "20rem" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Tracking</th>
                  <th>Carrier</th>
                  <th>Direction</th>
                  <th>Status</th>
                  <th>Days open</th>
                </tr>
              </thead>
              <tbody>
                {data.late.map((r) => (
                  <tr key={r.shipment_id}>
                    <td className="font-mono text-xs">{r.tracking_number}</td>
                    <td>{r.carrier}</td>
                    <td>{r.direction}</td>
                    <td>{r.carrier_status}</td>
                    <td>
                      <span className="badge badge-warning">
                        {r.days_open}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <div className="card card-body stack">
        <span className="eyebrow">Avg transit days · last 90d</span>
        {data.carrier_avg_days.length === 0 ? (
          <span className="text-text-muted text-sm">No delivered shipments yet.</span>
        ) : (
          <Bars
            bars={data.carrier_avg_days.map((r) => ({
              label: `${r.carrier} (${r.count} delivered)`,
              value: r.avg_days ?? 0,
            }))}
            labelWidth="13rem"
          />
        )}
      </div>
    </div>
  );
}

// ────────────────────────── Intune ──────────────────────────

function IntuneView() {
  const [data, setData] = useState<IntuneReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getIntuneReport()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <p className="text-muted">Loading…</p>;

  return (
    <div className="stack-lg">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Stale > 7d" value={data.stale_count_7d} tone="warning" />
        <Stat label="Stale > 30d" value={data.stale_count_30d} tone="danger" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card card-body stack">
          <span className="eyebrow">Check-in recency</span>
          <Bars
            bars={data.recency_buckets.map((r) => ({
              label: r.label,
              value: r.count,
              color:
                r.label === "90d+" || r.label === "never"
                  ? COLORS.danger
                  : r.label === "30-90d"
                    ? COLORS.warning
                    : COLORS.success,
            }))}
            labelWidth="4rem"
          />
        </div>
        <div className="card card-body stack">
          <span className="eyebrow">Managed by</span>
          <Bars
            bars={data.managed_by.map((r) => ({
              label: r.label,
              value: r.count,
            }))}
          />
        </div>
      </div>

      <div className="card card-body stack">
        <span className="eyebrow">
          Stale check-ins ({data.stale_check_ins.length})
        </span>
        <ul className="list-clean stack sm:hidden" style={{ maxHeight: "24rem", overflowY: "auto" }}>
          {data.stale_check_ins.map((r) => {
            const tone =
              (r.days_since ?? 0) > 90
                ? "badge badge-danger"
                : (r.days_since ?? 0) > 30
                  ? "badge badge-warning"
                  : "badge badge-soft";
            return (
              <li key={r.asset_id} className="card card-body">
                <div className="cluster" style={{ justifyContent: "space-between" }}>
                  <span className="font-medium truncate">{r.intune_device_name ?? "—"}</span>
                  <span className={tone}>{r.days_since}d</span>
                </div>
                <div className="font-mono text-xs mt-1">{r.serial_number}</div>
                {r.assigned_upn && (
                  <div className="text-muted text-xs mt-1">{r.assigned_upn}</div>
                )}
                <div className="text-muted text-xs mt-1">Last: {fmtDate(r.last_check_in)}</div>
              </li>
            );
          })}
          {data.stale_check_ins.length === 0 && (
            <li className="card card-body text-muted text-sm">None.</li>
          )}
        </ul>
        <div className="scroll-x hidden sm:block" style={{ maxHeight: "24rem" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Serial</th>
                <th>Assigned</th>
                <th>Last check-in</th>
                <th>Days</th>
              </tr>
            </thead>
            <tbody>
              {data.stale_check_ins.map((r) => (
                <tr key={r.asset_id}>
                  <td className="font-medium">{r.intune_device_name ?? "—"}</td>
                  <td className="font-mono text-xs">{r.serial_number}</td>
                  <td>{r.assigned_upn ?? "—"}</td>
                  <td>{fmtDate(r.last_check_in)}</td>
                  <td>
                    <span
                      className={
                        (r.days_since ?? 0) > 90
                          ? "badge badge-danger"
                          : (r.days_since ?? 0) > 30
                            ? "badge badge-warning"
                            : "badge badge-soft"
                      }
                    >
                      {r.days_since}d
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────── Activity ──────────────────────────

function ActivityView() {
  const [data, setData] = useState<ActivityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getActivityReport()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <p className="text-muted">Loading…</p>;

  const assigns = data.monthly_180d.map((m) => m.assign);
  const unassigns = data.monthly_180d.map((m) => m.unassign);
  const repairs = data.monthly_180d.map((m) => m.in_repair);
  const lost = data.monthly_180d.map((m) => m.lost);
  const retired = data.monthly_180d.map((m) => m.retired);

  return (
    <div className="stack-lg">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <MiniSeries label="Assignments · 6mo" values={assigns} color="primary" />
        <MiniSeries
          label="Unassignments · 6mo"
          values={unassigns}
          color="warning"
        />
        <MiniSeries label="In repair · 6mo" values={repairs} color="warning" />
        <MiniSeries label="Lost / retired · 6mo" values={[...lost.map((v, i) => v + retired[i])]} color="danger" />
      </div>

      <div className="card card-body stack">
        <span className="eyebrow">Recent activity ({data.recent.length})</span>
        <ul className="list-clean stack sm:hidden" style={{ maxHeight: "30rem", overflowY: "auto" }}>
          {data.recent.map((r) => (
            <li key={r.id} className="card card-body">
              <div className="cluster" style={{ justifyContent: "space-between" }}>
                <span className="font-medium truncate">{r.asset_label}</span>
                <span className="badge badge-soft">{r.event_type}</span>
              </div>
              <div className="text-muted text-xs mt-1">{fmtDate(r.performed_at)}</div>
              <div className="text-xs mt-1">
                {r.from_value ?? "None"} → {r.to_value ?? "None"}
              </div>
              {r.performed_by_upn && (
                <div className="text-muted text-xs mt-1">By {r.performed_by_upn}</div>
              )}
              {r.notes && (
                <div className="text-text-muted text-xs mt-1">{r.notes}</div>
              )}
            </li>
          ))}
          {data.recent.length === 0 && (
            <li className="card card-body text-muted text-sm">No activity.</li>
          )}
        </ul>
        <div className="scroll-x hidden sm:block" style={{ maxHeight: "30rem" }}>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Asset</th>
                <th>Event</th>
                <th>From → To</th>
                <th>By</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.id}>
                  <td className="text-xs">{fmtDate(r.performed_at)}</td>
                  <td className="font-medium">{r.asset_label}</td>
                  <td>
                    <span className="badge badge-soft">{r.event_type}</span>
                  </td>
                  <td className="text-xs">
                    {r.from_value ?? "None"} → {r.to_value ?? "None"}
                  </td>
                  <td className="text-xs">{r.performed_by_upn ?? "—"}</td>
                  <td className="text-xs text-text-muted">{r.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────── shared bits ──────────────────────────

function Legend({
  slices,
}: {
  slices: { label: string; value: number; color: string }[];
}) {
  return (
    <ul className="list-clean stack" style={{ gap: "0.4rem" }}>
      {slices.map((s) => (
        <li key={s.label} className="cluster" style={{ gap: "0.5rem" }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: s.color,
            }}
          />
          <span className="text-sm">{s.label}</span>
          <span className="text-sm text-text-muted ml-auto">{s.value}</span>
        </li>
      ))}
    </ul>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "warning" | "danger";
}) {
  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <span className="stat-card-label">{label}</span>
      </div>
      <span
        className="stat-card-value"
        style={{
          color: tone === "danger" ? COLORS.danger : tone === "warning" ? COLORS.warning : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function MiniSeries({
  label,
  values,
  color,
}: {
  label: string;
  values: number[];
  color: "primary" | "success" | "warning" | "danger";
}) {
  const total = values.reduce((s, v) => s + v, 0);
  const cls =
    color === "success"
      ? "stat-card-spark-success"
      : color === "warning"
        ? "stat-card-spark-warning"
        : color === "danger"
          ? "stat-card-spark-danger"
          : "stat-card-spark";
  return (
    <div className="card card-body stack">
      <span className="eyebrow">{label}</span>
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <span className="text-2xl font-semibold">{total}</span>
        <Sparkline values={values} className={cls} width={160} height={32} />
      </div>
    </div>
  );
}
