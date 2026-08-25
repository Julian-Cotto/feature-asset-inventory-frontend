import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, X } from "lucide-react";

import { useConfirm } from "../components/ConfirmProvider";
import ExportDropdown from "../components/ExportDropdown";
import SimReconcileChip from "../components/SimReconcileChip";
import { useToast } from "../components/ToastProvider";
import { AccentPill, FreshnessCell } from "../components/visual";
import { downloadSimsExport } from "../services/exports";
import { listNetworks } from "../services/networks";
import { createSim, listSims, syncSims } from "../services/sims";
import type { Network } from "../types/network";
import type { Sim, SimStatus } from "../types/sim";

interface Props {
  onSelect: (id: number) => void;
}

const STATUS_TONE: Record<SimStatus, string> = {
  active: "badge-success",
  spare: "badge",
  suspended: "badge-warning",
  deactivated: "badge-danger",
};

export default function Sims({ onSelect }: Props) {
  const confirm = useConfirm();
  const toast = useToast();

  const [rows, setRows] = useState<Sim[]>([]);
  const [statuses, setStatuses] = useState<SimStatus[]>([]);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [networks, setNetworks] = useState<Network[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [carrierFilter, setCarrierFilter] = useState<string>("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [showCreate, setShowCreate] = useState(false);

  const reload = () => {
    setLoading(true);
    return listSims({
      status: statusFilter || undefined,
      carrier: carrierFilter || undefined,
      unassigned_only: unassignedOnly || undefined,
      include_archived: includeArchived || undefined,
    })
      .then((res) => {
        setRows(res.sims);
        setStatuses(res.statuses);
        setCarriers(res.carriers);
        setStatusCounts(res.status_counts);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, carrierFilter, unassignedOnly, includeArchived]);

  useEffect(() => {
    void listNetworks().then(setNetworks).catch(() => setNetworks([]));
  }, []);

  const doSync = async () => {
    const ok = await confirm({
      title: "Pull & reconcile SIMs from Meraki?",
      message:
        "Pulls the ICCIDs Meraki reports on its cellular firewalls, cross-checks each inventory SIM, and auto-onboards any SIM Meraki sees that isn't on file yet (assigned to its firewall's network). Flags SIMs assigned on paper but not live in a firewall.",
      tone: "info",
      confirmLabel: "Pull & reconcile",
    });
    if (!ok) return;
    setSyncing(true);
    try {
      await toast.run(() => syncSims(), {
        pending: "Pulling from Meraki…",
        success: (r) =>
          `Done — ${r.created} onboarded, ${r.matched} matched, ${r.mismatched} mismatched, ${r.assigned_not_live} not live`,
        error: "SIM reconcile failed",
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
        ? rows.filter((s) =>
            [s.iccid, s.phone_number, s.imsi, s.carrier, s.network_name]
              .filter(Boolean)
              .some((v) => v!.toLowerCase().includes(needle)),
          )
        : rows,
    [rows, needle],
  );

  // Reconcile roll-up across the loaded set — the health signal at a glance.
  const recon = useMemo(() => {
    const c = { matched: 0, mismatched: 0, assigned_not_live: 0, unassigned_but_live: 0 };
    for (const s of rows) {
      if (s.reconcile_state in c) c[s.reconcile_state as keyof typeof c] += 1;
    }
    return c;
  }, [rows]);

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">SIM cards</h2>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowCreate((v) => !v)}
          >
            <Plus size={14} strokeWidth={1.75} /> Add SIM
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void doSync()}
            disabled={syncing}
            title="Pull cellular SIMs from Meraki, reconcile, and auto-onboard any not on file"
          >
            <RefreshCw
              size={14}
              className={syncing ? "animate-spin" : ""}
              strokeWidth={1.75}
            />
            {syncing ? "Pulling…" : "Pull from Meraki"}
          </button>
          <ExportDropdown
            entityName="sims"
            onExport={(fmt) =>
              downloadSimsExport(
                {
                  q: filter || undefined,
                  status: statusFilter || undefined,
                  carrier: carrierFilter || undefined,
                  include_archived: includeArchived || undefined,
                },
                fmt,
              )
            }
          />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <StatTile label="Total SIMs" value={rows.length} tone="neutral" />
        <StatTile label="Matched" value={recon.matched} tone="success" />
        <StatTile label="Mismatched" value={recon.mismatched} tone="danger" />
        <StatTile label="Assigned · not live" value={recon.assigned_not_live} tone="warning" />
        <StatTile label="Live · unassigned" value={recon.unassigned_but_live} tone="warning" />
      </div>

      {showCreate && (
        <CreateSimForm
          networks={networks}
          statuses={statuses}
          carriers={carriers}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void reload();
          }}
        />
      )}

      <section className="section-block">
        <span className="eyebrow">Filters</span>
        <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Search ICCID, phone, IMSI, carrier…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <select
            className="input input-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s} {statusCounts[s] != null ? `(${statusCounts[s]})` : ""}
              </option>
            ))}
          </select>
          <select
            className="input input-sm"
            value={carrierFilter}
            onChange={(e) => setCarrierFilter(e.target.value)}
          >
            <option value="">All carriers</option>
            {carriers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="cluster" style={{ gap: "0.375rem", whiteSpace: "nowrap" }}>
            <input
              type="checkbox"
              checked={unassignedOnly}
              onChange={(e) => setUnassignedOnly(e.target.checked)}
            />
            <span className="text-sm">Unassigned only</span>
          </label>
          <label className="cluster" style={{ gap: "0.375rem", whiteSpace: "nowrap" }}>
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            <span className="text-sm">Include archived</span>
          </label>
        </div>
      </section>

      <div className="card">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>ICCID</th>
                <th>Carrier</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Network / firewall</th>
                <th>Location</th>
                <th>Meraki</th>
                <th>Checked</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className="row-clickable"
                  onClick={() => onSelect(s.id)}
                  style={{ opacity: s.archived_at ? 0.55 : 1 }}
                >
                  <td>
                    <span className="font-mono text-xs">{s.iccid}</span>
                  </td>
                  <td>{s.carrier ? <AccentPill value={s.carrier} /> : <span className="text-muted">—</span>}</td>
                  <td>
                    <span className="font-mono text-xs">{s.phone_number ?? "—"}</span>
                  </td>
                  <td>
                    <span className={"badge " + STATUS_TONE[s.status]}>{s.status}</span>
                  </td>
                  <td>
                    {s.network_name ?? <span className="text-muted">Unassigned</span>}
                  </td>
                  <td>{s.location_name ?? <span className="text-muted">—</span>}</td>
                  <td>
                    <SimReconcileChip
                      state={s.reconcile_state}
                      title={
                        s.meraki_seen
                          ? `Meraki: ${s.meraki_status ?? "seen"}${
                              s.meraki_serial ? ` · ${s.meraki_serial}` : ""
                            }`
                          : "Not seen in any Meraki firewall"
                      }
                    />
                  </td>
                  <td>
                    {s.meraki_checked_at ? (
                      <FreshnessCell iso={s.meraki_checked_at} />
                    ) : (
                      <span className="text-muted text-xs">never</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    {loading
                      ? "Loading…"
                      : rows.length === 0
                        ? "No SIMs yet. Add one, or run Reconcile with Meraki to discover live SIMs."
                        : "No SIMs match the current filter."}
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

function CreateSimForm({
  networks,
  statuses,
  carriers,
  onClose,
  onCreated,
}: {
  networks: Network[];
  statuses: SimStatus[];
  carriers: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [iccid, setIccid] = useState("");
  const [carrier, setCarrier] = useState("");
  const [phone, setPhone] = useState("");
  const [imsi, setImsi] = useState("");
  const [dataPlan, setDataPlan] = useState("");
  const [status, setStatus] = useState<SimStatus>("spare");
  const [networkId, setNetworkId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!iccid.trim()) {
      toast.notify({ kind: "danger", title: "ICCID is required." });
      return;
    }
    setSaving(true);
    try {
      await toast.run(
        () =>
          createSim({
            iccid: iccid.trim(),
            carrier: carrier || null,
            phone_number: phone || null,
            imsi: imsi || null,
            data_plan: dataPlan || null,
            status,
            network_id: networkId ? Number(networkId) : null,
            notes: notes || null,
          }),
        {
          pending: "Adding SIM…",
          success: "SIM added",
          error: (e) => (e instanceof Error ? e.message : "Failed to add SIM"),
        },
      );
      onCreated();
    } catch {
      /* toast surfaced */
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section-block">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <span className="eyebrow">New SIM</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">ICCID *</span>
          <input className="input input-sm" value={iccid} onChange={(e) => setIccid(e.target.value)} placeholder="8912…" />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Carrier</span>
          <input className="input input-sm" list="sim-carriers" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
          <datalist id="sim-carriers">
            {carriers.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Phone number</span>
          <input className="input input-sm" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">IMSI</span>
          <input className="input input-sm" value={imsi} onChange={(e) => setImsi(e.target.value)} />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Data plan</span>
          <input className="input input-sm" value={dataPlan} onChange={(e) => setDataPlan(e.target.value)} />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Status</span>
          <select className="input input-sm" value={status} onChange={(e) => setStatus(e.target.value as SimStatus)}>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Assign to network (firewall)</span>
          <select className="input input-sm" value={networkId} onChange={(e) => setNetworkId(e.target.value)}>
            <option value="">Unassigned</option>
            {networks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.display_name}
                {n.location_name ? ` · ${n.location_name}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 2, gridColumn: "1 / -1" }}>
          <span className="text-xs text-muted">Notes</span>
          <input className="input input-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <div className="cluster" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void submit()} disabled={saving}>
          {saving ? "Adding…" : "Add SIM"}
        </button>
      </div>
    </section>
  );
}
