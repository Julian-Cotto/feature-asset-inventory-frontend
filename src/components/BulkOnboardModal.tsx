import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, X } from "lucide-react";

import ScanInput from "./ScanInput";
import Select from "./Select";
import {
  listLocations,
  listStatuses,
  lookupAssetBySerial,
  lookupDevice,
  onboardAsset,
} from "../services/inventory";
import type {
  AssetStatus,
  AssetType,
  Location,
  LookupResult,
} from "../types/inventory";
import { assetTypeLabel } from "../utils/assetTypeBadge";
import { locationLabel } from "../utils/locationLabel";
import { normalizeOs } from "../utils/normalizeOs";

const TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: "laptop", label: "Laptop" },
  { value: "desktop", label: "Desktop" },
  { value: "thin_client", label: "Thin client" },
  { value: "ap", label: "Access point" },
  { value: "switch", label: "Switch" },
  { value: "gateway", label: "Gateway" },
  { value: "pos_aio", label: "POS (Windows AIO)" },
  { value: "pos_thin_client", label: "POS (thin client)" },
  { value: "pos_tablet", label: "POS tablet" },
  { value: "card_reader", label: "Credit card reader" },
  { value: "printer_office", label: "Office printer" },
  { value: "printer_receipt", label: "Receipt printer" },
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
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | "">("");
  const [rows, setRows] = useState<Row[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  // Collapse the shared defaults by default on phones so the scanned-items
  // list gets the vertical room — the whole point is to see what you scanned.
  const [showDefaults, setShowDefaults] = useState(
    () =>
      typeof window === "undefined" ||
      !window.matchMedia("(max-width: 640px)").matches,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressDone, setProgressDone] = useState(0);

  useEffect(() => {
    listStatuses()
      .then(setStatuses)
      .catch(() => {});
    listLocations()
      .then(setLocations)
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

  function newId(): string {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  }

  /** Paste-to-add: split a blob (newlines / commas / whitespace) into
   *  serials, dedupe within the paste AND against existing rows, append all
   *  at once, then kick off lookups. Much faster than scanning a printed
   *  list one at a time. */
  function addSerials(blob: string) {
    const tokens = blob
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length === 0) return;

    const existing = new Set(rows.map((r) => r.serial));
    const fresh: Row[] = [];
    for (const serial of tokens) {
      if (existing.has(serial)) continue;
      existing.add(serial);
      fresh.push({
        id: newId(),
        serial,
        type: defaultType,
        status: "looking",
        lookup: null,
        duplicateAssetId: null,
      });
    }
    if (fresh.length === 0) return;
    setRows((rs) => [...rs, ...fresh]);
    setPasteText("");
    setShowPaste(false);
    for (const r of fresh) void runRowChecks(r.id, r.serial);
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
          location_id: locationId === "" ? null : Number(locationId),
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
        style={{
          maxWidth: "780px",
          width: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header — pinned */}
        <div
          className="cluster"
          style={{ justifyContent: "space-between", flexShrink: 0 }}
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

        {/* Controls — pinned */}
        <div className="stack" style={{ gap: "0.5rem", flexShrink: 0 }}>
          {/* Defaults — collapsible so the scanned list gets the room */}
          <button
            type="button"
            onClick={() => setShowDefaults((v) => !v)}
            className="cluster"
            style={{
              justifyContent: "space-between",
              width: "100%",
              background: "transparent",
              border: "none",
              padding: "0.15rem 0",
              cursor: "pointer",
              color: "rgb(var(--color-text-muted))",
            }}
          >
            <span className="text-xs" style={{ letterSpacing: "0.04em" }}>
              Defaults
              {!showDefaults && (
                <span style={{ opacity: 0.8 }}>
                  {" · "}
                  {defaultType} · {statusCode}
                  {locationId !== "" ? " · location set" : ""}
                </span>
              )}
            </span>
            {showDefaults ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>

          {showDefaults && (
            <>
              <div className="form-row">
                <div className="field">
                  <label className="label">Type for new scans</label>
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
                  <label className="label">Status (all)</label>
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
              <div className="field">
                <label className="label">Location (all)</label>
                <Select
                  value={locationId === "" ? "" : String(locationId)}
                  onChange={(v) => setLocationId(v === "" ? "" : Number(v))}
                  disabled={submitting}
                  searchable
                  searchPlaceholder="Filter by name / address / city"
                  placeholder="— none —"
                  options={[
                    { value: "", label: "— none —" },
                    ...locations.map((l) => ({
                      value: String(l.id),
                      label: locationLabel(l),
                    })),
                  ]}
                />
              </div>
            </>
          )}

          <ScanInput
            value={scanInput}
            onChange={setScanInput}
            onScan={handleScan}
            label="Scan serial"
            autoFocus
          />

          <div className="cluster" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowPaste((v) => !v)}
              disabled={submitting}
            >
              {showPaste ? "Hide paste box" : "Paste a list of serials…"}
            </button>
          </div>
          {showPaste && (
            <div className="field">
              <textarea
                className="textarea"
                rows={3}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste serials — one per line, or comma/space separated"
                style={{ resize: "vertical", minHeight: "4rem" }}
              />
              <div
                className="cluster"
                style={{ justifyContent: "flex-end", marginTop: "0.5rem" }}
              >
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => addSerials(pasteText)}
                  disabled={submitting || !pasteText.trim()}
                >
                  Add rows
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scanned items — the flexible, always-visible scroll area */}
        <div
          className="stack"
          style={{ flex: 1, minHeight: 0, gap: "0.4rem", marginTop: "0.25rem" }}
        >
          <div
            className="cluster"
            style={{
              justifyContent: "space-between",
              gap: "0.5rem",
              flexWrap: "wrap",
              flexShrink: 0,
            }}
          >
            <span className="text-sm font-medium">
              Scanned{rows.length > 0 ? ` (${rows.length})` : ""}
              {stillLookingUp && (
                <span className="text-text-muted"> · identifying…</span>
              )}
            </span>
            {rows.length > 0 && (
              <div
                className="cluster"
                style={{ gap: "0.25rem", flexWrap: "wrap" }}
              >
                <span className="text-xs text-text-muted">Mark all:</span>
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
            )}
          </div>

          {rows.length === 0 ? (
            <div
              style={{
                flex: 1,
                minHeight: "4rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: "1.25rem",
                border: "1px dashed rgb(var(--color-border) / 0.6)",
                borderRadius: "0.75rem",
                color: "rgb(var(--color-text-muted))",
              }}
            >
              <span className="text-sm">
                Scan or paste serials — they’ll appear here to review and remove.
              </span>
            </div>
          ) : (
            <ul
              className="list-clean stack"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                gap: "0.4rem",
                paddingRight: 2,
              }}
            >
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="stack"
                  style={{
                    gap: "0.4rem",
                    padding: "0.5rem 0.6rem",
                    background: "rgb(var(--color-surface-muted))",
                    border: "1px solid rgb(var(--color-border) / 0.5)",
                    borderRadius: "0.75rem",
                  }}
                >
                  {/* Line 1: the scanned barcode + remove (always reachable) */}
                  <div
                    className="cluster"
                    style={{ justifyContent: "space-between", gap: "0.5rem" }}
                  >
                    <span
                      className="font-mono text-sm"
                      style={{ flex: 1, minWidth: 0, wordBreak: "break-all" }}
                      title={r.serial}
                    >
                      {r.serial}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeRow(r.id)}
                      disabled={submitting}
                      title="Remove"
                      aria-label={`Remove ${r.serial}`}
                      style={{ flexShrink: 0 }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Line 2: lookup status + per-row type override */}
                  <div
                    className="cluster"
                    style={{
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{ flex: "1 1 8rem", minWidth: 0 }}
                      className="text-xs text-text-muted truncate"
                    >
                      {r.status === "looking" && (
                        <span className="cluster" style={{ gap: "0.3rem" }}>
                          <Loader2 size={12} className="animate-spin" aria-hidden />
                          looking up…
                        </span>
                      )}
                      {r.status === "ready" && r.lookup?.model && (
                        <span
                          title={`${r.lookup.manufacturer ?? ""} ${r.lookup.model}`}
                        >
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
                    <div style={{ flex: "0 1 10rem", minWidth: "8rem" }}>
                      <Select
                        value={r.type}
                        onChange={(v) => patchRow(r.id, { type: v as AssetType })}
                        disabled={r.status === "duplicate" || submitting}
                        size="sm"
                        options={TYPE_OPTIONS.map((o) => ({
                          value: o.value,
                          label: assetTypeLabel(o.value),
                        }))}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <div className="alert alert-error" style={{ flexShrink: 0 }}>
            {error}
          </div>
        )}

        {/* Footer — pinned */}
        <div className="modal-actions" style={{ flexShrink: 0 }}>
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
