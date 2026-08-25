/** Dashboard widget: one row per integration source showing last-run
 *  status + staleness. Click a tile to open the recent-runs drawer for
 *  that source (errors, summary JSON, duration, trigger). */

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PlayCircle,
  X,
} from "lucide-react";

import {
  getSyncHealth,
  getSyncRunStats,
  listSyncRuns,
  listTriggerableSources,
  triggerSync,
  type SyncHealth,
  type SyncRun,
  type SyncRunStats,
  type SyncSourceHealth,
} from "../services/syncRuns";
import { useToast } from "./ToastProvider";

const SOURCE_LABELS: Record<string, string> = {
  intune: "Intune assets",
  defender: "Defender cache",
  meraki_devices: "Meraki gear",
  meraki_networks: "Meraki networks",
  meraki_clients: "Meraki clients",
  snowflake_locations: "Snowflake locations",
  users: "Users (Graph)",
  entra_groups: "Entra groups",
  software: "Software (Intune apps)",
  shipments_poll: "Shipments poll",
  warranty: "Warranty refresh",
  axis_badges: "Axis badges",
};

function labelFor(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (!then) return "never";
  const diff = Date.now() - then;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function toneFor(s: SyncSourceHealth): "good" | "warn" | "bad" | "muted" {
  if (!s.last_run) return "muted";
  if (!s.last_run.ok) return "bad";
  if (s.stale) return "warn";
  return "good";
}

function summaryLine(run: SyncRun | null): string {
  if (!run) return "Never run";
  if (!run.ok) return run.error?.split("\n")[0] ?? "Failed";
  const sum = run.summary ?? {};
  // Pull a few common keys if present, ignore the rest. Keeps the tile
  // compact without baking in source-specific knowledge.
  const interesting = [
    "total_devices",
    "fetched",
    "machines",
    "networks_visited",
    "checked",
    "created",
    "updated",
  ];
  const bits: string[] = [];
  for (const k of interesting) {
    const v = (sum as Record<string, unknown>)[k];
    if (typeof v === "number") bits.push(`${k.replace(/_/g, " ")} ${v}`);
    if (bits.length >= 2) break;
  }
  if (bits.length === 0) return "OK";
  return bits.join(" · ");
}

export default function SyncHealthCard() {
  const [health, setHealth] = useState<SyncHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerSource, setDrawerSource] = useState<string | null>(null);
  const [triggerable, setTriggerable] = useState<Set<string>>(new Set());

  async function reload() {
    setLoading(true);
    try {
      const h = await getSyncHealth();
      setHealth(h);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void listTriggerableSources()
      .then((r) => setTriggerable(new Set(r.sources)))
      .catch(() => setTriggerable(new Set()));
  }, []);

  useEffect(() => {
    void reload();
    // Cheap auto-refresh every 60s. Card is small, no debouncing needed.
    const id = setInterval(() => void reload(), 60_000);
    return () => clearInterval(id);
  }, []);

  const ordered = useMemo(() => {
    if (!health) return [];
    // Show problem sources first so the most urgent tiles aren't buried.
    return [...health.sources].sort((a, b) => {
      const pri = (s: SyncSourceHealth) =>
        !s.last_run ? 1 : !s.last_run.ok ? 0 : s.stale ? 2 : 3;
      const pa = pri(a);
      const pb = pri(b);
      if (pa !== pb) return pa - pb;
      return a.source.localeCompare(b.source);
    });
  }, [health]);

  return (
    <section className="card stack" style={{ padding: "1.25rem" }}>
      <div
        className="cluster"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <div className="cluster" style={{ gap: "0.5rem", alignItems: "center" }}>
          <Activity size={16} />
          <h3 className="heading-3" style={{ margin: 0 }}>
            Sync health
          </h3>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void reload()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {health && health.sources.length > 0 && (() => {
        const total = health.sources.length;
        const failed = health.sources.filter(
          (s) => s.last_run && !s.last_run.ok,
        ).length;
        const neverRun = health.sources.filter((s) => !s.last_run).length;
        // Stale = ok run but past threshold. Never-run is counted separately.
        const stale = health.sources.filter(
          (s) => s.stale && s.last_run && s.last_run.ok,
        ).length;
        const healthy = total - failed - stale - neverRun;
        return (
          <div
            className="cluster text-xs"
            style={{ gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}
          >
            <SummaryChip
              label={`${healthy}/${total} healthy`}
              tone="success"
            />
            {failed > 0 && (
              <SummaryChip label={`${failed} failed`} tone="danger" />
            )}
            {stale > 0 && (
              <SummaryChip label={`${stale} stale`} tone="warning" />
            )}
            {neverRun > 0 && (
              <SummaryChip label={`${neverRun} never run`} tone="text-muted" />
            )}
          </div>
        );
      })()}
      {error && <div className="alert alert-error">{error}</div>}
      {!error && (
        <div
          className="grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))",
            gap: "0.5rem",
          }}
        >
          {ordered.map((s) => (
            <SyncTile
              key={s.source}
              source={s}
              onClick={() => setDrawerSource(s.source)}
            />
          ))}
        </div>
      )}
      {drawerSource && (
        <RunsDrawer
          source={drawerSource}
          canTrigger={triggerable.has(drawerSource)}
          onTriggered={() => void reload()}
          onClose={() => setDrawerSource(null)}
        />
      )}
    </section>
  );
}

function SummaryChip({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "danger" | "warning" | "text-muted";
}) {
  return (
    <span
      className="badge"
      style={{
        background: `rgb(from rgb(var(--color-${tone})) r g b / 0.16)`,
        color: `rgb(var(--color-${tone}))`,
        borderColor: "transparent",
        fontSize: "0.7rem",
        padding: "2px 8px",
      }}
    >
      {label}
    </span>
  );
}

function SyncTile({
  source,
  onClick,
}: {
  source: SyncSourceHealth;
  onClick: () => void;
}) {
  const tone = toneFor(source);
  const palette = {
    good: { tint: "success", icon: <CheckCircle2 size={14} /> },
    warn: { tint: "warning", icon: <Clock size={14} /> },
    bad: { tint: "danger", icon: <AlertTriangle size={14} /> },
    muted: { tint: "text-muted", icon: <Clock size={14} /> },
  } as const;
  const p = palette[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left"
      style={{
        background: `rgb(from rgb(var(--color-${p.tint})) r g b / 0.08)`,
        border: `1px solid rgb(from rgb(var(--color-${p.tint})) r g b / 0.35)`,
        borderRadius: 8,
        padding: "0.6rem 0.75rem",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "0.2rem",
        color: "rgb(var(--color-text))",
      }}
      title={source.last_run?.error ?? labelFor(source.source)}
    >
      <span
        className="cluster"
        style={{
          gap: "0.4rem",
          alignItems: "center",
          color: `rgb(var(--color-${p.tint}))`,
        }}
      >
        {p.icon}
        <span className="font-medium text-sm">{labelFor(source.source)}</span>
      </span>
      <span className="text-xs text-muted">
        {relativeTime(source.last_run?.finished_at ?? source.last_run?.started_at ?? null)}
      </span>
      <span
        className="text-xs"
        style={{
          color: tone === "bad" ? `rgb(var(--color-${p.tint}))` : undefined,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {summaryLine(source.last_run)}
      </span>
    </button>
  );
}

function RunsDrawer({
  source,
  canTrigger,
  onTriggered,
  onClose,
}: {
  source: string;
  canTrigger: boolean;
  onTriggered: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [runs, setRuns] = useState<SyncRun[] | null>(null);
  const [stats, setStats] = useState<SyncRunStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);

  async function refetchRuns() {
    try {
      const r = await listSyncRuns(source, 15);
      setRuns(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStats(null);
    (async () => {
      try {
        const [r, s] = await Promise.all([
          listSyncRuns(source, 15),
          getSyncRunStats(source, 30).catch(() => null),
        ]);
        if (!cancelled) {
          setRuns(r);
          setStats(s);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  async function runNow() {
    if (!canTrigger || triggering) return;
    setTriggering(true);
    try {
      const r = await triggerSync(source);
      toast.notify({
        kind: r.ok ? "success" : "danger",
        title: r.ok
          ? `${labelFor(source)} sync complete`
          : `${labelFor(source)} sync failed`,
        detail: r.detail,
      });
      await refetchRuns();
      onTriggered();
    } catch (e) {
      toast.notify({
        kind: "danger",
        title: "Trigger failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 50,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="card stack"
        style={{
          width: "min(34rem, 100%)",
          height: "100%",
          borderRadius: 0,
          padding: "1.25rem",
          overflow: "auto",
        }}
      >
        <div
          className="cluster"
          style={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <h3 className="heading-3" style={{ margin: 0 }}>
            {labelFor(source)}
          </h3>
          <div className="cluster" style={{ gap: "0.4rem" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!canTrigger || triggering}
              onClick={() => void runNow()}
              title={
                canTrigger
                  ? "Run this sync now"
                  : "No manual trigger for this source (scheduled only)"
              }
            >
              <PlayCircle size={14} />
              {triggering ? "Running…" : "Trigger now"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        {loading && <p className="text-muted text-sm">Loading…</p>}
        {stats && stats.total > 0 && <StatsPanel stats={stats} />}
        {error && <div className="alert alert-error">{error}</div>}
        {runs && runs.length === 0 && (
          <p className="text-muted text-sm">No runs recorded yet.</p>
        )}
        {runs && runs.length > 0 && (
          <ul className="list-clean stack">
            {runs.map((r) => (
              <li key={r.id} className="card card-body stack" style={{ gap: "0.35rem" }}>
                <div
                  className="cluster"
                  style={{ justifyContent: "space-between", alignItems: "center" }}
                >
                  <span
                    className="badge"
                    style={{
                      background: r.ok
                        ? "rgb(from rgb(var(--color-success)) r g b / 0.16)"
                        : "rgb(from rgb(var(--color-danger)) r g b / 0.16)",
                      color: r.ok
                        ? "rgb(var(--color-success))"
                        : "rgb(var(--color-danger))",
                      borderColor: "transparent",
                    }}
                  >
                    {r.ok ? "OK" : "FAILED"}
                  </span>
                  <span className="text-xs text-muted">
                    {new Date(r.started_at).toLocaleString()}
                    {r.duration_ms !== null && ` · ${(r.duration_ms / 1000).toFixed(1)}s`}
                    {r.trigger && ` · ${r.trigger}`}
                  </span>
                </div>
                {r.summary && (
                  <pre
                    className="text-xs font-mono"
                    style={{
                      margin: 0,
                      padding: "0.5rem",
                      background: "rgb(var(--color-bg) / 0.5)",
                      borderRadius: 4,
                      overflow: "auto",
                      maxHeight: "10rem",
                    }}
                  >
                    {JSON.stringify(r.summary, null, 2)}
                  </pre>
                )}
                {r.error && (
                  <pre
                    className="text-xs font-mono"
                    style={{
                      margin: 0,
                      padding: "0.5rem",
                      background: "rgb(from rgb(var(--color-danger)) r g b / 0.08)",
                      color: "rgb(var(--color-danger))",
                      borderRadius: 4,
                      overflow: "auto",
                      maxHeight: "16rem",
                    }}
                  >
                    {r.error}
                  </pre>
                )}
                {r.actor_upn && (
                  <span className="text-xs text-muted">
                    Triggered by {r.actor_upn}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function StatsPanel({ stats }: { stats: SyncRunStats }) {
  const successPct = Math.round(stats.success_rate * 100);
  const successTone =
    successPct >= 95 ? "success" : successPct >= 75 ? "warning" : "danger";
  return (
    <section
      className="card stack"
      style={{
        padding: "0.85rem 1rem",
        gap: "0.6rem",
        background: "rgb(var(--color-bg) / 0.5)",
      }}
    >
      <div
        className="cluster"
        style={{ justifyContent: "space-between", alignItems: "baseline" }}
      >
        <span
          className="text-xs"
          style={{
            textTransform: "uppercase",
            letterSpacing: 0.6,
            color: "rgb(var(--color-text-muted))",
          }}
        >
          Last {stats.window_days} days
        </span>
        <span className="text-xs text-muted">{stats.total} runs</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.5rem",
        }}
      >
        <Stat
          label="Success rate"
          value={`${successPct}%`}
          tone={successTone as "success" | "warning" | "danger"}
        />
        <Stat
          label="Failed"
          value={stats.failed}
          tone={stats.failed > 0 ? "danger" : "muted"}
        />
        <Stat
          label="Avg duration"
          value={
            stats.avg_duration_ms !== null
              ? formatMs(stats.avg_duration_ms)
              : "—"
          }
          tone="muted"
        />
      </div>
      {stats.error_buckets.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <span
            className="text-xs"
            style={{
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "rgb(var(--color-text-muted))",
            }}
          >
            Top failure patterns
          </span>
          <ul
            className="stack"
            style={{ listStyle: "none", padding: 0, margin: 0, gap: 2 }}
          >
            {stats.error_buckets.map((b) => (
              <li
                key={b.fingerprint}
                className="cluster"
                style={{
                  gap: "0.5rem",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                }}
              >
                <span
                  className="text-xs font-mono truncate"
                  style={{ flex: 1, minWidth: 0 }}
                  title={b.fingerprint}
                >
                  {b.fingerprint}
                </span>
                <span
                  className="badge"
                  style={{
                    background:
                      "rgb(from rgb(var(--color-danger)) r g b / 0.16)",
                    color: "rgb(var(--color-danger))",
                    borderColor: "transparent",
                    fontSize: "0.65rem",
                    padding: "1px 6px",
                  }}
                >
                  ×{b.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "success" | "warning" | "danger" | "muted";
}) {
  const color =
    tone === "muted"
      ? "rgb(var(--color-text))"
      : `rgb(var(--color-${tone}))`;
  return (
    <div className="stack" style={{ gap: 1, minWidth: 0 }}>
      <span
        className="text-xs"
        style={{
          color: "rgb(var(--color-text-muted))",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: "1.1rem", fontWeight: 600, color }}>
        {value}
      </span>
    </div>
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  return `${m.toFixed(1)}m`;
}
