/** One badge's full record + manual link picker. The picker searches the
 *  cached IntuneUser list locally; we don't hit Graph live here because
 *  the cache is small enough to filter in-browser and the action is a
 *  pure DB write (no upstream call needed). */

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AtSign,
  Calendar,
  Check,
  ChevronLeft,
  Clock,
  CreditCard,
  DoorClosed,
  DoorOpen,
  Fingerprint,
  IdCard,
  Laptop,
  Link2,
  Link2Off,
  Pencil,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserSearch,
  X,
} from "lucide-react";

import { useConfirm } from "../components/ConfirmProvider";
import EntityHistoryList from "../components/EntityHistoryList";
import { useToast } from "../components/ToastProvider";
import {
  deleteBadge,
  getBadge,
  linkBadge,
  unlinkBadge,
  updateAxisUser,
  type Badge,
} from "../services/badges";
import { listAssets } from "../services/inventory";
import { listUsers } from "../services/users";
import type { Asset } from "../types/inventory";
import type { IntuneUser } from "../types/user";

interface Props {
  token: string;
  onBack: () => void;
  onUserClick?: (userId: string) => void;
  onAssetClick?: (assetId: number) => void;
}

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

function parseUtc(iso: string): number {
  if (!iso) return NaN;
  const hasTz =
    iso.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(iso.split("T")[1] ?? "");
  return new Date(hasTz ? iso : iso + "Z").getTime();
}

function relTime(iso: string | null): string | null {
  if (!iso) return null;
  const ts = parseUtc(iso);
  if (!ts) return null;
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

function controllerTint(id: string): { bg: string; fg: string; icon: ReactNode } {
  if (id === "front") {
    return {
      bg: "rgb(from rgb(var(--color-info)) r g b / 0.18)",
      fg: "rgb(var(--color-info))",
      icon: <DoorOpen size={13} />,
    };
  }
  return {
    bg: "rgb(from rgb(var(--color-warning)) r g b / 0.18)",
    fg: "rgb(var(--color-warning))",
    icon: <DoorClosed size={13} />,
  };
}

export default function BadgeDetail({
  token,
  onBack,
  onUserClick,
  onAssetClick,
}: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const [badge, setBadge] = useState<Badge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [users, setUsers] = useState<IntuneUser[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [busy, setBusy] = useState(false);

  // Assets the linked Intune user owns. Loaded lazily once we know the
  // badge has a UPN linked — re-fetched if the link changes.
  const [linkedAssets, setLinkedAssets] = useState<Asset[] | null>(null);
  const [showArchivedAssets, setShowArchivedAssets] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(false);

  // Inline edit state for the Axis-side user record. When open, the hero
  // swaps the read-only name for a first/last/description form. Saving
  // PATCHes the controller and refreshes the badge.
  const [editing, setEditing] = useState(false);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  async function load() {
    try {
      const b = await getBadge(token);
      setBadge(b);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!pickerOpen || users.length > 0) return;
    void listUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [pickerOpen, users.length]);

  useEffect(() => {
    if (!pickerOpen) return;
    if (!badge) return;
    const seed =
      [badge.axis_first_name, badge.axis_last_name].filter(Boolean).join(" ").trim();
    if (seed) setUserQuery(seed);
  }, [pickerOpen, badge]);

  // Load assets owned by the linked Intune user. Empty UPN → empty list.
  useEffect(() => {
    const upn = badge?.linked_intune_user_upn;
    if (!upn) {
      setLinkedAssets(null);
      return;
    }
    setAssetsLoading(true);
    void listAssets({ assigned_upn: upn })
      .then((rows) => setLinkedAssets(rows))
      .catch(() => setLinkedAssets([]))
      .finally(() => setAssetsLoading(false));
  }, [badge?.linked_intune_user_upn]);

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

  async function doLink(upn: string) {
    if (!badge) return;
    setBusy(true);
    try {
      const updated = await linkBadge(badge.token, upn);
      setBadge(updated);
      setPickerOpen(false);
      toast.notify({
        kind: "success",
        title: "Badge linked",
        detail: `${fmtName(updated) ?? updated.axis_token} → ${upn}`,
      });
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

  function openEditor() {
    if (!badge) return;
    setEditFirst(badge.axis_first_name ?? "");
    setEditLast(badge.axis_last_name ?? "");
    setEditDesc(badge.axis_user_description ?? "");
    setEditing(true);
  }

  async function saveEditor() {
    if (!badge) return;
    setEditSaving(true);
    try {
      const updated = await updateAxisUser(badge.token, {
        first_name: editFirst,
        last_name: editLast,
        description: editDesc,
        // backend recomputes display name from first/last if `name` omitted
      });
      setBadge(updated);
      setEditing(false);
      toast.notify({
        kind: "success",
        title: "Axis user updated",
        detail: `${fmtName(updated) ?? updated.axis_token} written to ${updated.controller_label ?? updated.controller_id}`,
      });
    } catch (e) {
      toast.notify({
        kind: "danger",
        title: "Update failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setEditSaving(false);
    }
  }

  async function doDelete() {
    if (!badge) return;
    const display = fmtName(badge) ?? `credential #${badge.axis_token}`;
    const card = badge.card_nr ? ` (card ${badge.card_nr})` : "";
    const ok = await confirm({
      title: "Delete badge?",
      tone: "danger",
      confirmLabel: "Delete badge",
      cancelLabel: "Keep",
      message: (
        <div className="stack" style={{ gap: "0.4rem" }}>
          <p>
            This removes the credential <strong>{display}</strong>
            {card} from{" "}
            <strong>{badge.controller_label ?? badge.controller_id}</strong>.
          </p>
          <p className="text-muted text-sm">
            If no other badge on this controller uses the same user record,
            the user is deleted too. This action can't be undone — the
            local link to {badge.linked_intune_user_upn ?? "any directory user"}{" "}
            is lost.
          </p>
        </div>
      ),
    });
    if (!ok) {
      toast.notify({
        kind: "info",
        title: "Delete cancelled",
        detail: `${display} kept on ${badge.controller_label ?? badge.controller_id}`,
      });
      return;
    }
    setBusy(true);
    try {
      const res = await deleteBadge(badge.token, "auto");
      const detail =
        res.user_removed
          ? `Credential + user removed from ${badge.controller_label ?? badge.controller_id}`
          : res.other_credentials_for_user > 0
            ? `Credential removed. User kept (${res.other_credentials_for_user} other badge${res.other_credentials_for_user === 1 ? "" : "s"} still reference it).`
            : `Credential removed from ${badge.controller_label ?? badge.controller_id}`;
      toast.notify({
        kind: "success",
        title: "Badge deleted",
        detail,
      });
      onBack();
    } catch (e) {
      toast.notify({
        kind: "danger",
        title: "Delete failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function doUnlink() {
    if (!badge) return;
    setBusy(true);
    try {
      const updated = await unlinkBadge(badge.token);
      setBadge(updated);
      toast.notify({
        kind: "success",
        title: "Link cleared",
        detail: `Badge ${updated.axis_token} unlinked`,
      });
    } catch (e) {
      toast.notify({
        kind: "danger",
        title: "Unlink failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!badge) return <p className="text-muted">Loading…</p>;

  const name = fmtName(badge);
  const tint = controllerTint(badge.controller_id);

  return (
    <div className="stack-lg">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onBack}
        style={{ alignSelf: "flex-start" }}
      >
        <ChevronLeft size={14} />
        Back to badges
      </button>

      {/* Hero card — identity + state at a glance. */}
      <section
        className="card"
        style={{
          padding: "1.5rem",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: "1.25rem",
          alignItems: "center",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 64,
            height: 64,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            fontSize: "1.1rem",
            letterSpacing: 1,
            background: name
              ? "rgb(from rgb(var(--color-primary)) r g b / 0.16)"
              : "rgb(var(--color-bg))",
            color: name
              ? "rgb(var(--color-primary))"
              : "rgb(var(--color-text-muted))",
            border: name ? "none" : "1px dashed rgb(var(--color-border) / 0.7)",
          }}
        >
          {name ? initialsFor(name) : <IdCard size={26} />}
        </div>
        <div className="stack" style={{ gap: "0.35rem", minWidth: 0 }}>
          {editing ? (
            <div className="stack" style={{ gap: "0.4rem" }}>
              <div
                className="cluster"
                style={{ gap: "0.4rem", flexWrap: "wrap" }}
              >
                <div className="stack" style={{ gap: 2 }}>
                  <label className="text-xs text-muted">First name</label>
                  <input
                    className="input"
                    value={editFirst}
                    onChange={(e) => setEditFirst(e.target.value)}
                    style={{ minWidth: "10rem" }}
                    autoFocus
                  />
                </div>
                <div className="stack" style={{ gap: 2 }}>
                  <label className="text-xs text-muted">Last name</label>
                  <input
                    className="input"
                    value={editLast}
                    onChange={(e) => setEditLast(e.target.value)}
                    style={{ minWidth: "10rem" }}
                  />
                </div>
              </div>
              <div className="stack" style={{ gap: 2 }}>
                <label className="text-xs text-muted">Description (optional)</label>
                <input
                  className="input"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </div>
              <div className="cluster" style={{ gap: "0.4rem" }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={editSaving}
                  onClick={() => void saveEditor()}
                >
                  <Check size={13} />
                  {editSaving ? "Saving…" : "Save to Axis"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={editSaving}
                  onClick={() => setEditing(false)}
                >
                  <X size={13} />
                  Cancel
                </button>
                <span
                  className="text-xs text-muted"
                  style={{ marginLeft: "0.4rem" }}
                >
                  Writes back to {badge.controller_label ?? badge.controller_id}
                </span>
              </div>
            </div>
          ) : (
            <div
              className="cluster"
              style={{ gap: "0.4rem", alignItems: "center", minWidth: 0 }}
            >
              {name ? (
                <h2 className="heading-2" style={{ margin: 0, minWidth: 0 }}>
                  {name}
                </h2>
              ) : (
                <h2
                  className="heading-2 text-muted"
                  style={{ margin: 0, fontStyle: "italic" }}
                >
                  Unnamed credential
                </h2>
              )}
              {badge.user_token ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={openEditor}
                  title="Edit name on Axis controller"
                  aria-label="Edit name"
                  style={{ padding: "0.25rem 0.4rem" }}
                >
                  <Pencil size={13} />
                </button>
              ) : null}
            </div>
          )}
          {!editing && (
            <div
              className="cluster"
              style={{ gap: "0.4rem", flexWrap: "wrap" }}
            >
              <Chip
                icon={tint.icon}
                bg={tint.bg}
                fg={tint.fg}
                label={badge.controller_label ?? badge.controller_id}
                title={`Controller: ${badge.controller_label ?? badge.controller_id}`}
              />
              <Chip
                icon={
                  badge.enabled ? <ShieldCheck size={12} /> : <ShieldOff size={12} />
                }
                bg={
                  badge.enabled
                    ? "rgb(from rgb(var(--color-success)) r g b / 0.16)"
                    : "rgb(from rgb(var(--color-text-muted)) r g b / 0.18)"
                }
                fg={
                  badge.enabled
                    ? "rgb(var(--color-success))"
                    : "rgb(var(--color-text-muted))"
                }
                label={badge.status ?? (badge.enabled ? "Enabled" : "Disabled")}
              />
              {badge.archived_at && (
                <Chip
                  bg="rgb(from rgb(var(--color-warning)) r g b / 0.16)"
                  fg="rgb(var(--color-warning))"
                  label="Archived"
                  title={`Removed from Axis on ${new Date(parseUtc(badge.archived_at)).toLocaleString()}`}
                />
              )}
              {badge.linked_intune_user_upn && (
                <Chip
                  icon={<AtSign size={12} />}
                  bg="rgb(from rgb(var(--color-info)) r g b / 0.16)"
                  fg="rgb(var(--color-info))"
                  label={badge.linked_intune_user_upn}
                />
              )}
            </div>
          )}
        </div>
        {badge.card_nr && (
          <div
            style={{
              padding: "0.6rem 0.9rem",
              borderRadius: 10,
              border: "1px solid rgb(var(--color-border) / 0.5)",
              background: "rgb(var(--color-bg) / 0.5)",
              minWidth: 0,
              textAlign: "right",
            }}
            title="Card number · facility code"
          >
            <div
              className="text-xs"
              style={{
                color: "rgb(var(--color-text-muted))",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Card
            </div>
            <div
              className="font-mono"
              style={{ fontSize: "1.1rem", lineHeight: 1.1 }}
            >
              {badge.card_nr}
            </div>
            {badge.facility_code && (
              <div
                className="font-mono text-xs"
                style={{ color: "rgb(var(--color-text-muted))" }}
              >
                FAC · {badge.facility_code}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Identity card — every other field. */}
      <section className="card stack" style={{ padding: "1.5rem" }}>
        <SubHeader icon={<Fingerprint size={14} />} label="Identifiers" />
        <Grid>
          <KV label="Axis token" value={badge.axis_token} mono />
          <KV label="User token" value={badge.user_token} mono />
          <KV label="PIN" value={badge.pin ? "•••••" : null} />
          <KV label="Card value" value={badge.card_value} mono />
        </Grid>

        <SubHeader icon={<Calendar size={14} />} label="Validity" />
        <Grid>
          <KV label="Valid from" value={badge.valid_from} />
          <KV label="Valid to" value={badge.valid_to} />
          <KV label="Description" value={badge.description} />
          <KV label="User description" value={badge.axis_user_description} />
        </Grid>

        <SubHeader icon={<CreditCard size={14} />} label="Access profiles" />
        {badge.access_profiles.length === 0 ? (
          <span className="text-muted text-sm" style={{ fontStyle: "italic" }}>
            No access profiles assigned.
          </span>
        ) : (
          <div className="cluster" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
            {badge.access_profiles.map((p) => (
              <span
                key={p.token}
                className="badge"
                style={{
                  fontSize: "0.75rem",
                  padding: "3px 8px",
                  background: "rgb(from rgb(var(--color-primary)) r g b / 0.10)",
                  color: "rgb(var(--color-text))",
                  borderColor: "rgb(var(--color-border) / 0.5)",
                }}
                title={p.description ?? p.name ?? p.token}
              >
                {p.name ?? p.token}
              </span>
            ))}
          </div>
        )}

        {badge.archived_at && (
          <div className="alert alert-warning" style={{ marginTop: "0.5rem" }}>
            Archived from Axis on{" "}
            {new Date(parseUtc(badge.archived_at)).toLocaleString()} — credential was
            absent from the most recent sync.
          </div>
        )}
      </section>

      {/* Directory link card */}
      <section className="card stack" style={{ padding: "1.5rem" }}>
        <SubHeader icon={<Link2 size={14} />} label="Directory link" />
        {badge.linked_intune_user_upn ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "1rem",
              alignItems: "center",
            }}
          >
            <div
              className="cluster"
              style={{ gap: "0.75rem", alignItems: "center", minWidth: 0 }}
            >
              <div
                aria-hidden
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    "rgb(from rgb(var(--color-info)) r g b / 0.16)",
                  color: "rgb(var(--color-info))",
                }}
              >
                <AtSign size={16} />
              </div>
              <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                <span
                  className="font-mono truncate"
                  style={{ fontSize: "0.95rem" }}
                >
                  {badge.linked_intune_user_upn}
                </span>
                {badge.linked_at && (
                  <span className="text-xs text-muted">
                    Linked {relTime(badge.linked_at)}
                    {badge.linked_by_upn ? ` by ${badge.linked_by_upn}` : ""}
                  </span>
                )}
              </div>
            </div>
            <div className="cluster" style={{ gap: "0.4rem" }}>
              {onUserClick && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    onUserClick(badge.linked_intune_user_upn as string)
                  }
                >
                  Open user
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() => setPickerOpen(true)}
              >
                Change
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => void doUnlink()}
              >
                <Link2Off size={14} />
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div
            className="cluster"
            style={{
              gap: "0.5rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <Link2Off
              size={14}
              style={{ color: "rgb(var(--color-text-muted))" }}
            />
            <span
              className="text-muted text-sm"
              style={{ fontStyle: "italic" }}
            >
              Not yet linked to a directory user.
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => setPickerOpen(true)}
              style={{ marginLeft: "auto" }}
            >
              <UserSearch size={14} />
              Link to user…
            </button>
          </div>
        )}

        {pickerOpen && (
          <div
            className="stack"
            style={{
              padding: "0.75rem",
              gap: "0.5rem",
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
                placeholder="Search by name or UPN…"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                autoFocus
                style={{ paddingLeft: 30 }}
              />
            </div>
            {users.length === 0 && (
              <p className="text-muted text-sm">Loading users…</p>
            )}
            {users.length > 0 && filteredUsers.length === 0 && (
              <p className="text-muted text-sm">No matches.</p>
            )}
            {filteredUsers.length > 0 && (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  maxHeight: "22rem",
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
                        onClick={() => void doLink(u.user_principal_name)}
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
                        <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                          <span className="font-medium truncate">{dn}</span>
                          <span className="text-xs text-muted font-mono truncate">
                            {u.user_principal_name}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="cluster" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPickerOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Assets assigned to the linked Intune user. Hidden when no link.
          Helps an operator confirm "this badge belongs to person X who
          also has laptop Y" without leaving the page. */}
      {badge.linked_intune_user_upn && (
        <section className="card stack" style={{ padding: "1.5rem" }}>
          <SubHeader
            icon={<Laptop size={14} />}
            label={`Assets assigned to ${badge.linked_intune_user_upn}`}
          />
          {assetsLoading && (
            <p className="text-muted text-sm">Loading…</p>
          )}
          {!assetsLoading && linkedAssets && linkedAssets.length === 0 && (
            <p className="text-muted text-sm" style={{ fontStyle: "italic" }}>
              No assets currently assigned to this UPN.
            </p>
          )}
          {!assetsLoading && linkedAssets && linkedAssets.length > 0 && (
            <>
              <div
                className="cluster"
                style={{ gap: "0.5rem", alignItems: "center" }}
              >
                <span className="text-xs text-muted">
                  {
                    linkedAssets.filter((a) =>
                      showArchivedAssets ? true : a.archived_at === null,
                    ).length
                  }{" "}
                  of {linkedAssets.length} shown
                </span>
                {linkedAssets.some((a) => a.archived_at !== null) && (
                  <label
                    className="cluster text-xs"
                    style={{ gap: 4, alignItems: "center", cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={showArchivedAssets}
                      onChange={(e) => setShowArchivedAssets(e.target.checked)}
                    />
                    Include archived
                  </label>
                )}
              </div>
              <ul
                className="stack"
                style={{ listStyle: "none", padding: 0, margin: 0, gap: 6 }}
              >
                {linkedAssets
                  .filter((a) =>
                    showArchivedAssets ? true : a.archived_at === null,
                  )
                  .map((a) => {
                    const modelLabel =
                      a.override_model?.trim() ||
                      [a.series, a.generation].filter(Boolean).join(" ").trim() ||
                      a.model?.trim() ||
                      "—";
                    const archived = a.archived_at !== null;
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => onAssetClick?.(a.id)}
                          disabled={!onAssetClick}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "0.55rem 0.75rem",
                            background: "transparent",
                            border:
                              "1px solid rgb(var(--color-border) / 0.4)",
                            borderRadius: 8,
                            cursor: onAssetClick ? "pointer" : "default",
                            color: "rgb(var(--color-text))",
                            display: "grid",
                            gridTemplateColumns: "auto 1fr auto",
                            gap: "0.75rem",
                            alignItems: "center",
                            opacity: archived ? 0.6 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (onAssetClick)
                              e.currentTarget.style.background =
                                "rgb(var(--color-bg) / 0.5)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 6,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background:
                                "rgb(from rgb(var(--color-primary)) r g b / 0.14)",
                              color: "rgb(var(--color-primary))",
                            }}
                          >
                            <Laptop size={14} />
                          </span>
                          <div
                            className="stack"
                            style={{ gap: 1, minWidth: 0 }}
                          >
                            <span className="font-medium truncate">
                              {a.intune_device_name?.trim() ||
                                a.asset_tag?.trim() ||
                                a.serial_number}
                            </span>
                            <span className="text-xs text-muted truncate">
                              {a.asset_type}
                              {modelLabel && modelLabel !== "—"
                                ? ` · ${modelLabel}`
                                : ""}
                              {" · "}
                              <span className="font-mono">
                                {a.serial_number}
                              </span>
                            </span>
                          </div>
                          <div
                            className="cluster"
                            style={{ gap: 6, alignItems: "center" }}
                          >
                            {archived && (
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
                              >
                                archived
                              </span>
                            )}
                            <span
                              className="badge"
                              style={{
                                fontSize: "0.7rem",
                                padding: "2px 8px",
                              }}
                            >
                              {a.status_code}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </>
          )}
        </section>
      )}

      {/* Danger zone */}
      <section
        className="card stack"
        style={{
          padding: "1.25rem",
          border: "1px solid rgb(from rgb(var(--color-danger)) r g b / 0.3)",
          background: "rgb(from rgb(var(--color-danger)) r g b / 0.04)",
        }}
      >
        <SubHeader icon={<Trash2 size={14} />} label="Danger zone" />
        <div
          className="cluster"
          style={{
            gap: "0.75rem",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <span className="text-sm font-medium">Delete this badge</span>
            <span className="text-xs text-muted">
              Removes the credential from {badge.controller_label ?? badge.controller_id}.
              If no other badge uses the same Axis user record, the user is
              removed too.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busy}
            onClick={() => void doDelete()}
          >
            <Trash2 size={13} />
            Delete badge
          </button>
        </div>
      </section>

      <EntityHistoryList entityType="badge" entityId={badge.token} />

      {/* Sync info */}
      <section className="card stack" style={{ padding: "1.25rem" }}>
        <SubHeader icon={<Clock size={14} />} label="Sync info" />
        <Grid>
          <KV
            label="Last synced from Axis"
            value={relTime(badge.synced_at) ?? undefined}
            tooltip={new Date(parseUtc(badge.synced_at)).toLocaleString()}
          />
          <KV
            label="First seen"
            value={relTime(badge.created_at) ?? undefined}
            tooltip={new Date(parseUtc(badge.created_at)).toLocaleString()}
          />
        </Grid>
      </section>
    </div>
  );
}

function SubHeader({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div
      className="cluster"
      style={{
        gap: "0.4rem",
        alignItems: "center",
        color: "rgb(var(--color-text-muted))",
        textTransform: "uppercase",
        fontSize: "0.7rem",
        letterSpacing: 0.7,
        fontWeight: 600,
        padding: "0.25rem 0",
        borderBottom: "1px solid rgb(var(--color-border) / 0.35)",
        marginTop: "0.25rem",
      }}
    >
      {icon}
      {label}
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
        gap: "0.75rem 1.25rem",
      }}
    >
      {children}
    </div>
  );
}

function Chip({
  icon,
  label,
  bg,
  fg,
  title,
}: {
  icon?: ReactNode;
  label: string;
  bg: string;
  fg: string;
  title?: string;
}) {
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: "0.72rem",
    padding: "3px 9px",
    borderRadius: 999,
    background: bg,
    color: fg,
    border: "1px solid transparent",
    fontWeight: 500,
  };
  return (
    <span style={style} title={title}>
      {icon}
      {label}
    </span>
  );
}

function KV({
  label,
  value,
  mono,
  tooltip,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  tooltip?: string;
}) {
  const shown = value && value.length > 0 ? value : "—";
  return (
    <div className="stack" style={{ gap: 2, minWidth: 0 }}>
      <span
        className="text-xs"
        style={{
          color: "rgb(var(--color-text-muted))",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          fontSize: "0.65rem",
        }}
      >
        {label}
      </span>
      <span
        className={mono ? "font-mono text-sm truncate" : "text-sm truncate"}
        title={tooltip ?? (typeof shown === "string" ? shown : undefined)}
        style={{ color: shown === "—" ? "rgb(var(--color-text-muted))" : undefined }}
      >
        {shown}
      </span>
    </div>
  );
}
