import { useEffect, useState } from "react";
import { ArrowLeft, ArrowLeftRight, Boxes, Ban, Send, PackageCheck } from "lucide-react";

import { useConfirm } from "../components/ConfirmProvider";
import EntityHistoryList from "../components/EntityHistoryList";
import { useToast } from "../components/ToastProvider";
import { FreshnessCell, SectionHeader } from "../components/visual";
import { getTransfer, setTransferStatus } from "../services/logistics";
import type { Transfer, TransferStatus } from "../types/logistics";

interface Props {
  transferId: number;
  onBack: () => void;
  onAssetClick?: (id: number) => void;
}

const STATUS_BADGE: Record<TransferStatus, string> = {
  draft: "badge",
  in_transit: "badge badge-warning",
  received: "badge badge-success",
  cancelled: "badge badge-danger",
};

export default function TransferDetail({ transferId, onBack, onAssetClick }: Props) {
  const toast = useToast();
  const confirm = useConfirm();

  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () =>
    getTransfer(transferId)
      .then(setTransfer)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferId]);

  const changeStatus = async (next: TransferStatus, pending: string, success: string) => {
    setBusy(true);
    try {
      await toast.run(() => setTransferStatus(transferId, next), {
        pending,
        success,
        error: (e) => (e instanceof Error ? e.message : "Failed"),
      });
      await reload();
    } catch {
      /* toast surfaced */
    } finally {
      setBusy(false);
    }
  };

  const ship = () => changeStatus("in_transit", "Shipping…", "Transfer shipped");

  const receive = async () => {
    const ok = await confirm({
      title: "Receive this transfer?",
      message: "Receiving relocates each asset to the destination location.",
      confirmLabel: "Receive",
    });
    if (!ok) return;
    await changeStatus("received", "Receiving…", "Transfer received");
  };

  const cancel = () => changeStatus("cancelled", "Cancelling…", "Transfer cancelled");

  if (error) {
    return (
      <div className="stack-lg">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Transfers
        </button>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="stack-lg">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Transfers
        </button>
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  const heading = transfer.reference ?? `Transfer #${transfer.id}`;
  const route = `${transfer.from_location_name ?? "—"} → ${transfer.to_location_name ?? "—"}`;

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Transfers
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
            background: "#1c2b42",
            color: "#8fb8f6",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden
        >
          <ArrowLeftRight size={32} strokeWidth={1.75} />
        </span>
        <div className="stack" style={{ gap: "0.375rem", minWidth: 0 }}>
          <h2 className="heading-2" style={{ margin: 0 }}>
            {heading}
          </h2>
          <span className="text-muted text-sm font-mono truncate">{route}</span>
          <div className="cluster" style={{ gap: "0.375rem", flexWrap: "wrap" }}>
            <span className={STATUS_BADGE[transfer.status]}>{transfer.status}</span>
          </div>
        </div>
        <div className="stack text-sm" style={{ gap: "0.25rem", textAlign: "right" }}>
          <div>
            <span className="text-muted text-xs uppercase tracking-wide">Created</span>{" "}
            <FreshnessCell iso={transfer.created_at} />
          </div>
          <div>
            <span className="text-muted text-xs uppercase tracking-wide">Shipped</span>{" "}
            <FreshnessCell iso={transfer.shipped_at} />
          </div>
          <div>
            <span className="text-muted text-xs uppercase tracking-wide">Received</span>{" "}
            <FreshnessCell iso={transfer.received_at} />
          </div>
        </div>
      </div>

      {/* Status */}
      <section className="section-block">
        <SectionHeader icon={<ArrowLeftRight size={18} />} title="Status" tint="info" />
        <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <span className={STATUS_BADGE[transfer.status]}>{transfer.status}</span>
          {transfer.status === "draft" && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void ship()}
              disabled={busy}
            >
              <Send size={14} /> Ship
            </button>
          )}
          {transfer.status === "in_transit" && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void receive()}
              disabled={busy}
            >
              <PackageCheck size={14} /> Receive
            </button>
          )}
          {(transfer.status === "draft" || transfer.status === "in_transit") && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void cancel()}
              disabled={busy}
            >
              <Ban size={14} /> Cancel
            </button>
          )}
        </div>
        {transfer.notes && (
          <p className="text-xs text-muted" style={{ margin: 0 }}>
            {transfer.notes}
          </p>
        )}
      </section>

      {/* Assets */}
      <section className="section-block">
        <SectionHeader
          icon={<Boxes size={18} />}
          title="Assets"
          tint="green"
          right={<span className="badge badge-info">{transfer.item_count}</span>}
        />
        <div className="card scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Type</th>
                <th>Model</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transfer.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted text-sm">
                    No assets on this transfer.
                  </td>
                </tr>
              ) : (
                transfer.items.map((item) => {
                  const asset = item.asset;
                  const canClick = !!asset && !!onAssetClick;
                  return (
                    <tr
                      key={item.id}
                      className={canClick ? "row-clickable" : undefined}
                      onClick={canClick ? () => onAssetClick!(asset!.id) : undefined}
                      style={{ cursor: canClick ? "pointer" : undefined }}
                    >
                      <td className="font-mono text-xs">
                        {asset ? (
                          <span
                            style={{
                              color: canClick ? "rgb(var(--color-primary))" : undefined,
                            }}
                          >
                            {asset.asset_tag ?? asset.serial_number}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>{asset?.asset_type ?? <span className="text-muted">—</span>}</td>
                      <td>{asset?.model ?? <span className="text-muted">—</span>}</td>
                      <td>
                        {asset ? (
                          <span className="badge">{asset.status_code}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <EntityHistoryList entityType="transfer" entityId={transferId} title="History" />
    </div>
  );
}
