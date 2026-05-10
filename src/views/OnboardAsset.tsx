import { useEffect, useState } from "react";
import { Cpu, Layers, MapPin, ScanBarcode, StickyNote } from "lucide-react";

import BulkOnboardModal from "../components/BulkOnboardModal";
import ScanInput from "../components/ScanInput";
import Select from "../components/Select";
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

export default function OnboardAsset({ onCreated }: Props) {
  const [bulkOpen, setBulkOpen] = useState(false);
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
      // assetType defaults to "laptop". Only adopt the vendor's value if
      // the user hasn't manually picked something else during the wait.
      if (result.assetType)
        setAssetType((curr) =>
          curr === "laptop" ? result.assetType! : curr,
        );
    } catch {
      /* lookup failed — silent */
    } finally {
      setLookingUp(false);
    }
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
      onCreated(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to onboard");
    } finally {
      setSubmitting(false);
    }
  }

  const isComputer = !isNetworkType(assetType);

  return (
    <div className="stack-lg sticky-actions-spacer">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Onboard asset</h2>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Identify ─────────────────────────────────────────── */}
        <section className="card lg:col-span-2">
          <div className="card-header">
            <span className="cluster" style={{ gap: "0.5rem" }}>
              <ScanBarcode size={14} className="text-primary" />
              <span className="eyebrow">Identify</span>
            </span>
          </div>
          <div className="card-body stack">
            <ScanInput
              value={serial}
              onChange={setSerial}
              onScan={handleScan}
              label="Serial number (scan or type)"
            />
            {duplicate !== null && (
              <div className="alert alert-warning">
                Serial already exists as asset #{duplicate}.
              </div>
            )}
            {lookingUp && (
              <div className="text-muted text-sm">Identifying device…</div>
            )}
            {lookup && lookup.manufacturer && (
              <div className="alert alert-info">
                Identified: <strong>{lookup.manufacturer}</strong>
                {lookup.model ? ` · ${lookup.model}` : ""}
                {lookup.cached ? " (cached)" : ""}
                {lookup.intuneId && (
                  <>
                    <br />
                    <span className="text-xs">
                      Found in Intune
                      {lookup.assignedUpn
                        ? ` · assigned to ${lookup.assignedUpn}`
                        : ""}
                    </span>
                  </>
                )}
              </div>
            )}
            {lookup && !lookup.manufacturer && lookup.error && (
              <div className="text-muted text-xs">
                Lookup: {lookup.source} — {lookup.error}
              </div>
            )}
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
        </section>

        {/* ── Hardware (computer types only) ──────────────────── */}
        {isComputer && (
          <section className="card lg:col-span-2">
            <div className="card-header">
              <span className="cluster" style={{ gap: "0.5rem" }}>
                <Cpu size={14} className="text-primary" />
                <span className="eyebrow">Hardware</span>
              </span>
            </div>
            <div className="card-body stack">
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
          </section>
        )}

        {/* ── Placement ───────────────────────────────────────── */}
        <section className="card lg:col-span-2">
          <div className="card-header">
            <span className="cluster" style={{ gap: "0.5rem" }}>
              <MapPin size={14} className="text-primary" />
              <span className="eyebrow">Placement</span>
            </span>
          </div>
          <div className="card-body stack">
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
                options={[
                  { value: "", label: "— none —" },
                  ...locations.map((l) => ({
                    value: String(l.id),
                    label: `${l.name} (${l.type})`,
                  })),
                ]}
              />
            </Field>
          </div>
        </section>

        {/* ── Notes ───────────────────────────────────────────── */}
        <section className="card lg:col-span-2">
          <div className="card-header">
            <span className="cluster" style={{ gap: "0.5rem" }}>
              <StickyNote size={14} className="text-primary" />
              <span className="eyebrow">Notes</span>
            </span>
          </div>
          <div className="card-body">
            <textarea
              className="textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any extra context (optional)"
            />
          </div>
        </section>

        {error && (
          <div className="alert alert-error lg:col-span-2">{error}</div>
        )}
      </div>

      {/* Sticky submit on mobile, inline on sm+ */}
      <div className="sticky-actions">
        <button
          type="button"
          className="btn btn-primary w-full sm:w-auto"
          onClick={() => void submit()}
          disabled={submitting || !serial.trim() || duplicate !== null}
        >
          {submitting ? "Saving…" : "Onboard asset"}
        </button>
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
