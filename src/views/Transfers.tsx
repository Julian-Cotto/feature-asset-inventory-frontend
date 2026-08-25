import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import AssetPicker from "../components/AssetPicker";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { FreshnessCell } from "../components/visual";
import { StatTile, StatTileRow } from "../components/StatTile";
import { listLocations } from "../services/inventory";
import {
  createTransfer,
  listTransfers,
  setTransferStatus,
} from "../services/logistics";
import type { Asset, Location } from "../types/inventory";
import type { Transfer, TransferStatus } from "../types/logistics";

const STATUS_TONE: Record<TransferStatus, string> = {
  draft: "badge",
  in_transit: "badge-warning",
  received: "badge-success",
  cancelled: "badge-danger",
};

export default function Transfers({
  onSelect,
}: {
  onAssetClick?: (id: number) => void;
  onSelect?: (id: number) => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();

  const [rows, setRows] = useState<Transfer[]>([]);
  // Unfiltered set — powers the stat tiles so a status filter doesn't skew totals.
  const [allRows, setAllRows] = useState<Transfer[]>([]);
  const [statuses, setStatuses] = useState<TransferStatus[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);

  const reload = () => {
    setLoading(true);
    const allPromise = statusFilter ? listTransfers() : null;
    return Promise.all([listTransfers(statusFilter || undefined), allPromise])
      .then(([res, all]) => {
        setRows(res.transfers);
        setStatuses(res.statuses);
        setAllRows((all ?? res).transfers);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  const stats = {
    total: allRows.length,
    draft: allRows.filter((t) => t.status === "draft").length,
    in_transit: allRows.filter((t) => t.status === "in_transit").length,
    received: allRows.filter((t) => t.status === "received").length,
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    void listLocations().then(setLocations).catch(() => setLocations([]));
  }, []);

  const advance = async (
    id: number,
    status: TransferStatus,
    pending: string,
    success: string,
  ) => {
    try {
      await toast.run(() => setTransferStatus(id, status), {
        pending,
        success,
        error: (e) => (e instanceof Error ? e.message : "Failed to update transfer"),
      });
      void reload();
    } catch {
      /* toast surfaced */
    }
  };

  const receive = async (id: number) => {
    const ok = await confirm({
      title: "Receive transfer?",
      message: "Receiving relocates each asset to the destination location.",
      tone: "info",
      confirmLabel: "Receive",
    });
    if (!ok) return;
    void advance(id, "received", "Receiving…", "Transfer received");
  };

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Transfers</h2>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowCreate((v) => !v)}
        >
          <Plus size={14} strokeWidth={1.75} /> New transfer
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <StatTileRow>
        <StatTile label="Total transfers" value={stats.total} tone="neutral" />
        <StatTile label="Draft" value={stats.draft} tone="neutral" />
        <StatTile label="In transit" value={stats.in_transit} tone="warning" />
        <StatTile label="Received" value={stats.received} tone="success" />
      </StatTileRow>

      {showCreate && (
        <CreateTransferForm
          locations={locations}
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
                <th>Ref</th>
                <th>Route</th>
                <th>Items</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.id}
                  className="row-clickable"
                  onClick={() => onSelect?.(t.id)}
                >
                  <td>
                    <span className="font-mono text-xs">
                      {t.reference ?? `#${t.id}`}
                    </span>
                  </td>
                  <td>
                    <span className="text-sm">
                      {t.from_location_name ?? "—"}
                      {" → "}
                      {t.to_location_name ?? "—"}
                    </span>
                  </td>
                  <td>{t.item_count}</td>
                  <td>
                    <span className={"badge " + STATUS_TONE[t.status]}>
                      {t.status}
                    </span>
                  </td>
                  <td>
                    <FreshnessCell iso={t.created_at} />
                  </td>
                  <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                    <div
                      className="cluster"
                      style={{ gap: "0.375rem", justifyContent: "flex-end" }}
                    >
                      {t.status === "draft" && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            void advance(t.id, "in_transit", "Shipping…", "Transfer shipped")
                          }
                        >
                          Ship
                        </button>
                      )}
                      {t.status === "in_transit" && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void receive(t.id)}
                        >
                          Receive
                        </button>
                      )}
                      {(t.status === "draft" || t.status === "in_transit") && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            void advance(t.id, "cancelled", "Cancelling…", "Transfer cancelled")
                          }
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
                    colSpan={6}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    {loading
                      ? "Loading…"
                      : "No transfers yet. Create one to move assets between locations."}
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

function CreateTransferForm({
  locations,
  onClose,
  onCreated,
}: {
  locations: Location[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [picked, setPicked] = useState<Asset[]>([]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (picked.length === 0) {
      toast.notify({ kind: "danger", title: "Pick at least one asset." });
      return;
    }
    setSaving(true);
    try {
      await toast.run(
        () =>
          createTransfer({
            from_location_id: fromId ? Number(fromId) : null,
            to_location_id: toId ? Number(toId) : null,
            asset_ids: picked.map((a) => a.id),
            reference: reference || null,
            notes: notes || null,
          }),
        {
          pending: "Creating transfer…",
          success: "Transfer created",
          error: (e) => (e instanceof Error ? e.message : "Failed to create transfer"),
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
        <span className="eyebrow">New transfer</span>
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
          <span className="text-xs text-muted">From location</span>
          <select
            className="input input-sm"
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
          >
            <option value="">—</option>
            {locations.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">To location</span>
          <select
            className="input input-sm"
            value={toId}
            onChange={(e) => setToId(e.target.value)}
          >
            <option value="">—</option>
            {locations.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 2, gridColumn: "1 / -1" }}>
          <span className="text-xs text-muted">Assets *</span>
          <AssetPicker multiple selected={picked} onChange={setPicked} />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Reference</span>
          <input
            className="input input-sm"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <label className="stack" style={{ gap: 2, gridColumn: "1 / -1" }}>
          <span className="text-xs text-muted">Notes</span>
          <input
            className="input input-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </div>
      <div className="cluster" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void submit()}
          disabled={saving}
        >
          {saving ? "Creating…" : "Create transfer"}
        </button>
      </div>
    </section>
  );
}
