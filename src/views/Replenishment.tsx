import { useEffect, useMemo, useState } from "react";

import Select from "../components/Select";
import { useToast } from "../components/ToastProvider";
import { AccentPill } from "../components/visual";
import { locationLabel } from "../utils/locationLabel";
import { getAssetFacets, listLocations } from "../services/inventory";
import type { AssetFacetRow } from "../services/inventory";
import {
  deleteReorderRule,
  getReplenishment,
  listReorderRules,
  upsertReorderRule,
} from "../services/logistics";
import type { Location } from "../types/inventory";
import type { ReorderRule, ReplenishmentRow } from "../types/logistics";

const ASSET_TYPES = [
  "laptop",
  "desktop",
  "thin_client",
  "ap",
  "switch",
  "gateway",
  "pos_aio",
  "pos_thin_client",
  "pos_tablet",
  "card_reader",
  "printer_office",
  "printer_receipt",
] as const;

export default function Replenishment() {
  const toast = useToast();

  const [rows, setRows] = useState<ReplenishmentRow[]>([]);
  const [rules, setRules] = useState<ReorderRule[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [facetModels, setFacetModels] = useState<AssetFacetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [needsOnly, setNeedsOnly] = useState(false);

  const reload = () => {
    setLoading(true);
    return Promise.all([getReplenishment(), listReorderRules()])
      .then(([repl, rls]) => {
        setRows(repl);
        setRules(rls);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    void listLocations().then(setLocations).catch(() => setLocations([]));
    // Distinct models on hand — powers the reorder-rule model suggestions so
    // a rule's model string exactly matches real assets (the on-hand match is
    // an exact compare).
    void getAssetFacets()
      .then((f) => setFacetModels(f.models))
      .catch(() => setFacetModels([]));
  }, []);

  const shortCount = useMemo(
    () => rows.filter((r) => r.short > 0).length,
    [rows],
  );
  const suggestedUnits = useMemo(
    () => rows.reduce((sum, r) => sum + r.suggested_order, 0),
    [rows],
  );

  const visibleRows = useMemo(
    () => (needsOnly ? rows.filter((r) => r.needs_reorder) : rows),
    [rows, needsOnly],
  );

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Replenishment</h2>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <StatTile label="Rules" value={rules.length} tone="neutral" />
        <StatTile label="Items short" value={shortCount} tone="danger" />
        <StatTile label="Suggested units" value={suggestedUnits} tone="warning" />
      </div>

      <section className="section-block">
        <div
          className="cluster"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <span className="eyebrow">Stock vs par</span>
          <label
            className="cluster"
            style={{ gap: "0.4rem", whiteSpace: "nowrap", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={needsOnly}
              onChange={(e) => setNeedsOnly(e.target.checked)}
            />
            <span className="text-sm">Needs reorder only</span>
          </label>
        </div>
        <div className="card" style={{ padding: 0 }}>
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Type</th>
                <th>Model</th>
                <th>On hand</th>
                <th>On order</th>
                <th>Par</th>
                <th>Short</th>
                <th>Suggested</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.rule_id}>
                  <td>
                    {r.location_name ?? <span className="text-muted">—</span>}
                  </td>
                  <td>
                    <AccentPill value={r.asset_type} />
                  </td>
                  <td>{r.model ?? "any"}</td>
                  <td>{r.on_hand}</td>
                  <td>{r.on_order}</td>
                  <td>{r.par_level}</td>
                  <td>
                    {r.short > 0 ? (
                      <span
                        style={{
                          color: "rgb(var(--color-danger))",
                          fontWeight: 600,
                        }}
                      >
                        {r.short}
                      </span>
                    ) : (
                      0
                    )}
                  </td>
                  <td>{r.suggested_order || "—"}</td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    {loading
                      ? "Loading…"
                      : rows.length === 0
                        ? "No reorder rules yet. Add one below to track stock against par."
                        : "No items need reorder right now."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      </section>

      <section className="section-block">
        <span className="eyebrow">Reorder rules</span>
        <AddRuleForm
          locations={locations}
          facetModels={facetModels}
          onSaved={() => void reload()}
        />
        <div className="card">
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Model</th>
                  <th>Par</th>
                  <th>Reorder qty</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      {locations.find((l) => l.id === rule.location_id)?.name ??
                        `#${rule.location_id}`}
                    </td>
                    <td>
                      <AccentPill value={rule.asset_type} />
                    </td>
                    <td>{rule.model ?? "any"}</td>
                    <td>{rule.par_level}</td>
                    <td>{rule.reorder_qty}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          void toast
                            .run(() => deleteReorderRule(rule.id), {
                              pending: "Deleting rule…",
                              success: "Rule deleted",
                              error: (e) =>
                                e instanceof Error
                                  ? e.message
                                  : "Failed to delete rule",
                            })
                            .then(() => reload())
                            .catch(() => {
                              /* toast surfaced */
                            })
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-muted"
                      style={{ textAlign: "center", padding: "1rem" }}
                    >
                      No reorder rules yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

const TILE_TONES: Record<string, string> = {
  neutral: "var(--color-text-muted)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning" | "danger";
}) {
  const color = TILE_TONES[tone];
  const active = tone !== "neutral" && value > 0;
  return (
    <div
      className="card"
      style={{
        padding: "0.75rem 1rem",
        borderLeft: `3px solid rgb(${color} / ${active ? 1 : 0.35})`,
      }}
    >
      <div
        className="heading-2"
        style={{ margin: 0, color: active ? `rgb(${color})` : undefined }}
      >
        {value}
      </div>
      <div className="text-xs text-muted" style={{ marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function AddRuleForm({
  locations,
  facetModels,
  onSaved,
}: {
  locations: Location[];
  facetModels: AssetFacetRow[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [locationId, setLocationId] = useState<string>("");
  const [assetType, setAssetType] = useState<string>(ASSET_TYPES[0]);
  const [model, setModel] = useState("");

  // Distinct models on hand for the selected asset type — drives the
  // datalist so the model string matches real inventory.
  const modelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of facetModels) {
      if (row.asset_type === assetType && row.model) set.add(row.model);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [facetModels, assetType]);
  const [parLevel, setParLevel] = useState("0");
  const [reorderQty, setReorderQty] = useState("0");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!locationId) {
      toast.notify({ kind: "danger", title: "Location is required." });
      return;
    }
    setSaving(true);
    try {
      await toast.run(
        () =>
          upsertReorderRule({
            location_id: Number(locationId),
            asset_type: assetType,
            model: model.trim() || null,
            par_level: Number(parLevel) || 0,
            reorder_qty: Number(reorderQty) || 0,
          }),
        {
          pending: "Saving rule…",
          success: "Rule saved",
          error: (e) =>
            e instanceof Error ? e.message : "Failed to save rule",
        },
      );
      setModel("");
      onSaved();
    } catch {
      /* toast surfaced */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "0.75rem",
        alignItems: "end",
      }}
    >
      {/* Plain div, not a <label> — wrapping a custom Select in a label makes
          option clicks redirect to the trigger and never select. */}
      <div className="stack" style={{ gap: 2 }}>
        <span className="text-xs text-muted">Location</span>
        <Select
          value={locationId}
          onChange={setLocationId}
          placeholder="Select…"
          searchable
          searchPlaceholder="Filter by name / code / city"
          options={locations.map((l) => ({
            value: String(l.id),
            label: locationLabel(l),
          }))}
        />
      </div>
      <label className="stack" style={{ gap: 2 }}>
        <span className="text-xs text-muted">Asset type</span>
        <select
          className="input input-sm"
          value={assetType}
          onChange={(e) => setAssetType(e.target.value)}
        >
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="stack" style={{ gap: 2 }}>
        <span className="text-xs text-muted">
          Model
          {modelOptions.length > 0 && (
            <span style={{ opacity: 0.6 }}> · {modelOptions.length} on hand</span>
          )}
        </span>
        <input
          className="input input-sm"
          list="reorder-model-options"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={
            modelOptions.length > 0 ? "any model — or pick" : "any model"
          }
          title="Leave blank to cover any model of this type. Pick a listed model (from what's on hand) so the rule matches real assets."
        />
        <datalist id="reorder-model-options">
          {modelOptions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      <label className="stack" style={{ gap: 2 }}>
        <span
          className="text-xs text-muted"
          title="Target minimum to keep on hand at this location. When available stock (plus in-transit) falls below it, the item is flagged short."
        >
          Par level
        </span>
        <input
          className="input input-sm"
          type="number"
          min={0}
          value={parLevel}
          onChange={(e) => setParLevel(e.target.value)}
          title="Target minimum stock. Below this ⇒ flagged for reorder."
        />
      </label>
      <label className="stack" style={{ gap: 2 }}>
        <span
          className="text-xs text-muted"
          title="How many units to order when this item is short — shown as the suggested order quantity."
        >
          Reorder qty
        </span>
        <input
          className="input input-sm"
          type="number"
          min={0}
          value={reorderQty}
          onChange={(e) => setReorderQty(e.target.value)}
          title="Units to order when short (the suggested order quantity)."
        />
      </label>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => void submit()}
        disabled={saving}
      >
        {saving ? "Saving…" : "Add / update rule"}
      </button>
    </div>
  );
}
