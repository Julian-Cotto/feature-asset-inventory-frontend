/** Badge mirror list. Search + filter + bulk sync. Click a row to open
 *  the detail view (`BadgeDetail.tsx`) which surfaces the manual badge ↔
 *  Intune user linking flow. */

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AtSign,
  DoorClosed,
  DoorOpen,
  IdCard,
  Link2,
  Link2Off,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";

import AddBadgeModal from "../components/AddBadgeModal";
import ExportDropdown from "../components/ExportDropdown";
import LinkBadgesWizard from "../components/LinkBadgesWizard";
import { useToast } from "../components/ToastProvider";
import { SectionHeader } from "../components/visual";
import { toErrorDetails, type ErrorDetailItem } from "../lib/errors";
import { downloadBadgesExport } from "../services/exports";
import {
  bulkSetBadgesEnabled,
  listBadges,
  listControllers,
  syncBadges,
  type AxisController,
  type Badge,
  type BadgesQuery,
} from "../services/badges";

interface Props {
  onSelect: (token: string) => void;
}

type EnabledFilter = "all" | "enabled" | "disabled";
type LinkedFilter = "all" | "linked" | "unlinked";

const PAGE_SIZE = 200;

function fmtName(b: Badge): string | null {
  const last = b.axis_last_name?.trim();
  const first = b.axis_first_name?.trim();
  if (last && first) return `${last}, ${first}`;
  if (b.axis_full_name?.trim()) return b.axis_full_name.trim();
  return null;
}

function initialsFor(name: string): string {
  const parts = name.split(/[\s,]+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Backend returns naive UTC ISO strings (no `Z`). JS would otherwise
 *  parse them as local time and report future timestamps. */
function parseUtc(iso: string): number {
  if (!iso) return NaN;
  // ISO has a timezone marker if it ends with Z or +HH:MM / -HH:MM in the
  // time portion (after the "T").
  const hasTz =
    iso.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(iso.split("T")[1] ?? "");
  return new Date(hasTz ? iso : iso + "Z").getTime();
}

function relTime(iso: string): string {
  const ts = parseUtc(iso);
  if (!ts) return "—";
  const diff = Date.now() - ts;
  // Clock skew or freshly-written row arriving "in the future" by a few
  // seconds — clamp instead of showing "-3s ago".
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

function controllerTint(id: string): { bg: string; fg: string; icon: ReactNode } {
  if (id === "front") {
    return {
      bg: "rgb(from rgb(var(--color-info)) r g b / 0.16)",
      fg: "rgb(var(--color-info))",
      icon: <DoorOpen size={11} />,
    };
  }
  return {
    bg: "rgb(from rgb(var(--color-warning)) r g b / 0.16)",
    fg: "rgb(var(--color-warning))",
    icon: <DoorClosed size={11} />,
  };
}

const cellStyle: CSSProperties = {
  padding: "0.55rem 0.85rem",
  borderBottom: "1px solid rgb(var(--color-border) / 0.25)",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

export default function Badges({ onSelect }: Props) {
  const toast = useToast();
  const [rows, setRows] = useState<Badge[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [enabled, setEnabled] = useState<EnabledFilter>("all");
  const [linked, setLinked] = useState<LinkedFilter>("all");
  const [facility, setFacility] = useState("");
  const [controllerFilter, setControllerFilter] = useState<string>("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [offset, setOffset] = useState(0);

  const [controllers, setControllers] = useState<AxisController[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [linkWizardOpen, setLinkWizardOpen] = useState(false);

  // Multi-select state for bulk enable/disable. Cleared whenever the
  // visible filter changes — selections only make sense against the
  // page the operator is looking at.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  useEffect(() => {
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, enabled, linked, facility, controllerFilter, includeArchived, offset]);

  function toggleSelect(token: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  }

  const allSelectedOnPage =
    rows.length > 0 && rows.every((r) => selected.has(r.token));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelectedOnPage) {
        rows.forEach((r) => next.delete(r.token));
      } else {
        rows.forEach((r) => next.add(r.token));
      }
      return next;
    });
  }

  async function runBulkSetEnabled(enabledValue: boolean) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const r = await bulkSetBadgesEnabled([...selected], enabledValue);
      const verb = enabledValue ? "enabled" : "disabled";
      toast.notify({
        kind: r.errors.length > 0 ? "warning" : "success",
        title: `${r.updated} badge${r.updated === 1 ? "" : "s"} ${verb}`,
        detail:
          r.errors.length > 0
            ? `${r.errors.length} error(s) · ${r.skipped} skipped`
            : `${r.requested} requested · ${r.skipped} skipped`,
      });
      setSelected(new Set());
      await load();
    } catch (e) {
      const details = toErrorDetails(e, {
        title: "Bulk update failed",
        occurredAt: new Date().toLocaleString(),
        context: { requested: selected.size },
      });
      toast.notify({
        kind: "danger",
        title: "Bulk update failed",
        detail: details.message,
        details,
      });
    } finally {
      setBulkBusy(false);
    }
  }
  useEffect(() => {
    void listControllers()
      .then(setControllers)
      .catch(() => {
        // Non-fatal — fall back to a single "all" view.
      });
  }, []);

  const query = useMemo<BadgesQuery>(
    () => ({
      search: search.trim() || undefined,
      enabled:
        enabled === "all" ? undefined : enabled === "enabled" ? true : false,
      linked: linked === "all" ? undefined : linked === "linked" ? true : false,
      facility_code: facility.trim() || undefined,
      controller: controllerFilter === "all" ? undefined : controllerFilter,
      include_archived: includeArchived,
      limit: PAGE_SIZE,
      offset,
    }),
    [search, enabled, linked, facility, controllerFilter, includeArchived, offset],
  );

  async function load() {
    setLoading(true);
    try {
      const r = await listBadges(query);
      setRows(r.rows);
      setTotal(r.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Reset paging when filters change.
  useEffect(() => {
    setOffset(0);
  }, [search, enabled, linked, facility, controllerFilter, includeArchived]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function runSync() {
    setSyncing(true);
    try {
      const r = await syncBadges();
      const perController = r.controllers
        .filter((c) => !c.skipped)
        .map((c) => {
          const matchRate =
            c.fetched_credentials > 0
              ? Math.round(
                  (c.matched_users /
                    Math.max(1, c.matched_users + c.unmatched_users)) *
                    100,
                )
              : 100;
          return `${c.label}: ${c.fetched_credentials} (+${c.created}/${c.updated}/${c.archived}) · users ${c.fetched_users} · ${matchRate}% matched`;
        })
        .join(" · ");
      // Collect every controller-level failure into structured items so the
      // "complete with errors" toast can open a full breakdown.
      const errorItems: ErrorDetailItem[] = [
        ...r.controllers.flatMap((c) =>
          c.errors.map((msg) => ({
            label: c.label,
            message: msg,
            kind: (c.unreachable ? "error" : "warning") as ErrorDetailItem["kind"],
          })),
        ),
        ...r.errors.map((msg) => ({
          label: "Sync",
          message: msg,
          kind: "error" as const,
        })),
      ];
      toast.notify({
        kind: r.errors.length === 0 ? "success" : "warning",
        title: "Axis sync complete",
        detail:
          perController +
          (r.errors.length ? ` · ${r.errors.length} error(s)` : ""),
        details: errorItems.length
          ? {
              title: "Axis sync — issues",
              message: `${errorItems.length} issue(s) across ${r.controllers.length} controller(s).`,
              occurredAt: new Date().toLocaleString(),
              context: {
                credentials: r.total_credentials,
                users: r.total_users,
                created: r.created,
                updated: r.updated,
                archived: r.archived,
              },
              items: errorItems,
            }
          : undefined,
      });
      // Surface skipped / unreachable controllers as their own toasts so
      // the operator notices a panel issue without having to scroll
      // through a long success line.
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
          details: {
            title: "Controllers unreachable",
            message: `${unreachable.length} controller(s) could not be reached.`,
            occurredAt: new Date().toLocaleString(),
            items: unreachable.map((c) => ({
              label: c.label,
              message: c.errors[0] ?? "connection timed out",
              kind: "error" as const,
            })),
          },
        });
      }
      await load();
    } catch (e) {
      const details = toErrorDetails(e, {
        title: "Axis sync failed",
        occurredAt: new Date().toLocaleString(),
      });
      toast.notify({
        kind: "danger",
        title: "Axis sync failed",
        detail: details.message,
        details,
      });
    } finally {
      setSyncing(false);
    }
  }

  const pageStart = offset + 1;
  const pageEnd = Math.min(offset + rows.length, total);

  return (
    <div className="stack-lg">
      <section className="card stack" style={{ padding: "1.25rem" }}>
        <SectionHeader
          icon={<IdCard size={18} />}
          title="Access badges (Axis)"
          tint="teal"
          right={
            <div className="cluster" style={{ gap: "0.5rem" }}>
              <span className="text-muted text-sm">
                {total} total{includeArchived ? " (incl. archived)" : ""}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setLinkWizardOpen(true)}
                title="Step through every badge with no directory user and link them one-by-one"
              >
                <Link2 size={14} />
                Link badges
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setAddOpen(true)}
                disabled={
                  controllers.filter((c) => c.configured).length === 0
                }
                title="Create a new credential + user on Axis"
              >
                <Plus size={14} />
                Add badge
              </button>
              <ExportDropdown
                entityName="badges"
                onExport={(fmt) =>
                  downloadBadgesExport(
                    {
                      search: search.trim() || undefined,
                      enabled:
                        enabled === "all"
                          ? undefined
                          : enabled === "enabled"
                            ? true
                            : false,
                      linked:
                        linked === "all"
                          ? undefined
                          : linked === "linked"
                            ? true
                            : false,
                      facility_code: facility.trim() || undefined,
                      controller:
                        controllerFilter === "all"
                          ? undefined
                          : controllerFilter,
                      include_archived: includeArchived,
                    },
                    fmt,
                  )
                }
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={syncing}
                onClick={() => void runSync()}
              >
                <RefreshCw
                  size={14}
                  className={syncing ? "animate-spin" : ""}
                />
                {syncing ? "Syncing…" : "Sync from Axis"}
              </button>
            </div>
          }
        />
        <p className="text-muted text-sm" style={{ margin: 0 }}>
          Read-only mirror of the Axis access-control credential database.
          Click a badge to link it to an Intune user.
        </p>

        <div
          className="cluster"
          style={{ gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}
        >
          <div className="stack" style={{ flex: "1 1 18rem", gap: 4 }}>
            <label className="label text-xs">Search</label>
            <div className="relative">
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "rgb(var(--color-text-muted))",
                }}
              />
              <input
                className="input"
                placeholder="Name, card number, token, linked UPN…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: 28 }}
              />
            </div>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <label className="label text-xs">Controller</label>
            <select
              className="input"
              value={controllerFilter}
              onChange={(e) => setControllerFilter(e.target.value)}
            >
              <option value="all">All</option>
              {controllers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {c.configured ? "" : " (not configured)"}
                </option>
              ))}
            </select>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <label className="label text-xs">Enabled</label>
            <select
              className="input"
              value={enabled}
              onChange={(e) => setEnabled(e.target.value as EnabledFilter)}
            >
              <option value="all">All</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <label className="label text-xs">Link</label>
            <select
              className="input"
              value={linked}
              onChange={(e) => setLinked(e.target.value as LinkedFilter)}
            >
              <option value="all">All</option>
              <option value="linked">Linked</option>
              <option value="unlinked">Unlinked</option>
            </select>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <label className="label text-xs">Facility code</label>
            <input
              className="input font-mono"
              placeholder="e.g. 2182"
              value={facility}
              onChange={(e) => setFacility(e.target.value)}
              style={{ width: "8rem" }}
            />
          </div>
          <label
            className="cluster text-xs"
            style={{ gap: 4, alignItems: "center" }}
          >
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Bulk toolbar — visible only when at least one badge is
            selected. Lives outside the scrollable table so it doesn't
            disappear when the operator scrolls down the list. */}
        {selected.size > 0 && (
          <div
            className="cluster"
            style={{
              gap: "0.5rem",
              alignItems: "center",
              padding: "0.5rem 0.75rem",
              borderRadius: 8,
              background:
                "rgb(from rgb(var(--color-primary)) r g b / 0.08)",
              border: "1px solid rgb(from rgb(var(--color-primary)) r g b / 0.3)",
            }}
          >
            <span className="text-sm">
              <strong>{selected.size}</strong> selected
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={bulkBusy}
              onClick={() => void runBulkSetEnabled(true)}
            >
              <ShieldCheck size={13} />
              Enable
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={bulkBusy}
              onClick={() => void runBulkSetEnabled(false)}
            >
              <ShieldOff size={13} />
              Disable
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={bulkBusy}
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted">No badges match the current filter.</p>
        ) : (
          <div
            className="scroll-x"
            style={{
              border: "1px solid rgb(var(--color-border) / 0.4)",
              borderRadius: 10,
              overflow: "auto",
              maxHeight: "calc(100vh - 22rem)",
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
                  <th
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 1,
                      background: "rgb(var(--color-bg) / 0.92)",
                      backdropFilter: "blur(6px)",
                      borderBottom:
                        "1px solid rgb(var(--color-border) / 0.5)",
                      padding: "0.6rem 0.55rem",
                      width: "2rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={allSelectedOnPage}
                      onChange={toggleSelectAll}
                      aria-label="Select all on this page"
                    />
                  </th>
                  {[
                    "Name",
                    "Controller",
                    "Card",
                    "Facility",
                    "State",
                    "Access",
                    "Linked",
                    "Synced",
                  ].map((h, i) => (
                    <th
                      key={h}
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
                        textAlign:
                          i === 2 || i === 3 ? "right" : "left",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((b, idx) => {
                  const name = fmtName(b);
                  const tint = controllerTint(b.controller_id);
                  const profiles = b.access_profiles
                    .map((p) => p.name ?? p.token)
                    .join(", ");
                  return (
                    <tr
                      key={b.token}
                      className="row-clickable"
                      onClick={() => onSelect(b.token)}
                      style={{
                        background: selected.has(b.token)
                          ? "rgb(from rgb(var(--color-primary)) r g b / 0.10)"
                          : idx % 2 === 0
                            ? "transparent"
                            : "rgb(var(--color-bg) / 0.35)",
                        cursor: "pointer",
                      }}
                    >
                      <td
                        style={{ ...cellStyle, width: "2rem" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(b.token)}
                          onChange={() => toggleSelect(b.token)}
                          aria-label={`Select ${b.axis_token}`}
                        />
                      </td>
                      <td style={cellStyle}>
                        <div
                          className="cluster"
                          style={{
                            gap: "0.6rem",
                            alignItems: "center",
                          }}
                        >
                          <div
                            aria-hidden
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              letterSpacing: 0.5,
                              background: name
                                ? "rgb(from rgb(var(--color-primary)) r g b / 0.16)"
                                : "rgb(var(--color-bg))",
                              color: name
                                ? "rgb(var(--color-primary))"
                                : "rgb(var(--color-text-muted))",
                              border: name
                                ? "none"
                                : "1px dashed rgb(var(--color-border) / 0.7)",
                            }}
                          >
                            {name ? initialsFor(name) : <IdCard size={12} />}
                          </div>
                          <div className="stack" style={{ gap: 0, minWidth: 0 }}>
                            {name ? (
                              <span className="font-medium truncate">{name}</span>
                            ) : (
                              <span
                                className="text-muted"
                                style={{ fontStyle: "italic" }}
                              >
                                Unnamed credential
                              </span>
                            )}
                            <span
                              className="text-xs font-mono"
                              style={{
                                color: "rgb(var(--color-text-muted))",
                              }}
                            >
                              #{b.axis_token}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td style={cellStyle}>
                        <span
                          className="badge"
                          style={{
                            display: "inline-flex",
                            gap: 4,
                            alignItems: "center",
                            background: tint.bg,
                            color: tint.fg,
                            borderColor: "transparent",
                            fontSize: "0.7rem",
                            padding: "2px 8px",
                          }}
                          title={`Controller: ${b.controller_label ?? b.controller_id}`}
                        >
                          {tint.icon}
                          {b.controller_label ?? b.controller_id}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>
                        {b.card_nr ? (
                          <span
                            className="font-mono"
                            style={{
                              fontSize: "0.8rem",
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "rgb(var(--color-bg) / 0.6)",
                              border:
                                "1px solid rgb(var(--color-border) / 0.4)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {b.card_nr}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>
                        {b.facility_code ? (
                          <span
                            className="font-mono text-xs"
                            style={{
                              color: "rgb(var(--color-text-muted))",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {b.facility_code}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td style={cellStyle}>
                        <div
                          className="cluster"
                          style={{ gap: 4, flexWrap: "wrap" }}
                        >
                          <span
                            className="badge"
                            style={{
                              display: "inline-flex",
                              gap: 4,
                              alignItems: "center",
                              background: b.enabled
                                ? "rgb(from rgb(var(--color-success)) r g b / 0.16)"
                                : "rgb(from rgb(var(--color-text-muted)) r g b / 0.18)",
                              color: b.enabled
                                ? "rgb(var(--color-success))"
                                : "rgb(var(--color-text-muted))",
                              borderColor: "transparent",
                              fontSize: "0.7rem",
                              padding: "2px 8px",
                            }}
                          >
                            {b.enabled ? (
                              <ShieldCheck size={11} />
                            ) : (
                              <ShieldOff size={11} />
                            )}
                            {b.status ?? (b.enabled ? "Enabled" : "Disabled")}
                          </span>
                          {b.archived_at && (
                            <span
                              className="badge"
                              style={{
                                fontSize: "0.65rem",
                                padding: "1px 6px",
                                background:
                                  "rgb(from rgb(var(--color-warning)) r g b / 0.16)",
                                color: "rgb(var(--color-warning))",
                                borderColor: "transparent",
                              }}
                              title="Removed from latest Axis snapshot"
                            >
                              archived
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        {b.access_profiles.length === 0 ? (
                          <span className="text-muted text-xs">—</span>
                        ) : (
                          <div
                            className="cluster"
                            style={{ gap: 4, flexWrap: "wrap" }}
                          >
                            {b.access_profiles.slice(0, 2).map((p) => (
                              <span
                                key={p.token}
                                className="badge"
                                style={{
                                  fontSize: "0.7rem",
                                  padding: "2px 6px",
                                  background:
                                    "rgb(from rgb(var(--color-primary)) r g b / 0.10)",
                                  color: "rgb(var(--color-text))",
                                  borderColor:
                                    "rgb(var(--color-border) / 0.5)",
                                }}
                                title={p.description ?? p.name ?? p.token}
                              >
                                {p.name ?? p.token}
                              </span>
                            ))}
                            {b.access_profiles.length > 2 && (
                              <span
                                className="text-muted text-xs"
                                title={profiles}
                              >
                                +{b.access_profiles.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={cellStyle}>
                        {b.linked_intune_user_upn ? (
                          <span
                            className="cluster"
                            style={{
                              gap: 4,
                              alignItems: "center",
                              color: "rgb(var(--color-info))",
                              fontSize: "0.78rem",
                            }}
                            title={`Linked to ${b.linked_intune_user_upn}`}
                          >
                            <AtSign size={12} />
                            <span
                              className="font-mono truncate"
                              style={{ maxWidth: "18ch" }}
                            >
                              {b.linked_intune_user_upn}
                            </span>
                          </span>
                        ) : (
                          <span
                            className="cluster text-muted text-xs"
                            style={{
                              gap: 4,
                              alignItems: "center",
                              fontStyle: "italic",
                            }}
                          >
                            <Link2Off size={11} />
                            Not linked
                          </span>
                        )}
                      </td>
                      <td style={cellStyle}>
                        <span
                          className="text-muted text-xs"
                          title={new Date(parseUtc(b.synced_at)).toLocaleString()}
                        >
                          {relTime(b.synced_at)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > rows.length && (
          <div
            className="cluster"
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <span className="text-muted text-sm">
              {pageStart}–{pageEnd} of {total}
            </span>
            <div className="cluster" style={{ gap: "0.5rem" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={offset + rows.length >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      <AddBadgeModal
        open={addOpen}
        controllers={controllers}
        onClose={() => setAddOpen(false)}
        onCreated={(b) => {
          setAddOpen(false);
          // Open the new badge's detail so the operator can verify.
          onSelect(b.token);
        }}
      />

      <LinkBadgesWizard
        open={linkWizardOpen}
        onClose={() => setLinkWizardOpen(false)}
        onChanged={() => {
          void load();
        }}
      />
    </div>
  );
}
