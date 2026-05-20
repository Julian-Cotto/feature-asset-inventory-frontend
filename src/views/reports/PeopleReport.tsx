import { useEffect, useState } from "react";
import {
  Building2,
  ChevronsUp,
  Laptop,
  MapPin,
  UserMinus,
  Users as UsersIcon,
} from "lucide-react";

import Bars from "../../components/Bars";
import { AccentPill, Avatar, SectionHeader } from "../../components/visual";
import { getPeopleReport } from "../../services/inventory";
import type { PeopleReport } from "../../types/reports";

const COLORS = {
  success: "rgb(var(--color-success))",
  warning: "rgb(var(--color-warning))",
  danger: "rgb(var(--color-danger))",
  primary: "rgb(var(--color-primary))",
  muted: "rgb(var(--color-text-muted))",
};

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

export default function PeopleReportView({
  onOpenUser,
}: {
  onOpenUser?: (id: string) => void;
}) {
  const [data, setData] = useState<PeopleReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPeopleReport()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <p className="text-muted">Loading…</p>;

  const coveragePct =
    data.totals.total_users > 0
      ? Math.round(
          (data.totals.users_with_device / data.totals.total_users) * 100,
        )
      : 0;

  const deptBars = data.devices_by_department.slice(0, 15).map((r) => ({
    label: r.label,
    value: r.count,
    color: r.label === "Unknown" ? COLORS.muted : COLORS.primary,
  }));

  const officeBars = data.devices_by_office.slice(0, 15).map((r) => ({
    label: r.label,
    value: r.count,
    color: r.label === "Unknown" ? COLORS.muted : COLORS.success,
  }));

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
          icon={<UsersIcon size={14} />}
          label="Active users"
          value={data.totals.total_users}
          sub="cached from Microsoft Graph"
        />
        <StatTile
          icon={<Laptop size={14} />}
          label="With device"
          value={data.totals.users_with_device}
          tone="success"
          sub={`${coveragePct}% coverage`}
        />
        <StatTile
          icon={<UserMinus size={14} />}
          label="Without device"
          value={data.totals.users_without_device}
          tone={data.totals.users_without_device === 0 ? "success" : "warning"}
          sub="active users, no primary device"
        />
        <StatTile
          icon={<ChevronsUp size={14} />}
          label="Total assignments"
          value={data.totals.total_assigned_devices}
          sub="includes multi-device owners"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card card-body stack">
          <SectionHeader
            icon={<Building2 size={16} />}
            title="Devices by department"
            tint="info"
          />
          {deptBars.length === 0 ? (
            <p className="text-muted text-sm">No data.</p>
          ) : (
            <Bars bars={deptBars} labelWidth="9rem" />
          )}
          {data.devices_by_department.length > 15 && (
            <p className="text-muted text-xs">
              Showing top 15 of {data.devices_by_department.length} departments.
            </p>
          )}
        </div>

        <div className="card card-body stack">
          <SectionHeader
            icon={<MapPin size={16} />}
            title="Devices by office"
            tint="green"
          />
          {officeBars.length === 0 ? (
            <p className="text-muted text-sm">No data.</p>
          ) : (
            <Bars bars={officeBars} labelWidth="9rem" />
          )}
          {data.devices_by_office.length > 15 && (
            <p className="text-muted text-xs">
              Showing top 15 of {data.devices_by_office.length} offices.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card card-body stack">
          <SectionHeader
            icon={<Laptop size={16} />}
            title={`Multi-device owners (${data.top_users_by_devices.filter((u) => u.device_count > 1).length})`}
            tint="purple"
          />
          {data.top_users_by_devices.filter((u) => u.device_count > 1).length ===
          0 ? (
            <p className="text-muted text-sm">
              No user has more than one device.
            </p>
          ) : (
            <ul className="stack" style={{ gap: "0.5rem" }}>
              {data.top_users_by_devices
                .filter((u) => u.device_count > 1)
                .slice(0, 10)
                .map((u) => (
                  <li
                    key={u.upn}
                    className="cluster"
                    style={{
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      padding: "0.5rem 0.625rem",
                      borderRadius: 8,
                      background: "rgb(var(--color-bg) / 0.4)",
                    }}
                  >
                    <div
                      className="cluster"
                      style={{ gap: "0.625rem", flexWrap: "nowrap", minWidth: 0 }}
                    >
                      <Avatar seed={u.upn} name={u.display_name} />
                      <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                        <span className="font-medium truncate">
                          {u.display_name ?? u.upn}
                        </span>
                        <span className="font-mono text-xs text-muted truncate">
                          {u.upn}
                        </span>
                      </div>
                    </div>
                    <span className="badge badge-warning">
                      {u.device_count}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div className="card card-body stack">
          <SectionHeader
            icon={<ChevronsUp size={16} />}
            title={`Top managers by team device count (${data.top_managers.length})`}
            tint="amber"
          />
          {data.top_managers.length === 0 ? (
            <p className="text-muted text-sm">
              No manager has any reports with devices.
            </p>
          ) : (
            <ul className="stack" style={{ gap: "0.5rem" }}>
              {data.top_managers.slice(0, 10).map((m) => (
                <li
                  key={m.manager_id}
                  className="cluster"
                  style={{
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    padding: "0.5rem 0.625rem",
                    borderRadius: 8,
                    background: "rgb(var(--color-bg) / 0.4)",
                  }}
                >
                  <div
                    className="cluster"
                    style={{ gap: "0.625rem", flexWrap: "nowrap", minWidth: 0 }}
                  >
                    <Avatar seed={m.manager_id} name={m.manager_name} />
                    <span className="font-medium truncate">
                      {m.manager_name}
                    </span>
                  </div>
                  <div className="cluster" style={{ gap: 4 }}>
                    <span
                      className="badge badge-info"
                      title="Direct reports with at least one device"
                    >
                      {m.direct_reports_with_devices} reports
                    </span>
                    <span className="badge" title="Total devices on team">
                      {m.devices_total} devices
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card card-body stack">
        <SectionHeader
          icon={<UserMinus size={16} />}
          title={`Users without a device (${data.users_without_devices_sample.length}${data.totals.users_without_device > data.users_without_devices_sample.length ? "+" : ""})`}
          tint="pink"
        />
        {data.users_without_devices_sample.length === 0 ? (
          <p className="text-muted text-sm">
            Every active user has at least one assigned device. 🎉
          </p>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Department</th>
                  <th>Office</th>
                  <th>Title</th>
                </tr>
              </thead>
              <tbody>
                {data.users_without_devices_sample.map((u) => (
                  <tr
                    key={u.user_id}
                    className={onOpenUser ? "row-clickable" : undefined}
                    onClick={() => onOpenUser?.(u.user_id)}
                  >
                    <td>
                      <div
                        className="cluster"
                        style={{ gap: "0.625rem", flexWrap: "nowrap" }}
                      >
                        <Avatar seed={u.upn} name={u.display_name} />
                        <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                          <span className="font-medium truncate">
                            {u.display_name ?? u.upn}
                          </span>
                          <span className="font-mono text-xs text-muted truncate">
                            {u.upn}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <AccentPill value={u.department} />
                    </td>
                    <td>
                      <AccentPill value={u.office} />
                    </td>
                    <td className="text-sm">
                      {u.job_title ?? <span className="text-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.totals.users_without_device >
          data.users_without_devices_sample.length && (
          <p className="text-muted text-xs">
            Showing first {data.users_without_devices_sample.length} of{" "}
            {data.totals.users_without_device} users.
          </p>
        )}
      </div>
    </div>
  );
}
