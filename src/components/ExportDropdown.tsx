/** Compact "Export ▾" dropdown with CSV / XLSX choices. Used on list
 *  views (Assets, Badges). Caller supplies a callback that invokes the
 *  matching downloader with the chosen format; the dropdown handles
 *  loading state + toasts. */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download } from "lucide-react";

import { useToast } from "./ToastProvider";

import type { ExportFormat } from "../services/exports";

interface Props {
  /** Invoked with the chosen format. Should resolve when the download
   *  has been triggered (file write happens inside the downloader). */
  onExport: (fmt: ExportFormat) => Promise<void>;
  /** Optional name fragment for the toast detail line. */
  entityName?: string;
}

export default function ExportDropdown({ onExport, entityName = "rows" }: Props) {
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        open &&
        ref.current &&
        !ref.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function go(fmt: ExportFormat) {
    setOpen(false);
    setBusy(fmt);
    try {
      await onExport(fmt);
      toast.notify({
        kind: "success",
        title: `Export ready (${fmt.toUpperCase()})`,
        detail: `Downloaded ${entityName} with current filters`,
      });
    } catch (e) {
      toast.notify({
        kind: "danger",
        title: "Export failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen((v) => !v)}
        disabled={busy !== null}
        title="Export current filter set"
      >
        <Download size={14} />
        {busy ? `Downloading ${busy.toUpperCase()}…` : "Export"}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "calc(100% + 0.375rem)",
            right: 0,
            zIndex: 30,
            padding: "0.375rem",
            minWidth: "9rem",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <Item label="CSV" hint=".csv" onClick={() => void go("csv")} />
          <Item label="XLSX" hint=".xlsx · Excel" onClick={() => void go("xlsx")} />
        </div>
      )}
    </div>
  );
}

function Item({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "none",
        padding: "0.5rem 0.625rem",
        borderRadius: 6,
        cursor: "pointer",
        color: "rgb(var(--color-text))",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: "0.75rem",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "rgb(var(--color-bg))")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "transparent")
      }
    >
      <span className="font-medium">{label}</span>
      <span className="text-muted text-xs">{hint}</span>
    </button>
  );
}
