/** Asset locator — pick model token(s), see which networks the matching
 *  devices live on, export to CSV or XLSX.
 *
 *  Lives above the main Assets table. Model token list comes from the
 *  /assets/facets endpoint (already populated for filter menus). Match is
 *  substring against override_model / series / model server-side, so
 *  picking "ThinkBook" returns every variant. */

import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  Download,
  Filter,
  Network as NetworkIcon,
  Search,
  X,
} from "lucide-react";

import { useToast } from "../components/ToastProvider";
import {
  AccentPill,
  SectionHeader,
} from "../components/visual";
import { getAssetFacets, type AssetFacetRow } from "../services/inventory";
import {
  downloadLocatorExport,
  locateAssets,
  type LocatorQuery,
  type LocatorResult,
} from "../services/assetLocator";

/** True if `raw` looks like a MAC — 12 hex chars after stripping common
 *  separators (`:`, `-`, `.`, whitespace). Anything else gets treated as
 *  a serial number. */
function isMac(raw: string): boolean {
  const cleaned = raw.replace(/[\s:.\-]/g, "");
  return /^[0-9A-Fa-f]{12}$/.test(cleaned);
}

interface Props {
  onAssetClick?: (id: number) => void;
  onNetworkClick?: (id: number) => void;
}

/** Distinct human-facing model labels with their underlying token (what we
 *  send to the backend) and a cumulative count. We dedupe by series first,
 *  raw model second, so "ThinkBook" shows once with the sum of all its
 *  generation variants. */
interface ModelChoice {
  label: string;       // what user sees in the picker
  token: string;       // what gets sent to backend (substring matched)
  manufacturer: string | null;
  count: number;
  asset_types: Set<string>;
}

function buildChoices(rows: AssetFacetRow[]): ModelChoice[] {
  const byKey = new Map<string, ModelChoice>();
  for (const r of rows) {
    // Prefer series as the grouping token (Lenovo enrichment), fall back to
    // model. Skip rows with neither.
    const label = (r.series && r.series.trim()) || (r.model && r.model.trim());
    if (!label) continue;
    const key = `${r.manufacturer ?? ""}::${label.toLowerCase()}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        label,
        token: label,
        manufacturer: r.manufacturer,
        count: 0,
        asset_types: new Set(),
      };
      byKey.set(key, entry);
    }
    entry.count += r.count;
    entry.asset_types.add(r.asset_type);
  }
  return [...byKey.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

export default function AssetLocatorPanel({
  onAssetClick,
  onNetworkClick,
}: Props) {
  const toast = useToast();

  const [choices, setChoices] = useState<ModelChoice[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set()); // tokens
  const [pickerFilter, setPickerFilter] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  // Free-text serial/MAC chips. MAC vs serial classification happens at
  // add time so the user sees what kind of match will run.
  const [serials, setSerials] = useState<string[]>([]);
  const [macs, setMacs] = useState<string[]>([]);
  const [freeInput, setFreeInput] = useState("");
  const [live, setLive] = useState(false);

  const [result, setResult] = useState<LocatorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"csv" | "xlsx" | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const pickerRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Load model choices once.
  useEffect(() => {
    void getAssetFacets(false)
      .then((f) => setChoices(buildChoices(f.models)))
      .catch((e) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  }, []);

  // Close popups when clicking outside.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (pickerOpen && pickerRef.current && !pickerRef.current.contains(target)) {
        setPickerOpen(false);
      }
      if (exportOpen && exportRef.current && !exportRef.current.contains(target)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [pickerOpen, exportOpen]);

  const filteredChoices = useMemo(() => {
    const q = pickerFilter.trim().toLowerCase();
    if (!q) return choices;
    return choices.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.manufacturer ?? "").toLowerCase().includes(q),
    );
  }, [choices, pickerFilter]);

  function togglePick(token: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  }

  /** Split `text` on commas/whitespace/newlines, classify each value as MAC
   *  or serial, append to the right chip list (dedup, case-insensitive). */
  function ingestTokens(text: string) {
    const parts = text
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const nextSerials = [...serials];
    const nextMacs = [...macs];
    for (const p of parts) {
      if (isMac(p)) {
        if (!nextMacs.some((m) => m.toLowerCase() === p.toLowerCase())) {
          nextMacs.push(p);
        }
      } else {
        if (!nextSerials.some((s) => s.toLowerCase() === p.toLowerCase())) {
          nextSerials.push(p);
        }
      }
    }
    setSerials(nextSerials);
    setMacs(nextMacs);
  }

  function commitFreeInput() {
    if (!freeInput.trim()) return;
    ingestTokens(freeInput);
    setFreeInput("");
  }

  /** Triggered on every value change. If the user typed (or pasted)
   *  anything containing a separator (newline, comma, tab, whitespace),
   *  ingest the completed tokens immediately and keep only the
   *  still-being-typed trailing fragment in the textarea. */
  function handleFreeInputChange(v: string) {
    if (/[\s,]/.test(v)) {
      // Split off the trailing fragment (no terminator yet) so the user can
      // keep typing it. Everything before it gets chipped.
      const match = v.match(/([^\s,]*)$/);
      const trailing = match ? match[1] : "";
      const completed = trailing ? v.slice(0, -trailing.length) : v;
      ingestTokens(completed);
      setFreeInput(trailing);
    } else {
      setFreeInput(v);
    }
  }

  function buildQuery(): LocatorQuery {
    return { tokens: [...picked], serials, macs };
  }

  function queryIsEmpty(): boolean {
    return picked.size === 0 && serials.length === 0 && macs.length === 0;
  }

  async function runSearch() {
    if (queryIsEmpty()) {
      setError("Pick a model or type a serial/MAC first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await locateAssets(buildQuery(), false, live);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function doExport(fmt: "csv" | "xlsx") {
    if (queryIsEmpty()) {
      setError("Pick a model or type a serial/MAC first.");
      return;
    }
    setExportOpen(false);
    setDownloading(fmt);
    try {
      const query = buildQuery();
      await downloadLocatorExport(query, fmt, false, live);
      const total =
        query.tokens.length + query.serials.length + query.macs.length;
      toast.notify({
        kind: "success",
        title: `Export ready (${fmt.toUpperCase()})`,
        detail: `${total} term${total === 1 ? "" : "s"} queried`,
      });
    } catch (e) {
      toast.notify({
        kind: "danger",
        title: "Export failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setDownloading(null);
    }
  }

  const pickedChips = [...picked].map((t) => {
    const choice = choices.find((c) => c.token === t);
    return (
      <span
        key={t}
        className="badge"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "rgb(from rgb(var(--color-primary)) r g b / 0.18)",
          color: "rgb(var(--color-primary))",
          borderColor: "transparent",
        }}
      >
        {choice?.label ?? t}
        <button
          type="button"
          onClick={() => togglePick(t)}
          aria-label={`Remove ${t}`}
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          <X size={11} />
        </button>
      </span>
    );
  });

  return (
    <section className="card stack" style={{ padding: "1.5rem" }}>
      <SectionHeader
        icon={<Search size={18} />}
        title="Locate assets"
        tint="teal"
        right={
          result && (
            <span className="text-muted text-sm">
              {result.matched} matched ·{" "}
              {result.groups.length} network
              {result.groups.length === 1 ? "" : "s"}
            </span>
          )
        }
      />
      <p className="text-muted text-sm" style={{ margin: 0 }}>
        Pick a model series, paste serial numbers, or paste MAC addresses —
        results group by the network each device currently sits on. Model
        match is substring ("ThinkBook" catches all variants); serial match
        is suffix (handles Intune-truncated serials); MAC match is exact
        and accepts any separator format.
      </p>

      {/* Picker row */}
      <div
        className="cluster"
        style={{ gap: "0.5rem", alignItems: "flex-start", flexWrap: "wrap" }}
      >
        <div
          ref={pickerRef}
          style={{ position: "relative", flex: "1 1 24rem", minWidth: "20rem" }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            style={{
              width: "100%",
              justifyContent: "space-between",
              display: "flex",
              alignItems: "center",
            }}
            onClick={() => setPickerOpen((v) => !v)}
          >
            <span
              className="cluster"
              style={{ gap: "0.5rem", flexWrap: "wrap" }}
            >
              <Filter size={14} />
              {picked.size === 0 ? (
                <span className="text-muted">Pick models…</span>
              ) : (
                pickedChips
              )}
            </span>
            <ChevronDown size={14} />
          </button>
          {pickerOpen && (
            <div
              className="card"
              style={{
                position: "absolute",
                top: "calc(100% + 0.375rem)",
                left: 0,
                right: 0,
                zIndex: 30,
                padding: "0.5rem",
                maxHeight: "26rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              <input
                className="input"
                placeholder="Filter models…"
                value={pickerFilter}
                onChange={(e) => setPickerFilter(e.target.value)}
                autoFocus
              />
              {picked.size > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPicked(new Set())}
                  style={{ alignSelf: "flex-start" }}
                >
                  Clear all ({picked.size})
                </button>
              )}
              <div style={{ overflow: "auto", minHeight: 0 }}>
                {filteredChoices.length === 0 ? (
                  <p
                    className="text-muted text-sm"
                    style={{ padding: "0.5rem" }}
                  >
                    No models match "{pickerFilter}".
                  </p>
                ) : (
                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: 0,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {filteredChoices.map((c) => {
                      const checked = picked.has(c.token);
                      return (
                        <li key={`${c.manufacturer}-${c.token}`}>
                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.625rem",
                              padding: "0.4rem 0.5rem",
                              cursor: "pointer",
                              borderRadius: 6,
                              background: checked
                                ? "rgb(from rgb(var(--color-primary)) r g b / 0.08)"
                                : undefined,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePick(c.token)}
                            />
                            <span
                              className="stack"
                              style={{ gap: 1, flex: 1, minWidth: 0 }}
                            >
                              <span className="font-medium truncate">
                                {c.label}
                              </span>
                              <span className="text-xs text-muted truncate">
                                {c.manufacturer ?? "—"} ·{" "}
                                {[...c.asset_types].join(", ")}
                              </span>
                            </span>
                            <span className="badge">{c.count}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <label
          className="cluster text-xs text-muted"
          style={{
            gap: "0.35rem",
            alignItems: "center",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          title="Slower: hits Meraki /clients/search live for every MAC the cache can't place on a network."
        >
          <input
            type="checkbox"
            checked={live}
            onChange={(e) => setLive(e.target.checked)}
          />
          Live Meraki lookup
        </label>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void runSearch()}
          disabled={loading || queryIsEmpty()}
        >
          {loading
            ? live
              ? "Searching (live)…"
              : "Searching…"
            : "Find devices"}
        </button>

        {/* Export dropdown */}
        <div ref={exportRef} style={{ position: "relative" }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={queryIsEmpty() || downloading !== null}
            onClick={() => setExportOpen((v) => !v)}
            title="Export the current selection (re-runs the search server-side)"
          >
            <Download size={14} />
            {downloading
              ? `Downloading ${downloading.toUpperCase()}…`
              : "Export"}
            <ChevronDown size={12} />
          </button>
          {exportOpen && (
            <div
              className="card"
              style={{
                position: "absolute",
                top: "calc(100% + 0.375rem)",
                right: 0,
                zIndex: 30,
                padding: "0.375rem",
                minWidth: "10rem",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              <ExportMenuItem
                label="CSV"
                hint=".csv"
                onClick={() => void doExport("csv")}
              />
              <ExportMenuItem
                label="XLSX"
                hint=".xlsx · Excel"
                onClick={() => void doExport("xlsx")}
              />
            </div>
          )}
        </div>
      </div>

      {/* Serial/MAC free-text row */}
      <div
        className="stack"
        style={{ gap: "0.4rem" }}
      >
        <div
          className="cluster"
          style={{ gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}
        >
          <textarea
            className="input"
            placeholder="Paste serial numbers or MAC addresses — one per line, comma, or space. Each item becomes a removable pill."
            value={freeInput}
            onChange={(e) => handleFreeInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitFreeInput();
              }
            }}
            onBlur={() => commitFreeInput()}
            rows={2}
            style={{
              flex: "1 1 24rem",
              minWidth: "20rem",
              resize: "vertical",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.85rem",
            }}
          />
          {(serials.length > 0 || macs.length > 0) && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSerials([]);
                setMacs([]);
              }}
            >
              Clear all ({serials.length + macs.length})
            </button>
          )}
        </div>
        {(serials.length > 0 || macs.length > 0) && (
          <div
            className="cluster"
            style={{ gap: "0.35rem", flexWrap: "wrap" }}
          >
            {serials.map((s) => (
              <span
                key={`sn-${s}`}
                className="badge"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background:
                    "rgb(from rgb(var(--color-info)) r g b / 0.16)",
                  color: "rgb(var(--color-info))",
                  borderColor: "transparent",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
                title="Serial (suffix match)"
              >
                SN · {s}
                <button
                  type="button"
                  onClick={() =>
                    setSerials((prev) => prev.filter((x) => x !== s))
                  }
                  aria-label={`Remove serial ${s}`}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "inherit",
                    cursor: "pointer",
                    padding: 0,
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            {macs.map((m) => (
              <span
                key={`mac-${m}`}
                className="badge"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background:
                    "rgb(from rgb(var(--color-warning)) r g b / 0.16)",
                  color: "rgb(var(--color-warning))",
                  borderColor: "transparent",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
                title="MAC (exact match)"
              >
                MAC · {m}
                <button
                  type="button"
                  onClick={() =>
                    setMacs((prev) => prev.filter((x) => x !== m))
                  }
                  aria-label={`Remove MAC ${m}`}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "inherit",
                    cursor: "pointer",
                    padding: 0,
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Result groups */}
      {result && result.matched === 0 && (
        <p className="text-muted text-sm" style={{ margin: 0 }}>
          No devices match the current query.
        </p>
      )}
      {result && result.groups.length > 0 && (
        <div className="stack" style={{ gap: "1.25rem" }}>
          {result.groups.map((g) => (
            <div
              key={g.network_id ?? "_none"}
              className="card"
              style={{ padding: 0 }}
            >
              <div
                className="cluster"
                style={{
                  justifyContent: "space-between",
                  padding: "0.875rem 1rem",
                  borderBottom: "1px solid rgb(var(--color-border) / 0.4)",
                  background: "rgb(var(--color-bg) / 0.4)",
                }}
              >
                <div
                  className="cluster"
                  style={{ gap: "0.625rem", alignItems: "center" }}
                >
                  <span
                    className="cluster"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: g.network_id
                        ? "rgb(from rgb(var(--color-primary)) r g b / 0.14)"
                        : "rgb(from rgb(var(--color-text-muted)) r g b / 0.14)",
                      color: g.network_id
                        ? "rgb(var(--color-primary))"
                        : "rgb(var(--color-text-muted))",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                    aria-hidden
                  >
                    <NetworkIcon size={14} />
                  </span>
                  <div className="stack" style={{ gap: 1 }}>
                    {g.network_id && g.network_name ? (
                      <button
                        type="button"
                        className="btn btn-link btn-sm"
                        style={{
                          padding: 0,
                          fontWeight: 600,
                          textAlign: "left",
                        }}
                        onClick={() =>
                          onNetworkClick?.(g.network_id as number)
                        }
                      >
                        {g.network_name}
                      </button>
                    ) : (
                      <span className="font-medium">No network</span>
                    )}
                    {g.network_subnet && (
                      <span className="font-mono text-xs text-muted">
                        {g.network_subnet}
                      </span>
                    )}
                  </div>
                </div>
                <span className="badge badge-success">
                  {g.devices.length}{" "}
                  {g.devices.length === 1 ? "device" : "devices"}
                </span>
              </div>
              <div className="scroll-x">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Serial</th>
                      <th>Model</th>
                      <th>Assigned to</th>
                      <th>Status</th>
                      <th>IP</th>
                      <th>VLAN</th>
                      <th>Networks seen</th>
                      <th>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.devices.map((d) => (
                      <tr
                        key={d.asset_id}
                        className={onAssetClick ? "row-clickable" : undefined}
                        onClick={
                          onAssetClick
                            ? () => onAssetClick(d.asset_id)
                            : undefined
                        }
                      >
                        <td>
                          <span className="font-medium">
                            {d.intune_device_name ?? "—"}
                          </span>
                        </td>
                        <td>
                          <span className="font-mono text-xs">
                            {d.serial_number}
                          </span>
                        </td>
                        <td>
                          <span className="text-sm">
                            {d.effective_model}
                          </span>
                        </td>
                        <td>
                          {d.assigned_upn ? (
                            <span className="font-mono text-xs">
                              {d.assigned_upn}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          <AccentPill value={d.status_code} />
                        </td>
                        <td>
                          {d.defender_last_ip ? (
                            <span className="font-mono text-xs">
                              {d.defender_last_ip}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {d.matched_vlan_id !== null &&
                          d.matched_vlan_id !== undefined ? (
                            <div className="stack" style={{ gap: 1 }}>
                              <span className="font-mono text-xs font-medium">
                                {d.matched_vlan_id}
                                {d.matched_vlan_name
                                  ? ` · ${d.matched_vlan_name}`
                                  : ""}
                              </span>
                              {d.network_subnet && (
                                <span className="font-mono text-xs text-muted">
                                  {d.network_subnet}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {d.seen_networks.length === 0 ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <span
                              className="badge badge-info"
                              title={d.seen_networks
                                .map(
                                  (s) =>
                                    `${s.network_name}${s.ip ? ` (${s.ip})` : ""}${s.vlan !== null && s.vlan !== undefined ? ` VLAN ${s.vlan}` : ""}`,
                                )
                                .join("\n")}
                            >
                              {d.seen_networks.length}
                            </span>
                          )}
                        </td>
                        <td>
                          <AccentPill value={d.matched_token} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ExportMenuItem({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: ReactNode;
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
