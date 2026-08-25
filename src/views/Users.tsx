import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  UserMinus,
  UserPlus,
} from "lucide-react";

import { useConfirm } from "../components/ConfirmProvider";
import ExportDropdown from "../components/ExportDropdown";
import { useToast } from "../components/ToastProvider";
import { downloadUsersExport } from "../services/exports";
import { AccentPill, Avatar, FreshnessCell } from "../components/visual";
import { listUsers, syncAllUsers } from "../services/users";
import type { IntuneUser } from "../types/user";

interface Props {
  onSelect: (userId: string) => void;
  onEnroll: () => void;
  onOffboard: () => void;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

export default function Users({ onSelect, onEnroll, onOffboard }: Props) {
  const confirm = useConfirm();
  const toast = useToast();
  const [users, setUsers] = useState<IntuneUser[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const reload = () =>
    listUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void reload();
  }, []);

  const doSync = async () => {
    const ok = await confirm({
      title: "Sync all users from Microsoft Graph?",
      message:
        "Pulls every active member user (accountEnabled=true, userType=Member). Could take 10–60s on large tenants. Existing rows are updated; new rows are inserted.",
      tone: "info",
      confirmLabel: "Sync",
    });
    if (!ok) return;
    setSyncing(true);
    try {
      await toast.run(() => syncAllUsers(), {
        pending: "Syncing users from Microsoft Graph…",
        success: (r) =>
          `Done — fetched ${r.fetched}, ${r.created} created, ${r.updated} updated`,
        error: "User sync failed",
      });
      void reload();
    } catch {
      // toast surfaced the error
    } finally {
      setSyncing(false);
    }
  };

  const needle = filter.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? users.filter((u) =>
            [
              u.display_name,
              u.user_principal_name,
              u.mail,
              u.job_title,
              u.department,
            ]
              .filter(Boolean)
              .some((v) => v!.toLowerCase().includes(needle)),
          )
        : users,
    [users, needle],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  // Reset to page 1 whenever the filter narrows the set or page-size changes.
  useEffect(() => {
    setPage(1);
  }, [needle, pageSize]);

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Users</h2>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onEnroll}
            title="Pick a user and assign assets + software in one flow"
          >
            <UserPlus size={14} strokeWidth={1.75} />
            Enroll Employee
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onOffboard}
            title="Pick a departing user and collect devices, revoke software + badges"
          >
            <UserMinus size={14} strokeWidth={1.75} />
            Offboard Employee
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void doSync()}
            disabled={syncing}
            title="Pull all active member users from Microsoft Graph"
          >
            <RefreshCw
              size={14}
              className={syncing ? "animate-spin" : ""}
              strokeWidth={1.75}
            />
            {syncing ? "Syncing…" : "Sync from Graph"}
          </button>
          <ExportDropdown
            entityName="users"
            onExport={(fmt) => downloadUsersExport(fmt)}
          />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="section-block">
        <span className="eyebrow">Filter</span>
        <input
          className="input"
          placeholder="Search by name, UPN, mail, title, or department…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </section>

      <div className="card">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Title</th>
                <th>Department</th>
                <th>Office</th>
                <th>Status</th>
                <th>Last synced</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((u) => (
                <tr
                  key={u.id}
                  className="row-clickable"
                  onClick={() => onSelect(u.id)}
                >
                  <td>
                    <div
                      className="cluster"
                      style={{ gap: "0.625rem", flexWrap: "nowrap" }}
                    >
                      <Avatar
                        seed={u.user_principal_name}
                        name={u.display_name}
                      />
                      <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                        <span className="font-medium truncate">
                          {u.display_name ?? u.user_principal_name}
                        </span>
                        <span className="font-mono text-xs text-muted truncate">
                          {u.user_principal_name}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    {u.job_title ? (
                      <span className="text-sm">{u.job_title}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>
                    <AccentPill value={u.department} />
                  </td>
                  <td>
                    <AccentPill value={u.office_location} />
                  </td>
                  <td>
                    {u.account_enabled ? (
                      <span className="badge badge-success">Active</span>
                    ) : (
                      <span className="badge badge-danger">Disabled</span>
                    )}
                  </td>
                  <td>
                    <FreshnessCell iso={u.synced_at} />
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    {users.length === 0
                      ? "No users cached yet. Click “Sync from Graph” to pull from Microsoft."
                      : "No users match the filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length > 0 && (
        <div
          className="cluster"
          style={{ justifyContent: "space-between", flexWrap: "wrap" }}
        >
          <div className="cluster text-muted text-xs">
            <span>
              {start + 1}–{Math.min(start + pageSize, filtered.length)} of{" "}
              {filtered.length}
              {filtered.length !== users.length && (
                <> (filtered from {users.length})</>
              )}
            </span>
          </div>
          <div className="cluster">
            <label className="cluster text-xs text-muted" style={{ gap: 6 }}>
              Rows per page
              <select
                className="select"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{ width: "5rem" }}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <span className="text-xs text-muted" style={{ minWidth: "5rem" }}>
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label="Next page"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
