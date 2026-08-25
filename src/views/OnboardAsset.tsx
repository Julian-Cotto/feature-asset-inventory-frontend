import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Cpu,
  Layers,
  MapPin,
  ScanBarcode,
  Search,
  StickyNote,
} from "lucide-react";

import BulkOnboardModal from "../components/BulkOnboardModal";
import MerakiClaimPanel from "../components/MerakiClaimPanel";
import ScanInput from "../components/ScanInput";
import Select from "../components/Select";
import { useToast } from "../components/ToastProvider";
import { AccentPill, SectionHeader } from "../components/visual";
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
import { locationLabel } from "../utils/locationLabel";
import { normalizeOs } from "../utils/normalizeOs";

interface Props {
  onCreated: (assetId: number) => void;
}

const TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: "laptop", label: "Laptop" },
  { value: "desktop", label: "Desktop" },
  { value: "thin_client", label: "Thin client" },
  { value: "ap", label: "Access point" },
  { value: "switch", label: "Switch" },
  { value: "gateway", label: "Gateway" },
  { value: "pos_aio", label: "POS station (Windows AIO)" },
  { value: "pos_thin_client", label: "POS station (thin client)" },
  { value: "pos_tablet", label: "POS tablet" },
  { value: "card_reader", label: "Credit card reader" },
  { value: "printer_office", label: "Office printer" },
  { value: "printer_receipt", label: "Receipt printer" },
];

const NETWORK_TYPES: AssetType[] = ["ap", "switch", "gateway"];

function isNetworkType(t: AssetType): boolean {
  return NETWORK_TYPES.includes(t);
}

const OS_OPTIONS = [
  "Windows 11",
  "Windows 10",
  "Windows Server",
  "Linux",
  "Mac",
] as const;

interface RecentOnboard {
  id: number;
  serial: string;
  assetTag: string | null;
  assetType: AssetType;
  model: string | null;
}

export default function OnboardAsset({ onCreated }: Props) {
  const toast = useToast();
  const [bulkOpen, setBulkOpen] = useState(false);
  // Batch intake: stay on the form after each save, keep placement context.
  const [addAnother, setAddAnother] = useState(true);
  const [recent, setRecent] = useState<RecentOnboard[]>([]);
  const [refocusToken, setRefocusToken] = useState(0);
  const [serial, setSerial] = useState("");
  const [assetTag, setAssetTag] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("laptop");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [series, setSeries] = useState("");
  const [generation, setGeneration] = useState("");
  const [cpu, setCpu] = useState("");
  const [os, setOs] = useState("");
  const [osVersion, setOsVersion] = useState("");
  const [statusCode, setStatusCode] = useState("active");
  const [locationId, setLocationId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [duplicate, setDuplicate] = useState<number | null>(null);
  const [statuses, setStatuses] = useState<AssetStatus[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  // True once the user manually picks a Type. While false, vendor lookup
  // (Intune/Meraki — authoritative) may set the type; a manual pick locks it.
  // Reset each batch so the next scan auto-detects even after switching kinds.
  const typeTouched = useRef(false);

  useEffect(() => {
    Promise.all([listStatuses(), listLocations()])
      .then(([s, l]) => {
        setStatuses(s);
        setLocations(l);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function handleScan(value: string) {
    setSerial(value);
    setDuplicate(null);
    setLookup(null);

    // Existing-asset check (404 expected for new ones).
    try {
      const existing = await lookupAssetBySerial(value);
      setDuplicate(existing.id);
      return; // already onboarded — skip vendor lookup
    } catch {
      /* not in DB yet */
    }

    // Vendor lookup — best-effort, never blocks.
    setLookingUp(true);
    try {
      const result = await lookupDevice(value);
      setLookup(result);
      // Pre-fill blank fields only — use functional setters so we read
      // each field's *current* value at apply time. Otherwise typing into
      // a field during the (potentially slow) lookup would get overwritten
      // by stale closure-captured "empty" checks.
      if (result.manufacturer)
        setManufacturer((curr) => curr || result.manufacturer!);
      if (result.model) setModel((curr) => curr || result.model!);
      if (result.series) setSeries((curr) => curr || result.series!);
      if (result.generation)
        setGeneration((curr) => curr || result.generation!);
      if (result.cpu) setCpu((curr) => curr || result.cpu!);
      const normalizedOs = normalizeOs(result.os, result.osVersion);
      if (normalizedOs) setOs((curr) => curr || normalizedOs);
      if (result.osVersion)
        setOsVersion((curr) => curr || result.osVersion!);
      // Adopt the vendor's type unless the user has manually locked it.
      if (result.assetType && !typeTouched.current)
        setAssetType(result.assetType);
    } catch {
      /* lookup failed — silent */
    } finally {
      setLookingUp(false);
    }
  }

  /** Clear identity + hardware for the next scan while KEEPING placement
   *  context (type / status / location) — the fields that stay constant
   *  across a batch going to one place. */
  function resetForNext() {
    setSerial("");
    setAssetTag("");
    setManufacturer("");
    setModel("");
    setSeries("");
    setGeneration("");
    setCpu("");
    setOs("");
    setOsVersion("");
    setNotes("");
    setLookup(null);
    setDuplicate(null);
    // Let the next scan's vendor lookup auto-detect the type again. The
    // current type value is retained (homogeneous batch), but an inherited
    // value is no longer "locked" against a confident vendor match.
    typeTouched.current = false;
    setRefocusToken((t) => t + 1);
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const created = await onboardAsset({
        asset_tag: assetTag.trim() || null,
        serial_number: serial.trim(),
        asset_type: assetType,
        manufacturer: manufacturer || null,
        model: model || null,
        series: series || null,
        generation: generation || null,
        cpu: cpu || null,
        os: os || null,
        os_version: osVersion || null,
        status_code: statusCode,
        location_id: locationId === "" ? null : Number(locationId),
        notes: notes || null,
        intune_id: lookup?.intuneId ?? null,
      });

      if (addAnother) {
        // Stay on the form for the next device.
        setRecent((r) => [
          {
            id: created.id,
            serial: serial.trim(),
            assetTag: assetTag.trim() || null,
            assetType,
            model: model || null,
          },
          ...r,
        ]);
        toast.notify({
          kind: "success",
          title: `Onboarded ${serial.trim()}`,
          detail: "Ready for the next scan.",
        });
        resetForNext();
      } else {
        onCreated(created.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to onboard");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !submitting && !!serial.trim() && duplicate === null;

  const isComputer = !isNetworkType(assetType);

  return (
    <div
      className="stack-lg sticky-actions-spacer"
      onKeyDown={(e) => {
        // Ctrl/⌘+Enter submits from anywhere in the form.
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmit) {
          e.preventDefault();
          void submit();
        }
      }}
    >
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <div className="cluster" style={{ gap: "0.625rem", alignItems: "baseline" }}>
          <h2 className="heading-2">Onboard asset</h2>
          {recent.length > 0 && (
            <span className="badge badge-success">
              {recent.length} onboarded this session
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setBulkOpen(true)}
          title="Onboard multiple devices at once"
        >
          <Layers size={14} strokeWidth={1.75} />
          Bulk add
        </button>
      </div>

      <div className="card card-body stack">
        <SectionHeader
          icon={<ScanBarcode size={16} />}
          title="Identify"
          tint="info"
        />
        <ScanInput
          value={serial}
          onChange={setSerial}
          onScan={handleScan}
          label="Serial number (scan or type)"
          refocusToken={refocusToken}
        />
        {duplicate !== null && (
          <div
            className="alert alert-warning cluster"
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <span>Serial already exists as asset #{duplicate}.</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onCreated(duplicate)}
            >
              Open asset #{duplicate} <ArrowRight size={14} />
            </button>
          </div>
        )}
        {lookingUp && (
          <div
            className="cluster text-info-soft-fg text-sm"
            style={{ gap: "0.375rem" }}
          >
            <Search size={14} className="animate-spin" />
            Identifying device…
          </div>
        )}
        {lookup && lookup.manufacturer && (
          <div
            className="card card-body stack"
            style={{
              background: "rgb(var(--color-success) / 0.08)",
              borderColor: "rgb(var(--color-success) / 0.35)",
            }}
          >
            <div className="cluster" style={{ gap: "0.5rem" }}>
              <CheckCircle2
                size={16}
                className="text-success-soft-fg shrink-0"
              />
              <span className="font-medium">Device identified</span>
              {lookup.cached && (
                <span className="badge text-xs">cached</span>
              )}
              {lookup.intuneId && (
                <span className="badge badge-info text-xs">Intune</span>
              )}
            </div>
            <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
              <AccentPill value={lookup.manufacturer} />
              {lookup.model && <AccentPill value={lookup.model} />}
            </div>
            {lookup.intuneId && lookup.assignedUpn && (
              <span className="text-xs text-muted">
                Currently assigned to{" "}
                <code className="font-mono">{lookup.assignedUpn}</code>
              </span>
            )}
          </div>
        )}
        {lookup && !lookup.manufacturer && lookup.error && (
          <div className="text-muted text-xs">
            Lookup: {lookup.source} — {lookup.error}
          </div>
        )}
        <div className="form-row">
          <Field label="Asset tag (optional)">
            <input
              className="input"
              value={assetTag}
              onChange={(e) => setAssetTag(e.target.value)}
              placeholder="leave blank if none"
            />
          </Field>
          <Field label="Type">
            <Select
              value={assetType}
              onChange={(v) => {
                const next = v as AssetType;
                typeTouched.current = true;
                setAssetType(next);
                if (isNetworkType(next)) {
                  setOs("");
                  setOsVersion("");
                  setSeries("");
                  setGeneration("");
                  setCpu("");
                }
              }}
              options={TYPE_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </Field>
        </div>
        {isNetworkType(assetType) && serial.trim() && (
          <div
            className="stack"
            style={{
              gap: "0.4rem",
              padding: "0.75rem 0.9rem",
              borderRadius: 8,
              background: "rgb(var(--color-bg) / 0.4)",
              border: "1px dashed rgb(var(--color-border) / 0.5)",
            }}
          >
            <span className="text-xs text-muted">
              Meraki org claim (idempotent — safe if already claimed):
            </span>
            <MerakiClaimPanel serial={serial} compact />
          </div>
        )}
      </div>

      {isComputer && (
        <div className="card card-body stack">
          <SectionHeader
            icon={<Cpu size={16} />}
            title="Hardware"
            tint="purple"
          />
          <div className="form-row">
            <Field label="Manufacturer">
              <input
                className="input"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
              />
            </Field>
            <Field label="Model">
              <input
                className="input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Series (optional)">
              <input
                className="input"
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                placeholder="e.g. ThinkPad E16"
              />
            </Field>
            <Field label="Generation (optional)">
              <input
                className="input"
                value={generation}
                onChange={(e) => setGeneration(e.target.value)}
                placeholder="e.g. Gen 1"
              />
            </Field>
          </div>
          <Field label="CPU (optional)">
            <input
              className="input"
              value={cpu}
              onChange={(e) => setCpu(e.target.value)}
              placeholder="e.g. i7-1355U"
            />
          </Field>
          <div className="form-row">
            <Field label="OS">
              <Select
                value={os}
                onChange={setOs}
                placeholder="— select —"
                options={[
                  { value: "", label: "— select —" },
                  ...OS_OPTIONS.map((o) => ({ value: o, label: o })),
                ]}
              />
            </Field>
            <Field label="OS version (optional)">
              <input
                className="input"
                value={osVersion}
                onChange={(e) => setOsVersion(e.target.value)}
                placeholder="e.g. 23H2, 14.4, Ubuntu 22.04"
              />
            </Field>
          </div>
        </div>
      )}

      <div className="card card-body stack">
        <SectionHeader
          icon={<MapPin size={16} />}
          title="Placement"
          tint="green"
        />
        <div className="form-row">
          <Field label="Status">
            <Select
              value={statusCode}
              onChange={setStatusCode}
              options={statuses.map((s) => ({
                value: s.code,
                label: s.label,
              }))}
            />
          </Field>
          <Field label="Location (optional)">
            <Select
              value={locationId === "" ? "" : String(locationId)}
              onChange={(v) => setLocationId(v === "" ? "" : Number(v))}
              placeholder="— none —"
              searchable
              searchPlaceholder="Filter by name / address / city"
              options={[
                { value: "", label: "— none —" },
                ...locations.map((l) => ({
                  value: String(l.id),
                  label: locationLabel(l),
                })),
              ]}
            />
          </Field>
        </div>
      </div>

      <div className="card card-body stack">
        <SectionHeader
          icon={<StickyNote size={16} />}
          title="Notes"
          tint="amber"
        />
        <textarea
          className="textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={6}
          placeholder="Any extra context (optional)"
          style={{ minHeight: "8rem", resize: "vertical" }}
        />
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Recently onboarded this session — reassurance + quick jump. */}
      {recent.length > 0 && (
        <div className="card card-body stack">
          <SectionHeader
            icon={<CheckCircle2 size={16} />}
            title="Onboarded this session"
            tint="green"
          />
          <div className="scroll-x">
            <table className="table">
              <tbody>
                {recent.map((r) => (
                  <tr
                    key={r.id}
                    className="row-clickable"
                    onClick={() => onCreated(r.id)}
                  >
                    <td className="font-mono text-xs">{r.serial}</td>
                    <td>{r.assetTag ?? "—"}</td>
                    <td>
                      <AccentPill value={r.assetType} />
                    </td>
                    <td className="text-muted">{r.model ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <span className="text-info-soft-fg cluster" style={{ gap: 4, justifyContent: "flex-end" }}>
                        Open <ArrowRight size={13} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sticky submit on mobile, inline on sm+ */}
      <div className="sticky-actions cluster" style={{ gap: "1rem", alignItems: "center" }}>
        <button
          type="button"
          className="btn btn-primary w-full sm:w-auto"
          onClick={() => void submit()}
          disabled={!canSubmit}
          title="Ctrl/⌘+Enter"
        >
          {submitting
            ? "Saving…"
            : addAnother
              ? "Onboard & add another"
              : "Onboard asset"}
        </button>
        <label className="cluster" style={{ gap: "0.4rem", whiteSpace: "nowrap" }}>
          <input
            type="checkbox"
            className="checkbox"
            checked={addAnother}
            onChange={(e) => setAddAnother(e.target.checked)}
          />
          <span className="text-sm text-muted">
            Keep adding (retains type, status &amp; location)
          </span>
        </label>
      </div>

      {bulkOpen && (
        <BulkOnboardModal
          onCancel={() => setBulkOpen(false)}
          onCreated={(ids) => {
            setBulkOpen(false);
            // Hand the most recent created asset back to the parent so the
            // existing post-onboard flow (navigate to detail) still works.
            if (ids.length > 0) onCreated(ids[ids.length - 1]);
          }}
        />
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

