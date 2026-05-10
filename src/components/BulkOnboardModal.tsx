import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

import ScanInput from "./ScanInput";
import Select from "./Select";
import {
  listStatuses,
  lookupAssetBySerial,
  lookupDevice,
  onboardAsset,
} from "../services/inventory";
import type {
  AssetStatus,
  AssetType,
  LookupResult,
} from "../types/inventory";
import { assetTypeLabel } from "../utils/assetTypeBadge";
import { normalizeOs } from "../utils/normalizeOs";

const TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: "laptop", label: "Laptop" },
  { value: "desktop", label: "Desktop" },
  { value: "thin_client", label: "Thin client" },
  { value: "ap", label: "Access point" },
  { value: "switch", label: "Switch" },
  { value: "gateway", label: "Gateway" },
];

type RowStatus = "looking" | "duplicate" | "ready" | "error";

interface Row {
  id: string;
  serial: string;
  type: AssetType;
  status: RowStatus;
  lookup: LookupResult | null;
  duplicateAssetId: number | null;
  errorMessage?: string;
}

interface Props {
  onCreated: (createdIds: number[]) => void;
  onCancel: () => void;
}

export default function BulkOnboardModal({ onCreated, onCancel }: Props) {
  const [defaultType, setDefaultType] = useState<AssetType>("laptop");
  const [statusCode, setStatusCode] = useState("active");
  const [statuses, setStatuses] = useState<AssetStatus[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressDone, setProgressDone] = useState(0);

  useEffect(() => {
    listStatuses()
      .then(setStatuses)
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [submitting, onCancel]);

  function patchRow(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function runRowChecks(id: string, serial: string) {
    // Duplicate check first
    try {
      const existing = await lookupAssetBySerial(serial);
      patchRow(id, {
        status: "duplicate",
        duplicateAssetId: existing.id,
      });
      return;
    } catch {
      /* not in DB, continue */
    }

    // Vendor lookup, best-effort
    try {
      const result = await lookupDevice(serial);
      setRows((rs) =>
        rs.map((r) => {
          if (r.id !== id) return r;
          // Adopt vendor's asset_type only if user hasn't manually changed
          // from the default (matches single-onboard pre-fill behavior).
          const next: Row = { ...r, status: "ready", lookup: result };
          if (result.assetType && r.type === defaultType) {
            next.type = result.assetType;
          }
          return next;
        }),
      );
    } catch {
      patchRow(id, { status: "ready" });
    }
  }

  async function handleScan(serial: string) {
    const trimmed = serial.trim();
    if (!trimmed) return;
    if (rows.some((r) => r.serial === trimmed)) {
      setScanInput("");
      return;
    }
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    const newRow: Row = {
      id,
      serial: trimmed,
      type: defaultType,
      status: "looking",
      lookup: null,
      duplicateAssetId: null,
    };
    setRows((rs) => [...rs, newRow]);
    setScanInput("");
    void runRowChecks(id, trimmed);
  }

  function removeRow(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  function markAllAs(type: AssetType) {
    setRows((rs) =>
      rs.map((r) => (r.status === "duplicate" ? r : { ...r, type })),
    );
  }

  const submittableRows = rows.filter((r) => r.status !== "duplicate");
  const stillLookingUp = rows.some((r) => r.status === "looking");

  async function submit() {
    if (submittableRows.length === 0) return;
    setSubmitting(true);
    setError(null);
    setProgressDone(0);

    const created: number[] = [];
    const failed: { serial: string; error: string }[] = [];

    for (const row of submittableRows) {
      try {
        const asset = await onboardAsset({
          serial_number: row.serial,
          asset_type: row.type,
          status_code: statusCode,
          manufacturer: row.lookup?.manufacturer ?? null,
          model: row.lookup?.model ?? null,
          series: row.lookup?.series ?? null,
          generation: row.lookup?.generation ?? null,
          cpu: row.lookup?.cpu ?? null,
          os: normalizeOs(row.lookup?.os, row.lookup?.osVersion),
          os_version: row.lookup?.osVersion ?? null,
          intune_id: row.lookup?.intuneId ?? null,
        });
        created.push(asset.id);
      } catch (e) {
        failed.push({
          serial: row.serial,
          error: e instanceof Error ? e.message : "Onboard failed",
        });
      }
      setProgressDone((d) => d + 1);
    }

    setSubmitting(false);

    if (failed.length === 0) {
      onCreated(created);
      return;
    }

    // Mark failed rows + show summary; keep modal open
    setRows((rs) =>
      rs.map((r) => {
        const f = failed.find((x) => x.serial === r.serial);
        return f ? { ...r, status: "error" as const, errorMessage: f.error } : r;
      }),
    );
    setError(
      `${created.length} created, ${failed.length} failed. See marked rows.`,
    );
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <div
        className="modal-panel"
        style={{ maxWidth: "780px", maxHeight: "90vh" }}
      >
        <div
          className="cluster"
          style={{ justifyContent: "space-between", marginBottom: "0.25rem" }}
        >
          <h3 className="modal-title">Bulk onboard</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Close"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-muted text-sm" style={{ marginTop: 0 }}>
          Scan serial numbers to add rows. Each row adopts the default type;
          edit individually or use “Mark all as…”. Vendor lookup runs in the
          background — submit any time.
        </p>

        <div className="form-row">
          <div className="field">
            <label className="label">Default type for new scans</label>
            <Select
              value={defaultType}
              onChange={(v) => setDefaultType(v as AssetType)}
              disabled={submitting}
              options={TYPE_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </div>
          <div className="field">
            <label className="label">Status (applied to all)</label>
            <Select
              value={statusCode}
              onChange={setStatusCode}
              disabled={submitting}
              options={statuses.map((s) => ({
                value: s.code,
                label: s.label,
              }))}
            />
          </div>
        </div>

        <ScanInput
          value={scanInput}
          onChange={setScanInput}
          onScan={handleScan}
          label="Scan serial"
          autoFocus
        />

        {rows.length > 0 && (
          <>
            <div
              className="cluster"
              style={{
                justifyContent: "space-between",
                marginTop: "0.25rem",
                gap: "0.5rem",
              }}
            >
              <span className="text-sm text-text-muted">
                {rows.length} row{rows.length === 1 ? "" : "s"}
                {stillLookingUp ? " · identifying…" : ""}
              </span>
              <div className="cluster" style={{ gap: "0.25rem" }}>
                <span className="text-xs text-text-muted">Mark all as:</span>
                {TYPE_OPTIONS.slice(0, 4).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => markAllAs(o.value)}
                    disabled={submitting}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <ul
              className="list-clean stack"
              style={{
                maxHeight: "40vh",
                overflowY: "auto",
                gap: "0.4rem",
                marginTop: "0.5rem",
              }}
            >
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="cluster"
                  style={{
                    padding: "0.5rem 0.75rem",
                    background: "rgb(var(--color-surface-muted))",
                    border: "1px solid rgb(var(--color-border) / 0.5)",
                    borderRadius: "0.75rem",
                    justifyContent: "space-between",
                    gap: "0.625rem",
                    flexWrap: "nowrap",
                  }}
                >
                  <span
                    className="font-mono text-sm truncate"
                    style={{ minWidth: "8ch", maxWidth: "16ch" }}
                    title={r.serial}
                  >
                    {r.serial}
                  </span>

                  <div
                    style={{ flex: 1, minWidth: 0 }}
                    className="text-xs text-text-muted truncate"
                  >
                    {r.status === "looking" && (
                      <span className="cluster" style={{ gap: "0.3rem" }}>
                        <Loader2
                          size={12}
                          className="animate-spin"
                          aria-hidden
                        />
                        looking up…
                      </span>
                    )}
                    {r.status === "ready" && r.lookup?.model && (
                      <span title={`${r.lookup.manufacturer ?? ""} ${r.lookup.model}`}>
                        {r.lookup.manufacturer} {r.lookup.model}
                      </span>
                    )}
                    {r.status === "ready" && !r.lookup?.model && (
                      <span className="text-text-muted">no vendor match</span>
                    )}
                    {r.status === "duplicate" && (
                      <span className="badge badge-warning">
                        Already exists #{r.duplicateAssetId}
                      </span>
                    )}
                    {r.status === "error" && (
                      <span className="badge badge-danger" title={r.errorMessage}>
                        Failed
                      </span>
                    )}
                  </div>

                  <div style={{ width: "10rem", flexShrink: 0 }}>
                    <Select
                      value={r.type}
                      onChange={(v) =>
                        patchRow(r.id, { type: v as AssetType })
                      }
                      disabled={r.status === "duplicate" || submitting}
                      size="sm"
                      options={TYPE_OPTIONS.map((o) => ({
                        value: o.value,
                        label: assetTypeLabel(o.value),
                      }))}
                    />
                  </div>

                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => removeRow(r.id)}
                    disabled={submitting}
                    title="Remove"
                    aria-label={`Remove ${r.serial}`}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={submitting || submittableRows.length === 0}
          >
            {submitting
              ? `Onboarding ${progressDone}/${submittableRows.length}…`
              : `Onboard ${submittableRows.length} device${
                  submittableRows.length === 1 ? "" : "s"
                }`}
          </button>
        </div>
      </div>
    </div>
  );
}
