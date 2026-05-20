import { useEffect, useState } from "react";
import { X } from "lucide-react";

import Select from "./Select";
import {
  bulkSetLocation,
  listLocations,
  type BulkLocationResult,
} from "../services/inventory";
import type { Location } from "../types/inventory";
import { locationLabel } from "../utils/locationLabel";

interface Props {
  assetIds: number[];
  onApplied: (result: BulkLocationResult) => void;
  onCancel: () => void;
}

export default function BulkLocationModal({
  assetIds,
  onApplied,
  onCancel,
}: Props) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  async function apply() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await bulkSetLocation(
        assetIds,
        locationId === "" ? null : Number(locationId),
      );
      onApplied(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk update failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <div className="modal-panel" style={{ maxWidth: "480px" }}>
        <div
          className="cluster"
          style={{ justifyContent: "space-between", marginBottom: "0.25rem" }}
        >
          <h3 className="modal-title">Set location for {assetIds.length} asset{assetIds.length === 1 ? "" : "s"}</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-muted text-sm" style={{ marginTop: 0 }}>
          Pick a location to apply, or leave blank to clear. Each changed
          asset gets a history entry.
        </p>

        <div className="field">
          <label className="label">Location</label>
          <Select
            value={locationId}
            onChange={setLocationId}
            placeholder="— clear location —"
            searchable
            searchPlaceholder="Filter by name / address / city"
            disabled={submitting}
            options={[
              { value: "", label: "— clear location —" },
              ...locations.map((l) => ({
                value: String(l.id),
                label: locationLabel(l),
              })),
            ]}
          />
        </div>

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
            onClick={() => void apply()}
            disabled={submitting}
          >
            {submitting ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
