/** "Where has this asset been seen on Meraki?" panel for AssetDetail.
 *
 *  Drives off the asset's MAC (synced from Intune `wiFiMacAddress`/
 *  `ethernetMacAddress`). Default render uses the local cache populated by
 *  the most recent Meraki sync. A "Live search" button hits Meraki's org
 *  /clients/search endpoint to bypass the cache for ad-hoc checks. */

import { useEffect, useState } from "react";
import { RefreshCw, Wifi } from "lucide-react";

import { useToast } from "./ToastProvider";
import { SectionHeader, relativeTime } from "./visual";
import {
  getAssetNetworkAppearances,
  type NetworkAppearance,
} from "../services/networkAppearances";

interface Props {
  assetId: number;
  onNetworkClick?: (id: number) => void;
}

export default function AssetNetworkAppearances({
  assetId,
  onNetworkClick,
}: Props) {
  const toast = useToast();
  const [rows, setRows] = useState<NetworkAppearance[]>([]);
  const [mac, setMac] = useState<string | null>(null);
  const [source, setSource] = useState<"cache" | "live">("cache");
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const r = await getAssetNetworkAppearances(assetId, refresh);
      setRows(r.appearances);
      setMac(r.mac);
      setSource(r.source);
      setNote(r.note ?? null);
    } catch (e) {
      toast.notify({
        kind: "danger",
        title: "Could not fetch network appearances",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load(false);
  }, [assetId]);

  return (
    <section className="card stack mt-4" style={{ padding: "1.5rem" }}>
      <SectionHeader
        icon={<Wifi size={18} />}
        title="Networks seen on (Meraki)"
        tint="teal"
        right={
          <div className="cluster" style={{ gap: "0.5rem" }}>
            <span className="text-muted text-xs">
              {source === "cache" ? "cached" : "live"} · {rows.length}
            </span>
            {mac && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void load(true)}
                disabled={refreshing}
                title="Force a live Meraki client search for this MAC"
              >
                <RefreshCw
                  size={13}
                  className={refreshing ? "animate-spin" : ""}
                />
                Live search
              </button>
            )}
          </div>
        }
      />
      {mac && (
        <p className="text-muted text-xs" style={{ margin: 0 }}>
          MAC <span className="font-mono">{mac}</span>
        </p>
      )}
      {loading ? (
        <p className="text-muted text-sm" style={{ margin: 0 }}>
          Loading…
        </p>
      ) : note ? (
        <p className="text-muted text-sm" style={{ margin: 0 }}>
          {note}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted text-sm" style={{ margin: 0 }}>
          No Meraki client records cached for this MAC. Run a Meraki sync
          (or click "Live search" above) to refresh.
        </p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Network</th>
                  <th>IP</th>
                  <th>VLAN</th>
                  <th>First seen</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.network_id}-${r.last_seen_at ?? ""}`}>
                    <td>
                      <button
                        type="button"
                        className="btn btn-link btn-sm"
                        style={{ padding: 0, fontWeight: 600 }}
                        onClick={() =>
                          onNetworkClick?.(r.network_id)
                        }
                      >
                        {r.network_name}
                      </button>
                      {r.description && (
                        <div className="text-xs text-muted">
                          {r.description}
                        </div>
                      )}
                    </td>
                    <td>
                      {r.ip ? (
                        <span className="font-mono text-xs">{r.ip}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {r.vlan !== null && r.vlan !== undefined ? (
                        <span className="font-mono text-xs">{r.vlan}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {r.first_seen_at ? (
                        <span
                          className="text-xs"
                          title={new Date(r.first_seen_at).toLocaleString()}
                        >
                          {relativeTime(r.first_seen_at)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {r.last_seen_at ? (
                        <span
                          className="text-xs"
                          title={new Date(r.last_seen_at).toLocaleString()}
                        >
                          {relativeTime(r.last_seen_at)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
