import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  History,
  MapPin,
  RefreshCw,
} from "lucide-react";

import {
  archiveShipment,
  cancelShipment,
  deleteShipment,
  getShipment,
  refreshShipment,
  removeShipmentItem,
  resolveShipment,
  unarchiveShipment,
} from "../services/shipments";
import type {
  Shipment,
  ShipmentCarrierStatus,
  ShipmentEvent,
} from "../types/shipment";
import { useConfirm } from "../components/ConfirmProvider";
import EntityHistoryList from "../components/EntityHistoryList";
import {
  AccentPill,
  Avatar,
  FreshnessCell,
  SectionHeader,
} from "../components/visual";
import { friendlyModel } from "../utils/friendlyModel";

interface Props {
  shipmentId: number;
  onBack: () => void;
}

const CARRIER_STATUS_LABEL: Record<ShipmentCarrierStatus, string> = {
  pending: "Pending",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  exception: "Exception",
  unknown: "Unknown",
};

function carrierStatusBadgeClass(s: ShipmentCarrierStatus): string {
  switch (s) {
    case "delivered":
      return "badge badge-success";
    case "exception":
      return "badge badge-danger";
    case "out_for_delivery":
    case "in_transit":
      return "badge badge-soft";
    default:
      return "badge";
  }
}

function formatAddress(s: Shipment, prefix: "to" | "from"): string {
  const k = (suffix: string) =>
    (s as unknown as Record<string, string | null>)[`${prefix}_${suffix}`];
  const parts = [
    k("address_line1"),
    k("address_line2"),
    [k("city"), k("state")].filter(Boolean).join(", "),
    k("postal_code"),
    k("country"),
  ].filter(Boolean) as string[];
  return parts.join(" · ") || "—";
}

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export default function ShipmentDetail({ shipmentId, onBack }: Props) {
  const confirm = useConfirm();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await getShipment(shipmentId, true);
      setShipment(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shipment");
    }
  };

  useEffect(() => {
    void load();
    // 15-minute auto-refresh while detail is open
    const timer = window.setInterval(() => {
      void doRefresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId]);

  async function doRefresh() {
    setRefreshing(true);
    try {
      const data = await refreshShipment(shipmentId);
      setShipment(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function doResolve() {
    try {
      const data = await resolveShipment(shipmentId);
      setShipment(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resolve failed");
    }
  }

  async function doCancel() {
    const ok = await confirm({
      title: "Cancel shipment?",
      message: "This cannot be undone.",
      tone: "danger",
      confirmLabel: "Cancel shipment",
      cancelLabel: "Keep",
    });
    if (!ok) return;
    try {
      const data = await cancelShipment(shipmentId);
      setShipment(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    }
  }

  async function doArchive() {
    try {
      const data = shipment?.archived_at
        ? await unarchiveShipment(shipmentId)
        : await archiveShipment(shipmentId);
      setShipment(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive failed");
    }
  }

  async function doDelete() {
    const ok = await confirm({
      title: "Delete shipment?",
      message:
        "Permanently delete this shipment along with its items and events. Cannot be undone.",
      tone: "danger",
      confirmLabel: "Delete forever",
    });
    if (!ok) return;
    try {
      await deleteShipment(shipmentId);
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function doRemoveItem(itemId: number) {
    const ok = await confirm({
      title: "Remove asset?",
      message: "Remove this asset from the shipment?",
      tone: "warning",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await removeShipmentItem(shipmentId, itemId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    }
  }

  if (!shipment) {
    return (
      <div className="stack">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          ← Back
        </button>
        {error ? (
          <div className="alert alert-error">{error}</div>
        ) : (
          <p className="text-muted">Loading shipment…</p>
        )}
      </div>
    );
  }

  const isOpen = shipment.resolution === "open";
  const sortedEvents = [...shipment.events].sort(
    (a: ShipmentEvent, b: ShipmentEvent) =>
      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <div className="cluster">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void doRefresh()}
            disabled={refreshing}
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : ""}
              strokeWidth={1.75}
            />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          {isOpen && shipment.carrier_status === "delivered" && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void doResolve()}
            >
              Mark resolved
            </button>
          )}
          {isOpen && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => void doCancel()}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void doArchive()}
            title={shipment.archived_at ? "Restore from archive" : "Hide from default list"}
          >
            {shipment.archived_at ? "Unarchive" : "Archive"}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => void doDelete()}
            title="Permanently delete"
          >
            Delete
          </button>
        </div>
      </div>

      <div
        className="card card-body cluster"
        style={{ gap: "0.875rem", alignItems: "center" }}
      >
        <Avatar
          seed={shipment.tracking_number}
          name={shipment.carrier.toUpperCase()}
        />
        <div className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
          <div
            className="cluster"
            style={{ gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}
          >
            <span className="heading-2 font-mono" style={{ margin: 0 }}>
              {shipment.tracking_number}
            </span>
            {shipment.archived_at && (
              <span className="badge badge-danger">Archived</span>
            )}
          </div>
          <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <AccentPill value={shipment.carrier.toUpperCase()} />
            <span className={carrierStatusBadgeClass(shipment.carrier_status)}>
              {CARRIER_STATUS_LABEL[shipment.carrier_status]}
            </span>
            <span
              className={
                shipment.resolution === "resolved"
                  ? "badge badge-success"
                  : shipment.resolution === "cancelled"
                    ? "badge badge-danger"
                    : "badge"
              }
            >
              {shipment.resolution}
            </span>
            <AccentPill value={shipment.direction} />
          </div>
        </div>
        <div className="stack" style={{ gap: 2, alignItems: "flex-end" }}>
          <span className="text-xs eyebrow">Last refreshed</span>
          <FreshnessCell
            iso={shipment.last_polled_at}
            fallback="never refreshed"
          />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {shipment.last_poll_error && (
        <div className="alert alert-warning">
          Last refresh: {shipment.last_poll_error}
        </div>
      )}

      <div className="card card-body stack">
        <SectionHeader
          icon={<MapPin size={16} />}
          title="Routing"
          tint="info"
        />
        {shipment.description && (
          <p className="text-sm">{shipment.description}</p>
        )}
        <div className="grid-2 text-sm">
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">From</span>
            <span className="text-sm">{formatAddress(shipment, "from")}</span>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">To</span>
            <span className="text-sm">{formatAddress(shipment, "to")}</span>
          </div>
        </div>
        {shipment.notes && (
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">Notes</span>
            <p className="text-sm text-muted">{shipment.notes}</p>
          </div>
        )}
      </div>

      <div className="card card-body stack">
        <SectionHeader
          icon={<Boxes size={16} />}
          title={`Items (${shipment.items.length})`}
          tint="purple"
        />
        {shipment.items.length === 0 ? (
          <p className="text-muted text-sm">No assets on this shipment.</p>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Serial</th>
                  <th>Type</th>
                  <th>Model</th>
                  <th>Status</th>
                  {isOpen && <th></th>}
                </tr>
              </thead>
              <tbody>
                {shipment.items.map((item) => {
                  const seed =
                    item.asset?.serial_number ?? String(item.id);
                  const name =
                    item.asset?.asset_tag ??
                    item.asset?.serial_number ??
                    "—";
                  return (
                    <tr key={item.id}>
                      <td>
                        <div
                          className="cluster"
                          style={{ gap: "0.625rem", flexWrap: "nowrap" }}
                        >
                          <Avatar seed={seed} name={name} />
                          <span className="font-medium truncate">
                            {item.asset?.asset_tag ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td className="font-mono">{item.asset?.serial_number}</td>
                      <td>
                        <AccentPill value={item.asset?.asset_type ?? null} />
                      </td>
                      <td>
                        {item.asset?.manufacturer}{" "}
                        {item.asset ? friendlyModel(item.asset) : ""}
                      </td>
                      <td>
                        <AccentPill value={item.asset?.status_code ?? null} />
                      </td>
                      {isOpen && (
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => void doRemoveItem(item.id)}
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card-body stack">
        <SectionHeader
          icon={<History size={16} />}
          title={`Carrier events (${sortedEvents.length})`}
          tint="amber"
        />
        {sortedEvents.length === 0 ? (
          <p className="text-muted text-sm">No carrier events yet.</p>
        ) : (
          <ul className="stack" style={{ gap: "0.5rem" }}>
            {sortedEvents.map((ev) => (
              <li
                key={ev.id}
                className="stack"
                style={{
                  gap: 4,
                  padding: "0.625rem 0.75rem",
                  borderRadius: 8,
                  background: "rgb(var(--color-bg) / 0.4)",
                  borderLeft: "3px solid rgb(var(--color-primary))",
                }}
              >
                <div
                  className="cluster"
                  style={{ justifyContent: "space-between" }}
                >
                  <span className={carrierStatusBadgeClass(ev.status)}>
                    {CARRIER_STATUS_LABEL[ev.status]}
                  </span>
                  <span
                    className="text-muted text-xs"
                    title={new Date(ev.occurred_at).toLocaleString()}
                  >
                    {new Date(ev.occurred_at).toLocaleString()}
                  </span>
                </div>
                {ev.description && (
                  <p className="text-sm">{ev.description}</p>
                )}
                {ev.location && (
                  <p className="text-muted text-xs">{ev.location}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <EntityHistoryList entityType="shipment" entityId={shipmentId} />
    </div>
  );
}
