import { useEffect, useRef, useState } from "react";

import Select from "./Select";
import { updateAsset } from "../services/inventory";
import type { Asset } from "../types/inventory";

const OS_OPTIONS = [
  "Windows 11",
  "Windows 10",
  "Windows Server",
  "Linux",
  "Mac",
] as const;

interface Props {
  asset: Asset;
  onSaved: (updated: Asset) => void;
  onCancel: () => void;
}

export default function EditAssetModal({ asset, onSaved, onCancel }: Props) {
  const [assetTag, setAssetTag] = useState(asset.asset_tag ?? "");
  const [overrideModel, setOverrideModel] = useState(asset.override_model ?? "");
  const [manufacturer, setManufacturer] = useState(asset.manufacturer ?? "");
  const [model, setModel] = useState(asset.model ?? "");
  const [series, setSeries] = useState(asset.series ?? "");
  const [generation, setGeneration] = useState(asset.generation ?? "");
  const [cpu, setCpu] = useState(asset.cpu ?? "");
  const [os, setOs] = useState(asset.os ?? "");
  const [osVersion, setOsVersion] = useState(asset.os_version ?? "");
  const [notes, setNotes] = useState(asset.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const downOnBackdropRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const updated = await updateAsset(asset.id, {
        asset_tag: assetTag.trim() || null,
        override_model: overrideModel.trim() || null,
        manufacturer: manufacturer.trim() || null,
        model: model.trim() || null,
        series: series.trim() || null,
        generation: generation.trim() || null,
        cpu: cpu.trim() || null,
        os: os || null,
        os_version: osVersion.trim() || null,
        notes: notes.trim() || null,
      });
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Edit asset"
      onMouseDown={(e) => {
        downOnBackdropRef.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (downOnBackdropRef.current && e.target === e.currentTarget) {
          onCancel();
        }
        downOnBackdropRef.current = false;
      }}
    >
      <div
        className="modal-panel max-w-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cluster" style={{ justifyContent: "space-between" }}>
          <h2 className="modal-title">Edit asset</h2>
          <span className="text-muted text-xs font-mono">
            {asset.serial_number}
          </span>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="stack max-h-[70vh] overflow-y-auto">
          <Field label="Asset tag">
            <input
              className="input"
              value={assetTag}
              onChange={(e) => setAssetTag(e.target.value)}
              placeholder="leave blank if none"
            />
          </Field>
          <Field label="Override model (display name)">
            <input
              className="input"
              value={overrideModel}
              onChange={(e) => setOverrideModel(e.target.value)}
              placeholder="optional — wins over auto-detected name"
            />
          </Field>
          <div className="form-row">
            <Field label="Manufacturer">
              <input
                className="input"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
              />
            </Field>
            <Field label="Model (raw)">
              <input
                className="input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Series">
              <input
                className="input"
                value={series}
                onChange={(e) => setSeries(e.target.value)}
              />
            </Field>
            <Field label="Generation">
              <input
                className="input"
                value={generation}
                onChange={(e) => setGeneration(e.target.value)}
              />
            </Field>
          </div>
          <Field label="CPU">
            <input
              className="input"
              value={cpu}
              onChange={(e) => setCpu(e.target.value)}
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
            <Field label="OS version">
              <input
                className="input"
                value={osVersion}
                onChange={(e) => setOsVersion(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              className="textarea"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
