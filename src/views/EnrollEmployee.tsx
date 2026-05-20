/** Enroll Employee workflow.
 *
 *  Single-page flow that lets an admin pick a user via UPN typeahead, view
 *  their Entra/Graph info, then run two assignment actions:
 *    1. Assign assets (one at a time — physical handoff matters)
 *    2. Assign software (multi-select bulk — cheap to grant N at once)
 *
 *  Reuses the existing /users, /software, and /users/{id}/assignable-devices
 *  endpoints — no new backend routes. Deeplinkable as /enroll or
 *  /enroll/{upn} for direct loading.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  ChevronLeft,
  ExternalLink,
  Info,
  Laptop,
  RefreshCw,
  Search,
  UserPlus,
  X,
} from "lucide-react";

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
  assignDevice,
  getUser,
  listAssignableDevices,
  listUsers,
  syncOneUser,
  unassignDevice,
} from "../services/users";
import { addAssignment, listSoftware } from "../services/software";
import type { Software } from "../types/software";
import type {
  AssignableDevicesResponse,
  DeviceSummary,
  IntuneUser,
  UserDetail as UserDetailType,
} from "../types/user";

interface Props {
  initialUpn?: string;
  onBack: () => void;
  onOpenUser: (id: string) => void;
  onOpenSoftware: (id: number) => void;
  onOpenAsset: (id: number) => void;
  /** Notify parent so the URL updates to /enroll/{upn} when one is picked. */
  onUpnChanged: (upn: string) => void;
}

const SOFTWARE_PAGE_SIZE = 50;

export default function EnrollEmployee({
  initialUpn,
  onBack,
  onOpenUser,
  onOpenSoftware,
  onOpenAsset,
  onUpnChanged,
}: Props) {
  const toast = useToast();

  const [allUsers, setAllUsers] = useState<IntuneUser[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  const [selectedUser, setSelectedUser] = useState<IntuneUser | null>(null);
  const [detail, setDetail] = useState<UserDetailType | null>(null);
  const [pool, setPool] = useState<AssignableDevicesResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [allSoftware, setAllSoftware] = useState<Software[]>([]);
  const [softwareFilter, setSoftwareFilter] = useState("");
  const [softwareCategory, setSoftwareCategory] = useState<string>("");
  const [selectedSoftware, setSelectedSoftware] = useState<Set<number>>(
    new Set(),
  );

  const [busyDevice, setBusyDevice] = useState<string | null>(null);
  const [busySoftware, setBusySoftware] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const initialApplied = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Initial mount: load user + software catalogs.
  useEffect(() => {
    void listUsers()
      .then(setAllUsers)
      .catch((e) =>
        setUsersError(e instanceof Error ? e.message : String(e)),
      );
    void listSoftware({ include_archived: false })
      .then(setAllSoftware)
      .catch(() => undefined);
  }, []);

  // Apply initialUpn (from deeplink) once user list arrives.
  useEffect(() => {
    if (initialApplied.current) return;
    if (!initialUpn) return;
    if (allUsers.length === 0) return;
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
  }, [initialUpn, allUsers]);

  async function loadUserDetail(userId: string) {
    setLoadingDetail(true);
    try {
      const [d, p] = await Promise.all([
        getUser(userId),
        listAssignableDevices(userId).catch(() => null),
      ]);
      setDetail(d);
      setPool(p);
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
    setSelectedSoftware(new Set());
    setDetail(null);
    setPool(null);
    if (!skipUrl) onUpnChanged(u.user_principal_name);
    await loadUserDetail(u.id);
  }

  function clearSelection() {
    setSelectedUser(null);
    setDetail(null);
    setPool(null);
    setSelectedSoftware(new Set());
    setSearch("");
    onUpnChanged(""); // empty string means /enroll (handled by parent: navigate replaces "")
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
      await loadUserDetail(selectedUser.id);
    } catch {
      // toast surfaced the error
    } finally {
      setSyncing(false);
    }
  }

  async function doAssignDevice(device: DeviceSummary) {
    if (!selectedUser) return;
    setBusyDevice(device.intune_id);
    const label =
      device.device_name ?? device.serial_number ?? device.intune_id;
    try {
      await toast.run(() => assignDevice(selectedUser.id, device.intune_id), {
        pending: `Assigning ${label}…`,
        success: `Assigned ${label}`,
        error: "Assign failed",
      });
      await loadUserDetail(selectedUser.id);
    } catch {
      // toast surfaced the error
    } finally {
      setBusyDevice(null);
    }
  }

  async function doUnassignDevice(device: DeviceSummary) {
    if (!selectedUser) return;
    setBusyDevice(device.intune_id);
    const label =
      device.device_name ?? device.serial_number ?? device.intune_id;
    try {
      await toast.run(
        () => unassignDevice(selectedUser.id, device.intune_id),
        {
          pending: `Unassigning ${label}…`,
          success: `Unassigned ${label}`,
          error: "Unassign failed",
        },
      );
      await loadUserDetail(selectedUser.id);
    } catch {
      // toast surfaced the error
    } finally {
      setBusyDevice(null);
    }
  }

  async function doBulkAssignSoftware() {
    if (!selectedUser || selectedSoftware.size === 0) return;
    setBusySoftware(true);
    const ids = Array.from(selectedSoftware);
    let succeeded = 0;
    const failures: { name: string; reason: string }[] = [];
    for (const id of ids) {
      const sw = allSoftware.find((s) => s.id === id);
      const name = sw?.name ?? `#${id}`;
      try {
        await addAssignment(id, {
          principal_type: "user",
          principal_id: selectedUser.id,
        });
        succeeded++;
      } catch (e) {
        failures.push({
          name,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }
    toast.notify({
      kind: failures.length === 0 ? "success" : "warning",
      title: `Assigned ${succeeded} of ${ids.length} software item${
        ids.length === 1 ? "" : "s"
      }`,
      detail:
        failures.length === 0
          ? `to ${selectedUser.display_name ?? selectedUser.user_principal_name}`
          : `${failures.length} failed (often duplicates) — first: ${failures[0].name}`,
    });
    setSelectedSoftware(new Set());
    setBusySoftware(false);
    // refresh catalog so assignment counts update
    try {
      const fresh = await listSoftware({ include_archived: false });
      setAllSoftware(fresh);
    } catch {
      // ignore
    }
  }

  // ─────────────────────────── typeahead matching ───────────────────────────

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

  useEffect(() => {
    setHighlightedIdx(0);
  }, [needle]);

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

  // ─────────────────────────── software filtering ───────────────────────────

  const softwareCategories = useMemo(() => {
    const set = new Set<string>();
    for (const s of allSoftware) if (s.category) set.add(s.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allSoftware]);

  const softwareNeedle = softwareFilter.trim().toLowerCase();
  const filteredSoftware = useMemo(() => {
    return allSoftware
      .filter((s) => !s.archived_at)
      .filter((s) =>
        softwareCategory ? s.category === softwareCategory : true,
      )
      .filter((s) => {
        if (!softwareNeedle) return true;
        return [s.name, s.vendor, s.category, s.intune_publisher]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(softwareNeedle));
      })
      .slice(0, SOFTWARE_PAGE_SIZE);
  }, [allSoftware, softwareNeedle, softwareCategory]);

  function toggleSoftware(id: number) {
    setSelectedSoftware((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ─────────────────────────── render helpers ───────────────────────────

  const u = detail?.user ?? selectedUser;
  const assignedDevices = detail?.assigned_devices ?? [];
  const availableDevices = pool?.devices ?? [];

  return (
    <div className="stack-lg">
      {/* Top bar */}
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onBack}
          >
            <ChevronLeft size={14} />
            Back to Users
          </button>
          <h2 className="heading-2" style={{ margin: 0 }}>
            Enroll Employee
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
              title="Refresh from Microsoft Graph"
            >
              <RefreshCw
                size={14}
                className={syncing ? "animate-spin" : ""}
              />
              {syncing ? "Syncing…" : "Resync"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={clearSelection}
              title="Pick a different employee"
            >
              <X size={14} />
              Change employee
            </button>
          </div>
        )}
      </div>

      {usersError && <div className="alert alert-error">{usersError}</div>}

      {/* Step 1 — typeahead picker (only when nothing selected) */}
      {!selectedUser && (
        <section className="card stack" style={{ padding: "1.5rem" }}>
          <SectionHeader
            icon={<UserPlus size={18} />}
            title="Step 1 · Find employee"
            tint="info"
          />
          <p className="text-muted text-sm" style={{ margin: 0 }}>
            Search by name, UPN, email, employee ID, title, or department.
            Pick a user to load their Entra profile and run enrollment.
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
                      <Avatar
                        seed={m.user_principal_name}
                        name={m.display_name}
                      />
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
              <p
                className="text-muted text-sm"
                style={{ marginTop: "0.5rem" }}
              >
                No users match "{search}". Try a different search or sync
                from the Users page.
              </p>
            )}
          </div>
          {allUsers.length === 0 && !usersError && (
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              Loading users from cache…
            </p>
          )}
        </section>
      )}

      {/* Step 2 — Entra profile card + assignments */}
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
              <div
                className="cluster"
                style={{ gap: "0.375rem", flexWrap: "wrap" }}
              >
                {u.job_title && <AccentPill value={u.job_title} />}
                {u.department && <AccentPill value={u.department} />}
                {u.office_location && <AccentPill value={u.office_location} />}
                {u.account_enabled ? (
                  <span className="badge badge-success">Active</span>
                ) : (
                  <span className="badge badge-danger">Disabled</span>
                )}
              </div>
            </div>
            <div
              className="stack text-sm"
              style={{ gap: "0.25rem", textAlign: "right", minWidth: "10rem" }}
            >
              <KV k="Employee ID" v={u.employee_id} mono />
              <KV
                k="Manager"
                v={u.manager_display_name}
              />
              <KV k="Hired" v={u.employee_hire_date} />
            </div>
          </div>

          {/* Identity & contact */}
          <section className="card stack" style={{ padding: "1.5rem" }}>
            <SectionHeader
              icon={<Info size={18} />}
              title="Identity & contact"
              tint="purple"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1.5rem",
              }}
            >
              <div className="stack" style={{ gap: "0.5rem" }}>
                <KV k="Company" v={u.company_name} />
                <KV k="Employee type" v={u.employee_type} />
                <KV k="Division" v={u.employee_org_division} />
                <KV k="Cost center" v={u.employee_org_cost_center} />
                <KV k="Mail nickname" v={u.mail_nickname} mono />
                <KV
                  k="Sponsors"
                  v={
                    detail?.sponsors_status === "unavailable"
                      ? "—"
                      : detail && detail.sponsors.length > 0
                        ? detail.sponsors
                            .map((s) => s.display_name ?? s.user_principal_name)
                            .join(", ")
                        : "—"
                  }
                />
              </div>
              <div className="stack" style={{ gap: "0.5rem" }}>
                <KV k="Mail" v={u.mail} mono />
                <KV k="Mobile" v={u.mobile_phone} mono />
                <KV
                  k="Business phone"
                  v={u.business_phones[0] ?? null}
                  mono
                />
                <KV
                  k="Address"
                  v={[u.street_address, u.city, u.state, u.postal_code, u.country]
                    .filter(Boolean)
                    .join(", ") || null}
                />
                <KV
                  k="Other emails"
                  v={u.other_mails.length > 0 ? u.other_mails.join(", ") : null}
                  mono
                />
                <KV k="Synced" v={<FreshnessCell iso={u.synced_at} />} />
              </div>
            </div>
          </section>

          {/* Step 2 · Assets */}
          <section className="card stack" style={{ padding: "1.5rem" }}>
            <SectionHeader
              icon={<Laptop size={18} />}
              title="Step 2 · Assign assets"
              tint="green"
              right={
                <span className="badge badge-info">
                  {assignedDevices.length} currently assigned
                </span>
              }
            />
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              Devices below come from the staging UPN
              {pool ? (
                <>
                  {" "}
                  <span className="font-mono">{pool.staging_upn}</span>
                </>
              ) : null}
              . Click <strong>Assign</strong> to set this user as the device's
              primary user in Intune.
            </p>

            {/* Currently assigned */}
            <div className="stack" style={{ gap: "0.375rem" }}>
              <span className="eyebrow">Currently assigned</span>
              {assignedDevices.length === 0 ? (
                <p className="text-muted text-sm" style={{ margin: 0 }}>
                  No devices assigned yet.
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
                        {assignedDevices.map((d) => (
                          <DeviceRow
                            key={d.intune_id}
                            device={d}
                            busy={busyDevice === d.intune_id}
                            actionLabel="Unassign"
                            actionTone="danger"
                            onAction={() => void doUnassignDevice(d)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Available pool */}
            <div className="stack" style={{ gap: "0.375rem" }}>
              <span className="eyebrow">
                Available staging pool ({availableDevices.length})
              </span>
              {loadingDetail && (
                <p className="text-muted text-sm" style={{ margin: 0 }}>
                  Loading…
                </p>
              )}
              {!loadingDetail && availableDevices.length === 0 && (
                <p className="text-muted text-sm" style={{ margin: 0 }}>
                  No devices available in the staging pool.
                </p>
              )}
              {availableDevices.length > 0 && (
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
                        {availableDevices.map((d) => (
                          <DeviceRow
                            key={d.intune_id}
                            device={d}
                            busy={busyDevice === d.intune_id}
                            actionLabel="Assign"
                            actionTone="primary"
                            onAction={() => void doAssignDevice(d)}
                            onClickName={
                              d.intune_id
                                ? undefined
                                : (id) => onOpenAsset(id)
                            }
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Step 3 · Software */}
          <section className="card stack" style={{ padding: "1.5rem" }}>
            <SectionHeader
              icon={<Boxes size={18} />}
              title="Step 3 · Assign software"
              tint="pink"
              right={
                <div className="cluster" style={{ gap: "0.5rem" }}>
                  <span className="text-muted text-sm">
                    {selectedSoftware.size} selected
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={selectedSoftware.size === 0 || busySoftware}
                    onClick={() => void doBulkAssignSoftware()}
                  >
                    {busySoftware
                      ? "Assigning…"
                      : `Assign ${selectedSoftware.size || ""} software`}
                  </button>
                </div>
              }
            />
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              Pick one or more software entries. Each will be assigned
              directly to this user (not via a group). Existing direct
              assignments are surfaced as duplicates by the API and silently
              skipped.
            </p>

            <div className="cluster" style={{ gap: "0.5rem" }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Filter software by name, vendor, category…"
                value={softwareFilter}
                onChange={(e) => setSoftwareFilter(e.target.value)}
              />
              <select
                className="select"
                value={softwareCategory}
                onChange={(e) => setSoftwareCategory(e.target.value)}
                style={{ minWidth: "10rem" }}
              >
                <option value="">All categories</option>
                {softwareCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {selectedSoftware.size > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSelectedSoftware(new Set())}
                >
                  Clear selection
                </button>
              )}
            </div>

            <div className="card" style={{ padding: 0 }}>
              <div className="scroll-x">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: "2.5rem" }} />
                      <th>Name</th>
                      <th>Vendor</th>
                      <th>Category</th>
                      <th>Source</th>
                      <th>Assigned</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSoftware.map((s) => {
                      const checked = selectedSoftware.has(s.id);
                      return (
                        <tr
                          key={s.id}
                          className="row-clickable"
                          onClick={() => toggleSoftware(s.id)}
                          style={{
                            background: checked
                              ? "rgb(from rgb(var(--color-primary)) r g b / 0.08)"
                              : undefined,
                          }}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSoftware(s.id)}
                              aria-label={`Select ${s.name}`}
                            />
                          </td>
                          <td>
                            <span className="font-medium">{s.name}</span>
                          </td>
                          <td>
                            <AccentPill value={s.vendor ?? s.intune_publisher} />
                          </td>
                          <td>
                            <AccentPill value={s.category} />
                          </td>
                          <td>
                            <span className="badge">
                              {s.source === "intune" ? "Intune" : "Manual"}
                            </span>
                          </td>
                          <td>
                            <span className="text-sm">
                              {s.assignment_count}
                            </span>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => onOpenSoftware(s.id)}
                              title="Open software"
                            >
                              <ExternalLink size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredSoftware.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="text-muted"
                          style={{ textAlign: "center", padding: "1rem" }}
                        >
                          {allSoftware.length === 0
                            ? "No software in catalog yet."
                            : "No software matches the filter."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {allSoftware.filter((s) => !s.archived_at).length >
              SOFTWARE_PAGE_SIZE && (
              <p className="text-muted text-xs" style={{ margin: 0 }}>
                Showing first {SOFTWARE_PAGE_SIZE} matches — narrow the filter
                to see more.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** Reusable device row used in both the "currently assigned" and
 *  "available pool" tables on the Assets section. */
function DeviceRow({
  device,
  busy,
  actionLabel,
  actionTone,
  onAction,
  onClickName,
}: {
  device: DeviceSummary;
  busy: boolean;
  actionLabel: string;
  actionTone: "primary" | "danger";
  onAction: () => void;
  onClickName?: (id: number) => void;
}) {
  const label =
    device.device_name ?? device.serial_number ?? device.intune_id;
  return (
    <tr>
      <td>
        {onClickName ? (
          <button
            type="button"
            className="btn btn-link btn-sm"
            onClick={() => onClickName(Number(device.intune_id))}
          >
            {label}
          </button>
        ) : (
          <span className="font-medium">{label}</span>
        )}
      </td>
      <td>
        <span className="font-mono text-xs">
          {device.serial_number ?? "—"}
        </span>
      </td>
      <td>
        <span className="text-sm">
          {device.manufacturer ?? ""} {device.model ?? ""}
        </span>
      </td>
      <td>
        <span className="text-sm">{device.operating_system ?? "—"}</span>
      </td>
      <td style={{ textAlign: "right" }}>
        <button
          type="button"
          className={
            actionTone === "primary"
              ? "btn btn-primary btn-sm"
              : "btn btn-secondary btn-sm"
          }
          disabled={busy}
          onClick={onAction}
        >
          {busy ? "…" : actionLabel}
        </button>
      </td>
    </tr>
  );
}

/** Compact key/value pair used in the hero card + identity/contact grids. */
function KV({
  k,
  v,
  mono,
}: {
  k: string;
  v: React.ReactNode;
  mono?: boolean;
}) {
  const empty = v === null || v === undefined || v === "" || v === "—";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "0.75rem",
      }}
    >
      <span className="text-muted text-xs uppercase tracking-wide">{k}</span>
      <span
        className={mono ? "font-mono text-sm truncate" : "text-sm truncate"}
        style={{
          color: empty
            ? "rgb(var(--color-text-muted))"
            : "rgb(var(--color-text))",
          textAlign: "right",
        }}
      >
        {empty ? "—" : v}
      </span>
    </div>
  );
}
