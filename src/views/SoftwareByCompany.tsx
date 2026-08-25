import { useEffect, useState } from "react";
import { RefreshCw, Table2 } from "lucide-react";

import { StatTile, StatTileRow } from "../components/StatTile";
import { AccentPill } from "../components/visual";
import { getSoftwareByCompanyMatrix } from "../services/software";
import type { SoftwareByCompanyMatrix } from "../services/software";

interface Props {
  onSoftwareClick?: (id: number) => void;
}

const SOURCES = [
  { value: "", label: "All sources" },
  { value: "intune", label: "Intune" },
  { value: "manual", label: "Manual" },
];

export default function SoftwareByCompany({ onSoftwareClick }: Props) {
  const [data, setData] = useState<SoftwareByCompanyMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState("");

  const reload = () => {
    setLoading(true);
    return getSoftwareByCompanyMatrix(source || undefined)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const companies = data?.companies ?? [];
  const rows = data?.rows ?? [];
  const totalSeats = Object.values(data?.company_totals ?? {}).reduce(
    (a, b) => a + b,
    0,
  );

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <Table2 size={20} strokeWidth={1.75} />
          <h2 className="heading-2" style={{ margin: 0 }}>
            Software by company
          </h2>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void reload()}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} strokeWidth={1.75} />
          Refresh
        </button>
      </div>

      <p className="text-muted text-sm" style={{ margin: 0 }}>
        Directly-assigned users per software × company (vertical). Group-inherited
        assignments aren't expanded here — open a software item to expand its
        groups live.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <StatTileRow>
        <StatTile label="Software titles" value={rows.length} tone="neutral" />
        <StatTile label="Companies" value={companies.length} tone="neutral" />
        <StatTile label="Assigned seats" value={totalSeats} tone="neutral" />
      </StatTileRow>

      <section className="section-block">
        <span className="eyebrow">Filters</span>
        <div className="cluster" style={{ gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="stack" style={{ gap: 2 }}>
            <span className="text-xs text-muted">Source</span>
            <select
              className="input input-sm"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="card">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "rgb(var(--color-surface))", zIndex: 1 }}>
                  Software
                </th>
                <th style={{ textAlign: "right" }}>Total</th>
                {companies.map((c) => (
                  <th key={c} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.software_id}
                  className="row-clickable"
                  onClick={() => onSoftwareClick?.(r.software_id)}
                >
                  <td style={{ position: "sticky", left: 0, background: "rgb(var(--color-surface))" }}>
                    <span className="cluster" style={{ gap: "0.4rem" }}>
                      <span className="font-medium">{r.software_name}</span>
                      <AccentPill value={r.source} />
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className="badge badge-info">{r.total}</span>
                  </td>
                  {companies.map((c) => {
                    const n = r.counts[c] ?? 0;
                    return (
                      <td
                        key={c}
                        style={{
                          textAlign: "right",
                          color: n === 0 ? "rgb(var(--color-text-muted))" : undefined,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {n === 0 ? "·" : n}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={2 + companies.length}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    {loading
                      ? "Loading…"
                      : "No direct user assignments — nothing to break down by company."}
                  </td>
                </tr>
              )}
              {rows.length > 0 && companies.length > 0 && (
                <tr style={{ fontWeight: 600 }}>
                  <td style={{ position: "sticky", left: 0, background: "rgb(var(--color-surface))" }}>
                    Total
                  </td>
                  <td style={{ textAlign: "right" }}>{totalSeats}</td>
                  {companies.map((c) => (
                    <td key={c} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {data?.company_totals[c] ?? 0}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
