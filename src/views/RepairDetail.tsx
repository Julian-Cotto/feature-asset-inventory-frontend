import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Activity,
  HardDrive,
  Save,
  Wrench,
  XCircle,
} from "lucide-react";

import { useConfirm } from "../components/ConfirmProvider";
import DatePicker from "../components/DatePicker";
import EntityHistoryList from "../components/EntityHistoryList";
import { useToast } from "../components/ToastProvider";
import { AccentPill, FreshnessCell, SectionHeader } from "../components/visual";
import { getRepair, setRepairStatus, updateRepair } from "../services/logistics";
import type { Repair, RepairStatus } from "../types/logistics";

interface Props {
  repairId: number;
  onBack: () => void;
  onAssetClick?: (id: number) => void;
}

/** Small right-aligned key/value row, mirroring SimDetail's hero KV block. */
function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="text-muted text-xs uppercase tracking-wide">{label}</span>{" "}
      <span>{children}</span>
    </div>
  );
}

/** Linear forward transition per current status. */
const NEXT: Partial<Record<RepairStatus, { label: string; to: RepairStatus }>> = {
  open: { label: "Send to vendor", to: "sent" },
  sent: { label: "At vendor", to: "at_vendor" },
  at_vendor: { label: "Mark returned", to: "returned" },
  returned: { label: "Close", to: "closed" },
};

export default function RepairDetail({ repairId, onBack, onAssetClick }: Props) {
  const toast = useToast();
  const confirm = useConfirm();

  const [repair, setRepair] = useState<Repair | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [vendor, setVendor] = useState("");
  const [rmaNumber, setRmaNumber] = useState("");
  const [symptom, setSymptom] = useState("");
  const [isWarranty, setIsWarranty] = useState(false);
  const [cost, setCost] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [notes, setNotes] = useState("");

  const hydrate = (r: Repair) => {
    setRepair(r);
    setVendor(r.vendor ?? "");
    setRmaNumber(r.rma_number ?? "");
    setSymptom(r.symptom ?? "");
    setIsWarranty(r.is_warranty);
    setCost(r.cost_cents != null ? (r.cost_cents / 100).toString() : "");
    setExpectedReturn(r.expected_return_at ? r.expected_return_at.slice(0, 10) : "");
    setNotes(r.notes ?? "");
  };

  const reload = () =>
    getRepair(repairId)
      .then(hydrate)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repairId]);

  const saveDetails = async () => {
    setSaving(true);
    try {
      const updated = await toast.run(
        () =>
          updateRepair(repairId, {
            vendor: vendor || null,
            rma_number: rmaNumber || null,
            symptom: symptom || null,
            is_warranty: isWarranty,
            expected_return_at: expectedReturn || null,
            cost_cents: cost ? Math.round(Number(cost) * 100) : null,
            notes: notes || null,
          }),
        {
          pending: "Saving…",
          success: "Repair updated",
          error: (e) => (e instanceof Error ? e.message : "Save failed"),
        },
      );
      hydrate(updated);
    } catch {
      /* toast surfaced */
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (to: RepairStatus, pending: string, success: string) => {
    try {
      await toast.run(() => setRepairStatus(repairId, to), {
        pending,
        success,
        error: (e) => (e instanceof Error ? e.message : "Status change failed"),
      });
      await reload();
    } catch {
      /* toast surfaced */
    }
  };

  const cancelRepair = async () => {
    const ok = await confirm({
      title: "Cancel this repair?",
      message: "The ticket will be marked cancelled. This cannot be undone.",
      tone: "warning",
      confirmLabel: "Cancel repair",
    });
    if (!ok) return;
    await changeStatus("cancelled", "Cancelling…", "Repair cancelled");
  };

  if (error) {
    return (
      <div className="stack-lg">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Repairs
        </button>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  if (!repair) {
    return (
      <div className="stack-lg">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Repairs
        </button>
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  const asset = repair.asset;
  const loaner = repair.loaner_asset;
  const heading = asset?.asset_tag ?? asset?.serial_number ?? "Repair";
  const subline = asset
    ? [asset.manufacturer, asset.model].filter(Boolean).join(" ") || asset.asset_type
    : "—";
  const next = NEXT[repair.status];

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Repairs
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
            background: "#3a2c1f",
            color: "#fbc828",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden
        >
          <Wrench size={32} strokeWidth={1.75} />
        </span>
        <div className="stack" style={{ gap: "0.375rem", minWidth: 0 }}>
          <h2 className="heading-2 font-mono" style={{ margin: 0 }}>
            {heading}
          </h2>
          <span className="text-muted text-sm truncate">{subline}</span>
          <div className="cluster" style={{ gap: "0.375rem", flexWrap: "wrap" }}>
            <span className="badge">{repair.status}</span>
            {repair.is_warranty ? (
              <span className="badge badge-success">In warranty</span>
            ) : (
              <span className="badge">Out of warranty</span>
            )}
            {repair.is_overdue && <span className="badge badge-danger">Overdue</span>}
          </div>
        </div>
        <div className="stack text-sm" style={{ gap: "0.25rem", textAlign: "right" }}>
          <KV label="Opened">
            <FreshnessCell iso={repair.opened_at} />
          </KV>
          <KV label="Expected return">
            <FreshnessCell iso={repair.expected_return_at} fallback="—" />
          </KV>
        </div>
      </div>

      {/* Repair details */}
      <section className="card stack" style={{ padding: "1.5rem" }}>
        <SectionHeader icon={<Wrench size={18} />} title="Repair details" tint="amber" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "0.75rem",
          }}
        >
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
            <span className="text-xs text-muted">Cost (USD)</span>
            <input
              className="input input-sm"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </label>
          <label className="stack" style={{ gap: 2 }}>
            <span className="text-xs text-muted">Expected return</span>
            <DatePicker value={expectedReturn} onChange={setExpectedReturn} />
          </label>
          <label className="stack" style={{ gap: 2, gridColumn: "1 / -1" }}>
            <span className="text-xs text-muted">Symptom</span>
            <input
              className="input input-sm"
              value={symptom}
              onChange={(e) => setSymptom(e.target.value)}
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
          <label className="cluster" style={{ gap: "0.5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={isWarranty}
              onChange={(e) => setIsWarranty(e.target.checked)}
            />
            <span className="text-sm">Covered under warranty</span>
          </label>
        </div>
        <div className="cluster" style={{ justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void saveDetails()}
            disabled={saving}
          >
            <Save size={14} /> {saving ? "Saving…" : "Save details"}
          </button>
        </div>
      </section>

      {/* Status */}
      <section className="card stack" style={{ padding: "1.5rem" }}>
        <SectionHeader
          icon={<Activity size={18} />}
          title="Status"
          tint="info"
          right={<AccentPill value={repair.status} />}
        />
        <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          {next && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() =>
                void changeStatus(next.to, `${next.label}…`, `Repair → ${next.to}`)
              }
            >
              {next.label} <ArrowRight size={14} />
            </button>
          )}
          {repair.is_open && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void cancelRepair()}
            >
              <XCircle size={14} /> Cancel
            </button>
          )}
          {!next && !repair.is_open && (
            <span className="text-muted text-sm">No further transitions.</span>
          )}
        </div>
      </section>

      {/* Device + loaner */}
      <section className="card stack" style={{ padding: "1.5rem" }}>
        <SectionHeader icon={<HardDrive size={18} />} title="Device" tint="teal" />
        <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onAssetClick?.(repair.asset_id)}
          >
            <HardDrive size={14} />{" "}
            {asset?.asset_tag ?? asset?.serial_number ?? `Asset #${repair.asset_id}`}
          </button>
          {loaner && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onAssetClick?.(loaner.id)}
            >
              Loaner: {loaner.asset_tag ?? loaner.serial_number}
            </button>
          )}
        </div>
      </section>

      <EntityHistoryList entityType="repair" entityId={repairId} title="History" />
    </div>
  );
}
