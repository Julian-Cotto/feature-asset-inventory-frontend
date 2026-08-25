import { useEffect, useMemo, useState } from "react";

import Select from "../components/Select";
import { StatTile, StatTileRow } from "../components/StatTile";
import { listReservations } from "../services/inventory";
import type { ReservationRow } from "../types/inventory";
import { assetTypeBadgeClass, assetTypeLabel } from "../utils/assetTypeBadge";

interface Props {
  onSelect?: (row: ReservationRow) => void;
  onDeploymentClick?: (id: number) => void;
  onShipmentClick?: (id: number) => void;
}

export default function Reservations({
  onSelect,
  onDeploymentClick,
  onShipmentClick,
}: Props) {
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<string>("");
  const [q, setQ] = useState("");

  async function reload() {
    try {
      setRows(await listReservations());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reservations");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (kindFilter && r.kind !== kindFilter) return false;
      if (!term) return true;
      return (
        r.serial_number.toLowerCase().includes(term) ||
        (r.intune_device_name ?? "").toLowerCase().includes(term) ||
        (r.model ?? "").toLowerCase().includes(term) ||
        r.source_label.toLowerCase().includes(term) ||
        (r.destination ?? "").toLowerCase().includes(term) ||
        (r.assigned_upn ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, q, kindFilter]);

  const counts = useMemo(() => {
    const dep = rows.filter((r) => r.kind === "deployment").length;
    const ship = rows.filter((r) => r.kind === "shipment").length;
    const inTransit = rows.filter((r) => r.source_status === "in_transit").length;
    return { total: rows.length, dep, ship, inTransit };
  }, [rows]);

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Reservations</h2>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <StatTileRow>
        <StatTile label="Reservations" value={counts.total} tone="neutral" />
        <StatTile label="Via deployment" value={counts.dep} tone="neutral" />
        <StatTile label="Via shipment" value={counts.ship} tone="neutral" />
        <StatTile label="In transit" value={counts.inTransit} tone="warning" />
      </StatTileRow>

      <div className="toolbar">
        <input
          className="input"
          placeholder="Search serial / device / model / destination / assignee"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          value={kindFilter}
          onChange={setKindFilter}
          placeholder="All kinds"
          options={[
            { value: "", label: "All kinds" },
            { value: "deployment", label: "Deployment" },
            { value: "shipment", label: "Shipment" },
          ]}
        />
      </div>

      <div className="card hidden sm:block">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Type</th>
                <th>Model</th>
                <th>Kind</th>
                <th>Source</th>
                <th>Status</th>
                <th>Destination</th>
                <th>Assigned</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={`${r.kind}-${r.source_id}-${r.asset_id}`}
                  className={onSelect ? "row-clickable" : ""}
                  onClick={() => onSelect?.(r)}
                >
                  <td className="font-medium">
                    {r.intune_device_name ?? r.serial_number}
                  </td>
                  <td>
                    <span className={assetTypeBadgeClass(r.asset_type)}>
                      {assetTypeLabel(r.asset_type)}
                    </span>
                  </td>
                  <td className="max-w-[22ch]">
                    <span
                      className="block truncate"
                      title={`${r.manufacturer ?? ""} ${r.model ?? ""}`.trim()}
                    >
                      {r.manufacturer} {r.model ?? "—"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        r.kind === "deployment"
                          ? "badge badge-soft"
                          : "badge badge-warning"
                      }
                    >
                      {r.kind}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (r.kind === "deployment") {
                          onDeploymentClick?.(r.source_id);
                        } else {
                          onShipmentClick?.(r.source_id);
                        }
                      }}
                      title={r.source_label}
                    >
                      {r.source_label}
                    </button>
                  </td>
                  <td>
                    <span className="text-xs text-text-muted">
                      {r.source_status}
                    </span>
                  </td>
                  <td className="max-w-[20ch]">
                    <span className="block truncate" title={r.destination ?? ""}>
                      {r.destination ?? "—"}
                    </span>
                  </td>
                  <td className="max-w-[24ch]">
                    {r.assigned_upn ? (
                      <span className="block truncate" title={r.assigned_upn}>
                        {r.assigned_upn}
                      </span>
                    ) : (
                      <span className="text-muted italic">unassigned</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="text-muted text-sm p-4">No reservations.</p>
        )}
      </div>

      {/* Mobile card list */}
      <ul className="list-clean stack sm:hidden">
        {filtered.map((r) => (
          <li
            key={`${r.kind}-${r.source_id}-${r.asset_id}`}
            className="card card-body cursor-pointer"
            onClick={() => onSelect?.(r)}
          >
            <div className="cluster" style={{ justifyContent: "space-between" }}>
              <span className="font-semibold">
                {r.intune_device_name ?? r.serial_number}
              </span>
              <span
                className={
                  r.kind === "deployment"
                    ? "badge badge-soft"
                    : "badge badge-warning"
                }
              >
                {r.kind}
              </span>
            </div>
            <div className="text-sm text-text-muted mt-1">
              {r.manufacturer} {r.model}
            </div>
            <div className="text-xs text-text-muted mt-1">
              → {r.destination ?? "—"} · {r.source_label}
            </div>
            {r.assigned_upn && (
              <div className="text-xs text-text-muted mt-1">
                {r.assigned_upn}
              </div>
            )}
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="card card-body text-muted text-sm">No reservations.</li>
        )}
      </ul>
    </div>
  );
}
