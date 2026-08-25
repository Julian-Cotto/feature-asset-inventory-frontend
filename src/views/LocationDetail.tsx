/** Location detail — assets at this location + inbound/outbound shipments
 *  + deployments targeting it. Read-only summary; mutation continues to
 *  happen in the Locations list view (edit) and the
 *  Deployment/Shipment forms (location picker). */

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  Laptop,
  MapPin,
  Package,
  Truck,
  Warehouse,
} from "lucide-react";

import EntityHistoryList from "../components/EntityHistoryList";
import { SectionHeader } from "../components/visual";
import {
  countAssets,
  getLocation,
  getLocationReservations,
  listAssets,
  type LocationReservationDeploymentRow,
  type LocationReservationShipmentRow,
  type LocationReservations,
} from "../services/inventory";
import type { Asset, Location } from "../types/inventory";

interface Props {
  locationId: number;
  onBack: () => void;
  onAssetClick?: (id: number) => void;
  onDeploymentClick?: (id: number) => void;
  onShipmentClick?: (id: number) => void;
}

function parseUtc(iso: string | null): number | null {
  if (!iso) return null;
  const hasTz =
    iso.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(iso.split("T")[1] ?? "");
  const ts = new Date(hasTz ? iso : iso + "Z").getTime();
  return ts || null;
}

function relTime(iso: string | null): string {
  const ts = parseUtc(iso);
  if (!ts) return "—";
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

function addressSummary(l: Location): string {
  const parts = [
    l.address,
    l.address_line1,
    l.address_line2,
    [l.city, l.state, l.postal_code].filter(Boolean).join(", "),
    l.country,
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  return parts.join(" · ") || "—";
}

const CELL: CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid rgb(var(--color-border) / 0.25)",
  verticalAlign: "middle",
};

export default function LocationDetail({
  locationId,
  onBack,
  onAssetClick,
  onDeploymentClick,
  onShipmentClick,
}: Props) {
  const [location, setLocation] = useState<Location | null>(null);
  const [assetCount, setAssetCount] = useState<number | null>(null);
  const [assetSample, setAssetSample] = useState<Asset[]>([]);
  const [reservations, setReservations] = useState<LocationReservations | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getLocation(locationId),
      countAssets({ location_id: locationId }),
      listAssets({ location_id: locationId, limit: 8 }),
      getLocationReservations(locationId),
    ])
      .then(([loc, c, sample, res]) => {
        setLocation(loc);
        setAssetCount(c.total);
        setAssetSample(sample);
        setReservations(res);
        setError(null);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  }, [locationId]);

  const inboundCount = reservations?.shipments_inbound.length ?? 0;
  const outboundCount = reservations?.shipments_outbound.length ?? 0;
  const deploymentCount = reservations?.deployments.length ?? 0;

  const heroIcon = useMemo(() => {
    if (location?.type === "warehouse") return <Warehouse size={22} />;
    return <MapPin size={22} />;
  }, [location?.type]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (loading || !location) return <p className="text-muted">Loading…</p>;

  return (
    <div className="stack-lg">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onBack}
        style={{ alignSelf: "flex-start" }}
      >
        <ChevronLeft size={14} />
        Back to locations
      </button>

      {/* Hero */}
      <section
        className="card"
        style={{
          padding: "1.5rem",
          display: "grid",
          gridTemplateColumns: "auto 1fr",
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
            background:
              location.type === "warehouse"
                ? "rgb(from rgb(var(--color-info)) r g b / 0.16)"
                : "rgb(from rgb(var(--color-success)) r g b / 0.16)",
            color:
              location.type === "warehouse"
                ? "rgb(var(--color-info))"
                : "rgb(var(--color-success))",
          }}
        >
          {heroIcon}
        </div>
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          <h2 className="heading-2" style={{ margin: 0 }}>
            {location.name}
          </h2>
          <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <span className="font-mono text-xs text-muted">{location.code}</span>
            <span className="badge">{location.type}</span>
            {!location.is_active && (
              <span
                className="badge"
                style={{
                  background:
                    "rgb(from rgb(var(--color-warning)) r g b / 0.16)",
                  color: "rgb(var(--color-warning))",
                  borderColor: "transparent",
                }}
              >
                inactive
              </span>
            )}
          </div>
          <span className="text-sm text-muted">
            {addressSummary(location)}
          </span>
        </div>
      </section>

      {/* Summary tiles */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
          gap: "0.75rem",
        }}
      >
        <Tile
          icon={<Laptop size={16} />}
          label="Assets here"
          value={assetCount ?? 0}
          tint="primary"
        />
        <Tile
          icon={<Package size={16} />}
          label="Deployments"
          value={deploymentCount}
          tint="info"
        />
        <Tile
          icon={<ArrowDownToLine size={16} />}
          label="Inbound shipments"
          value={inboundCount}
          tint="success"
        />
        <Tile
          icon={<ArrowUpFromLine size={16} />}
          label="Outbound shipments"
          value={outboundCount}
          tint="warning"
        />
      </div>

      {/* Assets at this location (sample) */}
      <section className="card stack" style={{ padding: "1.5rem" }}>
        <SectionHeader
          icon={<Laptop size={18} />}
          title="Assets at this location"
          tint="purple"
          right={
            <span className="text-muted text-sm">
              {assetSample.length} of {assetCount ?? 0} shown
            </span>
          }
        />
        {assetSample.length === 0 ? (
          <p className="text-muted text-sm" style={{ fontStyle: "italic" }}>
            No assets currently assigned here.
          </p>
        ) : (
          <ul
            className="stack"
            style={{ listStyle: "none", padding: 0, margin: 0, gap: 6 }}
          >
            {assetSample.map((a) => {
              const model =
                a.override_model?.trim() ||
                [a.series, a.generation].filter(Boolean).join(" ").trim() ||
                a.model?.trim() ||
                "—";
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
                      border: "1px solid rgb(var(--color-border) / 0.4)",
                      borderRadius: 8,
                      cursor: onAssetClick ? "pointer" : "default",
                      color: "rgb(var(--color-text))",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: "0.75rem",
                      alignItems: "center",
                    }}
                  >
                    <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                      <span className="font-medium truncate">
                        {a.intune_device_name?.trim() ||
                          a.asset_tag?.trim() ||
                          a.serial_number}
                      </span>
                      <span className="text-xs text-muted truncate">
                        {a.asset_type}
                        {model !== "—" ? ` · ${model}` : ""}
                        {" · "}
                        <span className="font-mono">{a.serial_number}</span>
                      </span>
                    </div>
                    <span
                      className="badge"
                      style={{ fontSize: "0.7rem", padding: "2px 8px" }}
                    >
                      {a.status_code}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Deployments */}
      <section className="card stack" style={{ padding: "1.5rem" }}>
        <SectionHeader
          icon={<Package size={18} />}
          title="Deployments targeting this location"
          tint="teal"
        />
        {deploymentCount === 0 ? (
          <p className="text-muted text-sm" style={{ fontStyle: "italic" }}>
            None.
          </p>
        ) : (
          <DeploymentTable
            rows={reservations?.deployments ?? []}
            onSelect={onDeploymentClick}
          />
        )}
      </section>

      {/* Shipments inbound */}
      <section className="card stack" style={{ padding: "1.5rem" }}>
        <SectionHeader
          icon={<ArrowDownToLine size={18} />}
          title="Inbound shipments"
          tint="green"
        />
        {inboundCount === 0 ? (
          <p className="text-muted text-sm" style={{ fontStyle: "italic" }}>
            None.
          </p>
        ) : (
          <ShipmentTable
            rows={reservations?.shipments_inbound ?? []}
            onSelect={onShipmentClick}
          />
        )}
      </section>

      {/* Shipments outbound */}
      <section className="card stack" style={{ padding: "1.5rem" }}>
        <SectionHeader
          icon={<ArrowUpFromLine size={18} />}
          title="Outbound shipments"
          tint="amber"
        />
        {outboundCount === 0 ? (
          <p className="text-muted text-sm" style={{ fontStyle: "italic" }}>
            None.
          </p>
        ) : (
          <ShipmentTable
            rows={reservations?.shipments_outbound ?? []}
            onSelect={onShipmentClick}
          />
        )}
      </section>

      <EntityHistoryList entityType="location" entityId={locationId} />
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tint: "primary" | "info" | "success" | "warning";
}) {
  return (
    <div
      className="card"
      style={{
        padding: "0.85rem 1rem",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span
        className="cluster text-xs text-muted"
        style={{ gap: 6, alignItems: "center", color: `rgb(var(--color-${tint}))` }}
      >
        {icon}
        {label}
      </span>
      <span className="heading-2" style={{ margin: 0 }}>
        {value}
      </span>
    </div>
  );
}

function DeploymentTable({
  rows,
  onSelect,
}: {
  rows: LocationReservationDeploymentRow[];
  onSelect?: (id: number) => void;
}) {
  return (
    <div className="scroll-x">
      <table className="table" style={{ margin: 0 }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Status</th>
            <th>Items</th>
            <th>Target date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr
              key={d.id}
              className={onSelect ? "row-clickable" : undefined}
              onClick={onSelect ? () => onSelect(d.id) : undefined}
            >
              <td style={CELL}>
                <span className="font-medium">{d.name}</span>
              </td>
              <td style={CELL}>
                <span className="text-muted">{d.type ?? "—"}</span>
              </td>
              <td style={CELL}>
                <span className="badge">{d.status}</span>
              </td>
              <td style={CELL}>{d.item_count}</td>
              <td style={CELL}>
                <span
                  className="text-muted text-xs"
                  title={
                    d.target_date
                      ? new Date(parseUtc(d.target_date) ?? 0).toLocaleString()
                      : ""
                  }
                >
                  {d.target_date ? relTime(d.target_date) : "—"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShipmentTable({
  rows,
  onSelect,
}: {
  rows: LocationReservationShipmentRow[];
  onSelect?: (id: number) => void;
}) {
  return (
    <div className="scroll-x">
      <table className="table" style={{ margin: 0 }}>
        <thead>
          <tr>
            <th>Tracking</th>
            <th>Carrier</th>
            <th>Status</th>
            <th>Items</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={s.id}
              className={onSelect ? "row-clickable" : undefined}
              onClick={onSelect ? () => onSelect(s.id) : undefined}
            >
              <td style={CELL}>
                <span className="cluster" style={{ gap: 6, alignItems: "center" }}>
                  <Truck size={13} />
                  <span className="font-mono text-sm">{s.label}</span>
                </span>
              </td>
              <td style={CELL}>
                <span className="text-muted">{s.carrier ?? "—"}</span>
              </td>
              <td style={CELL}>
                <span className="badge">{s.carrier_status ?? "—"}</span>
              </td>
              <td style={CELL}>{s.item_count}</td>
              <td style={CELL}>
                <span
                  className="text-muted text-xs"
                  title={new Date(parseUtc(s.created_at) ?? 0).toLocaleString()}
                >
                  {relTime(s.created_at)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
