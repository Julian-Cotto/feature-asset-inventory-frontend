import { useEffect, useState } from "react";

import Select from "../components/Select";
import { listShipments } from "../services/shipments";
import type {
  Shipment,
  ShipmentCarrierStatus,
  ShipmentResolution,
} from "../types/shipment";

interface Props {
  onSelect: (id: number) => void;
  onCreate: () => void;
}

const CARRIER_STATUS_LABEL: Record<ShipmentCarrierStatus, string> = {
  pending: "Pending",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  exception: "Exception",
  unknown: "Unknown",
};

const RESOLUTION_LABEL: Record<ShipmentResolution, string> = {
  open: "Open",
  resolved: "Resolved",
  cancelled: "Cancelled",
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

function resolutionBadgeClass(r: ShipmentResolution): string {
  switch (r) {
    case "resolved":
      return "badge badge-success";
    case "cancelled":
      return "badge badge-danger";
    default:
      return "badge";
  }
}

export default function Shipments({ onSelect, onCreate }: Props) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState("");
  const [resolution, setResolution] = useState("");
  const [q, setQ] = useState("");

  const reload = async () => {
    try {
      const data = await listShipments({
        direction: direction || undefined,
        resolution: resolution || undefined,
        q: q || undefined,
        limit: 200,
      });
      setShipments(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  };

  useEffect(() => {
    void reload();
  }, [direction, resolution]);

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Shipments</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={onCreate}>
          New shipment
        </button>
      </div>

      <div className="toolbar">
        <input
          className="input"
          placeholder="Search tracking / description"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void reload()}
        />
        <Select
          value={direction}
          onChange={setDirection}
          placeholder="All directions"
          options={[
            { value: "", label: "All directions" },
            { value: "outbound", label: "Outbound" },
            { value: "inbound", label: "Inbound" },
          ]}
        />
        <Select
          value={resolution}
          onChange={setResolution}
          placeholder="All states"
          options={[
            { value: "", label: "All states" },
            { value: "open", label: "Open" },
            { value: "resolved", label: "Resolved" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void reload()}
        >
          Search
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Tracking</th>
              <th>Carrier</th>
              <th>Direction</th>
              <th>Items</th>
              <th>Carrier status</th>
              <th>State</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((s) => (
              <tr
                key={s.id}
                className="row-clickable"
                onClick={() => onSelect(s.id)}
              >
                <td className="font-mono">{s.tracking_number}</td>
                <td>
                  <span className="badge">{s.carrier.toUpperCase()}</span>
                </td>
                <td>{s.direction}</td>
                <td>{s.items.length}</td>
                <td>
                  <span className={carrierStatusBadgeClass(s.carrier_status)}>
                    {CARRIER_STATUS_LABEL[s.carrier_status]}
                  </span>
                </td>
                <td>
                  <span className={resolutionBadgeClass(s.resolution)}>
                    {RESOLUTION_LABEL[s.resolution]}
                  </span>
                </td>
                <td className="text-muted">
                  {new Date(s.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {shipments.length === 0 && (
          <p className="text-muted text-sm p-4">No shipments.</p>
        )}
      </div>
    </div>
  );
}
