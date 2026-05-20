import { useEffect, useState } from "react";
import {
  Archive,
  Boxes,
  DollarSign,
  Layers,
  PackageX,
  Users as UsersIcon,
} from "lucide-react";

import Bars from "../../components/Bars";
import { AccentPill, SectionHeader } from "../../components/visual";
import { getSoftwareReport } from "../../services/inventory";
import type { SoftwareReport } from "../../types/reports";

const COLORS = {
  success: "rgb(var(--color-success))",
  warning: "rgb(var(--color-warning))",
  danger: "rgb(var(--color-danger))",
  primary: "rgb(var(--color-primary))",
  muted: "rgb(var(--color-text-muted))",
};

const COVERAGE_PALETTE: Record<string, string> = {
  "0": COLORS.danger,
  "1": COLORS.warning,
  "2-5": COLORS.success,
  "6+": COLORS.primary,
};

function fmtUsd(cents: number): string {
  if (cents === 0) return "—";
  const dollars = cents / 100;
  if (dollars >= 1_000_000)
    return `$${(dollars / 1_000_000).toFixed(2)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}k`;
  return `$${dollars.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtUsdFull(cents: number | null): string {
  if (cents === null || cents === 0) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
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

/** Stacked horizontal "treemap" — visual relative weight of spend per
 *  category. Each row's bar width is proportional to total_cents. */
function SpendList({
  rows,
  total,
}: {
  rows: { category: string; total_cents: number; software_count: number }[];
  total: number;
}) {
  if (rows.length === 0 || total === 0) {
    return (
      <p className="text-muted text-sm">
        No license costs entered yet. Set "License cost" on individual software
        entries to populate this view.
      </p>
    );
  }
  const palette = [
    "#669DF1",
    "#4BCE97",
    "#94C748",
    "#E774BB",
    "#FCA700",
    "#C97CF4",
    "#F87168",
    "#6CC3E0",
  ];
  return (
    <div className="stack" style={{ gap: "0.5rem" }}>
      {rows
        .filter((r) => r.total_cents > 0)
        .map((r, i) => {
          const pct = (r.total_cents / total) * 100;
          return (
            <div
              key={r.category}
              className="stack"
              style={{ gap: 4 }}
            >
              <div
                className="cluster"
                style={{ justifyContent: "space-between" }}
              >
                <span className="text-sm font-medium truncate">
                  {r.category}
                </span>
                <span className="text-sm font-mono">
                  {fmtUsdFull(r.total_cents)}
                  <span className="text-xs text-muted">
                    {" "}
                    · {r.software_count}
                  </span>
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  background: "rgb(var(--color-bg))",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.max(2, pct)}%`,
                    height: "100%",
                    background: palette[i % palette.length],
                    borderRadius: 4,
                  }}
                />
              </div>
            </div>
          );
        })}
    </div>
  );
}

export default function SoftwareReportView({
  onOpenSoftware,
  onOpenGroup,
}: {
  onOpenSoftware?: (id: number) => void;
  onOpenGroup?: (id: string) => void;
}) {
  const [data, setData] = useState<SoftwareReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSoftwareReport()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <p className="text-muted">Loading…</p>;

  const unassignedCount =
    data.assignment_coverage.find((b) => b.bucket === "0")?.count ?? 0;
  const activeCount = data.totals.total_software - data.totals.archived;

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
          icon={<Boxes size={14} />}
          label="Software tracked"
          value={data.totals.total_software}
          sub={`${activeCount} active · ${data.totals.archived} archived`}
        />
        <StatTile
          icon={<DollarSign size={14} />}
          label="Annual license spend"
          value={fmtUsd(data.totals.total_spend_cents)}
          tone={data.totals.total_spend_cents > 0 ? "warning" : "default"}
          sub={
            data.totals.total_seats > 0
              ? `${data.totals.total_seats.toLocaleString()} seats tracked`
              : "no costs entered yet"
          }
        />
        <StatTile
          icon={<PackageX size={14} />}
          label="Unassigned"
          value={unassignedCount}
          tone={
            unassignedCount === 0
              ? "success"
              : unassignedCount > activeCount / 2
                ? "danger"
                : "warning"
          }
          sub="no groups + no users"
        />
        <StatTile
          icon={<Archive size={14} />}
          label="Archived"
          value={data.totals.archived}
          tone="default"
          sub="hidden from default list"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card card-body stack">
          <SectionHeader
            icon={<DollarSign size={16} />}
            title="Spend by category"
            tint="amber"
          />
          <SpendList
            rows={data.spend_by_category}
            total={data.totals.total_spend_cents}
          />
        </div>

        <div className="card card-body stack">
          <SectionHeader
            icon={<Layers size={16} />}
            title="Assignment coverage"
            tint="purple"
          />
          <p className="text-muted text-xs">
            How many groups + users each software has assigned. The "0" bucket
            is shelfware risk.
          </p>
          <Bars
            bars={data.assignment_coverage.map((b) => ({
              label: `${b.bucket} ${b.bucket === "1" ? "assignment" : "assignments"}`,
              value: b.count,
              color: COVERAGE_PALETTE[b.bucket] ?? COLORS.muted,
            }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card card-body stack">
          <SectionHeader
            icon={<Boxes size={16} />}
            title={`Top assigned software (${data.top_software.length})`}
            tint="green"
          />
          {data.top_software.length === 0 ? (
            <p className="text-muted text-sm">
              No software has any assignments yet.
            </p>
          ) : (
            <ul className="stack" style={{ gap: "0.5rem" }}>
              {data.top_software.map((s) => (
                <li
                  key={s.software_id}
                  className="cluster row-clickable"
                  style={{
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    padding: "0.5rem 0.625rem",
                    borderRadius: 8,
                    background: "rgb(var(--color-bg) / 0.4)",
                    cursor: onOpenSoftware ? "pointer" : undefined,
                  }}
                  onClick={() => onOpenSoftware?.(s.software_id)}
                >
                  <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                    <span className="font-medium truncate">{s.name}</span>
                    <div
                      className="cluster"
                      style={{ gap: 4, flexWrap: "wrap" }}
                    >
                      <AccentPill value={s.vendor} />
                      <AccentPill value={s.category} />
                    </div>
                  </div>
                  <span className="badge badge-success">
                    {s.assignment_count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card card-body stack">
          <SectionHeader
            icon={<UsersIcon size={16} />}
            title={`Top groups by software (${data.top_groups.length})`}
            tint="info"
          />
          {data.top_groups.length === 0 ? (
            <p className="text-muted text-sm">
              No managed groups have software assigned yet.
            </p>
          ) : (
            <ul className="stack" style={{ gap: "0.5rem" }}>
              {data.top_groups.map((g) => (
                <li
                  key={g.group_id}
                  className="cluster row-clickable"
                  style={{
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    padding: "0.5rem 0.625rem",
                    borderRadius: 8,
                    background: "rgb(var(--color-bg) / 0.4)",
                    cursor: onOpenGroup ? "pointer" : undefined,
                  }}
                  onClick={() => onOpenGroup?.(g.group_id)}
                >
                  <span className="font-medium truncate">
                    {g.display_name}
                  </span>
                  <span className="badge badge-info">{g.software_count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card card-body stack">
        <SectionHeader
          icon={<PackageX size={16} />}
          title={`Unassigned software (${data.unassigned_software.length})`}
          tint="pink"
        />
        <p className="text-muted text-xs">
          Sorted by license cost descending — biggest potential shelfware first.
        </p>
        {data.unassigned_software.length === 0 ? (
          <p className="text-muted text-sm">
            Every active software has at least one assignment. 🎉
          </p>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Vendor</th>
                  <th>Category</th>
                  <th>Source</th>
                  <th>License cost</th>
                </tr>
              </thead>
              <tbody>
                {data.unassigned_software.map((s) => (
                  <tr
                    key={s.software_id}
                    className={onOpenSoftware ? "row-clickable" : undefined}
                    onClick={() => onOpenSoftware?.(s.software_id)}
                  >
                    <td className="font-medium">{s.name}</td>
                    <td>
                      <AccentPill value={s.vendor} />
                    </td>
                    <td>
                      <AccentPill value={s.category} />
                    </td>
                    <td>
                      {s.source === "intune" ? (
                        <span className="badge badge-info">Intune</span>
                      ) : (
                        <span className="badge">Manual</span>
                      )}
                    </td>
                    <td className="font-mono">
                      {s.license_cost_cents === null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span className="text-warning-soft-fg">
                          {fmtUsdFull(s.license_cost_cents)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
