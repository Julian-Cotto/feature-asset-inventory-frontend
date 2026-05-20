import { useEffect, useState } from "react";
import { ArrowLeft, Boxes, MapPin, Package, Truck } from "lucide-react";

import { getAsset, getLocation } from "../services/inventory";
import { getDeployment } from "../services/deployments";
import { getShipment } from "../services/shipments";
import type { Asset, Location, ReservationRow } from "../types/inventory";
import type { Deployment } from "../types/deployment";
import type { Shipment } from "../types/shipment";
import { AccentPill, Avatar, SectionHeader } from "../components/visual";
import { assetTypeBadgeClass, assetTypeLabel } from "../utils/assetTypeBadge";
import { friendlyModel } from "../utils/friendlyModel";

interface Props {
  row: ReservationRow;
  onBack: () => void;
  onAssetClick: (id: number) => void;
  onDeploymentClick: (id: number) => void;
  onShipmentClick: (id: number) => void;
}

interface AddressLike {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function joinAddress(a: AddressLike): string {
  return [a.line1, a.line2, a.city, a.state, a.postal_code, a.country]
    .filter(Boolean)
    .join(", ");
}

export default function ReservationDetail({
  row,
  onBack,
  onAssetClick,
  onDeploymentClick,
  onShipmentClick,
}: Props) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const a = await getAsset(row.asset_id);
        if (cancelled) return;
        setAsset(a);

        let locId: number | null = null;
        if (row.kind === "deployment") {
          const d = await getDeployment(row.source_id);
          if (cancelled) return;
          setDeployment(d);
          locId = d.target_location_id;
        } else {
          const s = await getShipment(row.source_id, false);
          if (cancelled) return;
          setShipment(s);
          locId = s.to_location_id;
        }

        if (locId != null) {
          const loc = await getLocation(locId);
          if (cancelled) return;
          setLocation(loc);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load reservation");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row.asset_id, row.kind, row.source_id]);

  const headerName = row.intune_device_name ?? row.serial_number;

  const address: AddressLike | null = (() => {
    if (location) {
      return {
        line1: location.address_line1,
        line2: location.address_line2,
        city: location.city,
        state: location.state,
        postal_code: location.postal_code,
        country: location.country,
      };
    }
    if (deployment) {
      return {
        line1: deployment.target_address_line1,
        line2: deployment.target_address_line2,
        city: deployment.target_city,
        state: deployment.target_state,
        postal_code: deployment.target_postal_code,
        country: deployment.target_country,
      };
    }
    if (shipment) {
      return {
        line1: shipment.to_address_line1,
        line2: shipment.to_address_line2,
        city: shipment.to_city,
        state: shipment.to_state,
        postal_code: shipment.to_postal_code,
        country: shipment.to_country,
      };
    }
    return null;
  })();

  const sourceLocationLabel =
    location?.name ??
    row.destination ??
    (address && joinAddress(address) ? joinAddress(address) : "Unknown");

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onBack}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onAssetClick(row.asset_id)}
        >
          View asset
        </button>
      </div>

      <div
        className="card card-body cluster"
        style={{ gap: "0.875rem", alignItems: "center" }}
      >
        <Avatar seed={row.serial_number} name={headerName} />
        <div className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
          <div
            className="cluster"
            style={{ gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}
          >
            <span className="heading-2" style={{ margin: 0 }}>
              {headerName}
            </span>
            <span
              className={
                row.kind === "deployment"
                  ? "badge badge-info"
                  : "badge badge-warning"
              }
            >
              {row.kind}
            </span>
          </div>
          <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <span className={assetTypeBadgeClass(row.asset_type)}>
              {assetTypeLabel(row.asset_type)}
            </span>
            <AccentPill value={row.manufacturer} />
            <span className="font-mono text-xs text-muted">
              {row.serial_number}
            </span>
          </div>
        </div>
        <div className="stack" style={{ gap: 2, alignItems: "flex-end" }}>
          <span className="text-xs eyebrow">Reserved at</span>
          <span className="text-sm font-medium truncate">
            {sourceLocationLabel}
          </span>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card card-body stack">
          <SectionHeader
            icon={<Package size={16} />}
            title="Item"
            tint="info"
          />
          <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <span className="font-semibold">
              {asset?.intune_device_name ?? row.serial_number}
            </span>
            <span className={assetTypeBadgeClass(row.asset_type)}>
              {assetTypeLabel(row.asset_type)}
            </span>
          </div>
          <div className="text-sm">
            {row.manufacturer ?? ""}{" "}
            {asset ? friendlyModel(asset) : row.model ?? ""}
          </div>
          <dl
            className="grid grid-cols-2 text-sm"
            style={{ columnGap: "0.75rem", rowGap: "0.25rem" }}
          >
            <dt className="text-text-muted">Serial</dt>
            <dd className="font-mono">{row.serial_number}</dd>
            {row.asset_tag && (
              <>
                <dt className="text-text-muted">Tag</dt>
                <dd className="font-mono">{row.asset_tag}</dd>
              </>
            )}
            {asset?.os && (
              <>
                <dt className="text-text-muted">OS</dt>
                <dd>
                  {asset.os}
                  {asset.os_version ? ` ${asset.os_version}` : ""}
                </dd>
              </>
            )}
            {(asset?.assigned_upn ?? row.assigned_upn) && (
              <>
                <dt className="text-text-muted">Assigned</dt>
                <dd className="font-mono text-xs">
                  {asset?.assigned_upn ?? row.assigned_upn}
                </dd>
              </>
            )}
            {asset?.location_name && (
              <>
                <dt className="text-text-muted">Current location</dt>
                <dd>{asset.location_name}</dd>
              </>
            )}
          </dl>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onAssetClick(row.asset_id)}
          >
            View full asset details
          </button>
        </div>

        <div className="card card-body stack">
          <SectionHeader
            icon={<MapPin size={16} />}
            title="Reserved location"
            tint="green"
          />
          {location ? (
            <div className="stack" style={{ gap: 2 }}>
              <span className="font-semibold">{location.name}</span>
              <div
                className="cluster"
                style={{ gap: "0.375rem", flexWrap: "wrap" }}
              >
                <AccentPill value={location.code} />
                <AccentPill value={location.type} />
              </div>
              {joinAddress({
                line1: location.address_line1,
                line2: location.address_line2,
                city: location.city,
                state: location.state,
                postal_code: location.postal_code,
                country: location.country,
              }) && (
                <div className="text-sm text-muted">
                  {joinAddress({
                    line1: location.address_line1,
                    line2: location.address_line2,
                    city: location.city,
                    state: location.state,
                    postal_code: location.postal_code,
                    country: location.country,
                  })}
                </div>
              )}
            </div>
          ) : address && joinAddress(address) ? (
            <div className="stack" style={{ gap: 2 }}>
              <span className="font-semibold">
                {row.destination ?? "Address"}
              </span>
              <div className="text-sm text-muted">{joinAddress(address)}</div>
            </div>
          ) : (
            <div className="text-sm text-muted">
              {row.destination ?? "No destination on file."}
            </div>
          )}
        </div>
      </div>

      <div className="card card-body stack">
        <SectionHeader
          icon={
            row.kind === "deployment" ? <Boxes size={16} /> : <Truck size={16} />
          }
          title={row.kind === "deployment" ? "Deployment" : "Shipment"}
          tint={row.kind === "deployment" ? "purple" : "teal"}
        />
        {row.kind === "deployment" && deployment && (
          <>
            <div
              className="cluster"
              style={{ gap: "0.5rem", flexWrap: "wrap" }}
            >
              <span className="font-semibold">{deployment.name}</span>
              <AccentPill value={deployment.status} />
              {deployment.type && <AccentPill value={deployment.type} />}
            </div>
            <dl
              className="grid grid-cols-2 text-sm"
              style={{ columnGap: "0.75rem", rowGap: "0.25rem" }}
            >
              <dt className="text-text-muted">Target date</dt>
              <dd>{fmtDate(deployment.target_date)}</dd>
              <dt className="text-text-muted">Created</dt>
              <dd>{fmtDate(deployment.created_at)}</dd>
              {deployment.started_at && (
                <>
                  <dt className="text-text-muted">Started</dt>
                  <dd>{fmtDate(deployment.started_at)}</dd>
                </>
              )}
              <dt className="text-text-muted">Items</dt>
              <dd>{deployment.items.length}</dd>
              {deployment.shipments.length > 0 && (
                <>
                  <dt className="text-text-muted">Shipments</dt>
                  <dd>{deployment.shipments.length}</dd>
                </>
              )}
            </dl>
            {deployment.description && (
              <p className="text-sm">{deployment.description}</p>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onDeploymentClick(deployment.id)}
            >
              View full deployment
            </button>
          </>
        )}
        {row.kind === "shipment" && shipment && (
          <>
            <div
              className="cluster"
              style={{ gap: "0.5rem", flexWrap: "wrap" }}
            >
              <span className="font-semibold font-mono">
                {shipment.tracking_number}
              </span>
              <AccentPill value={shipment.carrier.toUpperCase()} />
              <AccentPill value={shipment.direction} />
              <span className="badge badge-warning">
                {shipment.carrier_status}
              </span>
            </div>
            <dl
              className="grid grid-cols-2 text-sm"
              style={{ columnGap: "0.75rem", rowGap: "0.25rem" }}
            >
              <dt className="text-text-muted">Resolution</dt>
              <dd>{shipment.resolution}</dd>
              <dt className="text-text-muted">Created</dt>
              <dd>{fmtDate(shipment.created_at)}</dd>
              {shipment.last_polled_at && (
                <>
                  <dt className="text-text-muted">Last poll</dt>
                  <dd>{fmtDate(shipment.last_polled_at)}</dd>
                </>
              )}
              <dt className="text-text-muted">Items</dt>
              <dd>{shipment.items.length}</dd>
            </dl>
            {shipment.description && (
              <p className="text-sm">{shipment.description}</p>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onShipmentClick(shipment.id)}
            >
              View full shipment
            </button>
          </>
        )}
        {!deployment && !shipment && !error && (
          <p className="text-muted text-sm">Loading…</p>
        )}
      </div>
    </div>
  );
}
