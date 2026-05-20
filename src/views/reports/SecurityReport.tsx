import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bug, Shield, ShieldAlert, ShieldCheck } from "lucide-react";

import Bars from "../../components/Bars";
import Donut from "../../components/Donut";
import { AccentPill, FreshnessCell, SectionHeader } from "../../components/visual";
import { getSecurityReport } from "../../services/inventory";
import type { SecurityReport } from "../../types/reports";

const COLORS = {
  success: "rgb(var(--color-success))",
  warning: "rgb(var(--color-warning))",
  danger: "rgb(var(--color-danger))",
  primary: "rgb(var(--color-primary))",
  muted: "rgb(var(--color-text-muted))",
};

const HEALTH_PALETTE: Record<string, string> = {
  active: COLORS.success,
  healthy: COLORS.success,
  secure: COLORS.success,
  inactive: COLORS.danger,
  atrisk: COLORS.warning,
  at_risk: COLORS.warning,
  impairedcommunications: COLORS.warning,
  noheartbeat: COLORS.danger,
  unknown: COLORS.muted,
};

const EXPOSURE_PALETTE: Record<string, string> = {
  high: COLORS.danger,
  medium: COLORS.warning,
  low: COLORS.success,
  none: COLORS.muted,
  unknown: COLORS.muted,
};

const EXPOSURE_ORDER = ["high", "medium", "low", "none", "unknown"];
const HEALTH_ORDER = [
  "active",
  "healthy",
  "secure",
  "atrisk",
  "at_risk",
  "impairedcommunications",
  "noheartbeat",
  "inactive",
  "unknown",
];

function paletteFor(palette: Record<string, string>, label: string): string {
  return palette[label.toLowerCase()] ?? COLORS.primary;
}

function Legend({
  slices,
}: {
  slices: { label: string; value: number; color: string }[];
}) {
  return (
    <ul className="stack" style={{ gap: 4 }}>
      {slices.map((s) => (
        <li key={s.label} className="cluster" style={{ gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              background: s.color,
              borderRadius: 2,
              display: "inline-block",
            }}
            aria-hidden
          />
          <span className="text-sm capitalize">{s.label}</span>
          <span className="text-muted text-xs">{s.value}</span>
        </li>
      ))}
    </ul>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone = "default",
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: "default" | "success" | "warning" | "danger";
  sub?: string;
}) {
  const toneColor = {
    default: COLORS.primary,
    success: COLORS.success,
    warning: COLORS.warning,
    danger: COLORS.danger,
  }[tone];
  return (
    <div className="card card-body stack" style={{ gap: 4 }}>
      <div className="cluster" style={{ gap: "0.5rem", color: toneColor }}>
        {icon}
        <span className="eyebrow">{label}</span>
      </div>
      <span
        className="heading-2"
        style={{ margin: 0, color: toneColor, lineHeight: 1.1 }}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

export default function SecurityReportView({
  onAssetClick,
}: {
  onAssetClick?: (id: number) => void;
}) {
  const [data, setData] = useState<SecurityReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSecurityReport()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const matrix = useMemo(() => {
    if (!data) return null;
    const rows = EXPOSURE_ORDER;
    const cols = HEALTH_ORDER;
    const present = new Map<string, number>();
    for (const cell of data.risk_matrix) {
      present.set(`${cell.exposure}::${cell.health}`, cell.count);
    }
    // Filter cols to only those that have at least one cell
    const colsWithData = cols.filter((c) =>
      data.risk_matrix.some((cell) => cell.health === c),
    );
    const rowsWithData = rows.filter((r) =>
      data.risk_matrix.some((cell) => cell.exposure === r),
    );
    const peak = Math.max(...data.risk_matrix.map((c) => c.count), 1);
    return {
      rows: rowsWithData,
      cols: colsWithData,
      get: (ex: string, h: string) => present.get(`${ex}::${h}`) ?? 0,
      peak,
    };
  }, [data]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <p className="text-muted">Loading…</p>;

  const healthSlices = data.health_status.map((r) => ({
    label: r.label,
    value: r.count,
    color: paletteFor(HEALTH_PALETTE, r.label),
  }));
  const exposureSlices = data.exposure_level.map((r) => ({
    label: r.label,
    value: r.count,
    color: paletteFor(EXPOSURE_PALETTE, r.label),
  }));

  const totalCovered = healthSlices.reduce((s, x) => s + x.value, 0);
  const onboardedPct =
    data.counts.total_computers > 0
      ? Math.round(
          (data.counts.defender_onboarded / data.counts.total_computers) * 100,
        )
      : 0;
  const unhealthyPct =
    data.counts.defender_onboarded > 0
      ? Math.round(
          (data.counts.defender_unhealthy / data.counts.defender_onboarded) *
            100,
        )
      : 0;

  return (
    <div className="stack-lg">
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <StatTile
          icon={<Shield size={14} />}
          label="Total computers"
          value={data.counts.total_computers}
          sub="active laptops / desktops / thin clients"
        />
        <StatTile
          icon={<ShieldCheck size={14} />}
          label="Defender onboarded"
          value={data.counts.defender_onboarded}
          tone={onboardedPct >= 90 ? "success" : "warning"}
          sub={`${onboardedPct}% of fleet`}
        />
        <StatTile
          icon={<ShieldAlert size={14} />}
          label="Unhealthy / inactive"
          value={data.counts.defender_unhealthy}
          tone={data.counts.defender_unhealthy === 0 ? "success" : "danger"}
          sub={`${unhealthyPct}% of onboarded`}
        />
        <StatTile
          icon={<AlertTriangle size={14} />}
          label="Missing from Defender"
          value={data.counts.defender_missing}
          tone={data.counts.defender_missing === 0 ? "success" : "warning"}
          sub="has Intune, no Defender"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card card-body stack">
          <SectionHeader
            icon={<ShieldCheck size={16} />}
            title="Health status"
            tint="info"
          />
          <div className="cluster" style={{ gap: "1rem", alignItems: "center" }}>
            <Donut
              slices={healthSlices}
              centerLabel={String(totalCovered)}
              centerSub="computers"
            />
            <Legend slices={healthSlices} />
          </div>
        </div>

        <div className="card card-body stack">
          <SectionHeader
            icon={<Bug size={16} />}
            title="Exposure level"
            tint="amber"
          />
          <div className="cluster" style={{ gap: "1rem", alignItems: "center" }}>
            <Donut
              slices={exposureSlices}
              centerLabel={String(
                exposureSlices.reduce((s, x) => s + x.value, 0),
              )}
              centerSub="computers"
            />
            <Legend slices={exposureSlices} />
          </div>
        </div>
      </div>

      {data.av_status.length > 0 && (
        <div className="card card-body stack">
          <SectionHeader
            icon={<Shield size={16} />}
            title="AV / signature status"
            tint="purple"
          />
          <Bars
            bars={data.av_status.map((r) => ({
              label: r.label,
              value: r.count,
              color:
                r.label.toLowerCase().includes("updated") ||
                r.label.toLowerCase().includes("up_to_date")
                  ? COLORS.success
                  : r.label.toLowerCase().includes("out")
                    ? COLORS.warning
                    : COLORS.muted,
            }))}
          />
        </div>
      )}

      {matrix && matrix.rows.length > 0 && matrix.cols.length > 0 && (
        <div className="card card-body stack">
          <SectionHeader
            icon={<ShieldAlert size={16} />}
            title="Risk matrix"
            tint="pink"
          />
          <p className="text-muted text-xs">
            Rows = exposure level · Columns = health status. Cells darker the
            more machines fall in that bucket. Top-left = highest priority.
          </p>
          <div className="scroll-x">
            <table className="table" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th />
                  {matrix.cols.map((c) => (
                    <th
                      key={c}
                      className="text-xs capitalize"
                      style={{ textAlign: "center" }}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((r) => (
                  <tr key={r}>
                    <th
                      className="text-xs capitalize"
                      style={{ textAlign: "left" }}
                    >
                      {r}
                    </th>
                    {matrix.cols.map((c) => {
                      const v = matrix.get(r, c);
                      const intensity =
                        v === 0 ? 0 : Math.max(0.12, v / matrix.peak);
                      // Color by exposure row tone
                      const tone = EXPOSURE_PALETTE[r] ?? COLORS.primary;
                      return (
                        <td
                          key={c}
                          style={{
                            textAlign: "center",
                            background:
                              v === 0
                                ? "transparent"
                                : `rgb(from ${tone} r g b / ${intensity * 0.4})`,
                            fontWeight: v > 0 ? 600 : 400,
                            color:
                              v === 0 ? "rgb(var(--color-text-muted))" : tone,
                            minWidth: 56,
                          }}
                        >
                          {v || "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card card-body stack">
        <SectionHeader
          icon={<ShieldAlert size={16} />}
          title={`Top at-risk machines (${data.top_at_risk.length})`}
          tint="pink"
        />
        {data.top_at_risk.length === 0 ? (
          <p className="text-muted text-sm">
            No machines flagged as at-risk by Defender. Either the fleet is
            healthy or the Defender data hasn't synced.
          </p>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Assigned</th>
                  <th>Exposure</th>
                  <th>Health</th>
                  <th>Risk</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {data.top_at_risk.map((m) => (
                  <tr
                    key={m.asset_id}
                    className={onAssetClick ? "row-clickable" : undefined}
                    onClick={() => onAssetClick?.(m.asset_id)}
                  >
                    <td>
                      <div className="stack" style={{ gap: 1 }}>
                        <span className="font-medium truncate">
                          {m.device_name ?? m.serial_number}
                        </span>
                        <span className="font-mono text-xs text-muted truncate">
                          {[m.manufacturer, m.model].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="font-mono text-xs">
                        {m.assigned_upn ?? (
                          <span className="text-muted">unassigned</span>
                        )}
                      </span>
                    </td>
                    <td>
                      <AccentPill value={m.exposure_level} />
                    </td>
                    <td>
                      <AccentPill value={m.health_status} />
                    </td>
                    <td>
                      <AccentPill value={m.risk_score} />
                    </td>
                    <td>
                      <FreshnessCell iso={m.last_seen_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.missing_defender.length > 0 && (
        <div className="card card-body stack">
          <SectionHeader
            icon={<AlertTriangle size={16} />}
            title={`Missing from Defender (${data.missing_defender.length})`}
            tint="amber"
          />
          <p className="text-muted text-xs">
            These computers are in Intune but never showed up in Defender.
            Either onboarding hasn't completed or the device's aadDeviceId
            doesn't match a Defender machine.
          </p>
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Serial</th>
                  <th>Last Intune sync</th>
                </tr>
              </thead>
              <tbody>
                {data.missing_defender.map((m) => (
                  <tr
                    key={m.asset_id}
                    className={onAssetClick ? "row-clickable" : undefined}
                    onClick={() => onAssetClick?.(m.asset_id)}
                  >
                    <td className="font-medium">
                      {m.device_name ?? m.serial_number}
                    </td>
                    <td className="font-mono">{m.serial_number}</td>
                    <td>
                      <FreshnessCell iso={m.intune_synced_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
