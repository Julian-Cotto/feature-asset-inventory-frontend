/** Offboard Employee workflow — the mirror of Enroll.
 *
 *  Pick a departing user, then run the three teardown steps IT owns:
 *    1. Collect devices   — clear Intune primaryUser on each assigned device
 *    2. Revoke software   — remove direct (user) software assignments
 *    3. Revoke access     — disable + unlink their Axis badges
 *
 *  Reuses existing endpoints: /users, /users/{id}/software (new, small),
 *  the device unassign route, software deleteAssignment, and the badge
 *  bulk-disable / unlink routes. Deeplinkable as /offboard or /offboard/{upn}.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeX,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  Info,
  Laptop,
  RefreshCw,
  Search,
  UserMinus,
  X,
} from "lucide-react";

import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import {
  AccentPill,
  Avatar,
  FreshnessCell,
  SectionHeader,
  avatarColorFor,
  initials,
} from "../components/visual";
import {
  getUser,
  listUserSoftware,
  listUsers,
  syncOneUser,
  unassignDevice,
} from "../services/users";
import {
  bulkSetBadgesEnabled,
  listBadges,
  unlinkBadge,
  type Badge,
} from "../services/badges";
import { deleteAssignment } from "../services/software";
import type {
  DeviceSummary,
  IntuneUser,
  UserDetail as UserDetailType,
  UserSoftwareAssignment,
} from "../types/user";

interface Props {
  initialUpn?: string;
  onBack: () => void;
  onOpenUser: (id: string) => void;
  onOpenSoftware: (id: number) => void;
  onOpenAsset: (id: number) => void;
  onUpnChanged: (upn: string) => void;
}

export default function OffboardEmployee({
  initialUpn,
  onBack,
  onOpenUser,
  onOpenSoftware,
  onOpenAsset,
  onUpnChanged,
}: Props) {
  const toast = useToast();
  const confirm = useConfirm();

  const [allUsers, setAllUsers] = useState<IntuneUser[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  const [selectedUser, setSelectedUser] = useState<IntuneUser | null>(null);
  const [detail, setDetail] = useState<UserDetailType | null>(null);
  const [software, setSoftware] = useState<UserSoftwareAssignment[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [busyDevice, setBusyDevice] = useState<string | null>(null);
  const [busySoftware, setBusySoftware] = useState<number | null>(null);
  const [busyBadge, setBusyBadge] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const initialApplied = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listUsers()
      .then(setAllUsers)
      .catch((e) => setUsersError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (initialApplied.current) return;
    if (!initialUpn || allUsers.length === 0) return;
    const target = initialUpn.toLowerCase();
    const found = allUsers.find(
      (u) =>
        u.user_principal_name?.toLowerCase() === target ||
        u.mail?.toLowerCase() === target ||
        u.id === initialUpn,
    );
    if (found) {
      initialApplied.current = true;
      void selectUser(found, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUpn, allUsers]);

  async function loadUserData(user: IntuneUser) {
    setLoadingDetail(true);
    try {
      const upn = user.user_principal_name.toLowerCase();
      const [d, sw, badgeRes] = await Promise.all([
        getUser(user.id),
        listUserSoftware(user.id).catch(() => []),
        // Backend badge search is a fuzzy ILIKE — re-filter to an exact UPN
        // match so a card number can't produce false positives.
        listBadges({ search: user.user_principal_name, include_archived: false, limit: 200 })
          .then((r) => r.rows)
          .catch((): Badge[] => []),
      ]);
      setDetail(d);
      setSoftware(sw);
      setBadges(
        badgeRes.filter(
          (b) => (b.linked_intune_user_upn ?? "").toLowerCase() === upn,
        ),
      );
    } catch (e) {
      toast.notify({
        kind: "danger",
        title: "Could not load user",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoadingDetail(false);
    }
  }

  async function selectUser(u: IntuneUser, skipUrl = false) {
    setSelectedUser(u);
    setSearch("");
    setShowDropdown(false);
    setDetail(null);
    setSoftware([]);
    setBadges([]);
    if (!skipUrl) onUpnChanged(u.user_principal_name);
    await loadUserData(u);
  }

  function clearSelection() {
    setSelectedUser(null);
    setDetail(null);
    setSoftware([]);
    setBadges([]);
    setSearch("");
    onUpnChanged("");
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  async function doResyncUser() {
    if (!selectedUser) return;
    setSyncing(true);
    try {
      await toast.run(() => syncOneUser(selectedUser.id), {
        pending: "Refreshing user from Graph…",
        success: "User refreshed",
        error: "Sync failed",
      });
      await loadUserData(selectedUser);
    } catch {
      /* toast surfaced */
    } finally {
      setSyncing(false);
    }
  }

  // ── Step 1 · Devices ────────────────────────────────────────────────
  async function doUnassignDevice(device: DeviceSummary) {
    if (!selectedUser) return;
    setBusyDevice(device.intune_id);
    const label = device.device_name ?? device.serial_number ?? device.intune_id;
    try {
      await toast.run(() => unassignDevice(selectedUser.id, device.intune_id), {
        pending: `Collecting ${label}…`,
        success: `Collected ${label}`,
        error: "Unassign failed",
      });
      await loadUserData(selectedUser);
    } catch {
      /* toast surfaced */
    } finally {
      setBusyDevice(null);
    }
  }

  async function doCollectAllDevices() {
    if (!selectedUser) return;
    const devices = detail?.assigned_devices ?? [];
    if (devices.length === 0) return;
    const ok = await confirm({
      title: `Collect all ${devices.length} device${devices.length === 1 ? "" : "s"}?`,
      message:
        "Clears the Intune primary user on each device so it returns to the unassigned pool. The physical device should be collected separately.",
      tone: "warning",
      confirmLabel: "Collect all",
    });
    if (!ok) return;
    setBulkBusy(true);
    let done = 0;
    for (const d of devices) {
      try {
        await unassignDevice(selectedUser.id, d.intune_id);
        done++;
      } catch {
        /* continue */
      }
    }
    toast.notify({
      kind: done === devices.length ? "success" : "warning",
      title: `Collected ${done} of ${devices.length} devices`,
    });
    setBulkBusy(false);
    await loadUserData(selectedUser);
  }

  // ── Step 2 · Software ───────────────────────────────────────────────
  async function doRevokeSoftware(row: UserSoftwareAssignment) {
    setBusySoftware(row.assignment_id);
    try {
      await toast.run(
        () => deleteAssignment(row.software_id, row.assignment_id),
        {
          pending: `Revoking ${row.name}…`,
          success: `Revoked ${row.name}`,
          error: "Revoke failed",
        },
      );
      if (selectedUser) await loadUserData(selectedUser);
    } catch {
      /* toast surfaced */
    } finally {
      setBusySoftware(null);
    }
  }

  async function doRevokeAllSoftware() {
    if (software.length === 0) return;
    const ok = await confirm({
      title: `Revoke all ${software.length} software assignment${software.length === 1 ? "" : "s"}?`,
      message:
        "Removes each direct (user) assignment. Group-inherited software is untouched — manage that on the group.",
      tone: "warning",
      confirmLabel: "Revoke all",
    });
    if (!ok) return;
    setBulkBusy(true);
    let done = 0;
    for (const row of software) {
      try {
        await deleteAssignment(row.software_id, row.assignment_id);
        done++;
      } catch {
        /* continue */
      }
    }
    toast.notify({
      kind: done === software.length ? "success" : "warning",
      title: `Revoked ${done} of ${software.length} assignments`,
    });
    setBulkBusy(false);
    if (selectedUser) await loadUserData(selectedUser);
  }

  // ── Step 3 · Access / badges ────────────────────────────────────────
  async function doDisableAllBadges() {
    const enabled = badges.filter((b) => b.enabled);
    if (enabled.length === 0) return;
    const ok = await confirm({
      title: `Disable ${enabled.length} badge${enabled.length === 1 ? "" : "s"}?`,
      message:
        "Disables the credential on the Axis controller(s) immediately — physical access is revoked. Badges stay linked for the record; unlink separately if needed.",
      tone: "danger",
      confirmLabel: "Disable access",
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      await toast.run(
        () => bulkSetBadgesEnabled(enabled.map((b) => b.token), false),
        {
          pending: "Disabling badges…",
          success: (r) => `Disabled ${r.updated} badge(s)`,
          error: "Disable failed",
        },
      );
      if (selectedUser) await loadUserData(selectedUser);
    } catch {
      /* toast surfaced */
    } finally {
      setBulkBusy(false);
    }
  }

  async function doUnlinkBadge(badge: Badge) {
    setBusyBadge(badge.token);
    try {
      await toast.run(() => unlinkBadge(badge.token), {
        pending: "Unlinking…",
        success: "Badge unlinked",
        error: "Unlink failed",
      });
      if (selectedUser) await loadUserData(selectedUser);
    } catch {
      /* toast surfaced */
    } finally {
      setBusyBadge(null);
    }
  }

  // ── typeahead ───────────────────────────────────────────────────────
  const needle = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return [];
    return allUsers
      .filter((u) =>
        [
          u.display_name,
          u.user_principal_name,
          u.mail,
          u.job_title,
          u.department,
          u.employee_id,
        ]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(needle)),
      )
      .slice(0, 8);
  }, [needle, allUsers]);

  useEffect(() => setHighlightedIdx(0), [needle]);

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = matches[highlightedIdx];
      if (pick) void selectUser(pick);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  const u = detail?.user ?? selectedUser;
  const devices = detail?.assigned_devices ?? [];
  const linkedBadges = badges;
  const enabledBadges = badges.filter((b) => b.enabled);
  const nothingLeft =
    !loadingDetail &&
    devices.length === 0 &&
    software.length === 0 &&
    enabledBadges.length === 0;

  return (
    <div className="stack-lg">
      {/* Top bar */}
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
            <ChevronLeft size={14} />
            Back to Users
          </button>
          <h2 className="heading-2" style={{ margin: 0 }}>
            Offboard Employee
          </h2>
        </div>
        {selectedUser && (
          <div className="cluster" style={{ gap: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onOpenUser(selectedUser.id)}
              title="Open full user profile"
            >
              <ExternalLink size={14} />
              Open profile
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void doResyncUser()}
              disabled={syncing}
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing…" : "Resync"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={clearSelection}
            >
              <X size={14} />
              Change employee
            </button>
          </div>
        )}
      </div>

      {usersError && <div className="alert alert-error">{usersError}</div>}

      {/* Step 1 — picker */}
      {!selectedUser && (
        <section className="card stack" style={{ padding: "1.5rem" }}>
          <SectionHeader
            icon={<UserMinus size={18} />}
            title="Find departing employee"
            tint="pink"
          />
          <p className="text-muted text-sm" style={{ margin: 0 }}>
            Search by name, UPN, email, employee ID, title, or department. Pick
            a user to load their assigned devices, software, and badges for
            teardown.
          </p>
          <div style={{ position: "relative" }}>
            <div className="cluster" style={{ gap: "0.5rem" }}>
              <Search size={16} style={{ opacity: 0.5 }} />
              <input
                ref={searchInputRef}
                className="input"
                style={{ flex: 1 }}
                placeholder="Start typing a name or UPN…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={onSearchKey}
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {showDropdown && matches.length > 0 && (
              <ul
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: "0.5rem",
                  background: "rgb(var(--color-surface))",
                  border: "1px solid rgb(var(--color-border))",
                  borderRadius: 10,
                  listStyle: "none",
                  padding: "0.375rem",
                  zIndex: 20,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  maxHeight: "22rem",
                  overflow: "auto",
                }}
              >
                {matches.map((m, i) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => void selectUser(m)}
                      onMouseEnter={() => setHighlightedIdx(i)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        background:
                          i === highlightedIdx
                            ? "rgb(var(--color-bg))"
                            : "transparent",
                        border: "none",
                        borderRadius: 8,
                        padding: "0.5rem 0.625rem",
                        cursor: "pointer",
                        color: "rgb(var(--color-text))",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.625rem",
                      }}
                    >
                      <Avatar seed={m.user_principal_name} name={m.display_name} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="font-medium truncate">
                          {m.display_name ?? m.user_principal_name}
                        </div>
                        <div className="font-mono text-xs text-muted truncate">
                          {m.user_principal_name}
                          {m.job_title ? ` · ${m.job_title}` : ""}
                          {m.department ? ` · ${m.department}` : ""}
                        </div>
                      </div>
                      {!m.account_enabled && (
                        <span className="badge badge-danger">Disabled</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {showDropdown && needle && matches.length === 0 && (
              <p className="text-muted text-sm" style={{ marginTop: "0.5rem" }}>
                No users match "{search}".
              </p>
            )}
          </div>
        </section>
      )}

      {/* Step 2 — selected user teardown */}
      {selectedUser && u && (
        <>
          {/* Hero */}
          <div
            className="card"
            style={{
              padding: "1.5rem",
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: "1.5rem",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 16,
                background: avatarColorFor(u.user_principal_name),
                color: "#0b0d10",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.875rem",
                fontWeight: 700,
                flexShrink: 0,
              }}
              aria-hidden
            >
              {initials(u.display_name, u.user_principal_name)}
            </div>
            <div className="stack" style={{ gap: "0.375rem", minWidth: 0 }}>
              <h2 className="heading-2" style={{ margin: 0 }}>
                {u.display_name ?? u.user_principal_name}
              </h2>
              <span className="font-mono text-muted text-sm truncate">
                {u.user_principal_name}
              </span>
              <div className="cluster" style={{ gap: "0.375rem", flexWrap: "wrap" }}>
                {u.job_title && <AccentPill value={u.job_title} />}
                {u.department && <AccentPill value={u.department} />}
                {u.account_enabled ? (
                  <span className="badge badge-success">Entra active</span>
                ) : (
                  <span className="badge badge-danger">Entra disabled</span>
                )}
              </div>
            </div>
            <div className="stack" style={{ gap: "0.25rem", textAlign: "right", minWidth: "12rem" }}>
              {nothingLeft ? (
                <span className="badge badge-success" style={{ alignSelf: "flex-end" }}>
                  <CheckCircle2 size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  IT teardown complete
                </span>
              ) : (
                <div className="cluster" style={{ gap: "0.375rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                  {devices.length > 0 && (
                    <span className="badge badge-warning">{devices.length} devices</span>
                  )}
                  {software.length > 0 && (
                    <span className="badge badge-warning">{software.length} software</span>
                  )}
                  {enabledBadges.length > 0 && (
                    <span className="badge badge-danger">{enabledBadges.length} active badges</span>
                  )}
                </div>
              )}
              <span className="text-muted text-xs">
                Synced <FreshnessCell iso={u.synced_at} />
              </span>
            </div>
          </div>

          {/* Note: this does NOT disable the Entra account. */}
          {u.account_enabled && (
            <div className="alert alert-warning cluster" style={{ gap: "0.5rem" }}>
              <Info size={16} />
              <span>
                This flow revokes IT resources (devices, software, badges). It
                does <strong>not</strong> disable the Entra account or mailbox —
                do that in Entra / your identity process.
              </span>
            </div>
          )}

          {/* Step 1 · Devices */}
          <section className="card stack" style={{ padding: "1.5rem" }}>
            <SectionHeader
              icon={<Laptop size={18} />}
              title="Step 1 · Collect devices"
              tint="green"
              right={
                <div className="cluster" style={{ gap: "0.5rem" }}>
                  <span className="badge badge-info">{devices.length} assigned</span>
                  {devices.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={bulkBusy}
                      onClick={() => void doCollectAllDevices()}
                    >
                      Collect all
                    </button>
                  )}
                </div>
              }
            />
            {loadingDetail && devices.length === 0 ? (
              <p className="text-muted text-sm" style={{ margin: 0 }}>Loading…</p>
            ) : devices.length === 0 ? (
              <p className="text-muted text-sm" style={{ margin: 0 }}>
                No devices assigned. Nothing to collect.
              </p>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                <div className="scroll-x">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Device</th>
                        <th>Serial</th>
                        <th>Model</th>
                        <th>OS</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {devices.map((d) => (
                        <tr key={d.intune_id}>
                          <td><span className="font-medium">{d.device_name ?? d.serial_number ?? d.intune_id}</span></td>
                          <td><span className="font-mono text-xs">{d.serial_number ?? "—"}</span></td>
                          <td><span className="text-sm">{d.manufacturer ?? ""} {d.model ?? ""}</span></td>
                          <td><span className="text-sm">{d.operating_system ?? "—"}</span></td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={busyDevice === d.intune_id || bulkBusy}
                              onClick={() => void doUnassignDevice(d)}
                            >
                              {busyDevice === d.intune_id ? "…" : "Collect"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Step 2 · Software */}
          <section className="card stack" style={{ padding: "1.5rem" }}>
            <SectionHeader
              icon={<Boxes size={18} />}
              title="Step 2 · Revoke software"
              tint="pink"
              right={
                <div className="cluster" style={{ gap: "0.5rem" }}>
                  <span className="badge badge-info">{software.length} assigned</span>
                  {software.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={bulkBusy}
                      onClick={() => void doRevokeAllSoftware()}
                    >
                      Revoke all
                    </button>
                  )}
                </div>
              }
            />
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              Direct (per-user) assignments only. Group-inherited licenses are
              managed on the group.
            </p>
            {software.length === 0 ? (
              <p className="text-muted text-sm" style={{ margin: 0 }}>
                No direct software assignments.
              </p>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                <div className="scroll-x">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Vendor</th>
                        <th>Category</th>
                        <th>Source</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {software.map((s) => (
                        <tr key={s.assignment_id}>
                          <td>
                            <button
                              type="button"
                              className="btn btn-link btn-sm"
                              onClick={() => onOpenSoftware(s.software_id)}
                            >
                              {s.name}
                            </button>
                          </td>
                          <td><AccentPill value={s.vendor} /></td>
                          <td><AccentPill value={s.category} /></td>
                          <td><span className="badge">{s.source === "intune" ? "Intune" : "Manual"}</span></td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={busySoftware === s.assignment_id || bulkBusy}
                              onClick={() => void doRevokeSoftware(s)}
                            >
                              {busySoftware === s.assignment_id ? "…" : "Revoke"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Step 3 · Access */}
          <section className="card stack" style={{ padding: "1.5rem" }}>
            <SectionHeader
              icon={<BadgeX size={18} />}
              title="Step 3 · Revoke access (badges)"
              tint="amber"
              right={
                <div className="cluster" style={{ gap: "0.5rem" }}>
                  <span className="badge badge-info">
                    {linkedBadges.length} linked · {enabledBadges.length} active
                  </span>
                  {enabledBadges.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={bulkBusy}
                      onClick={() => void doDisableAllBadges()}
                    >
                      Disable all
                    </button>
                  )}
                </div>
              }
            />
            {linkedBadges.length === 0 ? (
              <p className="text-muted text-sm" style={{ margin: 0 }}>
                No badges linked to this UPN.
              </p>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                <div className="scroll-x">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Controller</th>
                        <th>Card</th>
                        <th>State</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {linkedBadges.map((b) => (
                        <tr key={b.token}>
                          <td>{b.controller_label ?? b.controller_id}</td>
                          <td>
                            <span className="font-mono text-xs">
                              {b.card_value ?? b.card_nr ?? "—"}
                            </span>
                          </td>
                          <td>
                            {b.enabled ? (
                              <span className="badge badge-success">Enabled</span>
                            ) : (
                              <span className="badge">Disabled</span>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busyBadge === b.token || bulkBusy}
                              onClick={() => void doUnlinkBadge(b)}
                            >
                              {busyBadge === b.token ? "…" : "Unlink"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
