import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  IdCard,
  RefreshCw,
  Users as UsersIcon,
} from "lucide-react";

import { useToast } from "../components/ToastProvider";
import {
  AccentPill,
  Avatar,
  SectionHeader,
  relativeTime,
} from "../components/visual";
import { getGroup, setGroupManaged, syncOneGroup } from "../services/groups";
import type { GroupDetail, GroupMemberType } from "../types/group";

function groupKindLabel(g: GroupDetail["group"]): string {
  if (g.group_types.some((t) => t.toLowerCase() === "unified")) return "M365";
  if (g.security_enabled && g.mail_enabled) return "Mail-Security";
  if (g.security_enabled) return "Security";
  if (g.mail_enabled) return "Distribution";
  return "Other";
}

interface Props {
  groupId: string;
  onBack: () => void;
  onOpenSoftware: (softwareId: number) => void;
  onMemberClick?: (userId: string) => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="eyebrow">{label}</span>
      {children}
    </div>
  );
}

function memberTypeBadge(t: GroupMemberType): ReactNode {
  switch (t) {
    case "user":
      return <span className="badge badge-info">User</span>;
    case "group":
      return <span className="badge badge-warning">Nested group</span>;
    case "device":
      return <span className="badge">Device</span>;
    default:
      return <span className="badge">Other</span>;
  }
}

export default function GroupDetailView({
  groupId,
  onBack,
  onOpenSoftware,
  onMemberClick,
}: Props) {
  const toast = useToast();
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memberFilter, setMemberFilter] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const d = await getGroup(groupId);
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void reload();
  }, [groupId]);

  const doSync = async () => {
    setSyncing(true);
    try {
      await toast.run(() => syncOneGroup(groupId), {
        pending: "Syncing group metadata…",
        success: "Synced",
        error: "Sync failed",
      });
      await reload();
    } catch {
      /* toast surfaced */
    } finally {
      setSyncing(false);
    }
  };

  const toggleManaged = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await toast.run(
        () => setGroupManaged(groupId, !detail.group.is_managed),
        {
          pending: detail.group.is_managed
            ? "Removing managed flag…"
            : "Marking managed…",
          success: detail.group.is_managed
            ? "No longer managed"
            : "Now managed",
          error: "Failed",
        },
      );
      await reload();
    } catch {
      /* toast surfaced */
    } finally {
      setBusy(false);
    }
  };

  const needle = memberFilter.trim().toLowerCase();
  const filteredMembers = useMemo(() => {
    if (!detail) return [];
    return needle
      ? detail.members.filter((m) =>
          [m.display_name, m.user_principal_name, m.mail]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(needle)),
        )
      : detail.members;
  }, [detail, needle]);

  if (!detail) {
    return (
      <div className="stack-lg">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onBack}
        >
          <ArrowLeft size={14} /> Back
        </button>
        {error ? (
          <div className="alert alert-error">{error}</div>
        ) : (
          <p className="text-muted">Loading…</p>
        )}
      </div>
    );
  }

  const g = detail.group;

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onBack}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void toggleManaged()}
            disabled={busy}
          >
            {g.is_managed ? "Remove managed flag" : "Mark managed"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void doSync()}
            disabled={syncing}
          >
            <RefreshCw
              size={14}
              className={syncing ? "animate-spin" : ""}
              strokeWidth={1.75}
            />
            {syncing ? "Syncing…" : "Sync metadata"}
          </button>
        </div>
      </div>

      <div
        className="card card-body cluster"
        style={{ gap: "0.875rem", alignItems: "center" }}
      >
        <Avatar seed={g.id} name={g.display_name} />
        <div className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
          <div
            className="cluster"
            style={{ gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}
          >
            <span className="heading-2" style={{ margin: 0 }}>
              {g.display_name}
            </span>
            {g.is_managed ? (
              <span className="badge badge-success">Managed</span>
            ) : (
              <span className="badge">Unmanaged</span>
            )}
          </div>
          <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <AccentPill value={groupKindLabel(g)} />
            {g.mail_nickname && (
              <span className="text-xs text-muted font-mono">
                {g.mail_nickname}
              </span>
            )}
          </div>
        </div>
        <div className="stack" style={{ gap: 2, alignItems: "flex-end" }}>
          <span className="text-xs eyebrow">Members</span>
          <span
            className="badge badge-info"
            style={{ fontSize: "0.875rem" }}
          >
            {detail.members.length}
            {detail.members_truncated ? "+" : ""}
          </span>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card card-body stack">
        <SectionHeader
          icon={<IdCard size={16} />}
          title="Identity"
          tint="info"
        />
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "0.5rem",
          }}
        >
          <Field label="Display name">
            <span className="text-sm">{g.display_name}</span>
          </Field>
          <Field label="Object id">
            <span className="font-mono text-xs">{g.id}</span>
          </Field>
          <Field label="Mail nickname">
            <span className="text-sm">{g.mail_nickname ?? "—"}</span>
          </Field>
          <Field label="Mail">
            <span className="text-sm">{g.mail ?? "—"}</span>
          </Field>
          <Field label="Kind">
            <span className="cluster" style={{ gap: 4, flexWrap: "wrap" }}>
              {g.security_enabled && (
                <span className="badge badge-info">Security</span>
              )}
              {g.mail_enabled && <span className="badge">Mail-enabled</span>}
              {g.group_types.length > 0 &&
                g.group_types.map((t) => (
                  <span key={t} className="badge">
                    {t}
                  </span>
                ))}
            </span>
          </Field>
          <Field label="Last metadata sync">
            <span
              className="text-sm"
              title={new Date(g.last_synced_at).toLocaleString()}
            >
              {relativeTime(g.last_synced_at)}
            </span>
          </Field>
          <Field label="Description">
            <span className="text-sm">{g.description ?? "—"}</span>
          </Field>
        </div>
      </div>

      <div className="card card-body stack">
        <SectionHeader
          icon={<UsersIcon size={16} />}
          title={`Members (${detail.members.length}${detail.members_truncated ? "+ truncated" : ""})`}
          tint="green"
          right={
            <input
              className="input input-sm"
              placeholder="Filter members…"
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              style={{ width: 240 }}
            />
          }
        />
        {detail.members.length === 0 ? (
          <p className="text-muted text-sm">No members.</p>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>UPN / mail</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m) => {
                  const seed = m.user_principal_name ?? m.mail ?? m.id;
                  // Only `user` rows route to UserDetail — nested groups,
                  // devices, etc. don't have a detail view yet.
                  const isUser = m.member_type === "user";
                  const canClick = isUser && !!onMemberClick;
                  const handleOpen = canClick
                    ? () => onMemberClick(m.id)
                    : undefined;
                  return (
                    <tr
                      key={m.id}
                      className={canClick ? "row-clickable" : undefined}
                      onClick={handleOpen}
                      style={{ cursor: canClick ? "pointer" : undefined }}
                    >
                      <td>
                        <div
                          className="cluster"
                          style={{ gap: "0.625rem", flexWrap: "nowrap" }}
                        >
                          <Avatar seed={seed} name={m.display_name} />
                          <span
                            className="font-medium truncate"
                            style={{
                              color: canClick
                                ? "rgb(var(--color-primary))"
                                : undefined,
                            }}
                          >
                            {m.display_name ?? (
                              <span className="text-muted">—</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="font-mono text-xs">
                        {m.user_principal_name ?? m.mail ?? (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>{memberTypeBadge(m.member_type)}</td>
                    </tr>
                  );
                })}
                {filteredMembers.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="text-muted"
                      style={{ textAlign: "center", padding: "0.75rem" }}
                    >
                      No members match the filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card-body stack">
        <SectionHeader
          icon={<Boxes size={16} />}
          title={`Software assigned (${detail.assigned_software.length})`}
          tint="purple"
        />
        {detail.assigned_software.length === 0 ? (
          <p className="text-muted text-sm">
            No software is currently assigned to this group.
          </p>
        ) : (
          <ul className="stack" style={{ gap: "0.5rem" }}>
            {detail.assigned_software.map((s) => (
              <li
                key={s.assignment_id}
                className="cluster row-clickable"
                style={{
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  padding: "0.5rem 0.625rem",
                  borderRadius: 8,
                  background: "rgb(var(--color-bg) / 0.4)",
                  cursor: "pointer",
                }}
                onClick={() => onOpenSoftware(s.software_id)}
              >
                <div
                  className="cluster"
                  style={{ gap: "0.625rem", flexWrap: "nowrap", minWidth: 0 }}
                >
                  <Avatar seed={s.name} name={s.name} />
                  <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                    <span className="font-medium truncate">{s.name}</span>
                    <div
                      className="cluster"
                      style={{ gap: "0.375rem", flexWrap: "wrap" }}
                    >
                      <AccentPill value={s.vendor} />
                      <AccentPill value={s.category} />
                    </div>
                  </div>
                </div>
                {s.archived && (
                  <span className="badge badge-danger">Archived</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
