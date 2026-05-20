import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import {
  AccentPill,
  Avatar,
  FreshnessCell,
  relativeTime,
} from "../components/visual";
import { listGroups, setGroupManaged, syncAllGroups } from "../services/groups";
import type { EntraGroup } from "../types/group";

interface Props {
  onSelect: (id: string) => void;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;
const MANAGED_ONLY_KEY = "feature-asset-inventory:groups-managed-only";

function readManagedOnlyPref(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(MANAGED_ONLY_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return true;
}

function groupKindLabel(g: EntraGroup): string {
  if (g.group_types.some((t) => t.toLowerCase() === "unified")) return "M365";
  if (g.security_enabled && g.mail_enabled) return "Mail-Security";
  if (g.security_enabled) return "Security";
  if (g.mail_enabled) return "Distribution";
  return "Other";
}

export default function Groups({ onSelect }: Props) {
  const confirm = useConfirm();
  const toast = useToast();

  const [rows, setRows] = useState<EntraGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState("");
  const [managedOnly, setManagedOnly] = useState<boolean>(readManagedOnlyPref);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const reload = () =>
    listGroups({ managed_only: managedOnly })
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void reload();
  }, [managedOnly]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MANAGED_ONLY_KEY, String(managedOnly));
  }, [managedOnly]);

  const doSync = async () => {
    const ok = await confirm({
      title: "Sync groups from Microsoft Graph?",
      message:
        "Pulls every group in the tenant (metadata only — no members). Requires Group.Read.All. Existing rows are updated; new rows insert with is_managed=false.",
      tone: "info",
      confirmLabel: "Sync",
    });
    if (!ok) return;
    setSyncing(true);
    try {
      await toast.run(() => syncAllGroups(), {
        pending: "Syncing groups…",
        success: (r) =>
          `Done — fetched ${r.fetched}, ${r.created} created, ${r.updated} updated`,
        error: "Group sync failed",
      });
      void reload();
    } catch {
      /* toast surfaced */
    } finally {
      setSyncing(false);
    }
  };

  const toggleManaged = async (g: EntraGroup, ev: React.MouseEvent) => {
    ev.stopPropagation();
    const next = !g.is_managed;
    try {
      await toast.run(() => setGroupManaged(g.id, next), {
        pending: next ? "Marking managed…" : "Removing managed flag…",
        success: next ? "Now managed" : "No longer managed",
        error: "Failed",
      });
      void reload();
    } catch {
      /* toast surfaced */
    }
  };

  const needle = filter.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? rows.filter((g) =>
            [g.display_name, g.mail_nickname, g.description, g.mail]
              .filter(Boolean)
              .some((v) => v!.toLowerCase().includes(needle)),
          )
        : rows,
    [rows, needle],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  useEffect(() => {
    setPage(1);
  }, [needle, pageSize, managedOnly]);

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Groups</h2>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void doSync()}
          disabled={syncing}
          title="Pull all groups from Microsoft Graph"
        >
          <RefreshCw
            size={14}
            className={syncing ? "animate-spin" : ""}
            strokeWidth={1.75}
          />
          {syncing ? "Syncing…" : "Sync from Graph"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="section-block">
        <span className="eyebrow">Filters</span>
        <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Search name, mailNickname, description…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ flex: 1, minWidth: 240 }}
          />
          <label
            className="cluster"
            style={{ gap: "0.375rem", whiteSpace: "nowrap" }}
          >
            <input
              type="checkbox"
              checked={managedOnly}
              onChange={(e) => setManagedOnly(e.target.checked)}
            />
            <span className="text-sm">Managed only</span>
          </label>
        </div>
        <p className="text-xs text-muted">
          Uncheck to browse the long tail (M365 auto-groups, etc.) and flip “Managed”
          on the ones you want available for software assignment.
        </p>
      </section>

      <div className="card">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Group</th>
                <th>Kind</th>
                <th>Managed</th>
                <th>Members</th>
                <th>Software</th>
                <th>Synced</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((g) => {
                const kindLabel = groupKindLabel(g);
                return (
                  <tr
                    key={g.id}
                    className="row-clickable"
                    onClick={() => onSelect(g.id)}
                  >
                    <td>
                      <div
                        className="cluster"
                        style={{ gap: "0.625rem", flexWrap: "nowrap" }}
                      >
                        <Avatar seed={g.id} name={g.display_name} />
                        <div
                          className="stack"
                          style={{ gap: 1, minWidth: 0 }}
                        >
                          <span className="font-medium truncate">
                            {g.display_name}
                          </span>
                          <span className="font-mono text-xs text-muted truncate">
                            {g.mail_nickname ?? g.id}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <AccentPill value={kindLabel} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={
                          "btn btn-sm " +
                          (g.is_managed ? "btn-primary" : "btn-secondary")
                        }
                        onClick={(e) => void toggleManaged(g, e)}
                        title={
                          g.is_managed
                            ? "Click to remove managed flag"
                            : "Click to mark managed"
                        }
                      >
                        {g.is_managed ? "Managed" : "Unmanaged"}
                      </button>
                    </td>
                    <td>
                      {g.member_count_cached !== null ? (
                        <div className="stack" style={{ gap: 1 }}>
                          <span className="font-mono text-info-soft-fg">
                            {g.member_count_cached}
                          </span>
                          {g.members_synced_at && (
                            <span
                              className="text-xs text-muted"
                              title={new Date(g.members_synced_at).toLocaleString()}
                            >
                              {relativeTime(g.members_synced_at)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted text-xs">never opened</span>
                      )}
                    </td>
                    <td>
                      {g.assigned_software_count > 0 ? (
                        <span className="badge badge-success">
                          {g.assigned_software_count}
                        </span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>
                    <td>
                      <FreshnessCell iso={g.last_synced_at} />
                    </td>
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    {rows.length === 0
                      ? managedOnly
                        ? "No managed groups yet. Sync first, then flip groups to managed."
                        : "No groups cached yet. Click “Sync from Graph” to pull."
                      : "No groups match the current filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div
            className="cluster"
            style={{
              justifyContent: "space-between",
              padding: "0.5rem 0.75rem",
              borderTop: "1px solid rgb(var(--color-border) / 0.4)",
            }}
          >
            <div className="cluster" style={{ gap: "0.375rem" }}>
              <span className="text-xs text-muted">Rows per page</span>
              <select
                className="input input-sm"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{ width: 76 }}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="cluster" style={{ gap: "0.375rem" }}>
              <span className="text-xs text-muted">
                {start + 1}–{Math.min(start + pageSize, filtered.length)} of {filtered.length}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
