import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Network as NetworkIcon,
  RefreshCw,
  Wifi,
} from "lucide-react";

import { useConfirm } from "../components/ConfirmProvider";
import ExportDropdown from "../components/ExportDropdown";
import { useToast } from "../components/ToastProvider";
import { downloadNetworksExport } from "../services/exports";
import {
  AccentPill,
  FreshnessCell,
} from "../components/visual";
import { listNetworks, syncNetworks } from "../services/networks";
import type { Network } from "../types/network";

interface Props {
  onSelect: (id: number) => void;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

export default function Networks({ onSelect }: Props) {
  const confirm = useConfirm();
  const toast = useToast();

  const [rows, setRows] = useState<Network[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const reload = () =>
    listNetworks()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void reload();
  }, []);

  const doSync = async () => {
    const ok = await confirm({
      title: "Sync networks from Meraki?",
      message:
        "Pulls every network in the org + their first VLAN subnet, MX WAN/LAN IPs, and switch management IPs. Then re-links assets to networks (Meraki gear by serial, client devices by Defender IP subnet match).",
      tone: "info",
      confirmLabel: "Sync",
    });
    if (!ok) return;
    setSyncing(true);
    try {
      await toast.run(() => syncNetworks(), {
        pending: "Syncing networks from Meraki…",
        success: (r) =>
          `Done — fetched ${r.fetched}, ${r.created} new, ${r.updated} updated, ${r.assets_linked} assets linked`,
        error: "Network sync failed",
      });
      void reload();
    } catch {
      /* toast surfaced */
    } finally {
      setSyncing(false);
    }
  };

  const needle = filter.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? rows.filter((n) =>
            [
              n.display_name,
              n.name,
              n.location_name,
              n.subnet_cidr,
              n.wan_ip,
              n.firewall_ip,
              n.meraki_network_id,
              ...n.switch_ips,
            ]
              .filter(Boolean)
              .some((v) => v!.toLowerCase().includes(needle)),
          )
        : rows,
    [rows, needle],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  useEffect(() => {
    setPage(1);
  }, [needle, pageSize]);

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Networks</h2>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void doSync()}
            disabled={syncing}
            title="Pull all networks from Meraki + relink assets"
          >
            <RefreshCw
              size={14}
              className={syncing ? "animate-spin" : ""}
              strokeWidth={1.75}
            />
            {syncing ? "Syncing…" : "Sync from Meraki"}
          </button>
          <ExportDropdown
            entityName="networks"
            onExport={(fmt) => downloadNetworksExport(fmt)}
          />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="section-block">
        <span className="eyebrow">Filter</span>
        <input
          className="input"
          placeholder="Search name, subnet, IP, location…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </section>

      <div className="card">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Network</th>
                <th>Location</th>
                <th>VLANs</th>
                <th>Subnet</th>
                <th>Corp VLAN</th>
                <th>WAN IP</th>
                <th>Firewall</th>
                <th>Switches</th>
                <th>Assets</th>
                <th>Synced</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((n) => (
                <tr
                  key={n.id}
                  className="row-clickable"
                  onClick={() => onSelect(n.id)}
                >
                  <td>
                    <div
                      className="cluster"
                      style={{ gap: "0.625rem", flexWrap: "nowrap" }}
                    >
                      <span
                        className="cluster"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: "rgb(from rgb(var(--color-primary)) r g b / 0.14)",
                          color: "rgb(var(--color-primary))",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                        aria-hidden
                      >
                        {n.product_types.includes("wireless") ? (
                          <Wifi size={16} />
                        ) : (
                          <NetworkIcon size={16} />
                        )}
                      </span>
                      <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                        <span className="font-medium truncate">
                          {n.display_name}
                        </span>
                        <span className="font-mono text-xs text-muted truncate">
                          {n.meraki_network_id}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <AccentPill value={n.location_name} />
                  </td>
                  <td>
                    {n.vlan_count > 0 ? (
                      <span className="badge badge-info">
                        {n.vlan_count}
                      </span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </td>
                  <td>
                    {n.subnet_cidr ? (
                      <span className="font-mono text-xs">{n.subnet_cidr}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>
                    {n.corp_vlan_subnet ? (
                      <div className="stack" style={{ gap: 1 }}>
                        <span
                          className="font-mono text-xs"
                          style={{ color: "rgb(var(--color-success))" }}
                        >
                          {n.corp_vlan_subnet}
                        </span>
                        {n.corp_vlan_gateway_ip && (
                          <span className="font-mono text-xs text-muted">
                            gw {n.corp_vlan_gateway_ip}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>
                    {n.wan_ip ? (
                      <span className="font-mono text-xs">{n.wan_ip}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>
                    {n.firewall_ip ? (
                      <span className="font-mono text-xs">{n.firewall_ip}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>
                    {n.switch_ips.length > 0 ? (
                      <span className="badge">{n.switch_ips.length}</span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </td>
                  <td>
                    {n.asset_count > 0 ? (
                      <span className="badge badge-success">
                        {n.asset_count}
                      </span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </td>
                  <td>
                    <FreshnessCell iso={n.meraki_synced_at} />
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    {rows.length === 0
                      ? "No networks cached yet. Click “Sync from Meraki”."
                      : "No networks match the filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div
            className="cluster"
            style={{
              justifyContent: "space-between",
              padding: "0.5rem 0.75rem",
              borderTop: "1px solid rgb(var(--color-border) / 0.4)",
            }}
          >
            <div className="cluster" style={{ gap: "0.375rem" }}>
              <span className="text-xs text-muted">Rows per page</span>
              <select
                className="input input-sm"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{ width: 76 }}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="cluster" style={{ gap: "0.375rem" }}>
              <span className="text-xs text-muted">
                {start + 1}–{Math.min(start + pageSize, filtered.length)} of{" "}
                {filtered.length}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
