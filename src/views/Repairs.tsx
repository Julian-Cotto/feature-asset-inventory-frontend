import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import AssetPicker from "../components/AssetPicker";
import DatePicker from "../components/DatePicker";
import { useToast } from "../components/ToastProvider";
import { AccentPill, FreshnessCell } from "../components/visual";
import { createRepair, listRepairs, setRepairStatus } from "../services/logistics";
import type { Asset } from "../types/inventory";
import type { Repair, RepairStatus } from "../types/logistics";

export default function Repairs({
  onAssetClick,
  onSelect,
}: {
  onAssetClick?: (id: number) => void;
  onSelect?: (id: number) => void;
}) {
  const toast = useToast();

  const [rows, setRows] = useState<Repair[]>([]);
  const [statuses, setStatuses] = useState<RepairStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [openOnly, setOpenOnly] = useState(false);
  const [filter, setFilter] = useState("");

  const [showCreate, setShowCreate] = useState(false);

  const reload = () => {
    setLoading(true);
    return listRepairs({
      status: statusFilter || undefined,
      open_only: openOnly || undefined,
      q: filter.trim() || undefined,
    })
      .then((res) => {
        setRows(res.repairs);
        setStatuses(res.statuses);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, openOnly]);

  const needle = filter.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? rows.filter((r) =>
            [
              r.asset?.asset_tag,
              r.asset?.serial_number,
              r.vendor,
              r.rma_number,
              r.symptom,
            ]
              .filter(Boolean)
              .some((v) => v!.toLowerCase().includes(needle)),
          )
        : rows,
    [rows, needle],
  );

  const totalOpen = useMemo(() => rows.filter((r) => r.is_open).length, [rows]);
  const overdue = useMemo(() => rows.filter((r) => r.is_overdue).length, [rows]);
  const atVendor = useMemo(
    () => rows.filter((r) => r.status === "at_vendor").length,
    [rows],
  );

  const changeStatus = async (id: number, status: string) => {
    try {
      await toast.run(() => setRepairStatus(id, status), {
        pending: "Updating status…",
        success: "Status updated",
        error: (e) => (e instanceof Error ? e.message : "Failed to update status"),
      });
      void reload();
    } catch {
      /* toast surfaced */
    }
  };

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Repairs</h2>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowCreate((v) => !v)}
          >
            <Plus size={14} strokeWidth={1.75} /> New repair
          </button>
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
        <StatTile label="Total open" value={totalOpen} tone="neutral" />
        <StatTile label="Overdue" value={overdue} tone="danger" />
        <StatTile label="At vendor" value={atVendor} tone="warning" />
      </div>

      {showCreate && (
        <CreateRepairForm
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
            placeholder="Search asset, vendor, RMA #, symptom…"
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
                {s}
              </option>
            ))}
          </select>
          <label className="cluster" style={{ gap: "0.375rem", whiteSpace: "nowrap" }}>
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
            />
            <span className="text-sm">Open only</span>
          </label>
        </div>
      </section>

      <div className="card">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Vendor</th>
                <th>RMA #</th>
                <th>Warranty</th>
                <th>Status</th>
                <th>Expected return</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="row-clickable"
                  onClick={() => onSelect?.(r.id)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn btn-link btn-sm"
                      style={{ padding: 0 }}
                      onClick={() => onAssetClick?.(r.asset_id)}
                    >
                      <span className="font-mono text-xs">
                        {r.asset?.asset_tag ?? r.asset?.serial_number ?? "—"}
                      </span>
                    </button>
                  </td>
                  <td>
                    {r.vendor ? <AccentPill value={r.vendor} /> : <span className="text-muted">—</span>}
                  </td>
                  <td>
                    <span className="font-mono text-xs">{r.rma_number ?? "—"}</span>
                  </td>
                  <td>
                    {r.is_warranty ? (
                      <span className="badge badge-success">In warranty</span>
                    ) : (
                      <span className="text-muted text-xs">Out of warranty</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select
                      className="input input-sm"
                      value={r.status}
                      onChange={(e) => void changeStatus(r.id, e.target.value)}
                    >
                      {statuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {r.is_overdue ? (
                      <span className="cluster" style={{ gap: "0.375rem" }}>
                        <span className="badge badge-danger">Overdue</span>
                        <FreshnessCell iso={r.expected_return_at} />
                      </span>
                    ) : (
                      <FreshnessCell iso={r.expected_return_at} />
                    )}
                  </td>
                  <td>
                    <FreshnessCell iso={r.opened_at} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    {loading
                      ? "Loading…"
                      : rows.length === 0
                        ? "No repairs yet. Open one to start tracking an RMA."
                        : "No repairs match the current filter."}
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

function CreateRepairForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [device, setDevice] = useState<Asset[]>([]);
  const [loaner, setLoaner] = useState<Asset[]>([]);
  const [vendor, setVendor] = useState("");
  const [rmaNumber, setRmaNumber] = useState("");
  const [symptom, setSymptom] = useState("");
  const [isWarranty, setIsWarranty] = useState(false);
  const [expectedReturn, setExpectedReturn] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const picked = device[0];
    if (!picked) {
      toast.notify({ kind: "danger", title: "Pick the device being repaired." });
      return;
    }
    const loanerAsset = loaner[0];
    setSaving(true);
    try {
      await toast.run(
        () =>
          createRepair({
            asset_id: picked.id,
            vendor: vendor || null,
            rma_number: rmaNumber || null,
            symptom: symptom || null,
            is_warranty: isWarranty,
            expected_return_at: expectedReturn || null,
            loaner_asset_id: loanerAsset?.id ?? null,
          }),
        {
          pending: "Opening repair…",
          success: "Repair opened",
          error: (e) => (e instanceof Error ? e.message : "Failed to open repair"),
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
        <span className="eyebrow">New repair</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Device *</span>
          <AssetPicker
            selected={device}
            onChange={setDevice}
            placeholder="Search the device being repaired…"
          />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Vendor</span>
          <input
            className="input input-sm"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">RMA #</span>
          <input
            className="input input-sm"
            value={rmaNumber}
            onChange={(e) => setRmaNumber(e.target.value)}
          />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Symptom</span>
          <input
            className="input input-sm"
            value={symptom}
            onChange={(e) => setSymptom(e.target.value)}
          />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Expected return</span>
          <DatePicker value={expectedReturn} onChange={setExpectedReturn} />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Loaner (optional)</span>
          <AssetPicker
            selected={loaner}
            onChange={setLoaner}
            placeholder="Search a loaner device…"
            availableOnly
          />
        </label>
        <label
          className="cluster"
          style={{ gap: "0.375rem", whiteSpace: "nowrap", alignSelf: "end" }}
        >
          <input
            type="checkbox"
            checked={isWarranty}
            onChange={(e) => setIsWarranty(e.target.checked)}
          />
          <span className="text-sm">In warranty</span>
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
          {saving ? "Opening…" : "Open repair"}
        </button>
      </div>
    </section>
  );
}
