import { type ReactNode, useEffect, useState } from "react";
import {
  Activity,
  Briefcase,
  ChevronLeft,
  Laptop,
  Mail,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  Truck,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";

import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import {
  AccentPill,
  FreshnessCell,
  SectionHeader,
  avatarColorFor,
  initials,
} from "../components/visual";
import { listReservations } from "../services/inventory";
import {
  assignDevice,
  getUser,
  listAssignableDevices,
  syncOneUser,
  unassignDevice,
} from "../services/users";
import type { ReservationRow } from "../types/inventory";
import type {
  AssignableDevicesResponse,
  DeviceSummary,
  SignInStatus,
  UserDetail as UserDetailType,
} from "../types/user";

function lastSignInDisplay(iso: string | null, status: SignInStatus): string {
  if (iso) return new Date(iso).toLocaleString();
  if (status === "permission_missing")
    return "— (permission missing: AuditLog.Read.All)";
  if (status === "license_unavailable")
    return "— (Entra ID P1/P2 license required)";
  return "— (no sign-in recorded)";
}

interface Props {
  userId: string;
  onBack: () => void;
  onAssetClick?: (id: number) => void;
  onDeploymentClick?: (id: number) => void;
  onShipmentClick?: (id: number) => void;
  onEnroll?: (upn: string) => void;
  onOffboard?: (upn: string) => void;
}

export default function UserDetail({
  userId,
  onBack,
  onAssetClick,
  onDeploymentClick,
  onShipmentClick,
  onEnroll,
  onOffboard,
}: Props) {
  const confirm = useConfirm();
  const toast = useToast();

  const [detail, setDetail] = useState<UserDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [pool, setPool] = useState<AssignableDevicesResponse | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [loadingPool, setLoadingPool] = useState(false);
  const [busyDevice, setBusyDevice] = useState<string | null>(null);

  const [reservations, setReservations] = useState<ReservationRow[]>([]);

  const reload = () =>
    getUser(userId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void reload();
  }, [userId]);

  // Pending deliveries (shipments/deployments staged for this user).
  // Refetched whenever the user's UPN becomes known.
  useEffect(() => {
    const upn = detail?.user.user_principal_name;
    if (!upn) {
      setReservations([]);
      return;
    }
    void listReservations(upn)
      .then(setReservations)
      .catch(() => setReservations([]));
  }, [detail?.user.user_principal_name]);

  const doSync = async () => {
    setSyncing(true);
    try {
      await toast.run(() => syncOneUser(userId), {
        pending: "Refreshing user from Graph…",
        success: "User refreshed",
        error: "User sync failed",
      });
      await reload();
    } catch {
      // toast surfaced
    } finally {
      setSyncing(false);
    }
  };

  const openAssign = async () => {
    setShowAssign(true);
    setLoadingPool(true);
    try {
      const r = await listAssignableDevices(userId);
      setPool(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      toast.notify({
        kind: "danger",
        title: "Could not load available devices",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoadingPool(false);
    }
  };

  const doAssign = async (device: DeviceSummary) => {
    setBusyDevice(device.intune_id);
    const label =
      device.device_name ?? device.serial_number ?? device.intune_id;
    try {
      await toast.run(() => assignDevice(userId, device.intune_id), {
        pending: `Assigning ${label}…`,
        success: `Assigned ${label}`,
        error: "Assign failed",
      });
      setShowAssign(false);
      setPool(null);
      await reload();
    } catch {
      // toast surfaced
    } finally {
      setBusyDevice(null);
    }
  };

  const doUnassign = async (device: DeviceSummary) => {
    const label =
      device.device_name ?? device.serial_number ?? device.intune_id;
    const ok = await confirm({
      title: "Unassign device?",
      message: `Remove primary user from "${label}"? The device's primaryUser will be cleared in Intune.`,
      tone: "warning",
      confirmLabel: "Unassign",
    });
    if (!ok) return;
    setBusyDevice(device.intune_id);
    try {
      await toast.run(() => unassignDevice(userId, device.intune_id), {
        pending: `Unassigning ${label}…`,
        success: `Unassigned ${label}`,
        error: "Unassign failed",
      });
      await reload();
    } catch {
      // toast surfaced
    } finally {
      setBusyDevice(null);
    }
  };

  if (!detail) {
    return (
      <div className="stack-lg">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onBack}
        >
          <ChevronLeft size={14} />
          Back
        </button>
        {error ? (
          <div className="alert alert-error">{error}</div>
        ) : (
          <p className="text-muted">Loading user…</p>
        )}
      </div>
    );
  }

  const u = detail.user;
  const fullName = u.display_name ?? u.user_principal_name;
  const address = [u.street_address, u.city, u.state, u.postal_code, u.country]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="stack-lg">
      {/* Top bar */}
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onBack}
        >
          <ChevronLeft size={14} />
          Back to Users
        </button>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          {onEnroll && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onEnroll(u.user_principal_name)}
              title="Assign devices + software to this user"
            >
              <UserPlus size={14} strokeWidth={1.75} />
              Enroll
            </button>
          )}
          {onOffboard && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onOffboard(u.user_principal_name)}
              title="Collect devices, revoke software + badges for this user"
            >
              <UserMinus size={14} strokeWidth={1.75} />
              Offboard
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void doSync()}
            disabled={syncing}
          >
            <RefreshCw
              size={14}
              className={syncing ? "animate-spin" : ""}
              strokeWidth={1.75}
            />
            {syncing ? "Syncing…" : "Sync this user"}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Hero card */}
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
            {fullName}
          </h2>
          <span className="font-mono text-muted text-sm truncate">
            {u.user_principal_name}
          </span>
          <div className="cluster" style={{ gap: "0.375rem", flexWrap: "wrap" }}>
            {u.job_title && <AccentPill value={u.job_title} />}
            {u.department && <AccentPill value={u.department} />}
            {u.office_location && <AccentPill value={u.office_location} />}
            {u.account_enabled ? (
              <span className="badge badge-success">Active</span>
            ) : (
              <span className="badge badge-danger">Disabled</span>
            )}
            {u.user_type && u.user_type.toLowerCase() !== "member" && (
              <span className="badge">{u.user_type}</span>
            )}
          </div>
        </div>
        <div
          className="stack text-sm"
          style={{ gap: "0.25rem", textAlign: "right", minWidth: "10rem" }}
        >
          <HeroKV k="Employee ID" v={u.employee_id} mono />
          <HeroKV k="Manager" v={u.manager_display_name} />
          <HeroKV
            k="Hired"
            v={
              u.employee_hire_date
                ? new Date(u.employee_hire_date).toLocaleDateString()
                : null
            }
          />
          <HeroKV
            k="Devices"
            v={String(detail.assigned_devices.length)}
          />
        </div>
      </div>

      {/* Sign-in advisories */}
      {u.sign_in_status === "permission_missing" && (
        <div className="alert alert-warning">
          Microsoft Graph denied the{" "}
          <code className="font-mono">signInActivity</code> field on the last
          sync. Grant the <strong>AuditLog.Read.All</strong> application
          permission to the Azure AD app registration (with admin consent),
          then re-sync.
        </div>
      )}
      {u.sign_in_status === "license_unavailable" && (
        <div className="alert alert-info">
          Graph returned no <code className="font-mono">signInActivity</code>{" "}
          for any user on the last bulk sync. This usually means the tenant
          lacks an <strong>Entra ID P1 or P2</strong> license (required to
          expose sign-in activity).
        </div>
      )}

      {/* Identity & Org / Contact — 2-column */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
        }}
      >
        <section className="card stack" style={{ padding: "1.5rem" }}>
          <SectionHeader
            icon={<Briefcase size={18} />}
            title="Identity & org"
            tint="purple"
          />
          <div className="stack" style={{ gap: "0.5rem" }}>
            <KV k="Job title" v={u.job_title} />
            <KV k="Company" v={u.company_name} />
            <KV k="Department" v={u.department} />
            <KV k="Employee type" v={u.employee_type} />
            <KV k="Division" v={u.employee_org_division} />
            <KV k="Cost center" v={u.employee_org_cost_center} />
            <KV
              k="Manager"
              v={u.manager_display_name ?? u.manager_id}
            />
            <KVList
              k="Sponsors"
              vs={detail.sponsors.map(
                (s) =>
                  s.display_name ??
                  s.user_principal_name ??
                  s.mail ??
                  s.id,
              )}
            />
            {detail.sponsors_status === "unavailable" && (
              <p className="text-muted text-xs" style={{ margin: 0 }}>
                Sponsors endpoint unavailable — Graph returned 403/404.
              </p>
            )}
            <KV k="Mail nickname" v={u.mail_nickname} mono />
            <KV k="UPN" v={u.user_principal_name} mono />
            <KV k="Object ID" v={u.id} mono />
            <KV k="User type" v={u.user_type} />
          </div>
        </section>

        <section className="card stack" style={{ padding: "1.5rem" }}>
          <SectionHeader
            icon={<Mail size={18} />}
            title="Contact"
            tint="info"
          />
          <div className="stack" style={{ gap: "0.5rem" }}>
            <KV k="Email" v={u.mail} mono />
            <KVList k="Other emails" vs={u.other_mails} mono />
            <KV k="Mobile phone" v={u.mobile_phone} mono />
            <KVList k="Business phones" vs={u.business_phones} mono />
            <KV k="Fax" v={u.fax_number} mono />
            <KV
              k="Address"
              v={address || null}
              icon={<MapPin size={12} />}
            />
            <KVList
              k="Proxy addresses"
              vs={u.proxy_addresses}
              mono
              collapse
            />
            <KVList k="IM addresses" vs={u.im_addresses} mono collapse />
          </div>
        </section>
      </div>

      {/* Activity */}
      <section className="card stack" style={{ padding: "1.5rem" }}>
        <SectionHeader
          icon={<Activity size={18} />}
          title="Activity"
          tint="amber"
          right={<FreshnessCell iso={u.synced_at} />}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.5rem",
          }}
        >
          <KV
            k="Last sign-in"
            v={lastSignInDisplay(u.last_sign_in_at, u.sign_in_status)}
          />
          <KV
            k="Cache synced"
            v={new Date(u.synced_at).toLocaleString()}
          />
        </div>
      </section>

      {/* Assigned devices */}
      <section className="card stack" style={{ padding: "1.5rem" }}>
        <SectionHeader
          icon={<Laptop size={18} />}
          title="Assigned devices"
          tint="green"
          right={
            <div className="cluster" style={{ gap: "0.5rem" }}>
              <span className="text-muted text-sm">
                {detail.assigned_devices.length}{" "}
                {detail.assigned_devices.length === 1 ? "device" : "devices"}
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void openAssign()}
                disabled={showAssign}
              >
                <Plus size={14} />
                Assign device
              </button>
            </div>
          }
        />
        {detail.assigned_devices.length === 0 ? (
          <p className="text-muted text-sm" style={{ margin: 0 }}>
            No devices currently have this user as primary user in Intune.
          </p>
        ) : (
          <DeviceTable
            devices={detail.assigned_devices}
            busyId={busyDevice}
            actionLabel="Unassign"
            actionTone="secondary"
            onAction={(d) => void doUnassign(d)}
          />
        )}
      </section>

      {/* Pending deliveries — shipments + deployments staged for this
          UPN. Hidden when nothing pending (the typical case). */}
      {reservations.length > 0 && (
        <section className="card stack" style={{ padding: "1.5rem" }}>
          <SectionHeader
            icon={<Package size={18} />}
            title="Pending deliveries"
            tint="info"
            right={
              <span className="text-muted text-sm">
                {reservations.length}{" "}
                {reservations.length === 1 ? "asset" : "assets"} reserved
              </span>
            }
          />
          <ul
            className="stack"
            style={{ listStyle: "none", padding: 0, margin: 0, gap: 6 }}
          >
            {reservations.map((r) => {
              const isShipment = r.kind === "shipment";
              return (
                <li
                  key={`${r.kind}-${r.source_id}-${r.asset_id}`}
                  style={{
                    border: "1px solid rgb(var(--color-border) / 0.4)",
                    borderRadius: 8,
                    padding: "0.55rem 0.75rem",
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: "0.75rem",
                    alignItems: "center",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      color: isShipment
                        ? "rgb(var(--color-warning))"
                        : "rgb(var(--color-info))",
                    }}
                  >
                    {isShipment ? <Truck size={15} /> : <Package size={15} />}
                  </span>
                  <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={() => onAssetClick?.(r.asset_id)}
                      disabled={!onAssetClick}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: onAssetClick ? "pointer" : "default",
                        color: onAssetClick
                          ? "rgb(var(--color-primary))"
                          : "rgb(var(--color-text))",
                        fontWeight: 600,
                        textAlign: "left",
                      }}
                      title="Open asset"
                    >
                      {r.intune_device_name?.trim() ||
                        r.asset_tag?.trim() ||
                        r.serial_number}
                    </button>
                    <span className="text-xs text-muted truncate">
                      {r.asset_type}
                      {r.model ? ` · ${r.model}` : ""}
                      {" · "}
                      <span className="font-mono">{r.serial_number}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      isShipment
                        ? onShipmentClick?.(r.source_id)
                        : onDeploymentClick?.(r.source_id)
                    }
                    disabled={
                      isShipment ? !onShipmentClick : !onDeploymentClick
                    }
                  >
                    {isShipment ? r.source_label : r.source_label}
                    <span
                      className="badge"
                      style={{
                        marginLeft: 6,
                        fontSize: "0.65rem",
                        padding: "1px 6px",
                      }}
                    >
                      {r.source_status}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Available pool — only when actively assigning */}
      {showAssign && (
        <section className="card stack" style={{ padding: "1.5rem" }}>
          <SectionHeader
            icon={<ShieldCheck size={18} />}
            title="Available staging pool"
            tint="teal"
            right={
              <div className="cluster" style={{ gap: "0.5rem" }}>
                {pool && (
                  <span className="text-muted text-xs">
                    primaryUser =
                    <span className="font-mono"> {pool.staging_upn}</span>
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setShowAssign(false);
                    setPool(null);
                  }}
                >
                  <X size={14} />
                  Cancel
                </button>
              </div>
            }
          />
          {loadingPool ? (
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              Loading available devices…
            </p>
          ) : !pool || pool.devices.length === 0 ? (
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              No devices in the staging pool. Devices with primaryUser ={" "}
              <code className="font-mono">
                {pool?.staging_upn ?? "(unknown)"}
              </code>{" "}
              appear here.
            </p>
          ) : (
            <DeviceTable
              devices={pool.devices}
              busyId={busyDevice}
              actionLabel="Assign"
              actionTone="primary"
              onAction={(d) => void doAssign(d)}
            />
          )}
        </section>
      )}
    </div>
  );
}

function DeviceTable({
  devices,
  busyId,
  actionLabel,
  actionTone,
  onAction,
}: {
  devices: DeviceSummary[];
  busyId: string | null;
  actionLabel: string;
  actionTone: "primary" | "secondary";
  onAction: (d: DeviceSummary) => void;
}) {
  const btnClass =
    actionTone === "primary"
      ? "btn btn-primary btn-sm"
      : "btn btn-secondary btn-sm";
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Serial</th>
              <th>Manufacturer</th>
              <th>Model</th>
              <th>OS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.intune_id}>
                <td>
                  <div
                    className="cluster"
                    style={{ gap: "0.5rem", flexWrap: "nowrap" }}
                  >
                    <Laptop size={14} style={{ opacity: 0.6 }} />
                    <span className="font-medium">
                      {d.device_name ?? "—"}
                    </span>
                  </div>
                </td>
                <td>
                  <span className="font-mono text-xs">
                    {d.serial_number ?? "—"}
                  </span>
                </td>
                <td>
                  <AccentPill value={d.manufacturer} />
                </td>
                <td>
                  <span className="text-sm">{d.model ?? "—"}</span>
                </td>
                <td>
                  <span className="text-sm">
                    {d.operating_system ?? "—"}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <button
                    type="button"
                    className={btnClass}
                    onClick={() => onAction(d)}
                    disabled={busyId === d.intune_id}
                  >
                    {busyId === d.intune_id ? "…" : actionLabel}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Right-aligned label/value pair used in the hero card. Empty → muted "—". */
function HeroKV({
  k,
  v,
  mono,
}: {
  k: string;
  v: string | null | undefined;
  mono?: boolean;
}) {
  const empty = v === null || v === undefined || v === "";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "0.5rem",
        whiteSpace: "nowrap",
      }}
    >
      <span className="text-muted text-xs uppercase tracking-wide">{k}</span>
      <span
        className={
          (mono ? "font-mono text-sm " : "text-sm ") +
          (empty ? "text-muted" : "")
        }
      >
        {empty ? "—" : v}
      </span>
    </div>
  );
}

function KV({
  k,
  v,
  mono,
  icon,
}: {
  k: string;
  v: string | null | undefined;
  mono?: boolean;
  icon?: ReactNode;
}) {
  const empty = v === null || v === undefined || v === "";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "0.75rem",
        alignItems: "baseline",
      }}
    >
      <span
        className="text-muted text-xs uppercase tracking-wide"
        style={{ flexShrink: 0 }}
      >
        {icon && (
          <span
            style={{
              display: "inline-flex",
              verticalAlign: "middle",
              marginRight: 4,
              opacity: 0.7,
            }}
          >
            {icon}
          </span>
        )}
        {k}
      </span>
      <span
        className={
          (mono ? "font-mono text-sm " : "text-sm ") +
          (empty ? "text-muted" : "") +
          " truncate"
        }
        style={{ textAlign: "right", minWidth: 0 }}
        title={empty ? undefined : (v as string)}
      >
        {empty ? "—" : v}
      </span>
    </div>
  );
}

function KVList({
  k,
  vs,
  mono,
  collapse,
}: {
  k: string;
  vs: string[];
  mono?: boolean;
  /** When true and the list has >0 items, hide behind a "View" toggle. */
  collapse?: boolean;
}) {
  const [open, setOpen] = useState(!collapse);
  const empty = vs.length === 0;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "0.75rem",
        alignItems: "baseline",
      }}
    >
      <span
        className="text-muted text-xs uppercase tracking-wide"
        style={{ flexShrink: 0 }}
      >
        {k}
      </span>
      {empty ? (
        <span className="text-sm text-muted">—</span>
      ) : collapse && !open ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen(true)}
          style={{ padding: "0 0.25rem" }}
        >
          View ({vs.length})
        </button>
      ) : (
        <div
          className="stack"
          style={{
            gap: 2,
            minWidth: 0,
            textAlign: "right",
            alignItems: "flex-end",
          }}
        >
          {vs.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className={
                mono ? "font-mono text-xs truncate" : "text-sm truncate"
              }
              title={v}
            >
              {v}
            </span>
          ))}
          {collapse && (
            <button
              type="button"
              className="btn btn-ghost btn-sm text-xs"
              onClick={() => setOpen(false)}
              style={{ padding: "0 0.25rem" }}
            >
              Collapse
            </button>
          )}
        </div>
      )}
    </div>
  );
}
