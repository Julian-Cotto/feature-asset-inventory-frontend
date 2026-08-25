/** Per-controller Axis topology viewer. Read-only Phase 1: shows
 *  schedules, doors, readers, access points, auth profiles, and access
 *  profiles (badge groups) as the cache currently knows them. Sync
 *  reuses the same /badges/sync endpoint — it already pulls the
 *  topology along with users + credentials. */

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  DoorClosed,
  DoorOpen,
  Fingerprint,
  KeyRound,
  Network as NetworkIcon,
  Pencil,
  Plus,
  RefreshCw,
  ScanLine,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { SectionHeader } from "../components/visual";
import {
  createTopologyObject,
  deleteTopologyObject,
  listControllers,
  listTopology,
  listWritableKinds,
  syncBadges,
  updateTopologyObject,
  type AxisController,
  type AxisTopologyKind,
  type AxisTopologyObject,
} from "../services/badges";

interface KindDef {
  kind: AxisTopologyKind;
  label: string;
  icon: ReactNode;
  hint: string;
}

const KINDS: KindDef[] = [
  {
    kind: "door",
    label: "Doors",
    icon: <DoorOpen size={14} />,
    hint: "Physical doors the controller drives.",
  },
  {
    kind: "schedule",
    label: "Schedules",
    icon: <Calendar size={14} />,
    hint: "Time windows badges + access profiles reference.",
  },
  {
    kind: "access_profile",
    label: "Access profiles",
    icon: <Fingerprint size={14} />,
    hint: "Badge 'groups' — schedule + which access points they cover.",
  },
  {
    kind: "access_point",
    label: "Access points",
    icon: <KeyRound size={14} />,
    hint: "Door + reader pairings the controller authenticates against.",
  },
  {
    kind: "id_point",
    label: "Readers",
    icon: <ScanLine size={14} />,
    hint: "Card readers / keypads wired to the controller.",
  },
  {
    kind: "authentication_profile",
    label: "Auth profiles",
    icon: <ShieldCheck size={14} />,
    hint: "Credential-type rules (Card only, Card+PIN, etc.).",
  },
  {
    kind: "access_controller",
    label: "Controllers",
    icon: <Cpu size={14} />,
    hint: "The Axis controller itself.",
  },
];

const KIND_BY: Record<string, KindDef> = Object.fromEntries(
  KINDS.map((k) => [k.kind, k]),
);

function parseUtc(iso: string): number {
  if (!iso) return NaN;
  const hasTz =
    iso.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(iso.split("T")[1] ?? "");
  return new Date(hasTz ? iso : iso + "Z").getTime();
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const ts = parseUtc(iso);
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 0 && diff > -60_000) return "just now";
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function controllerTint(id: string) {
  if (id === "front") {
    return {
      bg: "rgb(from rgb(var(--color-info)) r g b / 0.16)",
      fg: "rgb(var(--color-info))",
      icon: <DoorOpen size={12} />,
    };
  }
  return {
    bg: "rgb(from rgb(var(--color-warning)) r g b / 0.16)",
    fg: "rgb(var(--color-warning))",
    icon: <DoorClosed size={12} />,
  };
}

interface ControllersProps {
  onNetworkClick?: (id: number) => void;
}

export default function Controllers({ onNetworkClick }: ControllersProps = {}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [controllers, setControllers] = useState<AxisController[]>([]);
  const [activeControllerId, setActiveControllerId] = useState<string>("");
  const [activeKind, setActiveKind] = useState<AxisTopologyKind>("door");
  const [rows, setRows] = useState<AxisTopologyObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [writableKinds, setWritableKinds] = useState<Set<AxisTopologyKind>>(
    new Set(),
  );
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    void listWritableKinds()
      .then((kinds) => setWritableKinds(new Set(kinds)))
      .catch(() => setWritableKinds(new Set()));
  }, []);

  // Load controllers list and default-select the first configured one.
  useEffect(() => {
    void listControllers()
      .then((cs) => {
        setControllers(cs);
        const first = cs.find((c) => c.configured) ?? cs[0];
        if (first) setActiveControllerId(first.id);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  }, []);

  // Refetch the visible kind when controller / kind changes.
  useEffect(() => {
    if (!activeControllerId) return;
    setLoading(true);
    void listTopology({ controller: activeControllerId, kind: activeKind })
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [activeControllerId, activeKind]);

  async function refetch() {
    if (!activeControllerId) return;
    try {
      const r = await listTopology({
        controller: activeControllerId,
        kind: activeKind,
      });
      setRows(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function startEdit(row: AxisTopologyObject) {
    setEditingId(row.id);
    setEditorText(JSON.stringify(row.raw ?? {}, null, 2));
    // Expand so the editor is visible.
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(row.id);
      return next;
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditorText("");
  }

  async function saveEdit(row: AxisTopologyObject) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editorText);
    } catch (e) {
      toast.notify({
        kind: "warning",
        title: "Invalid JSON",
        detail: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    setSavingId(row.id);
    try {
      const updated = await updateTopologyObject(
        row.controller_id,
        row.kind,
        row.axis_token,
        parsed,
      );
      toast.notify({
        kind: "success",
        title: `${KIND_BY[row.kind]?.label ?? "Object"} updated`,
        detail: `${updated.name ?? updated.axis_token} on ${updated.controller_label ?? updated.controller_id}`,
      });
      cancelEdit();
      await refetch();
    } catch (e) {
      toast.notify({
        kind: "danger",
        title: "Update failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRow(row: AxisTopologyObject) {
    const kindLabel = KIND_BY[row.kind]?.label ?? row.kind;
    const ok = await confirm({
      title: `Delete ${kindLabel.toLowerCase()}?`,
      tone: "danger",
      confirmLabel: "Delete",
      cancelLabel: "Keep",
      message: (
        <div className="stack" style={{ gap: "0.4rem" }}>
          <p>
            This removes <strong>{row.name ?? row.axis_token}</strong> (token{" "}
            <code>{row.axis_token}</code>) from{" "}
            <strong>{row.controller_label ?? row.controller_id}</strong>.
          </p>
          <p className="text-muted text-sm">
            Anything that references this {kindLabel.toLowerCase()} (badges,
            access profiles) will lose the link. Can't be undone.
          </p>
        </div>
      ),
    });
    if (!ok) {
      toast.notify({
        kind: "info",
        title: "Delete cancelled",
        detail: `${row.name ?? row.axis_token} kept`,
      });
      return;
    }
    setSavingId(row.id);
    try {
      await deleteTopologyObject(row.controller_id, row.kind, row.axis_token);
      toast.notify({
        kind: "success",
        title: `${kindLabel} deleted`,
        detail: `${row.name ?? row.axis_token} removed from ${row.controller_label ?? row.controller_id}`,
      });
      await refetch();
    } catch (e) {
      toast.notify({
        kind: "danger",
        title: "Delete failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSavingId(null);
    }
  }

  async function runSync() {
    setSyncing(true);
    try {
      const r = await syncBadges();
      const perCtl = r.controllers
        .filter((c) => !c.skipped)
        .map(
          (c) =>
            `${c.label}: creds ${c.fetched_credentials} · users ${c.fetched_users}`,
        )
        .join(" · ");
      toast.notify({
        kind: r.errors.length === 0 ? "success" : "warning",
        title: "Axis sync complete",
        detail:
          perCtl +
          (r.errors.length ? ` · ${r.errors.length} error(s)` : ""),
      });
      const skipped = r.controllers.filter((c) => c.skipped);
      if (skipped.length > 0) {
        toast.notify({
          kind: "info",
          title: "Some controllers skipped",
          detail: skipped
            .map((c) => `${c.label} (not configured)`)
            .join(" · "),
        });
      }
      const unreachable = r.controllers.filter(
        (c) => c.unreachable && !c.skipped,
      );
      if (unreachable.length > 0) {
        toast.notify({
          kind: "warning",
          title: "Controller unreachable",
          detail: unreachable
            .map(
              (c) =>
                `${c.label}: ${c.errors[0] ?? "connection timed out"}`,
            )
            .join(" · "),
        });
      }
      // Re-fetch the visible kind.
      if (activeControllerId) {
        const refetched = await listTopology({
          controller: activeControllerId,
          kind: activeKind,
        });
        setRows(refetched);
      }
    } catch (e) {
      toast.notify({
        kind: "danger",
        title: "Sync failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSyncing(false);
    }
  }

  const activeKindDef = KIND_BY[activeKind];
  const configuredControllers = controllers.filter((c) => c.configured);

  return (
    <div className="stack-lg">
      <section className="card stack" style={{ padding: "1.25rem" }}>
        <SectionHeader
          icon={<Settings size={18} />}
          title="Axis controllers"
          tint="teal"
          right={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={syncing || configuredControllers.length === 0}
              onClick={() => void runSync()}
            >
              <RefreshCw
                size={14}
                className={syncing ? "animate-spin" : ""}
              />
              {syncing ? "Syncing…" : "Sync from Axis"}
            </button>
          }
        />
        <p className="text-muted text-sm" style={{ margin: 0 }}>
          Read-only topology mirror. Pick a controller, then a category to see
          what the Axis panel currently has configured. Sync pulls badges,
          users, and topology in one call.
        </p>

        {/* Controller tabs */}
        {controllers.length === 0 ? (
          <p className="text-muted text-sm">No controllers known.</p>
        ) : (
          <div
            className="cluster"
            style={{ gap: "0.4rem", flexWrap: "wrap" }}
          >
            {controllers.map((c) => {
              const tint = controllerTint(c.id);
              const active = c.id === activeControllerId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveControllerId(c.id)}
                  className={active ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                  style={{
                    opacity: c.configured ? 1 : 0.55,
                  }}
                  title={
                    c.configured
                      ? `${c.label} · ${c.base_url}`
                      : `${c.label} not configured`
                  }
                >
                  {tint.icon}
                  {c.label}
                  {!c.configured && (
                    <span
                      className="text-xs"
                      style={{ marginLeft: 4, opacity: 0.7 }}
                    >
                      (off)
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Active controller — surface base URL + Meraki network it
            lives on so the operator can jump straight to that
            Network detail. */}
        {activeControllerId &&
          (() => {
            const active = controllers.find(
              (c) => c.id === activeControllerId,
            );
            if (!active) return null;
            return (
              <div
                className="cluster text-xs text-muted"
                style={{
                  gap: "0.5rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span className="font-mono">{active.base_url || "—"}</span>
                {active.network_id && active.network_name ? (
                  <button
                    type="button"
                    className="btn btn-link btn-sm"
                    style={{ padding: 0 }}
                    onClick={() => onNetworkClick?.(active.network_id as number)}
                    disabled={!onNetworkClick}
                    title={`Open ${active.network_name} in Networks`}
                  >
                    <NetworkIcon
                      size={12}
                      style={{ verticalAlign: "-2px", marginRight: 4 }}
                    />
                    On network: {active.network_name}
                  </button>
                ) : (
                  active.configured && (
                    <span style={{ fontStyle: "italic" }}>
                      Network unresolved (IP not in any known VLAN)
                    </span>
                  )
                )}
              </div>
            );
          })()}
      </section>

      {/* Kind picker + table */}
      {activeControllerId && (
        <section className="card stack" style={{ padding: "1.25rem" }}>
          <div
            className="cluster"
            style={{
              gap: "0.4rem",
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            <div
              className="cluster"
              style={{ gap: "0.4rem", flexWrap: "wrap" }}
            >
              {KINDS.map((k) => {
                const active = k.kind === activeKind;
                return (
                  <button
                    key={k.kind}
                    type="button"
                    onClick={() => setActiveKind(k.kind)}
                    className={
                      active ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"
                    }
                    title={k.hint}
                  >
                    {k.icon}
                    {k.label}
                  </button>
                );
              })}
            </div>
            {writableKinds.has(activeKind) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setAddOpen(true)}
                title={`Create a new ${activeKindDef?.label.toLowerCase() ?? activeKind} on this controller`}
              >
                <Plus size={13} />
                Add {activeKindDef?.label.toLowerCase().replace(/s$/, "") ?? "item"}
              </button>
            )}
          </div>

          <div
            className="cluster text-sm text-muted"
            style={{ gap: "0.5rem", alignItems: "center" }}
          >
            <Fingerprint size={12} />
            <span>{activeKindDef?.hint}</span>
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {loading ? (
            <p className="text-muted">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-muted">
              No {activeKindDef?.label.toLowerCase() ?? "items"} cached for
              this controller. Click "Sync from Axis".
            </p>
          ) : (
            <div
              className="scroll-x"
              style={{
                border: "1px solid rgb(var(--color-border) / 0.4)",
                borderRadius: 10,
                overflow: "auto",
                maxHeight: "calc(100vh - 24rem)",
              }}
            >
              <table
                className="table"
                style={{
                  margin: 0,
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  fontSize: "0.85rem",
                }}
              >
                <thead>
                  <tr>
                    {["Name", "Token", "Description", "Synced", ""].map((h, i) => (
                      <th
                        key={h || `c${i}`}
                        style={{
                          position: "sticky",
                          top: 0,
                          zIndex: 1,
                          background: "rgb(var(--color-bg) / 0.92)",
                          backdropFilter: "blur(6px)",
                          borderBottom:
                            "1px solid rgb(var(--color-border) / 0.5)",
                          textTransform: "uppercase",
                          fontSize: "0.7rem",
                          letterSpacing: 0.5,
                          color: "rgb(var(--color-text-muted))",
                          padding: "0.6rem 0.85rem",
                          textAlign: "left",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const isOpen = expanded.has(r.id);
                    const isEditing = editingId === r.id;
                    return (
                      <Row
                        key={r.id}
                        row={r}
                        idx={idx}
                        open={isOpen || isEditing}
                        editing={isEditing}
                        canWrite={writableKinds.has(r.kind)}
                        editorText={editorText}
                        onEditorChange={setEditorText}
                        busy={savingId === r.id}
                        onToggle={() => {
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.id)) next.delete(r.id);
                            else next.add(r.id);
                            return next;
                          });
                        }}
                        onStartEdit={() => startEdit(r)}
                        onCancelEdit={cancelEdit}
                        onSaveEdit={() => void saveEdit(r)}
                        onDelete={() => void deleteRow(r)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {addOpen && activeControllerId && (
        <AddTopologyModal
          controllerId={activeControllerId}
          controllerLabel={
            controllers.find((c) => c.id === activeControllerId)?.label ??
            activeControllerId
          }
          kind={activeKind}
          kindLabel={activeKindDef?.label ?? activeKind}
          starterTemplate={starterFor(activeKind, rows)}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

/** Pick a sensible starter JSON for a new object. If there's an existing
 *  row of this kind we clone it (with a blank token + tweaked name) so
 *  the operator only edits what differs. Otherwise we fall back to a
 *  minimal payload that the controller will likely accept. */
function starterFor(
  kind: AxisTopologyKind,
  existingRows: AxisTopologyObject[],
): Record<string, unknown> {
  const sample = existingRows.find((r) => r.raw)?.raw;
  if (sample) {
    return { ...sample, token: "", Name: "" };
  }
  // Bare-minimum scaffolds. The controller will reject and surface the
  // exact missing field — operator iterates from there.
  switch (kind) {
    case "schedule":
      return {
        token: "",
        Name: "",
        Description: "",
        ScheduleDefinition:
          "BEGIN:VCALENDAR\r\nPRODID:\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nSUMMARY:New Schedule\r\nDTSTART:19700101T000000\r\nDTEND:19700102T000000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\r\nDTSTAMP:19700101T000000\r\nUID:000000000000000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
        ExceptionScheduleDefinition: "",
        Attribute: [],
      };
    case "access_profile":
      return {
        token: "",
        Name: "",
        Description: "",
        ValidFrom: "",
        ValidTo: "",
        Schedule: [],
        AuthenticationProfile: [],
        Attribute: [],
        AccessPolicy: [],
        Enabled: true,
      };
    case "authentication_profile":
      return {
        token: "",
        Name: "",
        Description: "",
        Schedule: [],
        IdFactor: [],
      };
    case "door":
      return {
        token: "",
        Name: "",
        Description: "",
        AccessTime: "PT5S",
        OpenTooLongTime: "PT30S",
        PreAlarmTime: "PT10S",
        ExtendedAccessTime: "PT30S",
        ExtendedOpenTooLongTime: "PT60S",
        HeartbeatInterval: "PT600S",
      };
    case "access_point":
      return {
        token: "",
        Name: "",
        Description: "",
        EntityType: "tdc:Door",
        Entity: "",
        Enabled: true,
        IdPointDevice: [],
        AuthenticationProfile: [],
        Attribute: [],
        Action: "Access",
      };
    case "id_point":
      return {
        token: "",
        Name: "",
        Description: "",
        Action: "Access",
        MinPINSize: 4,
        MaxPINSize: 4,
        EndOfPIN: "#",
        Timeout: "PT10S",
      };
    default:
      return { token: "", Name: "" };
  }
}

interface AddModalProps {
  controllerId: string;
  controllerLabel: string;
  kind: AxisTopologyKind;
  kindLabel: string;
  starterTemplate: Record<string, unknown>;
  onClose: () => void;
  onCreated: (row: AxisTopologyObject) => void;
}

function AddTopologyModal({
  controllerId,
  controllerLabel,
  kind,
  kindLabel,
  starterTemplate,
  onClose,
  onCreated,
}: AddModalProps) {
  const toast = useToast();
  const [text, setText] = useState(() =>
    JSON.stringify(starterTemplate, null, 2),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.notify({ kind: "warning", title: "Invalid JSON", detail: msg });
      return;
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.token ||
      typeof parsed.token !== "string"
    ) {
      const msg = "Payload must include a non-empty `token` string.";
      setError(msg);
      toast.notify({ kind: "warning", title: "Missing token", detail: msg });
      return;
    }
    setSaving(true);
    try {
      const row = await createTopologyObject(controllerId, kind, parsed);
      toast.notify({
        kind: "success",
        title: `${kindLabel} created`,
        detail: `${row.name ?? row.axis_token} on ${row.controller_label ?? row.controller_id}`,
      });
      onCreated(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.notify({
        kind: "danger",
        title: "Create failed",
        detail: msg,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "1rem",
      }}
    >
      <div
        className="card stack"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(48rem, 100%)",
          maxHeight: "calc(100vh - 4rem)",
          overflow: "auto",
          padding: "1.5rem",
          gap: "0.75rem",
        }}
      >
        <div
          className="cluster"
          style={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <div className="cluster" style={{ gap: "0.5rem", alignItems: "center" }}>
            <Plus size={18} />
            <h3 className="heading-3" style={{ margin: 0 }}>
              New {kindLabel.toLowerCase()}
            </h3>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-muted text-sm" style={{ margin: 0 }}>
          Edit the JSON below and click Create. Pick a unique{" "}
          <code>token</code> (the operator-chosen ID Axis uses to reference
          this object) before saving. Writes to{" "}
          <strong>{controllerLabel}</strong>.
        </p>
        <p
          className="text-muted text-xs"
          style={{ margin: 0 }}
          title="Cloned from the first existing row of the same kind, so the schema is realistic."
        >
          <Copy size={11} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Template seeded from an existing row.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          style={{
            width: "100%",
            minHeight: "22rem",
            padding: "0.75rem",
            background: "rgb(var(--color-bg) / 0.6)",
            border: "1px solid rgb(var(--color-border) / 0.4)",
            borderRadius: 8,
            fontSize: "0.78rem",
            lineHeight: 1.45,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            color: "rgb(var(--color-text))",
            resize: "vertical",
          }}
        />
        {error && <div className="alert alert-error">{error}</div>}
        <div className="cluster" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void submit()}
            disabled={saving}
          >
            <Plus size={14} />
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  row: AxisTopologyObject;
  idx: number;
  open: boolean;
  editing: boolean;
  canWrite: boolean;
  editorText: string;
  busy: boolean;
  onToggle: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onEditorChange: (s: string) => void;
}

const CELL: CSSProperties = {
  padding: "0.55rem 0.85rem",
  borderBottom: "1px solid rgb(var(--color-border) / 0.25)",
  verticalAlign: "middle",
};

function Row({
  row,
  idx,
  open,
  editing,
  canWrite,
  editorText,
  busy,
  onToggle,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onEditorChange,
}: RowProps) {
  const bg = idx % 2 === 0 ? "transparent" : "rgb(var(--color-bg) / 0.35)";
  return (
    <>
      <tr style={{ background: bg, cursor: editing ? "default" : "pointer" }}>
        <td style={CELL} onClick={editing ? undefined : onToggle}>
          <div className="cluster" style={{ gap: 6, alignItems: "center" }}>
            <span style={{ color: "rgb(var(--color-text-muted))" }}>
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </span>
            <span className="font-medium">
              {row.name?.trim() || (
                <span className="text-muted" style={{ fontStyle: "italic" }}>
                  (unnamed)
                </span>
              )}
            </span>
          </div>
        </td>
        <td style={CELL} onClick={editing ? undefined : onToggle}>
          <span
            className="font-mono text-xs"
            style={{ color: "rgb(var(--color-text-muted))" }}
          >
            {row.axis_token}
          </span>
        </td>
        <td style={CELL} onClick={editing ? undefined : onToggle}>
          <span className="text-sm">
            {row.description?.trim() ? (
              row.description
            ) : (
              <span className="text-muted">—</span>
            )}
          </span>
        </td>
        <td style={CELL} onClick={editing ? undefined : onToggle}>
          <span
            className="text-muted text-xs"
            title={new Date(parseUtc(row.synced_at)).toLocaleString()}
          >
            {relTime(row.synced_at)}
          </span>
        </td>
        <td style={CELL}>
          <div className="cluster" style={{ gap: 4, justifyContent: "flex-end" }}>
            {row.archived_at && (
              <span
                className="badge"
                style={{
                  background:
                    "rgb(from rgb(var(--color-warning)) r g b / 0.16)",
                  color: "rgb(var(--color-warning))",
                  borderColor: "transparent",
                  fontSize: "0.7rem",
                  padding: "1px 6px",
                }}
                title={`Removed from Axis on ${new Date(parseUtc(row.archived_at)).toLocaleString()}`}
              >
                archived
              </span>
            )}
            {canWrite && !editing && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "2px 6px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartEdit();
                  }}
                  title="Edit raw payload"
                  disabled={busy}
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{
                    padding: "2px 6px",
                    color: "rgb(var(--color-danger))",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  title="Delete on Axis controller"
                  disabled={busy}
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {(open || editing) && (
        <tr style={{ background: bg }}>
          <td colSpan={5} style={{ ...CELL, padding: "0.25rem 0.85rem 0.85rem" }}>
            {editing ? (
              <div className="stack" style={{ gap: "0.5rem" }}>
                <p className="text-muted text-xs" style={{ margin: 0 }}>
                  Raw VAPIX payload. URL token (
                  <code>{row.axis_token}</code>) takes precedence — the
                  controller upserts this object as-is.
                </p>
                <textarea
                  value={editorText}
                  onChange={(e) => onEditorChange(e.target.value)}
                  spellCheck={false}
                  style={{
                    width: "100%",
                    minHeight: "16rem",
                    padding: "0.75rem",
                    background: "rgb(var(--color-bg) / 0.6)",
                    border: "1px solid rgb(var(--color-border) / 0.4)",
                    borderRadius: 8,
                    fontSize: "0.75rem",
                    lineHeight: 1.45,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    color: "rgb(var(--color-text))",
                    resize: "vertical",
                  }}
                />
                <div className="cluster" style={{ gap: "0.4rem" }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={onSaveEdit}
                    disabled={busy}
                  >
                    <Check size={13} />
                    {busy ? "Saving…" : "Save to Axis"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={onCancelEdit}
                    disabled={busy}
                  >
                    <X size={13} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <pre
                style={{
                  margin: 0,
                  padding: "0.75rem",
                  background: "rgb(var(--color-bg) / 0.6)",
                  border: "1px solid rgb(var(--color-border) / 0.3)",
                  borderRadius: 8,
                  fontSize: "0.75rem",
                  lineHeight: 1.45,
                  overflow: "auto",
                  maxHeight: "20rem",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {row.raw ? JSON.stringify(row.raw, null, 2) : "(no raw payload)"}
              </pre>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

