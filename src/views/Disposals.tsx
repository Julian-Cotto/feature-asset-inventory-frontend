import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import AssetPicker from "../components/AssetPicker";
import { useConfirm } from "../components/ConfirmProvider";
import DatePicker from "../components/DatePicker";
import { useToast } from "../components/ToastProvider";
import { AccentPill, FreshnessCell } from "../components/visual";
import {
  createDisposal,
  listDisposals,
  setDisposalStatus,
} from "../services/logistics";
import type { Asset } from "../types/inventory";
import type {
  Disposal,
  DisposalMethod,
  DisposalStatus,
} from "../types/logistics";

interface Props {
  onAssetClick?: (id: number) => void;
  onSelect?: (id: number) => void;
}

const STATUS_TONE: Record<DisposalStatus, string> = {
  scheduled: "badge",
  picked_up: "badge-warning",
  completed: "badge-success",
  cancelled: "badge-danger",
};

/** "return_to_vendor" → "Return to vendor" — human labels for method options. */
const methodLabel = (m: string) => {
  const spaced = m.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export default function Disposals({ onAssetClick, onSelect }: Props) {
  const confirm = useConfirm();
  const toast = useToast();

  const [rows, setRows] = useState<Disposal[]>([]);
  // Unfiltered set — powers the stat tiles so a status filter doesn't skew totals.
  const [allRows, setAllRows] = useState<Disposal[]>([]);
  const [statuses, setStatuses] = useState<DisposalStatus[]>([]);
  const [methods, setMethods] = useState<DisposalMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);

  const reload = () => {
    setLoading(true);
    const allPromise = statusFilter ? listDisposals() : null;
    return Promise.all([listDisposals(statusFilter || undefined), allPromise])
      .then(([res, all]) => {
        setRows(res.disposals);
        setStatuses(res.statuses);
        setMethods(res.methods);
        // When no filter is active, the filtered set IS the full set.
        setAllRows((all ?? res).disposals);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  const stats = {
    total: allRows.length,
    scheduled: allRows.filter((d) => d.status === "scheduled").length,
    picked_up: allRows.filter((d) => d.status === "picked_up").length,
    completed: allRows.filter((d) => d.status === "completed").length,
    // Compliance signal: not-yet-completed disposals with no data-wipe confirmation.
    not_wiped: allRows.filter(
      (d) => !d.data_wiped && d.status !== "completed" && d.status !== "cancelled",
    ).length,
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const advance = async (d: Disposal, next: DisposalStatus, confirmMsg?: string) => {
    if (confirmMsg) {
      const ok = await confirm({
        title: "Complete disposal?",
        message: confirmMsg,
        tone: "warning",
        confirmLabel: "Complete",
      });
      if (!ok) return;
    }
    try {
      await toast.run(() => setDisposalStatus(d.id, next), {
        pending: "Updating…",
        success: "Disposal updated",
        error: (e) => (e instanceof Error ? e.message : "Failed to update disposal"),
      });
      void reload();
    } catch {
      /* toast surfaced */
    }
  };

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Disposals</h2>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowCreate((v) => !v)}
        >
          <Plus size={14} strokeWidth={1.75} /> New disposal
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
        <StatTile label="Total disposals" value={stats.total} tone="neutral" />
        <StatTile label="Scheduled" value={stats.scheduled} tone="neutral" />
        <StatTile label="Picked up" value={stats.picked_up} tone="warning" />
        <StatTile label="Completed" value={stats.completed} tone="success" />
        <StatTile label="Not wiped" value={stats.not_wiped} tone="danger" />
      </div>

      {showCreate && (
        <CreateDisposalForm
          methods={methods}
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
          <select
            className="input input-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="card">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Method</th>
                <th>Status</th>
                <th>Data wiped</th>
                <th>Certificate</th>
                <th>Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr
                  key={d.id}
                  className="row-clickable"
                  onClick={() => onSelect?.(d.id)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn btn-link btn-sm"
                      style={{ padding: 0 }}
                      onClick={() => onAssetClick?.(d.asset_id)}
                    >
                      <span className="font-mono text-xs">
                        {d.asset?.asset_tag ?? d.asset?.serial_number ?? `#${d.asset_id}`}
                      </span>
                    </button>
                  </td>
                  <td>
                    <AccentPill value={d.method} />
                  </td>
                  <td>
                    <span className={"badge " + STATUS_TONE[d.status]}>{d.status}</span>
                  </td>
                  <td>
                    {d.data_wiped ? (
                      <span className="badge badge-success">Wiped</span>
                    ) : (
                      <span className="badge badge-warning">Not wiped</span>
                    )}
                  </td>
                  <td>
                    {d.certificate_ref ? (
                      <span className="font-mono text-xs">{d.certificate_ref}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>
                    <FreshnessCell
                      iso={d.completed_at ?? d.scheduled_at ?? d.created_at}
                    />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="cluster" style={{ gap: "0.375rem", justifyContent: "flex-end" }}>
                      {d.status === "scheduled" && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void advance(d, "picked_up")}
                        >
                          Picked up
                        </button>
                      )}
                      {d.status === "picked_up" && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            void advance(
                              d,
                              "completed",
                              "Completing marks the asset RETIRED.",
                            )
                          }
                        >
                          Complete
                        </button>
                      )}
                      {(d.status === "scheduled" || d.status === "picked_up") && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => void advance(d, "cancelled")}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    {loading
                      ? "Loading…"
                      : "No disposals yet. Schedule one to decommission an end-of-life asset."}
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

function CreateDisposalForm({
  methods,
  onClose,
  onCreated,
}: {
  methods: DisposalMethod[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [asset, setAsset] = useState<Asset[]>([]);
  const [method, setMethod] = useState<DisposalMethod>(methods[0] ?? "recycle");
  const [vendor, setVendor] = useState("");
  const [dataWiped, setDataWiped] = useState(false);
  const [certificateRef, setCertificateRef] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const picked = asset[0];
    if (!picked) {
      toast.notify({ kind: "danger", title: "Pick an asset to dispose." });
      return;
    }
    setSaving(true);
    try {
      await toast.run(
        () =>
          createDisposal({
            asset_id: picked.id,
            method,
            vendor: vendor || null,
            data_wiped: dataWiped,
            certificate_ref: certificateRef || null,
            scheduled_at: scheduledAt || null,
            notes: notes || null,
          }),
        {
          pending: "Scheduling disposal…",
          success: "Disposal scheduled",
          error: (e) => (e instanceof Error ? e.message : "Failed to schedule disposal"),
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
        <span className="eyebrow">New disposal</span>
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
        <label className="stack" style={{ gap: 2, gridColumn: "1 / -1" }}>
          <span className="text-xs text-muted">Asset *</span>
          <AssetPicker selected={asset} onChange={setAsset} />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Method</span>
          <select
            className="input input-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value as DisposalMethod)}
          >
            {methods.map((m) => (
              <option key={m} value={m}>
                {methodLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Vendor</span>
          <input className="input input-sm" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Certificate ref</span>
          <input
            className="input input-sm"
            value={certificateRef}
            onChange={(e) => setCertificateRef(e.target.value)}
          />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Scheduled</span>
          <DatePicker value={scheduledAt} onChange={setScheduledAt} />
        </label>
        <label className="cluster" style={{ gap: "0.375rem", whiteSpace: "nowrap", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={dataWiped}
            onChange={(e) => setDataWiped(e.target.checked)}
          />
          <span className="text-sm">Data wiped</span>
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
          {saving ? "Scheduling…" : "Schedule disposal"}
        </button>
      </div>
    </section>
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
