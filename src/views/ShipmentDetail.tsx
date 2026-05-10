import { useEffect, useState } from "react";

import {
  cancelShipment,
  getShipment,
  refreshShipment,
  removeShipmentItem,
  resolveShipment,
} from "../services/shipments";
import type {
  Shipment,
  ShipmentCarrierStatus,
  ShipmentEvent,
} from "../types/shipment";
import { useConfirm } from "../components/ConfirmProvider";
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
          ← Back
        </button>
        <div className="cluster">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void doRefresh()}
            disabled={refreshing}
          >
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
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Header */}
      <div className="card">
        <div className="card-body stack">
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <h2 className="heading-2 font-mono">{shipment.tracking_number}</h2>
            <div className="cluster">
              <span className="badge">{shipment.carrier.toUpperCase()}</span>
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
              <span className="badge">{shipment.direction}</span>
            </div>
          </div>
          {shipment.description && <p>{shipment.description}</p>}
          {shipment.last_poll_error && (
            <div className="alert alert-warning">
              Last refresh: {shipment.last_poll_error}
            </div>
          )}
          <div className="grid-2 text-sm">
            <div>
              <div className="eyebrow">From</div>
              <div className="text-muted">{formatAddress(shipment, "from")}</div>
            </div>
            <div>
              <div className="eyebrow">To</div>
              <div className="text-muted">{formatAddress(shipment, "to")}</div>
            </div>
          </div>
          {shipment.notes && (
            <div className="text-sm">
              <div className="eyebrow">Notes</div>
              <p className="text-muted">{shipment.notes}</p>
            </div>
          )}
          <div className="text-muted text-xs">
            {shipment.last_polled_at
              ? `Last refreshed ${new Date(shipment.last_polled_at).toLocaleString()}`
              : "Not yet refreshed"}
          </div>
        </div>
      </div>

      {/* Items */}
      <section className="stack">
        <h3 className="heading-3">Items ({shipment.items.length})</h3>
        <div className="card">
          <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Asset tag</th>
                <th>Serial</th>
                <th>Type</th>
                <th>Model</th>
                <th>Status</th>
                {isOpen && <th></th>}
              </tr>
            </thead>
            <tbody>
              {shipment.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.asset?.asset_tag ?? "—"}</td>
                  <td className="font-mono">{item.asset?.serial_number}</td>
                  <td>{item.asset?.asset_type}</td>
                  <td>
                    {item.asset?.manufacturer}{" "}
                    {item.asset ? friendlyModel(item.asset) : ""}
                  </td>
                  <td>
                    <span className="badge">{item.asset?.status_code}</span>
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
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      {/* Events */}
      <section className="stack">
        <h3 className="heading-3">Carrier events ({sortedEvents.length})</h3>
        {sortedEvents.length === 0 ? (
          <p className="text-muted text-sm">No carrier events yet.</p>
        ) : (
          <ul className="list-clean stack">
            {sortedEvents.map((ev) => (
              <li key={ev.id} className="card card-body">
                <div className="cluster" style={{ justifyContent: "space-between" }}>
                  <span className={carrierStatusBadgeClass(ev.status)}>
                    {CARRIER_STATUS_LABEL[ev.status]}
                  </span>
                  <span className="text-muted text-xs">
                    {new Date(ev.occurred_at).toLocaleString()}
                  </span>
                </div>
                {ev.description && <p className="mt-1">{ev.description}</p>}
                {ev.location && (
                  <p className="text-muted text-xs">{ev.location}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
