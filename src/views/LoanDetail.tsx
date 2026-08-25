import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, CheckCircle2, Handshake, User, XCircle } from "lucide-react";

import EntityHistoryList from "../components/EntityHistoryList";
import { FreshnessCell, SectionHeader } from "../components/visual";
import { getLoan, returnLoan, cancelLoan } from "../services/logistics";
import type { Loan } from "../types/logistics";

interface Props {
  loanId: number;
  onBack: () => void;
  onAssetClick?: (id: number) => void;
}

/** Read-only key/value row, matching SimDetail's stacked eyebrow + value. */
function KV({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="stack" style={{ gap: 2, minWidth: 0 }}>
      <span className="eyebrow">{label}</span>
      <span className={mono ? "font-mono text-sm" : "text-sm"} style={{ wordBreak: "break-word" }}>
        {value}
      </span>
    </div>
  );
}

const STATUS_BADGE: Record<Loan["status"], string> = {
  out: "badge badge-warning",
  returned: "badge badge-success",
  cancelled: "badge",
};

export default function LoanDetail({ loanId, onBack, onAssetClick }: Props) {
  const [loan, setLoan] = useState<Loan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () =>
    getLoan(loanId)
      .then(setLoan)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanId]);

  const doReturn = async () => {
    setBusy(true);
    try {
      const updated = await returnLoan(loanId);
      setLoan(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      const updated = await cancelLoan(loanId);
      setLoan(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="stack-lg">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Loaners
        </button>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  if (!loan) {
    return (
      <div className="stack-lg">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Loaners
        </button>
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  const asset = loan.asset;
  const heroTitle = asset?.asset_tag ?? asset?.serial_number ?? `Loan #${loan.id}`;
  const heroSub = [asset?.model, asset?.asset_type].filter(Boolean).join(" · ") || "—";

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Loaners
        </button>
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
            background: "#1c3329",
            color: "#7ee2b8",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden
        >
          <Handshake size={32} strokeWidth={1.75} />
        </span>
        <div className="stack" style={{ gap: "0.375rem", minWidth: 0 }}>
          <h2 className="heading-2 font-mono" style={{ margin: 0 }}>
            {heroTitle}
          </h2>
          <span className="text-muted text-sm font-mono truncate">{heroSub}</span>
          <div className="cluster" style={{ gap: "0.375rem", flexWrap: "wrap" }}>
            <span className={STATUS_BADGE[loan.status]}>{loan.status}</span>
            {loan.is_overdue && <span className="badge badge-danger">Overdue</span>}
          </div>
        </div>
        <div className="stack text-sm" style={{ gap: "0.25rem", textAlign: "right" }}>
          <div>
            <span className="text-muted text-xs uppercase tracking-wide">Checked out</span>{" "}
            <FreshnessCell iso={loan.checked_out_at} />
          </div>
          <div>
            <span className="text-muted text-xs uppercase tracking-wide">Due</span>{" "}
            <FreshnessCell iso={loan.due_at} fallback="—" />
          </div>
          <div>
            <span className="text-muted text-xs uppercase tracking-wide">Returned</span>{" "}
            <FreshnessCell iso={loan.returned_at} fallback="—" />
          </div>
        </div>
      </div>

      {/* Loan details */}
      <section className="section-block">
        <SectionHeader icon={<User size={18} />} title="Loan details" tint="info" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "0.75rem",
          }}
        >
          <KV label="Borrower" value={loan.borrower_name ?? "—"} />
          <KV label="Borrower UPN" value={loan.borrower_upn ?? "—"} mono />
          <KV label="Purpose" value={loan.purpose ?? "—"} />
          <KV label="Notes" value={loan.notes ?? "—"} />
        </div>
        {asset && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: "flex-start" }}
            onClick={() => onAssetClick?.(loan.asset_id)}
          >
            <Handshake size={14} /> {asset.serial_number}
            {asset.asset_tag ? ` · ${asset.asset_tag}` : ""} →
          </button>
        )}
      </section>

      {/* Actions */}
      <section className="section-block">
        <SectionHeader icon={<CheckCircle2 size={18} />} title="Actions" tint="amber" />
        {loan.status === "out" ? (
          <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void doReturn()}
              disabled={busy}
            >
              <CheckCircle2 size={14} /> Return (check in)
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void doCancel()}
              disabled={busy}
            >
              <XCircle size={14} /> Cancel loan
            </button>
          </div>
        ) : (
          <p className="text-muted text-sm" style={{ margin: 0 }}>
            This loan is {loan.status}.
          </p>
        )}
      </section>

      <EntityHistoryList entityType="loan" entityId={loanId} />
    </div>
  );
}
