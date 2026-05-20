import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";

import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import Select from "../components/Select";
import {
  AccentPill,
  Avatar,
  FreshnessCell,
} from "../components/visual";
import {
  createSoftware,
  listSoftware,
  listSoftwareCategories,
  syncSoftwareFromIntune,
} from "../services/software";
import type { Software, SoftwareSource } from "../types/software";

interface Props {
  onSelect: (id: number) => void;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

function formatCost(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function SoftwareView({ onSelect }: Props) {
  const confirm = useConfirm();
  const toast = useToast();

  const [rows, setRows] = useState<Software[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const [filter, setFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SoftwareSource | "">("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [includeArchived, setIncludeArchived] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const reload = () =>
    listSoftware({ include_archived: includeArchived })
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void reload();
    void listSoftwareCategories()
      .then(setCategories)
      .catch(() => {
        /* ignore */
      });
  }, [includeArchived]);

  const doSync = async () => {
    const ok = await confirm({
      title: "Sync software from Intune?",
      message:
        "Pulls every mobileApp from Intune (requires DeviceManagementApps.Read.All). Existing rows keyed by Intune app id are refreshed; manual entries are untouched.",
      tone: "info",
      confirmLabel: "Sync",
    });
    if (!ok) return;
    setSyncing(true);
    try {
      await toast.run(() => syncSoftwareFromIntune(), {
        pending: "Syncing from Intune…",
        success: (r) =>
          `Done — fetched ${r.fetched}, ${r.created} created, ${r.updated} updated`,
        error: "Software sync failed",
      });
      void reload();
    } catch {
      /* toast surfaced */
    } finally {
      setSyncing(false);
    }
  };

  const doCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await toast.run(() => createSoftware({ name }), {
        pending: "Creating…",
        success: "Software added",
        error: "Create failed",
      });
      setNewName("");
      setCreating(false);
      if (created?.id) onSelect(created.id);
    } catch {
      /* toast surfaced */
    }
  };

  const needle = filter.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (sourceFilter && r.source !== sourceFilter) return false;
        if (categoryFilter && r.category !== categoryFilter) return false;
        if (!needle) return true;
        return [
          r.name,
          r.vendor,
          r.category,
          r.description,
          r.internal_owner_upn,
        ]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(needle));
      }),
    [rows, needle, sourceFilter, categoryFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  useEffect(() => {
    setPage(1);
  }, [needle, sourceFilter, categoryFilter, pageSize]);

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Software</h2>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCreating((v) => !v)}
            title="Add software manually"
          >
            <Plus size={14} strokeWidth={1.75} />
            Add
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void doSync()}
            disabled={syncing}
            title="Pull mobileApps from Intune"
          >
            <RefreshCw
              size={14}
              className={syncing ? "animate-spin" : ""}
              strokeWidth={1.75}
            />
            {syncing ? "Syncing…" : "Sync from Intune"}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {creating && (
        <section className="section-block">
          <span className="eyebrow">New software</span>
          <div className="cluster" style={{ gap: "0.5rem" }}>
            <input
              className="input"
              placeholder="Name (e.g. Visual Studio Code)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void doCreate();
              }}
              autoFocus
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void doCreate()}
              disabled={!newName.trim()}
            >
              Create
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setCreating(false);
                setNewName("");
              }}
            >
              Cancel
            </button>
          </div>
          <p className="text-muted text-xs">
            Fill in link, description, license, etc. on the detail page after creation.
          </p>
        </section>
      )}

      <section className="section-block">
        <span className="eyebrow">Filters</span>
        <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Search name, vendor, category, owner…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ flex: 1, minWidth: 240 }}
          />
          <div style={{ width: 180 }}>
            <Select
              value={sourceFilter}
              onChange={(v) => setSourceFilter(v as SoftwareSource | "")}
              placeholder="Any source"
              size="sm"
              options={[
                { value: "manual", label: "Manual" },
                { value: "intune", label: "Intune" },
              ]}
            />
          </div>
          <div style={{ width: 200 }}>
            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              placeholder="Any category"
              size="sm"
              searchable
              searchPlaceholder="Filter categories…"
              options={categories.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <label
            className="cluster"
            style={{ gap: "0.375rem", whiteSpace: "nowrap" }}
          >
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            <span className="text-sm">Show archived</span>
          </label>
        </div>
      </section>

      <div className="card">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Software</th>
                <th>Vendor</th>
                <th>Category</th>
                <th>Source</th>
                <th>Cost</th>
                <th>Seats</th>
                <th>Assigned</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((s) => (
                <tr
                  key={s.id}
                  className="row-clickable"
                  onClick={() => onSelect(s.id)}
                >
                  <td>
                    <div
                      className="cluster"
                      style={{ gap: "0.625rem", flexWrap: "nowrap" }}
                    >
                      <Avatar seed={s.name} name={s.name} />
                      <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                        <span className="font-medium truncate">{s.name}</span>
                        <span className="text-xs text-muted truncate">
                          {s.description ?? (
                            <span className="text-muted">—</span>
                          )}
                        </span>
                      </div>
                      {s.archived_at && (
                        <span className="badge badge-danger text-xs">
                          Archived
                        </span>
                      )}
                    </div>
                  </td>
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
                  <td>
                    {s.license_cost_cents === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className="font-mono text-warning-soft-fg">
                        {formatCost(s.license_cost_cents)}
                      </span>
                    )}
                  </td>
                  <td>
                    {s.seat_count === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className="font-mono">{s.seat_count}</span>
                    )}
                  </td>
                  <td>
                    {s.assignment_count > 0 ? (
                      <span className="badge badge-success">
                        {s.assignment_count}
                      </span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </td>
                  <td>
                    <FreshnessCell
                      iso={s.intune_synced_at ?? s.updated_at}
                    />
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    {rows.length === 0
                      ? "No software yet. Add manually or sync from Intune."
                      : "No software matches the current filters."}
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
