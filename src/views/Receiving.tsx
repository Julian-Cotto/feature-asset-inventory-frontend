import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { useToast } from "../components/ToastProvider";
import { AccentPill, FreshnessCell } from "../components/visual";
import { listShipments } from "../services/shipments";
import type { Shipment, ShipmentCarrierStatus } from "../types/shipment";

interface Props {
  onShipmentClick?: (id: number) => void;
}

// Mirrors the labels/tones used on the Shipments list view (not exported from
// there) so the receiving queue reads with the same vocabulary.
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

// A shipment is "awaiting receipt" while it's inbound, still open, not archived,
// and the carrier hasn't reported it delivered yet. The delivered case is the
// only non-terminal carrier_status we exclude client-side — the rest of the
// terminal filtering (resolution/archived) is done by the API query below.
function isAwaitingReceipt(s: Shipment): boolean {
  return s.carrier_status !== "delivered";
}

function originLabel(s: Shipment): string | null {
  const cityState = [s.from_city, s.from_state].filter(Boolean).join(", ");
  return cityState || s.from_address_line1 || null;
}

export default function Receiving({ onShipmentClick }: Props) {
  const toast = useToast();

  const [rows, setRows] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setLoading(true);
    return listShipments({
      direction: "inbound",
      resolution: "open",
      archived: false,
      limit: 200,
    })
      .then((data) => {
        setRows(data.filter(isAwaitingReceipt));
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await toast.run(() => load(), {
        pending: "Refreshing receiving queue…",
        success: "Queue up to date",
        error: "Failed to refresh queue",
      });
    } catch {
      /* toast surfaced */
    } finally {
      setRefreshing(false);
    }
  };

  const counts = useMemo(() => {
    let inTransit = 0;
    let outForDelivery = 0;
    for (const s of rows) {
      if (s.carrier_status === "in_transit") inTransit += 1;
      else if (s.carrier_status === "out_for_delivery") outForDelivery += 1;
    }
    return { pending: rows.length, inTransit, outForDelivery };
  }, [rows]);

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Receiving</h2>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void refresh()}
          disabled={refreshing}
          title="Reload the inbound shipments awaiting receipt"
        >
          <RefreshCw
            size={14}
            className={refreshing ? "animate-spin" : ""}
            strokeWidth={1.75}
          />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <StatTile label="Inbound pending" value={counts.pending} tone="neutral" />
        <StatTile label="In transit" value={counts.inTransit} tone="warning" />
        <StatTile label="Out for delivery" value={counts.outForDelivery} tone="success" />
      </div>

      <div className="card">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Tracking</th>
                <th>Carrier</th>
                <th>From</th>
                <th>Status</th>
                <th>Items</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  className="row-clickable"
                  onClick={() => onShipmentClick?.(s.id)}
                >
                  <td>
                    <span className="font-mono text-xs">{s.tracking_number}</span>
                  </td>
                  <td>
                    <AccentPill value={s.carrier.toUpperCase()} />
                  </td>
                  <td>
                    {originLabel(s) ?? <span className="text-muted">—</span>}
                  </td>
                  <td>
                    <span className={carrierStatusBadgeClass(s.carrier_status)}>
                      {CARRIER_STATUS_LABEL[s.carrier_status]}
                    </span>
                  </td>
                  <td>{s.items.length}</td>
                  <td>
                    <FreshnessCell iso={s.last_polled_at ?? s.updated_at} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    {loading
                      ? "Loading…"
                      : "No inbound shipments awaiting receipt."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const TILE_TONES: Record<string, string> = {
  neutral: "var(--color-text-muted)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning" | "danger";
}) {
  const color = TILE_TONES[tone];
  const active = tone !== "neutral" && value > 0;
  return (
    <div
      className="card"
      style={{
        padding: "0.75rem 1rem",
        borderLeft: `3px solid rgb(${color} / ${active ? 1 : 0.35})`,
      }}
    >
      <div
        className="heading-2"
        style={{ margin: 0, color: active ? `rgb(${color})` : undefined }}
      >
        {value}
      </div>
      <div className="text-xs text-muted" style={{ marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
