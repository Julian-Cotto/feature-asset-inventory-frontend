import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Cpu,
  Info,
  Laptop,
  Layers,
  MapPin,
  Network as NetworkIcon,
  RefreshCw,
  Save,
  ShieldAlert,
  Wifi,
} from "lucide-react";

import { useToast } from "../components/ToastProvider";
import {
  AccentPill,
  FreshnessCell,
  SectionHeader,
} from "../components/visual";
import { listLocations } from "../services/inventory";
import {
  getNetwork,
  relinkNetworkAssets,
  syncNetworks,
  updateNetwork,
} from "../services/networks";
import type { Location } from "../types/inventory";
import type {
  NetworkAsset,
  NetworkDetail as NetworkDetailType,
  NetworkLinkReason,
} from "../types/network";

interface Props {
  networkId: number;
  onBack: () => void;
  onAssetClick: (id: number) => void;
}

const LINK_REASON_TINT: Record<NetworkLinkReason, { bg: string; fg: string; label: string }> = {
  meraki_serial: {
    bg: "rgb(from rgb(var(--color-primary)) r g b / 0.18)",
    fg: "rgb(var(--color-primary))",
    label: "Meraki serial",
  },
  ip_match: {
    bg: "rgb(from rgb(var(--color-success)) r g b / 0.18)",
    fg: "rgb(var(--color-success))",
    label: "IP match",
  },
  meraki_client: {
    bg: "rgb(from rgb(var(--color-warning)) r g b / 0.18)",
    fg: "rgb(var(--color-warning))",
    label: "Meraki client",
  },
  manual: {
    bg: "rgb(var(--color-bg))",
    fg: "rgb(var(--color-text-muted))",
    label: "Manual",
  },
};

function LinkReasonPill({ reason }: { reason: NetworkLinkReason }) {
  const t = LINK_REASON_TINT[reason];
  return (
    <span
      className="badge"
      style={{ background: t.bg, color: t.fg, borderColor: "transparent" }}
    >
      {t.label}
    </span>
  );
}

export default function NetworkDetail({
  networkId,
  onBack,
  onAssetClick,
}: Props) {
  const toast = useToast();

  const [detail, setDetail] = useState<NetworkDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [busy, setBusy] = useState(false);

  // Edit draft (only fields a human controls; rest is Meraki-sourced).
  const [nameOverride, setNameOverride] = useState("");
  const [locationId, setLocationId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);

  const reload = async () => {
    try {
      const d = await getNetwork(networkId);
      setDetail(d);
      setNameOverride(d.network.name_override ?? "");
      setLocationId(d.network.location_id ? String(d.network.location_id) : "");
      setNotes(d.network.notes ?? "");
      setDirty(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void reload();
    void listLocations(false)
      .then(setLocations)
      .catch(() => undefined);
  }, [networkId]);

  const network = detail?.network;

  const doSave = async () => {
    if (!network) return;
    setBusy(true);
    try {
      await toast.run(
        () =>
          updateNetwork(network.id, {
            name_override: nameOverride.trim() || null,
            location_id: locationId ? Number(locationId) : null,
            notes: notes.trim() || null,
          }),
        {
          pending: "Saving…",
          success: "Network updated",
          error: "Save failed",
        },
      );
      await reload();
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  };

  const doRelink = async () => {
    setBusy(true);
    try {
      await toast.run(() => relinkNetworkAssets(), {
        pending: "Re-linking assets to networks…",
        success: (r) => `Done — ${r.assets_linked} assets re-linked`,
        error: "Re-link failed",
      });
      await reload();
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  };

  const doSync = async () => {
    setBusy(true);
    try {
      await toast.run(() => syncNetworks(), {
        pending: "Syncing this network from Meraki…",
        success: (r) =>
          `Sync done — ${r.assets_linked} assets re-linked`,
        error: "Sync failed",
      });
      await reload();
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  };

  const gear = detail?.networking_equipment ?? [];
  const clients = detail?.client_devices ?? [];
  const gearByType = useMemo(() => {
    const out: Record<string, NetworkAsset[]> = {};
    for (const g of gear) (out[g.asset_type] = out[g.asset_type] ?? []).push(g);
    return out;
  }, [gear]);

  if (error) {
    return (
      <div className="stack-lg">
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>
            <ArrowLeft size={14} />
            Back
          </button>
        </div>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  if (!network) {
    return (
      <div className="stack-lg">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} />
          Back
        </button>
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  const isWireless =
    network.product_types.length === 1 &&
    network.product_types[0] === "wireless";

  return (
    <div className="stack-lg">
      {/* Top bar */}
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>
            <ArrowLeft size={14} />
            Back to Networks
          </button>
        </div>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => void doRelink()}
            title="Re-evaluate asset network membership without re-pulling Meraki"
          >
            Re-link assets
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => void doSync()}
          >
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
            Sync from Meraki
          </button>
        </div>
      </div>

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
        <span
          className="cluster"
          style={{
            width: 72,
            height: 72,
            borderRadius: 16,
            background: "rgb(from rgb(var(--color-primary)) r g b / 0.16)",
            color: "rgb(var(--color-primary))",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden
        >
          {isWireless ? <Wifi size={32} /> : <NetworkIcon size={32} />}
        </span>
        <div className="stack" style={{ gap: "0.375rem", minWidth: 0 }}>
          <h2 className="heading-2" style={{ margin: 0 }}>
            {network.display_name}
          </h2>
          <span className="font-mono text-muted text-sm truncate">
            {network.meraki_network_id}
          </span>
          <div className="cluster" style={{ gap: "0.375rem", flexWrap: "wrap" }}>
            <AccentPill value={network.location_name} />
            {network.product_types.map((pt) => (
              <AccentPill key={pt} value={pt} />
            ))}
            {network.timezone && <AccentPill value={network.timezone} />}
            {network.archived_at && (
              <span className="badge badge-danger">Archived</span>
            )}
          </div>
        </div>
        <div className="stack text-sm" style={{ gap: "0.25rem", textAlign: "right" }}>
          <div>
            <span className="text-muted text-xs uppercase tracking-wide">
              Subnet
            </span>{" "}
            <span className="font-mono">{network.subnet_cidr ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted text-xs uppercase tracking-wide">
              Corp VLAN
            </span>{" "}
            <span
              className="font-mono"
              style={{
                color: network.corp_vlan_subnet
                  ? "rgb(var(--color-success))"
                  : undefined,
              }}
            >
              {network.corp_vlan_subnet ?? "—"}
            </span>
          </div>
          <div>
            <span className="text-muted text-xs uppercase tracking-wide">
              WAN IP
            </span>{" "}
            <span className="font-mono">{network.wan_ip ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted text-xs uppercase tracking-wide">
              Firewall
            </span>{" "}
            <span className="font-mono">{network.firewall_ip ?? "—"}</span>
          </div>
          {network.corp_vlan_gateway_ip && (
            <div>
              <span className="text-muted text-xs uppercase tracking-wide">
                Corp gw
              </span>{" "}
              <span className="font-mono">{network.corp_vlan_gateway_ip}</span>
            </div>
          )}
          <div>
            <span className="text-muted text-xs uppercase tracking-wide">
              Synced
            </span>{" "}
            <FreshnessCell iso={network.meraki_synced_at} />
          </div>
        </div>
      </div>

      {/* Identity / overrides */}
      <section className="card stack" style={{ padding: "1.5rem" }}>
        <SectionHeader
          icon={<Info size={18} />}
          title="Identity & location"
          tint="purple"
          right={
            dirty && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void doSave()}
                disabled={busy}
              >
                <Save size={14} />
                Save
              </button>
            )
          }
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
          }}
        >
          <label className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">Display name override</span>
            <input
              className="input"
              value={nameOverride}
              onChange={(e) => {
                setNameOverride(e.target.value);
                setDirty(true);
              }}
              placeholder={network.name}
            />
            <span className="text-xs text-muted">
              Meraki name: <span className="font-mono">{network.name}</span>
            </span>
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">Location</span>
            <select
              className="input"
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                setDirty(true);
              }}
            >
              <option value="">— Not set —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">
              <MapPin size={11} style={{ verticalAlign: "middle" }} />{" "}
              Pin this network to an office for reporting.
            </span>
          </label>
        </div>
        <label className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">Notes</span>
          <textarea
            className="input"
            rows={4}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setDirty(true);
            }}
            placeholder="Anything else worth knowing about this network…"
            style={{ resize: "vertical", minHeight: "5rem" }}
          />
        </label>
      </section>

      {/* VLANs — full subnet inventory pulled from Meraki */}
      <section className="card stack" style={{ padding: "1.5rem" }}>
        <SectionHeader
          icon={<Layers size={18} />}
          title="VLANs"
          tint="teal"
          right={
            <span className="text-muted text-sm">
              {network.vlans.length}{" "}
              {network.vlans.length === 1 ? "VLAN" : "VLANs"}
            </span>
          }
        />
        {network.vlans.length === 0 ? (
          <p className="text-muted text-sm" style={{ margin: 0 }}>
            No VLANs returned by Meraki for this network. If the MX is in
            single-LAN mode you'll see one synthetic "VLAN 0" entry after
            the next sync.
          </p>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr>
                    <th>VLAN ID</th>
                    <th>Name</th>
                    <th>Subnet</th>
                    <th>Appliance IP</th>
                  </tr>
                </thead>
                <tbody>
                  {network.vlans.map((v) => {
                    const isCorp =
                      (v.name ?? "").toLowerCase().includes("corp") ||
                      v.meraki_vlan_id === 30;
                    return (
                      <tr key={v.id}>
                        <td>
                          <span
                            className="font-mono font-medium"
                            style={{
                              color: isCorp
                                ? "rgb(var(--color-success))"
                                : undefined,
                            }}
                          >
                            {v.meraki_vlan_id}
                          </span>
                        </td>
                        <td>
                          {v.name ? (
                            <span className="text-sm">{v.name}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {v.subnet_cidr ? (
                            <span
                              className="font-mono text-xs"
                              style={{
                                color: isCorp
                                  ? "rgb(var(--color-success))"
                                  : undefined,
                              }}
                            >
                              {v.subnet_cidr}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {v.appliance_ip ? (
                            <span className="font-mono text-xs">
                              {v.appliance_ip}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Networking equipment */}
      <section className="card stack" style={{ padding: "1.5rem" }}>
        <SectionHeader
          icon={<ShieldAlert size={18} />}
          title="Networking equipment"
          tint="info"
          right={
            <span className="text-muted text-sm">
              {gear.length} {gear.length === 1 ? "device" : "devices"}
            </span>
          }
        />
        {gear.length === 0 ? (
          <p className="text-muted text-sm" style={{ margin: 0 }}>
            No firewalls, switches, or APs linked yet. Run a Meraki bulk-sync
            so devices upsert with serials matching this network.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {(["gateway", "switch", "ap"] as const).map((t) =>
              gearByType[t]?.length ? (
                <div key={t}>
                  <span className="eyebrow">
                    {t === "gateway"
                      ? "Firewalls / gateways"
                      : t === "switch"
                        ? "Switches"
                        : "Access points"}{" "}
                    ({gearByType[t].length})
                  </span>
                  <AssetTable
                    rows={gearByType[t]}
                    onAssetClick={onAssetClick}
                  />
                </div>
              ) : null,
            )}
          </div>
        )}
      </section>

      {/* Client devices */}
      <section className="card stack" style={{ padding: "1.5rem" }}>
        <SectionHeader
          icon={<Laptop size={18} />}
          title="Client devices"
          tint="green"
          right={
            <span className="text-muted text-sm">
              {clients.length} matched by IP
            </span>
          }
        />
        {clients.length === 0 ? (
          <p className="text-muted text-sm" style={{ margin: 0 }}>
            No client devices matched.{" "}
            {network.corp_vlan_subnet || network.subnet_cidr
              ? `No assets have a Defender last-IP inside ${network.corp_vlan_subnet ?? network.subnet_cidr}.`
              : "No subnet on this network — Defender IP matching is disabled until Meraki provides VLAN/LAN info."}
          </p>
        ) : (
          <AssetTable rows={clients} onAssetClick={onAssetClick} />
        )}
      </section>
    </div>
  );
}

function AssetTable({
  rows,
  onAssetClick,
}: {
  rows: NetworkAsset[];
  onAssetClick: (id: number) => void;
}) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Serial</th>
              <th>Model</th>
              <th>Assigned to</th>
              <th>IP</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr
                key={a.asset_id}
                className="row-clickable"
                onClick={() => onAssetClick(a.asset_id)}
              >
                <td>
                  <div
                    className="cluster"
                    style={{ gap: "0.5rem", flexWrap: "nowrap" }}
                  >
                    <Cpu size={14} style={{ opacity: 0.6 }} />
                    <span className="font-medium">
                      {a.device_name ?? a.serial_number}
                    </span>
                  </div>
                </td>
                <td>
                  <span className="font-mono text-xs">{a.serial_number}</span>
                </td>
                <td>
                  <span className="text-sm">
                    {a.manufacturer ?? ""} {a.model ?? ""}
                  </span>
                </td>
                <td>
                  {a.assigned_upn ? (
                    <span className="font-mono text-xs">{a.assigned_upn}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td>
                  {a.defender_last_ip ? (
                    <span className="font-mono text-xs">
                      {a.defender_last_ip}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td>
                  <LinkReasonPill reason={a.link_reason} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
