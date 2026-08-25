import { useEffect, useState } from "react";
import { ArrowLeft, Save, Trash2 } from "lucide-react";

import { useConfirm } from "../components/ConfirmProvider";
import DatePicker from "../components/DatePicker";
import EntityHistoryList from "../components/EntityHistoryList";
import { useToast } from "../components/ToastProvider";
import { AccentPill, FreshnessCell, SectionHeader } from "../components/visual";
import { getDisposal, setDisposalStatus, updateDisposal } from "../services/logistics";
import type { Disposal, DisposalMethod, DisposalStatus } from "../types/logistics";

interface Props {
  disposalId: number;
  onBack: () => void;
  onAssetClick?: (id: number) => void;
}

const METHODS: DisposalMethod[] = [
  "recycle",
  "destroy",
  "donate",
  "return_to_vendor",
  "resale",
];

function methodLabel(method: string): string {
  return method
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const STATUS_BADGE: Record<DisposalStatus, string> = {
  scheduled: "badge",
  picked_up: "badge badge-warning",
  completed: "badge badge-success",
  cancelled: "badge badge-danger",
};

function assetLabel(asset: Disposal["asset"]): string {
  if (!asset) return "Unknown asset";
  return asset.asset_tag || asset.serial_number || `Asset #${asset.id}`;
}

export default function DisposalDetail({ disposalId, onBack, onAssetClick }: Props) {
  const toast = useToast();
  const confirm = useConfirm();

  const [disposal, setDisposal] = useState<Disposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [method, setMethod] = useState<DisposalMethod>("recycle");
  const [vendor, setVendor] = useState("");
  const [dataWiped, setDataWiped] = useState(false);
  const [certificateRef, setCertificateRef] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");

  const hydrate = (d: Disposal) => {
    setDisposal(d);
    setMethod(d.method);
    setVendor(d.vendor ?? "");
    setDataWiped(d.data_wiped);
    setCertificateRef(d.certificate_ref ?? "");
    setScheduledAt(d.scheduled_at ? d.scheduled_at.slice(0, 10) : "");
    setNotes(d.notes ?? "");
  };

  const reload = () =>
    getDisposal(disposalId)
      .then(hydrate)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disposalId]);

  const saveFields = async () => {
    setSaving(true);
    try {
      const updated = await toast.run(
        () =>
          updateDisposal(disposalId, {
            method,
            vendor: vendor || null,
            data_wiped: dataWiped,
            certificate_ref: certificateRef || null,
            scheduled_at: scheduledAt || null,
            notes: notes || null,
          }),
        {
          pending: "Saving…",
          success: "Disposal updated",
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

  const changeStatus = async (next: DisposalStatus) => {
    if (next === "completed") {
      const ok = await confirm({
        title: "Complete this disposal?",
        message: "Completing marks the asset RETIRED.",
        tone: "warning",
        confirmLabel: "Complete",
      });
      if (!ok) return;
    }
    try {
      await toast.run(() => setDisposalStatus(disposalId, next), {
        pending: "Updating status…",
        success: "Status updated",
        error: (e) => (e instanceof Error ? e.message : "Update failed"),
      });
      await reload();
    } catch {
      /* toast surfaced */
    }
  };

  if (error) {
    return (
      <div className="stack-lg">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Disposals
        </button>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  if (!disposal) {
    return (
      <div className="stack-lg">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Disposals
        </button>
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  const asset = disposal.asset;

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Disposals
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
            background: "#3d2232",
            color: "#f797d2",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden
        >
          <Trash2 size={32} strokeWidth={1.75} />
        </span>
        <div className="stack" style={{ gap: "0.375rem", minWidth: 0 }}>
          <h2 className="heading-2 font-mono" style={{ margin: 0 }}>
            {assetLabel(asset)}
          </h2>
          <span className="text-muted text-sm font-mono truncate">
            {asset
              ? [asset.model, asset.asset_type].filter(Boolean).join(" · ") ||
                "—"
              : "—"}
          </span>
          <div className="cluster" style={{ gap: "0.375rem", flexWrap: "wrap" }}>
            <span className={STATUS_BADGE[disposal.status]}>
              {disposal.status.replace("_", " ")}
            </span>
            <AccentPill value={methodLabel(disposal.method)} />
            {disposal.data_wiped ? (
              <span className="badge badge-success">Wiped</span>
            ) : (
              <span className="badge badge-warning">Not wiped</span>
            )}
          </div>
        </div>
        <div className="stack text-sm" style={{ gap: "0.25rem", textAlign: "right" }}>
          <div>
            <span className="text-muted text-xs uppercase tracking-wide">Scheduled</span>{" "}
            <FreshnessCell iso={disposal.scheduled_at} />
          </div>
          <div>
            <span className="text-muted text-xs uppercase tracking-wide">Completed</span>{" "}
            <FreshnessCell iso={disposal.completed_at} />
          </div>
        </div>
      </div>

      {/* Disposal details */}
      <section className="section-block">
        <SectionHeader
          icon={<Trash2 size={18} />}
          title="Disposal details"
          tint="pink"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "0.75rem",
          }}
        >
          <label className="stack" style={{ gap: 2 }}>
            <span className="text-xs text-muted">Method</span>
            <select
              className="input input-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value as DisposalMethod)}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {methodLabel(m)}
                </option>
              ))}
            </select>
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
          <label
            className="cluster"
            style={{ gap: "0.5rem", alignItems: "center", alignSelf: "end" }}
          >
            <input
              type="checkbox"
              checked={dataWiped}
              onChange={(e) => setDataWiped(e.target.checked)}
            />
            <span className="text-xs text-muted">Data wiped</span>
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
        <div className="cluster" style={{ justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void saveFields()}
            disabled={saving}
          >
            <Save size={14} /> {saving ? "Saving…" : "Save details"}
          </button>
        </div>
      </section>

      {/* Status */}
      <section className="section-block">
        <SectionHeader icon={<Trash2 size={18} />} title="Status" tint="info" />
        <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <span className={STATUS_BADGE[disposal.status]}>
            {disposal.status.replace("_", " ")}
          </span>
          {disposal.status === "scheduled" && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void changeStatus("picked_up")}
            >
              Mark picked up
            </button>
          )}
          {disposal.status === "picked_up" && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void changeStatus("completed")}
            >
              Complete
            </button>
          )}
          {(disposal.status === "scheduled" || disposal.status === "picked_up") && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void changeStatus("cancelled")}
            >
              Cancel
            </button>
          )}
        </div>
      </section>

      {/* Device asset */}
      {asset && (
        <section className="section-block">
          <span className="eyebrow">Asset</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onAssetClick?.(asset.id)}
            disabled={!onAssetClick}
          >
            <span className="font-mono">
              {asset.serial_number}
              {asset.asset_tag ? ` · ${asset.asset_tag}` : ""}
            </span>
          </button>
        </section>
      )}

      <EntityHistoryList entityType="disposal" entityId={disposalId} title="History" />
    </div>
  );
}
