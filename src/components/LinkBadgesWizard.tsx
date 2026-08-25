/** Guided bulk-link flow. Walks the operator through every unlinked
 *  badge one at a time — pick an Intune user, Skip, or close out.
 *  Each link uses the same `PATCH /badges/{token}/link` endpoint that
 *  the badge detail page uses, so the audit history records the same
 *  event type. */

import { useEffect, useMemo, useState } from "react";
import {
  AtSign,
  ChevronRight,
  Link2,
  Search,
  ShieldCheck,
  ShieldOff,
  SkipForward,
  UserPlus,
  X,
} from "lucide-react";

import { useToast } from "./ToastProvider";
import { linkBadge, listBadges, type Badge } from "../services/badges";
import { listUsers } from "../services/users";
import type { IntuneUser } from "../types/user";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after the wizard exits with at least one link change so the
   *  caller can reload its row state. */
  onChanged: () => void;
}

function fmtBadgeName(b: Badge): string {
  const last = b.axis_last_name?.trim();
  const first = b.axis_first_name?.trim();
  if (last && first) return `${last}, ${first}`;
  return b.axis_full_name?.trim() || "Unnamed credential";
}

function initialsFor(name: string): string {
  const parts = name.split(/[\s,]+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default function LinkBadgesWizard({ open, onClose, onChanged }: Props) {
  const toast = useToast();

  const [queue, setQueue] = useState<Badge[]>([]);
  const [cursor, setCursor] = useState(0);
  const [users, setUsers] = useState<IntuneUser[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [linkedCount, setLinkedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Initial fetch: pull every currently-unlinked badge so we have a
  // stable queue. We don't paginate — typical orgs have well under
  // 1000 unlinked badges and the linking action removes them from the
  // unlinked set on the next sync.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setCursor(0);
    setLinkedCount(0);
    setSkippedCount(0);
    setUserQuery("");
    void listBadges({ linked: false, limit: 1000 })
      .then((r) => {
        setQueue(r.rows);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open]);

  // Lazy-load Intune user list on first open. Cached for subsequent
  // opens within the same session — Graph user counts don't change
  // mid-task often enough to justify re-fetching.
  useEffect(() => {
    if (!open || usersLoaded) return;
    void listUsers()
      .then((u) => {
        setUsers(u);
        setUsersLoaded(true);
      })
      .catch(() => setUsersLoaded(true));
  }, [open, usersLoaded]);

  const current: Badge | undefined = queue[cursor];

  // Pre-seed the search box with the badge's own name when it advances
  // so the obvious match floats to the top.
  useEffect(() => {
    if (!current) {
      setUserQuery("");
      return;
    }
    const seed =
      [current.axis_first_name, current.axis_last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
    setUserQuery(seed);
  }, [cursor, current?.token]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users.slice(0, 25);
    return users
      .filter(
        (u) =>
          u.user_principal_name.toLowerCase().includes(q) ||
          (u.display_name ?? "").toLowerCase().includes(q),
      )
      .slice(0, 25);
  }, [users, userQuery]);

  function finish() {
    if (linkedCount > 0) {
      toast.notify({
        kind: "success",
        title: "Link badges done",
        detail: `${linkedCount} linked · ${skippedCount} skipped`,
      });
      onChanged();
    } else if (skippedCount > 0) {
      toast.notify({
        kind: "info",
        title: "Link badges closed",
        detail: `${skippedCount} skipped, none linked`,
      });
    }
    onClose();
  }

  async function linkCurrent(upn: string) {
    if (!current) return;
    setBusy(true);
    try {
      await linkBadge(current.token, upn);
      setLinkedCount((n) => n + 1);
      advance();
    } catch (e) {
      toast.notify({
        kind: "danger",
        title: "Link failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  function skipCurrent() {
    setSkippedCount((n) => n + 1);
    advance();
  }

  function advance() {
    setCursor((c) => c + 1);
  }

  if (!open) return null;

  const done = !loading && (queue.length === 0 || cursor >= queue.length);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => !busy && finish()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
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
          width: "min(64rem, 100%)",
          height: "min(44rem, calc(100vh - 2rem))",
          maxHeight: "calc(100vh - 2rem)",
          overflow: "auto",
          padding: "1.75rem",
          gap: "1rem",
        }}
      >
        <div
          className="cluster"
          style={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <div
            className="cluster"
            style={{ gap: "0.5rem", alignItems: "center" }}
          >
            <Link2 size={18} />
            <h3 className="heading-3" style={{ margin: 0 }}>
              Link badges
            </h3>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={finish}
            disabled={busy}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <p className="text-muted text-sm" style={{ margin: 0 }}>
          Walks through every badge with no directory link. Pick a user or
          skip; close any time to keep what you've done.
        </p>

        {/* Progress + counters */}
        <div
          className="cluster"
          style={{
            gap: "0.5rem",
            alignItems: "center",
            flexWrap: "wrap",
            background: "rgb(var(--color-bg) / 0.5)",
            padding: "0.55rem 0.75rem",
            borderRadius: 8,
          }}
        >
          <span className="text-sm">
            {loading ? (
              <span className="text-muted">Loading queue…</span>
            ) : queue.length === 0 ? (
              <span className="text-muted">No unlinked badges.</span>
            ) : (
              <>
                <strong>{Math.min(cursor + 1, queue.length)}</strong> of{" "}
                <strong>{queue.length}</strong>
              </>
            )}
          </span>
          <span className="text-xs text-muted" style={{ marginLeft: "auto" }}>
            ✓ linked {linkedCount} · skipped {skippedCount}
          </span>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {done && !error && (
          <div
            className="card card-body stack"
            style={{
              alignItems: "center",
              gap: "0.5rem",
              padding: "1.5rem",
            }}
          >
            <ShieldCheck
              size={28}
              style={{ color: "rgb(var(--color-success))" }}
            />
            <p className="font-medium" style={{ margin: 0 }}>
              {queue.length === 0
                ? "Nothing to link — all badges already have a directory user."
                : `Done. Linked ${linkedCount}, skipped ${skippedCount}.`}
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={finish}
            >
              Close
            </button>
          </div>
        )}

        {!done && current && (
          <>
            {/* Badge card */}
            <section
              className="card stack"
              style={{
                padding: "1rem 1.25rem",
                gap: "0.5rem",
                background:
                  "rgb(from rgb(var(--color-primary)) r g b / 0.04)",
                border:
                  "1px solid rgb(from rgb(var(--color-primary)) r g b / 0.25)",
              }}
            >
              <div
                className="cluster"
                style={{ gap: "0.75rem", alignItems: "center" }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      "rgb(from rgb(var(--color-primary)) r g b / 0.16)",
                    color: "rgb(var(--color-primary))",
                    fontWeight: 600,
                  }}
                >
                  {initialsFor(fmtBadgeName(current))}
                </span>
                <div className="stack" style={{ gap: 1, flex: 1, minWidth: 0 }}>
                  <span
                    className="font-medium truncate"
                    style={{ fontSize: "1rem" }}
                  >
                    {fmtBadgeName(current)}
                  </span>
                  <span className="text-xs text-muted">
                    {current.controller_label ?? current.controller_id}
                    {" · "}
                    <span className="font-mono">
                      card {current.card_nr ?? "—"}
                    </span>
                    {current.facility_code ? ` · FAC ${current.facility_code}` : ""}
                  </span>
                </div>
                <span
                  className="badge"
                  style={{
                    background: current.enabled
                      ? "rgb(from rgb(var(--color-success)) r g b / 0.16)"
                      : "rgb(from rgb(var(--color-text-muted)) r g b / 0.18)",
                    color: current.enabled
                      ? "rgb(var(--color-success))"
                      : "rgb(var(--color-text-muted))",
                    borderColor: "transparent",
                    fontSize: "0.7rem",
                  }}
                >
                  {current.enabled ? (
                    <ShieldCheck size={11} />
                  ) : (
                    <ShieldOff size={11} />
                  )}
                  {current.status ?? (current.enabled ? "Enabled" : "Disabled")}
                </span>
              </div>
            </section>

            {/* User picker */}
            <div
              className="stack"
              style={{
                gap: "0.5rem",
                padding: "0.75rem",
                borderRadius: 10,
                border: "1px solid rgb(var(--color-border) / 0.5)",
                background: "rgb(var(--color-bg) / 0.5)",
              }}
            >
              <div style={{ position: "relative" }}>
                <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "rgb(var(--color-text-muted))",
                  }}
                />
                <input
                  className="input"
                  placeholder="Search Intune users by name or UPN…"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  autoFocus
                  style={{ paddingLeft: 30 }}
                />
              </div>
              {!usersLoaded && (
                <p className="text-muted text-sm">Loading users…</p>
              )}
              {usersLoaded && users.length === 0 && (
                <p className="text-muted text-sm">
                  No Intune users available. Sync from Graph first.
                </p>
              )}
              {usersLoaded &&
                users.length > 0 &&
                filteredUsers.length === 0 && (
                  <p className="text-muted text-sm">No matches.</p>
                )}
              {filteredUsers.length > 0 && (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    maxHeight: "26rem",
                    overflow: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  {filteredUsers.map((u) => {
                    const dn = u.display_name ?? u.user_principal_name;
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => void linkCurrent(u.user_principal_name)}
                          disabled={busy}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "0.5rem 0.625rem",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "rgb(var(--color-text))",
                            borderRadius: 6,
                            display: "flex",
                            alignItems: "center",
                            gap: "0.6rem",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "rgb(var(--color-bg))")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 6,
                              background:
                                "rgb(from rgb(var(--color-primary)) r g b / 0.16)",
                              color: "rgb(var(--color-primary))",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              flexShrink: 0,
                            }}
                          >
                            {initialsFor(dn)}
                          </span>
                          <div className="stack" style={{ gap: 1, minWidth: 0, flex: 1 }}>
                            <span className="font-medium truncate">{dn}</span>
                            <span className="text-xs text-muted font-mono truncate">
                              {u.user_principal_name}
                            </span>
                          </div>
                          <span
                            className="cluster text-xs"
                            style={{
                              gap: 4,
                              alignItems: "center",
                              color: "rgb(var(--color-primary))",
                            }}
                          >
                            <UserPlus size={12} />
                            Link
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer actions */}
            <div
              className="cluster"
              style={{
                gap: "0.5rem",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={skipCurrent}
                disabled={busy}
                title="Don't link this one; move to the next"
              >
                <SkipForward size={13} />
                Skip
              </button>
              <span className="text-xs text-muted">
                Tip: just press the user row to link and advance.
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={finish}
                disabled={busy}
              >
                Close
                <ChevronRight size={13} />
              </button>
            </div>

            {/* Spacer */}
            <span aria-hidden style={{ color: "transparent" }}>
              <AtSign size={1} />
            </span>
          </>
        )}
      </div>
    </div>
  );
}
