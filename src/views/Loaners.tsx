import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import AssetPicker from "../components/AssetPicker";
import { useConfirm } from "../components/ConfirmProvider";
import DatePicker from "../components/DatePicker";
import { useToast } from "../components/ToastProvider";
import { FreshnessCell } from "../components/visual";
import { cancelLoan, createLoan, listLoans, returnLoan } from "../services/logistics";
import type { Asset } from "../types/inventory";
import type { Loan, LoanStatus } from "../types/logistics";

const STATUS_TONE: Record<LoanStatus, string> = {
  out: "badge-warning",
  returned: "badge-success",
  cancelled: "badge",
};

export default function Loaners({
  onAssetClick,
  onSelect,
}: {
  onAssetClick?: (id: number) => void;
  onSelect?: (id: number) => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();

  const [rows, setRows] = useState<Loan[]>([]);
  const [statuses, setStatuses] = useState<LoanStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [showCreate, setShowCreate] = useState(false);

  const reload = () => {
    setLoading(true);
    return listLoans({
      status: statusFilter || undefined,
      overdue_only: overdueOnly || undefined,
    })
      .then((res) => {
        setRows(res.loans);
        setStatuses(res.statuses);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, overdueOnly]);

  const outCount = rows.filter((l) => l.status === "out").length;
  const overdueCount = rows.filter((l) => l.is_overdue).length;

  const doReturn = async (id: number) => {
    try {
      await toast.run(() => returnLoan(id), {
        pending: "Checking in…",
        success: "Asset checked in",
        error: (e) => (e instanceof Error ? e.message : "Failed to check in"),
      });
      void reload();
    } catch {
      /* toast surfaced */
    }
  };

  const doCancel = async (id: number) => {
    const ok = await confirm({
      title: "Cancel this loan?",
      message: "Marks the loan cancelled without recording a check-in.",
      tone: "danger",
      confirmLabel: "Cancel loan",
    });
    if (!ok) return;
    try {
      await toast.run(() => cancelLoan(id), {
        pending: "Cancelling…",
        success: "Loan cancelled",
        error: (e) => (e instanceof Error ? e.message : "Failed to cancel"),
      });
      void reload();
    } catch {
      /* toast surfaced */
    }
  };

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Loaners</h2>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowCreate((v) => !v)}
        >
          <Plus size={14} strokeWidth={1.75} /> New loan
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
        <StatTile label="Out" value={outCount} tone="neutral" />
        <StatTile label="Overdue" value={overdueCount} tone="danger" />
      </div>

      {showCreate && (
        <CreateLoanForm
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
          <label className="cluster" style={{ gap: "0.375rem", whiteSpace: "nowrap" }}>
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            <span className="text-sm">Overdue only</span>
          </label>
        </div>
      </section>

      <div className="card">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Borrower</th>
                <th>Purpose</th>
                <th>Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr
                  key={l.id}
                  className="row-clickable"
                  onClick={() => onSelect?.(l.id)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn btn-link btn-sm"
                      style={{ padding: 0 }}
                      onClick={() => onAssetClick?.(l.asset_id)}
                    >
                      <span className="font-mono text-xs">
                        {l.asset?.asset_tag ?? l.asset?.serial_number ?? "—"}
                      </span>
                    </button>
                  </td>
                  <td>{l.borrower_name ?? l.borrower_upn ?? "—"}</td>
                  <td>{l.purpose ?? <span className="text-muted">—</span>}</td>
                  <td>
                    <div className="cluster" style={{ gap: "0.375rem" }}>
                      <FreshnessCell iso={l.due_at} />
                      {l.is_overdue && <span className="badge badge-danger">Overdue</span>}
                    </div>
                  </td>
                  <td>
                    <span className={"badge " + STATUS_TONE[l.status]}>{l.status}</span>
                  </td>
                  <td>
                    {l.status === "out" && (
                      <div
                        className="cluster"
                        style={{ gap: "0.375rem" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => void doReturn(l.id)}
                        >
                          Return
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => void doCancel(l.id)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
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
                    {loading ? "Loading…" : "No loans yet. Check out an asset to get started."}
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

function CreateLoanForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [asset, setAsset] = useState<Asset[]>([]);
  const [borrowerName, setBorrowerName] = useState("");
  const [borrowerUpn, setBorrowerUpn] = useState("");
  const [purpose, setPurpose] = useState("");
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const picked = asset[0];
    if (!picked) {
      toast.notify({ kind: "danger", title: "Select an asset to check out." });
      return;
    }
    setSaving(true);
    try {
      await toast.run(
        () =>
          createLoan({
            asset_id: picked.id,
            borrower_name: borrowerName || null,
            borrower_upn: borrowerUpn || null,
            purpose: purpose || null,
            due_at: due || null,
            notes: notes || null,
          }),
        {
          pending: "Checking out asset…",
          success: "Asset checked out",
          error: (e) => (e instanceof Error ? e.message : "Failed to check out asset"),
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
        <span className="eyebrow">New loan</span>
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
          <AssetPicker selected={asset} onChange={setAsset} availableOnly />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Borrower name</span>
          <input
            className="input input-sm"
            value={borrowerName}
            onChange={(e) => setBorrowerName(e.target.value)}
          />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Borrower UPN</span>
          <input
            className="input input-sm"
            value={borrowerUpn}
            onChange={(e) => setBorrowerUpn(e.target.value)}
          />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Purpose</span>
          <input
            className="input input-sm"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="text-xs text-muted">Due</span>
          <DatePicker value={due} onChange={setDue} />
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
          {saving ? "Checking out…" : "Check out asset"}
        </button>
      </div>
    </section>
  );
}
