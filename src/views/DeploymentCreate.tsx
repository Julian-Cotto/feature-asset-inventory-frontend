import { useEffect, useMemo, useState } from "react";

import DatePicker from "../components/DatePicker";
import Select from "../components/Select";
import {
  getAssetFacets,
  listAssets,
  listLocations,
  type AssetFacets,
} from "../services/inventory";
import { createDeployment } from "../services/deployments";
import type { Asset, AssetType, Location } from "../types/inventory";
import type { AddressInput, AutoAssignRequest } from "../types/deployment";
import { friendlyModel } from "../utils/friendlyModel";

interface Props {
  onCreated: (deploymentId: number) => void;
  onCancel: () => void;
}

const ASSET_TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: "laptop", label: "Laptop" },
  { value: "desktop", label: "Desktop" },
  { value: "thin_client", label: "Thin client" },
  { value: "ap", label: "Access point" },
  { value: "switch", label: "Switch" },
  { value: "gateway", label: "Gateway" },
];

const TYPE_SUGGESTIONS = [
  "acquisition",
  "new_build",
  "expansion",
  "relocation",
];

const EMPTY_ADDRESS: AddressInput = {
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "",
};

export default function DeploymentCreate({ onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [typeValue, setTypeValue] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [targetLocationId, setTargetLocationId] = useState<number | "">("");
  const [targetAddress, setTargetAddress] = useState<AddressInput>({
    ...EMPTY_ADDRESS,
  });

  const [pickMode, setPickMode] = useState<"manual" | "auto">("manual");
  const [pickedAssetIds, setPickedAssetIds] = useState<number[]>([]);
  const [pickedAssets, setPickedAssets] = useState<Asset[]>([]);
  const [autoRows, setAutoRows] = useState<AutoAssignRequest[]>([
    { asset_type: "laptop", quantity: 1 },
  ]);

  const [assetSearch, setAssetSearch] = useState("");
  const [searchTypeFilter, setSearchTypeFilter] = useState("");
  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [facets, setFacets] = useState<AssetFacets | null>(null);
  const [availableFacets, setAvailableFacets] = useState<AssetFacets | null>(
    null,
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listLocations().then(setLocations).catch(() => {});
    getAssetFacets().then(setFacets).catch(() => {});
    getAssetFacets(true).then(setAvailableFacets).catch(() => {});
  }, []);

  // Distinct models per asset_type that have AVAILABLE stock (in_warehouse,
  // unreserved). Drives auto-assign model dropdown so users can't pick a
  // model with zero pickable inventory. Count appended to label.
  const modelsByType = useMemo(() => {
    const m = new Map<
      string,
      { model: string; label: string; count: number }[]
    >();
    const source = availableFacets ?? facets;
    if (!source) return m;
    for (const row of source.models) {
      if (!row.model) continue;
      const list = m.get(row.asset_type) ?? [];
      const friendlyParts = [row.series, row.generation].filter(Boolean);
      const friendly = friendlyParts.join(" · ");
      const baseLabel =
        friendly && friendly !== row.model
          ? `${friendly} (${row.model})`
          : row.model;
      const isFriendly = friendly.length > 0 && friendly !== row.model;

      const existingIdx = list.findIndex((x) => x.model === row.model);
      if (existingIdx === -1) {
        list.push({ model: row.model, label: baseLabel, count: row.count });
      } else {
        list[existingIdx].count += row.count;
        if (isFriendly && list[existingIdx].label === row.model) {
          list[existingIdx].label = baseLabel;
        }
      }
      m.set(row.asset_type, list);
    }
    for (const [, v] of m) v.sort((a, b) => a.label.localeCompare(b.label));
    return m;
  }, [availableFacets, facets]);

  const runSearch = useMemo(
    () => async (term: string, typeFilter: string, showAll: boolean) => {
      if (!term.trim() && !typeFilter) {
        setSearchResults([]);
        return;
      }
      try {
        const results = await listAssets({
          q: term || undefined,
          asset_type: typeFilter || undefined,
          available_only: !showAll,
          limit: 30,
        });
        setSearchResults(results);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  useEffect(() => {
    const t = window.setTimeout(
      () => void runSearch(assetSearch, searchTypeFilter, showAllAssets),
      250,
    );
    return () => window.clearTimeout(t);
  }, [assetSearch, searchTypeFilter, showAllAssets, runSearch]);


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

  function nonEmptyAddress(addr: AddressInput): AddressInput | null {
    const hasAny = Object.values(addr).some(
      (v) => v && String(v).trim().length > 0,
    );
    return hasAny ? addr : null;
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const d = await createDeployment({
        name: name.trim(),
        type: typeValue.trim() || null,
        description: description || null,
        notes: notes || null,
        target_date: targetDate ? new Date(targetDate).toISOString() : null,
        target_location_id:
          targetLocationId === "" ? null : Number(targetLocationId),
        target_address: nonEmptyAddress(targetAddress),
        asset_ids: pickMode === "manual" ? pickedAssetIds : [],
        auto_assign:
          pickMode === "auto"
            ? autoRows.filter((r) => r.quantity > 0)
            : [],
      });
      onCreated(d.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = name.trim().length > 0;

  return (
    <div className="stack-lg sticky-actions-spacer">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">New deployment</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          ← Back
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stack-lg max-w-xl">
        <section className="card">
          <div className="card-header">
            <span className="eyebrow">Identify</span>
          </div>
          <div className="card-body stack">
            <Field label="Name">
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. New Salt Lake office build-out"
              />
            </Field>
            <Field label="Type">
              <Select
                value={typeValue}
                onChange={setTypeValue}
                placeholder="— select —"
                options={TYPE_SUGGESTIONS.map((t) => ({
                  value: t,
                  label: t.replace(/_/g, " "),
                }))}
              />
            </Field>
            <Field label="Target date (optional)">
              <DatePicker value={targetDate} onChange={setTargetDate} />
            </Field>
            <Field label="Description (optional)">
              <input
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <span className="eyebrow">Target location</span>
          </div>
          <div className="card-body stack">
            <Field label="Saved location (optional)">
              <Select
                value={targetLocationId === "" ? "" : String(targetLocationId)}
                onChange={(v) => {
                  const id = v === "" ? "" : Number(v);
                  setTargetLocationId(id);
                  if (id !== "") {
                    const loc = locations.find((l) => l.id === id);
                    if (loc) {
                      setTargetAddress({
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
                value={targetAddress.address_line1 ?? ""}
                onChange={(e) =>
                  setTargetAddress({
                    ...targetAddress,
                    address_line1: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Address line 2">
              <input
                className="input"
                value={targetAddress.address_line2 ?? ""}
                onChange={(e) =>
                  setTargetAddress({
                    ...targetAddress,
                    address_line2: e.target.value,
                  })
                }
              />
            </Field>
            <div className="form-row">
              <Field label="City">
                <input
                  className="input"
                  value={targetAddress.city ?? ""}
                  onChange={(e) =>
                    setTargetAddress({ ...targetAddress, city: e.target.value })
                  }
                />
              </Field>
              <Field label="State / Province">
                <input
                  className="input"
                  value={targetAddress.state ?? ""}
                  onChange={(e) =>
                    setTargetAddress({ ...targetAddress, state: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Postal code">
                <input
                  className="input"
                  value={targetAddress.postal_code ?? ""}
                  onChange={(e) =>
                    setTargetAddress({
                      ...targetAddress,
                      postal_code: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Country">
                <input
                  className="input"
                  value={targetAddress.country ?? ""}
                  onChange={(e) =>
                    setTargetAddress({
                      ...targetAddress,
                      country: e.target.value,
                    })
                  }
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <span className="eyebrow">Assets (optional)</span>
          </div>
          <div className="card-body stack">
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

            {pickMode === "manual" ? (
              <>
                <Field label="Type filter">
                  <Select
                    value={searchTypeFilter}
                    onChange={setSearchTypeFilter}
                    placeholder="— any type —"
                    options={[
                      { value: "", label: "— any type —" },
                      ...ASSET_TYPE_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      })),
                    ]}
                  />
                </Field>
                <Field label="Search by tag / serial / model">
                  <input
                    className="input"
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    placeholder="Type to search… (or just use type filter above)"
                  />
                  <label
                    className="cluster mt-1 text-xs text-text-muted cursor-pointer"
                    style={{ gap: "0.4rem" }}
                  >
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={showAllAssets}
                      onChange={(e) => setShowAllAssets(e.target.checked)}
                    />
                    Show assigned / reserved assets too
                  </label>
                  {searchResults.length > 0 && (
                    <div className="card mt-1">
                      <ul className="list-clean">
                        {searchResults.map((a) => (
                          <li
                            key={a.id}
                            className="row-clickable px-3 py-2 border-b border-border"
                            onClick={() => pickAsset(a)}
                          >
                            <div className="cluster" style={{ justifyContent: "space-between" }}>
                              <div className="cluster">
                                <span className="font-mono text-xs">
                                  {a.asset_tag ?? a.serial_number}
                                </span>
                                <span className="text-muted">·</span>
                                <span className="text-muted">{a.asset_type}</span>
                                <span className="text-muted">·</span>
                                <span>{friendlyModel(a)}</span>
                              </div>
                              <span className="badge">{a.status_code}</span>
                            </div>
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
                {autoRows.map((row, idx) => {
                  const availableModels = modelsByType.get(row.asset_type) ?? [];
                  return (
                    <div key={idx} className="stack">
                      <div className="form-row">
                        <Field label="Type">
                          <Select
                            value={row.asset_type}
                            onChange={(v) =>
                              setAutoRows((rows) =>
                                rows.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        asset_type: v as AssetType,
                                        model: null,
                                      }
                                    : r,
                                ),
                              )
                            }
                            options={ASSET_TYPE_OPTIONS.map((o) => ({
                              value: o.value,
                              label: o.label,
                            }))}
                          />
                        </Field>
                        <Field label="Model (optional)">
                          <Select
                            value={row.model ?? ""}
                            onChange={(v) =>
                              setAutoRows((rows) =>
                                rows.map((r, i) =>
                                  i === idx
                                    ? { ...r, model: v || null }
                                    : r,
                                ),
                              )
                            }
                            disabled={availableModels.length === 0}
                            placeholder={
                              availableModels.length === 0
                                ? "no available stock"
                                : "— any model —"
                            }
                            options={[
                              { value: "", label: "— any model —" },
                              ...availableModels.map((m) => ({
                                value: m.model,
                                label: `${m.label} · ${m.count} avail`,
                              })),
                            ]}
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
                              setAutoRows((rows) =>
                                rows.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        quantity: Math.max(
                                          1,
                                          Number(e.target.value),
                                        ),
                                      }
                                    : r,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label=" ">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setAutoRows((rows) =>
                                rows.filter((_, i) => i !== idx),
                              )
                            }
                            disabled={autoRows.length === 1}
                          >
                            Remove
                          </button>
                        </Field>
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    setAutoRows((rows) => [
                      ...rows,
                      { asset_type: "laptop", quantity: 1 },
                    ])
                  }
                >
                  + Add another type
                </button>
                <p className="text-muted text-xs">
                  System picks the oldest in-warehouse, unreserved assets matching
                  each type.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <span className="eyebrow">Notes</span>
          </div>
          <div className="card-body">
            <textarea
              className="textarea"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </section>
      </div>

      <div className="sticky-actions">
        <button
          type="button"
          className="btn btn-primary w-full sm:w-auto"
          disabled={!canSubmit || submitting}
          onClick={() => void submit()}
        >
          {submitting ? "Creating…" : "Create deployment"}
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
