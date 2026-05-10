import { useEffect, useMemo, useState } from "react";

import {
  listAssets,
  listLocations,
} from "../services/inventory";
import { createShipment, detectCarrier } from "../services/shipments";
import type { Asset, AssetType, Location } from "../types/inventory";
import ScanInput from "../components/ScanInput";
import Select from "../components/Select";
import { friendlyModel } from "../utils/friendlyModel";
import type {
  AddressInput,
  AutoAssignRequest,
  ShipmentCarrier,
  ShipmentDirection,
} from "../types/shipment";

interface Props {
  onCreated: (shipmentId: number) => void;
  onCancel: () => void;
}

const DIRECTION_OPTIONS: { value: ShipmentDirection; label: string }[] = [
  { value: "outbound", label: "Outbound" },
  { value: "inbound", label: "Inbound" },
];

const CARRIER_OPTIONS: { value: ShipmentCarrier; label: string }[] = [
  { value: "ups", label: "UPS" },
  { value: "fedex", label: "FedEx" },
  { value: "other", label: "Other (manual updates)" },
];

const ASSET_TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: "laptop", label: "Laptop" },
  { value: "desktop", label: "Desktop" },
  { value: "thin_client", label: "Thin client" },
  { value: "ap", label: "Access point" },
  { value: "switch", label: "Switch" },
  { value: "gateway", label: "Gateway" },
];

const EMPTY_ADDRESS: AddressInput = {
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "",
};

export default function ShipmentCreate({ onCreated, onCancel }: Props) {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState<ShipmentCarrier>("other");
  const [direction, setDirection] = useState<ShipmentDirection>("outbound");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  const [fromLocationId, setFromLocationId] = useState<number | "">("");
  const [fromAddress, setFromAddress] = useState<AddressInput>({ ...EMPTY_ADDRESS });
  const [toLocationId, setToLocationId] = useState<number | "">("");
  const [toAddress, setToAddress] = useState<AddressInput>({ ...EMPTY_ADDRESS });

  const [pickMode, setPickMode] = useState<"manual" | "auto">("manual");
  const [pickedAssetIds, setPickedAssetIds] = useState<number[]>([]);
  const [autoRows, setAutoRows] = useState<AutoAssignRequest[]>([
    { asset_type: "laptop", quantity: 1 },
  ]);

  const [assetSearch, setAssetSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [pickedAssets, setPickedAssets] = useState<Asset[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listLocations().then(setLocations).catch(() => {});
  }, []);

  // Auto-detect carrier from tracking format
  useEffect(() => {
    const tn = trackingNumber.trim();
    if (!tn) return;
    let cancelled = false;
    void detectCarrier(tn)
      .then((res) => {
        if (cancelled) return;
        if (res.carrier && res.carrier !== "other") setCarrier(res.carrier);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [trackingNumber]);

  const runSearch = useMemo(
    () =>
      async (term: string) => {
        if (!term.trim()) {
          setSearchResults([]);
          return;
        }
        try {
          const results = await listAssets({ q: term, limit: 20 });
          setSearchResults(results);
        } catch {
          /* ignore */
        }
      },
    [],
  );

  useEffect(() => {
    const t = window.setTimeout(() => void runSearch(assetSearch), 250);
    return () => window.clearTimeout(t);
  }, [assetSearch, runSearch]);

  function pickAsset(a: Asset) {
    if (pickedAssetIds.includes(a.id)) return;
    setPickedAssetIds((ids) => [...ids, a.id]);
    setPickedAssets((list) => [...list, a]);
    setAssetSearch("");
    setSearchResults([]);
  }

  function unpickAsset(id: number) {
    setPickedAssetIds((ids) => ids.filter((x) => x !== id));
    setPickedAssets((list) => list.filter((a) => a.id !== id));
  }

  function updateAutoRow(idx: number, patch: Partial<AutoAssignRequest>) {
    setAutoRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  }

  function addAutoRow() {
    setAutoRows((rows) => [...rows, { asset_type: "laptop", quantity: 1 }]);
  }

  function removeAutoRow(idx: number) {
    setAutoRows((rows) => rows.filter((_, i) => i !== idx));
  }

  function nonEmpty(addr: AddressInput): AddressInput | null {
    const hasAny = Object.values(addr).some(
      (v) => v && String(v).trim().length > 0,
    );
    return hasAny ? addr : null;
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const created = await createShipment({
        tracking_number: trackingNumber.trim(),
        carrier,
        direction,
        description: description || null,
        notes: notes || null,
        from_location_id: fromLocationId === "" ? null : Number(fromLocationId),
        from_address: nonEmpty(fromAddress),
        to_location_id: toLocationId === "" ? null : Number(toLocationId),
        to_address: nonEmpty(toAddress),
        asset_ids: pickMode === "manual" ? pickedAssetIds : [],
        auto_assign:
          pickMode === "auto"
            ? autoRows.filter((r) => r.quantity > 0)
            : [],
      });
      onCreated(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    trackingNumber.trim().length > 0 &&
    (pickMode === "manual"
      ? pickedAssetIds.length > 0
      : autoRows.some((r) => r.quantity > 0));

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">New shipment</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          ← Back
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="form">
        {/* Tracking + carrier + direction */}
        <ScanInput
          value={trackingNumber}
          onChange={setTrackingNumber}
          onScan={(v) => setTrackingNumber(v)}
          label="Tracking number (scan or type)"
          placeholder="e.g. 1Z..., 12-digit FedEx, etc."
          autoFocus={false}
        />
        <div className="form-row">
          <Field label="Carrier (auto-detected)">
            <Select
              value={carrier}
              onChange={(v) => setCarrier(v as ShipmentCarrier)}
              options={CARRIER_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </Field>
          <Field label="Direction">
            <Select
              value={direction}
              onChange={(v) => setDirection(v as ShipmentDirection)}
              options={DIRECTION_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </Field>
        </div>
        <Field label="Description (optional)">
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Q1 onboarding batch to Boston"
          />
        </Field>

        {/* From / To */}
        <AddressBlock
          label="From"
          locationId={fromLocationId}
          setLocationId={setFromLocationId}
          address={fromAddress}
          setAddress={setFromAddress}
          locations={locations}
        />
        <AddressBlock
          label="To"
          locationId={toLocationId}
          setLocationId={setToLocationId}
          address={toAddress}
          setAddress={setToAddress}
          locations={locations}
        />

        {/* Items mode toggle */}
        <Field label="Assets">
          <div className="cluster">
            <button
              type="button"
              className={pickMode === "manual" ? "tab tab-active" : "tab"}
              onClick={() => setPickMode("manual")}
            >
              Pick specific
            </button>
            <button
              type="button"
              className={pickMode === "auto" ? "tab tab-active" : "tab"}
              onClick={() => setPickMode("auto")}
            >
              Auto-assign by type
            </button>
          </div>
        </Field>

        {pickMode === "manual" ? (
          <>
            <Field label="Search by tag / serial / model">
              <input
                className="input"
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                placeholder="Type to search…"
              />
              {searchResults.length > 0 && (
                <div className="card mt-1">
                  <ul className="list-clean">
                    {searchResults.map((a) => (
                      <li
                        key={a.id}
                        className="row-clickable px-3 py-2 border-b border-border"
                        onClick={() => pickAsset(a)}
                      >
                        <span className="font-mono">{a.serial_number}</span>{" "}
                        · {a.asset_type} · {a.manufacturer}{" "}
                        {friendlyModel(a)}{" "}
                        {a.assigned_upn && (
                          <span
                            className="badge badge-warning"
                            title={`Currently assigned to ${a.assigned_upn}`}
                          >
                            assigned
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Field>
            {pickedAssets.length > 0 && (
              <div className="card">
                <div className="scroll-x">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Serial</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickedAssets.map((a) => (
                      <tr key={a.id}>
                        <td>
                          {a.asset_tag ?? "—"} ({a.asset_type})
                        </td>
                        <td className="font-mono">{a.serial_number}</td>
                        <td>
                          <span className="badge">{a.status_code}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => unpickAsset(a.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="stack">
            {autoRows.map((row, idx) => (
              <div key={idx} className="form-row">
                <Field label="Type">
                  <Select
                    value={row.asset_type}
                    onChange={(v) =>
                      updateAutoRow(idx, { asset_type: v as AssetType })
                    }
                    options={ASSET_TYPE_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    }))}
                  />
                </Field>
                <Field label="Quantity">
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={100}
                    value={row.quantity}
                    onChange={(e) =>
                      updateAutoRow(idx, {
                        quantity: Math.max(1, Number(e.target.value)),
                      })
                    }
                  />
                </Field>
                <Field label=" ">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => removeAutoRow(idx)}
                    disabled={autoRows.length === 1}
                  >
                    Remove
                  </button>
                </Field>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={addAutoRow}
            >
              + Add another type
            </button>
            <p className="text-muted text-xs">
              System picks the oldest in-warehouse assets matching each type.
            </p>
          </div>
        )}

        <Field label="Notes (optional)">
          <textarea
            className="textarea"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <button
          type="button"
          className="btn btn-primary"
          disabled={!canSubmit || submitting}
          onClick={() => void submit()}
        >
          {submitting ? "Creating…" : "Create shipment"}
        </button>
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

interface AddressBlockProps {
  label: string;
  locationId: number | "";
  setLocationId: (v: number | "") => void;
  address: AddressInput;
  setAddress: (a: AddressInput) => void;
  locations: Location[];
}

function AddressBlock({
  label,
  locationId,
  setLocationId,
  address,
  setAddress,
  locations,
}: AddressBlockProps) {
  return (
    <div className="stack">
      <div className="eyebrow">{label}</div>
      <Field label="Saved location (optional)">
        <Select
          value={locationId === "" ? "" : String(locationId)}
          onChange={(v) => {
            const id = v === "" ? "" : Number(v);
            setLocationId(id);
            if (id !== "") {
              const loc = locations.find((l) => l.id === id);
              if (loc) {
                setAddress({
                  address_line1: loc.address_line1 ?? "",
                  address_line2: loc.address_line2 ?? "",
                  city: loc.city ?? "",
                  state: loc.state ?? "",
                  postal_code: loc.postal_code ?? "",
                  country: loc.country ?? "",
                });
              }
            }
          }}
          placeholder="— pick one or fill in below —"
          options={[
            { value: "", label: "— pick one or fill in below —" },
            ...locations.map((l) => ({
              value: String(l.id),
              label: `${l.name} (${l.type})`,
            })),
          ]}
        />
      </Field>
      <Field label="Address line 1">
        <input
          className="input"
          value={address.address_line1 ?? ""}
          onChange={(e) =>
            setAddress({ ...address, address_line1: e.target.value })
          }
        />
      </Field>
      <Field label="Address line 2">
        <input
          className="input"
          value={address.address_line2 ?? ""}
          onChange={(e) =>
            setAddress({ ...address, address_line2: e.target.value })
          }
        />
      </Field>
      <div className="form-row">
        <Field label="City">
          <input
            className="input"
            value={address.city ?? ""}
            onChange={(e) => setAddress({ ...address, city: e.target.value })}
          />
        </Field>
        <Field label="State / Province">
          <input
            className="input"
            value={address.state ?? ""}
            onChange={(e) => setAddress({ ...address, state: e.target.value })}
          />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Postal code">
          <input
            className="input"
            value={address.postal_code ?? ""}
            onChange={(e) =>
              setAddress({ ...address, postal_code: e.target.value })
            }
          />
        </Field>
        <Field label="Country">
          <input
            className="input"
            value={address.country ?? ""}
            onChange={(e) =>
              setAddress({ ...address, country: e.target.value })
            }
          />
        </Field>
      </div>
    </div>
  );
}
