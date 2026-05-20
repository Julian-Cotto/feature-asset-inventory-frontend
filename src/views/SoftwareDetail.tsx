import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  ExternalLink,
  Info,
  Trash2,
  UserPlus,
  Users as UsersIcon,
} from "lucide-react";

import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import Select from "../components/Select";
import {
  AccentPill,
  Avatar,
  SectionHeader,
} from "../components/visual";
import { listGroups } from "../services/groups";
import {
  addAssignment,
  archiveSoftware,
  deleteAssignment,
  getSoftware,
  listAssignments,
  unarchiveSoftware,
  updateSoftware,
} from "../services/software";
import { listUsers } from "../services/users";
import type { EntraGroup } from "../types/group";
import type { IntuneUser } from "../types/user";
import type {
  AssignmentPrincipalType,
  Software,
  SoftwareAssignment,
} from "../types/software";

interface Props {
  softwareId: number;
  onBack: () => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="stack" style={{ gap: 4 }}>
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}

function formatCost(cents: number | null): string {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export default function SoftwareDetail({ softwareId, onBack }: Props) {
  const confirm = useConfirm();
  const toast = useToast();

  const [software, setSoftware] = useState<Software | null>(null);
  const [assignments, setAssignments] = useState<SoftwareAssignment[]>([]);
  const [groups, setGroups] = useState<EntraGroup[]>([]);
  const [users, setUsers] = useState<IntuneUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<Partial<Software>>({});

  // Assignment composer
  const [assignKind, setAssignKind] = useState<AssignmentPrincipalType>("group");
  const [assignPrincipalId, setAssignPrincipalId] = useState("");

  const reload = async () => {
    try {
      const [sw, asn] = await Promise.all([
        getSoftware(softwareId),
        listAssignments(softwareId),
      ]);
      setSoftware(sw);
      setAssignments(asn);
      setDraft({});
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void reload();
    // Cache groups + users for the assignment picker. Managed-only for groups
    // so the picker doesn't drown in noise.
    void listGroups({ managed_only: true })
      .then(setGroups)
      .catch(() => {
        /* ignore — picker just won't have options */
      });
    void listUsers()
      .then(setUsers)
      .catch(() => {
        /* ignore */
      });
  }, [softwareId]);

  // Hooks must run before any early return below — keep the derived memo
  // here and let downstream consumers gate on `software` instead.
  const assignedKeys = useMemo(
    () => new Set(assignments.map((a) => `${a.principal_type}:${a.principal_id}`)),
    [assignments],
  );

  if (!software) {
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

  const merged = { ...software, ...draft } as Software;

  function patch<K extends keyof Software>(key: K, value: Software[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  }

  const doSave = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const payload: Partial<Software> = { ...draft };
      await toast.run(() => updateSoftware(softwareId, payload), {
        pending: "Saving…",
        success: "Saved",
        error: "Save failed",
      });
      await reload();
    } catch {
      /* toast surfaced */
    } finally {
      setSaving(false);
    }
  };

  const doArchive = async () => {
    const archiving = software.archived_at === null;
    const ok = await confirm({
      title: archiving ? "Archive software?" : "Unarchive software?",
      message: archiving
        ? "It will be hidden from the default list. Existing assignments are kept."
        : "Restores visibility in the default list.",
      tone: archiving ? "warning" : "info",
      confirmLabel: archiving ? "Archive" : "Unarchive",
    });
    if (!ok) return;
    try {
      await toast.run(
        () =>
          archiving ? archiveSoftware(softwareId) : unarchiveSoftware(softwareId),
        {
          pending: archiving ? "Archiving…" : "Unarchiving…",
          success: archiving ? "Archived" : "Unarchived",
          error: "Failed",
        },
      );
      await reload();
    } catch {
      /* toast surfaced */
    }
  };

  const doAddAssignment = async () => {
    if (!assignPrincipalId) return;
    try {
      await toast.run(
        () =>
          addAssignment(softwareId, {
            principal_type: assignKind,
            principal_id: assignPrincipalId,
          }),
        {
          pending: "Adding assignment…",
          success: "Assigned",
          error: "Assign failed",
        },
      );
      setAssignPrincipalId("");
      await reload();
    } catch {
      /* toast surfaced */
    }
  };

  const doDeleteAssignment = async (asn: SoftwareAssignment) => {
    const ok = await confirm({
      title: "Remove assignment?",
      message: `Unassign ${asn.principal_display ?? asn.principal_id} from ${software.name}? Affects entitlement tracking only — no Intune/Entra change.`,
      tone: "warning",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await toast.run(() => deleteAssignment(softwareId, asn.id), {
        pending: "Removing…",
        success: "Removed",
        error: "Remove failed",
      });
      await reload();
    } catch {
      /* toast surfaced */
    }
  };

  // Filter out already-assigned principals from the picker so duplicates
  // aren't even an option. `assignedKeys` is memoized above (must declare
  // hooks above the early return).
  const groupOptions = groups
    .filter((g) => !assignedKeys.has(`group:${g.id}`))
    .map((g) => ({ value: g.id, label: g.display_name }));
  const userOptions = users
    .filter((u) => !assignedKeys.has(`user:${u.id}`))
    .map((u) => ({
      value: u.id,
      label: u.display_name
        ? `${u.display_name} <${u.user_principal_name}>`
        : u.user_principal_name,
    }));

  const groupAssignments = assignments.filter((a) => a.principal_type === "group");
  const userAssignments = assignments.filter((a) => a.principal_type === "user");

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
          {software.link && (
            <a
              href={software.link}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost btn-sm"
            >
              <ExternalLink size={14} />
              Open link
            </a>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void doArchive()}
          >
            {software.archived_at ? "Unarchive" : "Archive"}
          </button>
        </div>
      </div>

      <div
        className="card card-body cluster"
        style={{ gap: "0.875rem", alignItems: "center" }}
      >
        <Avatar seed={software.name} name={software.name} />
        <div className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
          <div
            className="cluster"
            style={{ gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}
          >
            <span className="heading-2" style={{ margin: 0 }}>
              {software.name}
            </span>
            {software.source === "intune" ? (
              <span className="badge badge-info">Intune</span>
            ) : (
              <span className="badge">Manual</span>
            )}
            {software.archived_at && (
              <span className="badge badge-danger">Archived</span>
            )}
          </div>
          <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <AccentPill value={software.vendor} />
            <AccentPill value={software.category} />
            {software.internal_owner_upn && (
              <span className="text-xs text-muted font-mono">
                owner: {software.internal_owner_upn}
              </span>
            )}
          </div>
        </div>
        <div className="stack" style={{ gap: 2, alignItems: "flex-end" }}>
          <span className="text-xs eyebrow">Assignments</span>
          <span
            className={
              "badge " +
              (software.assignment_count > 0
                ? "badge-success"
                : "badge-neutral")
            }
            style={{ fontSize: "0.875rem" }}
          >
            {software.assignment_count}
          </span>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card card-body stack">
        <SectionHeader
          icon={<Info size={16} />}
          title="Details"
          tint="info"
        />
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "0.75rem",
          }}
        >
          <Field label="Name">
            <input
              className="input"
              value={merged.name}
              onChange={(e) => patch("name", e.target.value)}
            />
          </Field>
          <Field label="Vendor">
            <input
              className="input"
              value={merged.vendor ?? ""}
              onChange={(e) => patch("vendor", e.target.value || null)}
            />
          </Field>
          <Field label="Category">
            <input
              className="input"
              value={merged.category ?? ""}
              onChange={(e) => patch("category", e.target.value || null)}
              placeholder="e.g. Productivity, Dev tools"
            />
          </Field>
          <Field label="Internal owner UPN">
            <input
              className="input"
              type="email"
              value={merged.internal_owner_upn ?? ""}
              onChange={(e) => patch("internal_owner_upn", e.target.value || null)}
              placeholder="owner@hv.ltd"
            />
          </Field>
          <Field label="Link">
            <input
              className="input"
              type="url"
              value={merged.link ?? ""}
              onChange={(e) => patch("link", e.target.value || null)}
              placeholder="https://"
            />
          </Field>
          <Field label="Seats">
            <input
              className="input"
              type="number"
              min={0}
              value={merged.seat_count ?? ""}
              onChange={(e) =>
                patch(
                  "seat_count",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </Field>
          <Field label="License cost (USD, total)">
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={
                merged.license_cost_cents !== null
                  ? (merged.license_cost_cents / 100).toString()
                  : ""
              }
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  patch("license_cost_cents", null);
                  return;
                }
                const dollars = Number(raw);
                patch(
                  "license_cost_cents",
                  Number.isFinite(dollars) ? Math.round(dollars * 100) : null,
                );
              }}
            />
            <span className="text-xs text-muted">
              Current: {formatCost(merged.license_cost_cents)}
            </span>
          </Field>
        </div>
        <Field label="Description">
          <textarea
            className="textarea"
            rows={10}
            value={merged.description ?? ""}
            onChange={(e) => patch("description", e.target.value || null)}
            style={{ minHeight: "12rem", resize: "vertical" }}
          />
        </Field>
        <Field label="Notes">
          <textarea
            className="textarea"
            rows={10}
            value={merged.notes ?? ""}
            onChange={(e) => patch("notes", e.target.value || null)}
            style={{ minHeight: "12rem", resize: "vertical" }}
          />
        </Field>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void doSave()}
            disabled={!dirty || saving}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {dirty && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setDraft({});
                setDirty(false);
              }}
            >
              Revert
            </button>
          )}
        </div>
      </div>

      {software.source === "intune" && (
        <div className="card card-body stack">
          <SectionHeader
            icon={<Boxes size={16} />}
            title="Intune metadata"
            tint="teal"
          />
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "0.5rem",
            }}
          >
            <Field label="Intune app id">
              <span className="font-mono text-xs">
                {software.intune_app_id ?? "—"}
              </span>
            </Field>
            <Field label="Intune app type">
              <span className="text-sm">{software.intune_app_type ?? "—"}</span>
            </Field>
            <Field label="Publisher">
              <span className="text-sm">{software.intune_publisher ?? "—"}</span>
            </Field>
            <Field label="Last synced">
              <span className="text-sm">
                {software.intune_synced_at
                  ? new Date(software.intune_synced_at).toLocaleString()
                  : "—"}
              </span>
            </Field>
          </div>
        </div>
      )}

      <div className="card card-body stack">
        <SectionHeader
          icon={<UserPlus size={16} />}
          title="Add assignment"
          tint="amber"
        />
        <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          <div style={{ width: 140 }}>
            <Select
              value={assignKind}
              onChange={(v) => {
                setAssignKind(v as AssignmentPrincipalType);
                setAssignPrincipalId("");
              }}
              size="sm"
              options={[
                { value: "group", label: "Group" },
                { value: "user", label: "User" },
              ]}
            />
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <Select
              value={assignPrincipalId}
              onChange={setAssignPrincipalId}
              placeholder={
                assignKind === "group"
                  ? groupOptions.length === 0
                    ? "No managed groups cached"
                    : "— pick a group —"
                  : userOptions.length === 0
                    ? "No users cached"
                    : "— pick a user —"
              }
              searchable
              searchPlaceholder={
                assignKind === "group"
                  ? "Search groups…"
                  : "Search name, UPN, mail…"
              }
              size="sm"
              options={assignKind === "group" ? groupOptions : userOptions}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void doAddAssignment()}
            disabled={!assignPrincipalId}
          >
            Assign
          </button>
        </div>
        <p className="text-xs text-muted">
          Tracks entitlement only — does not push installations to Intune. Groups
          must be marked “managed” to appear here.
        </p>
      </div>

      <div className="card card-body stack">
        <SectionHeader
          icon={<UsersIcon size={16} />}
          title={`Groups (${groupAssignments.length})`}
          tint="purple"
        />
        {groupAssignments.length === 0 ? (
          <p className="text-muted text-sm">No groups assigned.</p>
        ) : (
          <ul className="stack" style={{ gap: "0.5rem" }}>
            {groupAssignments.map((a) => (
              <li
                key={a.id}
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
                  <Avatar
                    seed={a.principal_id}
                    name={a.principal_display ?? a.principal_id}
                  />
                  <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                    <span className="font-medium truncate">
                      {a.principal_display ?? a.principal_id}
                    </span>
                    <span className="font-mono text-xs text-muted truncate">
                      {a.principal_id}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void doDeleteAssignment(a)}
                  title="Remove assignment"
                  aria-label="Remove assignment"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card card-body stack">
        <SectionHeader
          icon={<UsersIcon size={16} />}
          title={`Users (${userAssignments.length})`}
          tint="green"
        />
        {userAssignments.length === 0 ? (
          <p className="text-muted text-sm">No users assigned.</p>
        ) : (
          <ul className="stack" style={{ gap: "0.5rem" }}>
            {userAssignments.map((a) => (
              <li
                key={a.id}
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
                  <Avatar
                    seed={a.principal_id}
                    name={a.principal_display ?? a.principal_id}
                  />
                  <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                    <span className="font-medium truncate">
                      {a.principal_display ?? a.principal_id}
                    </span>
                    <span className="font-mono text-xs text-muted truncate">
                      {a.principal_id}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void doDeleteAssignment(a)}
                  title="Remove assignment"
                  aria-label="Remove assignment"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
