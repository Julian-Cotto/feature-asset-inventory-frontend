/** Wallboard / TV-mode dashboard.
 *
 *  Renders as a position:fixed full-viewport overlay above the shell. Auto-
 *  rotates through 7 slides every `SLIDE_DURATION_MS`. Refetches every
 *  `REFRESH_MS`. Keyboard:
 *    ←/→  prev / next
 *    space toggle pause
 *    esc   exit back to dashboard
 *
 *  Slides are sized for ~6ft viewing — large numerics, generous padding.
 *  Designed to live on an unattended TV / monitor so it never asks for input. */

import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Activity,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Laptop,
  Maximize,
  Minimize,
  Pause,
  Play,
  ShieldAlert,
  ShieldCheck,
  Truck,
  Users as UsersIcon,
  X,
} from "lucide-react";

import Donut from "../components/Donut";
import {
  getActivityReport,
  getFleetReport,
  getPeopleReport,
  getSecurityReport,
  getShipmentsReport,
  getSoftwareReport,
  getWarrantyReport,
} from "../services/inventory";
import type {
  ActivityReport,
  FleetReport,
  PeopleReport,
  SecurityReport,
  ShipmentsReport,
  SoftwareReport,
  WarrantyReport,
} from "../types/reports";

const SLIDE_DURATION_MS = 25_000;
const REFRESH_MS = 60_000;

const C = {
  bg: "rgb(var(--color-bg))",
  surface: "rgb(var(--color-surface))",
  border: "rgb(var(--color-border))",
  text: "rgb(var(--color-text))",
  muted: "rgb(var(--color-text-muted))",
  primary: "rgb(var(--color-primary))",
  success: "rgb(var(--color-success))",
  warning: "rgb(var(--color-warning))",
  danger: "rgb(var(--color-danger))",
};

interface Data {
  fleet: FleetReport | null;
  security: SecurityReport | null;
  warranty: WarrantyReport | null;
  shipments: ShipmentsReport | null;
  software: SoftwareReport | null;
  people: PeopleReport | null;
  activity: ActivityReport | null;
}

const EMPTY_DATA: Data = {
  fleet: null,
  security: null,
  warranty: null,
  shipments: null,
  software: null,
  people: null,
  activity: null,
};

interface Slide {
  key: string;
  title: string;
  icon: ReactNode;
  tint: string;
  render: (data: Data) => ReactNode;
}

const SLIDES: Slide[] = [
  {
    key: "fleet",
    title: "Fleet",
    icon: <Cpu size={28} />,
    tint: C.primary,
    render: (d) => <FleetSlide data={d.fleet} />,
  },
  {
    key: "security",
    title: "Security posture",
    icon: <ShieldAlert size={28} />,
    tint: C.danger,
    render: (d) => <SecuritySlide data={d.security} />,
  },
  {
    key: "warranty",
    title: "Warranty & lifecycle",
    icon: <ShieldCheck size={28} />,
    tint: C.warning,
    render: (d) => <WarrantySlide data={d.warranty} />,
  },
  {
    key: "shipments",
    title: "Shipments in motion",
    icon: <Truck size={28} />,
    tint: "#6CC3E0",
    render: (d) => <ShipmentsSlide data={d.shipments} />,
  },
  {
    key: "software",
    title: "Software & licenses",
    icon: <Boxes size={28} />,
    tint: "#C97CF4",
    render: (d) => <SoftwareSlide data={d.software} />,
  },
  {
    key: "people",
    title: "People coverage",
    icon: <UsersIcon size={28} />,
    tint: C.success,
    render: (d) => <PeopleSlide data={d.people} />,
  },
  {
    key: "activity",
    title: "Activity",
    icon: <Activity size={28} />,
    tint: C.primary,
    render: (d) => <ActivitySlide data={d.activity} />,
  },
];

export default function Wallboard({ onExit }: { onExit: () => void }) {
  const [data, setData] = useState<Data>(EMPTY_DATA);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [tick, setTick] = useState(0); // forces "Xs ago" re-render
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== "undefined" && !!document.fullscreenElement,
  );

  const toggleFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void document.documentElement
        .requestFullscreen()
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    function onChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [fleet, security, warranty, shipments, software, people, activity] =
        await Promise.all([
          getFleetReport().catch(() => null),
          getSecurityReport().catch(() => null),
          getWarrantyReport().catch(() => null),
          getShipmentsReport().catch(() => null),
          getSoftwareReport().catch(() => null),
          getPeopleReport().catch(() => null),
          getActivityReport().catch(() => null),
        ]);
      setData({
        fleet,
        security,
        warranty,
        shipments,
        software,
        people,
        activity,
      });
      setLastUpdated(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Initial + periodic refresh
  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Auto-advance slides
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, SLIDE_DURATION_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  // "Xs ago" ticker
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 5_000);
    return () => window.clearInterval(id);
  }, []);

  // Keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        setIndex((i) => (i + 1) % SLIDES.length);
      } else if (e.key === "ArrowLeft") {
        setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length);
      } else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "Escape") {
        onExit();
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, toggleFullscreen]);

  const slide = SLIDES[index];

  // Hidden tick read keeps the "updated Xs ago" line fresh on each interval
  void tick;
  const ago = lastUpdated
    ? Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000))
    : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: C.bg,
        color: C.text,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1.25rem 2rem",
          borderBottom: `1px solid ${C.border}`,
          background: C.surface,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.875rem",
          }}
        >
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: `rgb(from ${slide.tint} r g b / 0.12)`,
              color: slide.tint,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-hidden
          >
            {slide.icon}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span
              style={{
                fontSize: "0.875rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: C.muted,
              }}
            >
              IT Asset Wallboard
            </span>
            <h1
              style={{
                margin: 0,
                fontSize: "1.875rem",
                lineHeight: 1.1,
                fontWeight: 700,
              }}
            >
              {slide.title}
            </h1>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            color: C.muted,
            fontSize: "0.875rem",
          }}
        >
          <span>
            Slide {index + 1} / {SLIDES.length}
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span title={lastUpdated ? new Date(lastUpdated).toLocaleString() : ""}>
            {ago === null
              ? "loading…"
              : ago < 5
                ? "just updated"
                : `updated ${ago}s ago`}
          </span>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            title={paused ? "Resume rotation (space)" : "Pause rotation (space)"}
            style={{
              background: "transparent",
              color: paused ? C.warning : C.muted,
              border: `1px solid ${paused ? C.warning : C.border}`,
              borderRadius: 8,
              width: 36,
              height: 36,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title={
              isFullscreen
                ? "Exit fullscreen (f)"
                : "Enter fullscreen (f)"
            }
            style={{
              background: "transparent",
              color: isFullscreen ? C.primary : C.muted,
              border: `1px solid ${isFullscreen ? C.primary : C.border}`,
              borderRadius: 8,
              width: 36,
              height: 36,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button
            type="button"
            onClick={onExit}
            title="Exit wallboard (esc)"
            style={{
              background: "transparent",
              color: C.muted,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              width: 36,
              height: 36,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Slide body */}
      <main
        style={{
          flex: 1,
          padding: "2.5rem 3rem",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {error && (
          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: 8,
              background: `rgb(from ${C.danger} r g b / 0.12)`,
              color: C.danger,
              marginBottom: "1rem",
            }}
          >
            {error}
          </div>
        )}
        {slide.render(data)}
      </main>

      {/* Bottom bar — progress + nav hints */}
      <footer
        style={{
          padding: "1rem 2rem",
          borderTop: `1px solid ${C.border}`,
          background: C.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() =>
              setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)
            }
            title="Previous slide (←)"
            style={navBtnStyle}
          >
            <ChevronLeft size={16} />
          </button>
          {SLIDES.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setIndex(i)}
              title={s.title}
              style={{
                width: i === index ? 28 : 10,
                height: 10,
                borderRadius: 5,
                border: "none",
                background: i === index ? slide.tint : C.border,
                cursor: "pointer",
                transition: "width 0.3s ease, background 0.3s ease",
              }}
              aria-label={`Go to ${s.title}`}
            />
          ))}
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % SLIDES.length)}
            title="Next slide (→)"
            style={navBtnStyle}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <span
          style={{
            fontSize: "0.75rem",
            color: C.muted,
            letterSpacing: "0.04em",
          }}
        >
          ← / → switch · space pause · f fullscreen · esc exit
        </span>
      </footer>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: C.muted,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  width: 32,
  height: 32,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

// ────────────────────────── Big-number widgets ──────────────────────────

function BigNumber({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const color = {
    default: C.text,
    success: C.success,
    warning: C.warning,
    danger: C.danger,
  }[tone];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        padding: "1.5rem 1.75rem",
        borderRadius: 14,
        background: C.surface,
        border: `1px solid ${C.border}`,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: "0.875rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: C.muted,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
          lineHeight: 1,
          fontWeight: 700,
          color,
        }}
      >
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: "0.95rem", color: C.muted }}>{sub}</span>
      )}
    </div>
  );
}

function HorizontalBars({
  rows,
  color,
  max,
}: {
  rows: { label: string; value: number }[];
  color: string;
  max?: number;
}) {
  if (rows.length === 0) {
    return <p style={{ color: C.muted }}>No data.</p>;
  }
  const peak = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {rows.map((r, i) => {
        const pct = Math.max(2, Math.round((r.value / peak) * 100));
        return (
          <div
            key={`${r.label}-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.875rem",
              fontSize: "1.125rem",
            }}
          >
            <span
              style={{
                minWidth: "12rem",
                color: C.muted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={r.label}
            >
              {r.label}
            </span>
            <div
              style={{
                flex: 1,
                height: 18,
                background: C.bg,
                borderRadius: 9,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: color,
                  borderRadius: 9,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <span
              style={{
                minWidth: "4ch",
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                fontWeight: 700,
              }}
            >
              {r.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function VerticalBars({
  rows,
  color,
  height = 180,
}: {
  rows: { label: string; value: number }[];
  color: string;
  height?: number;
}) {
  if (rows.length === 0) {
    return <p style={{ color: C.muted }}>No data.</p>;
  }
  const peak = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div
      style={{
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: "1fr",
        alignItems: "end",
        gap: "0.625rem",
        height,
      }}
    >
      {rows.map((r, i) => {
        const pct = r.value === 0 ? 0 : Math.max(4, Math.round((r.value / peak) * 100));
        return (
          <div
            key={`${r.label}-${i}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.375rem",
              height: "100%",
              minWidth: 0,
            }}
            title={`${r.label}: ${r.value}`}
          >
            <span
              style={{
                fontSize: "0.875rem",
                fontWeight: 700,
                color: r.value === 0 ? C.muted : C.text,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {r.value}
            </span>
            <div
              style={{
                flex: 1,
                width: "100%",
                display: "flex",
                alignItems: "flex-end",
                minHeight: 0,
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: `${pct}%`,
                  background: color,
                  borderRadius: "6px 6px 0 0",
                  transition: "height 0.4s ease",
                  minHeight: r.value === 0 ? 0 : 4,
                }}
              />
            </div>
            <span
              style={{
                fontSize: "0.75rem",
                color: C.muted,
                textAlign: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                width: "100%",
              }}
            >
              {r.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RiskMatrix({
  data,
}: {
  data: { exposure: string; health: string; count: number }[];
}) {
  const exposures = ["low", "medium", "high"];
  const healths = ["secure", "atrisk", "impaired", "noheartbeat"];
  const max = Math.max(...data.map((d) => d.count), 1);
  const cellColor = (count: number) => {
    if (count === 0) return C.bg;
    const intensity = Math.min(1, count / max);
    return `rgb(from ${C.danger} r g b / ${0.18 + intensity * 0.65})`;
  };
  const lookup = (exp: string, h: string) =>
    data.find(
      (d) =>
        d.exposure.toLowerCase() === exp &&
        d.health.toLowerCase().replace(/[_\s]/g, "") === h,
    )?.count ?? 0;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `7rem repeat(${healths.length}, 1fr)`,
        gap: "0.375rem",
      }}
    >
      <span />
      {healths.map((h) => (
        <span
          key={`h-${h}`}
          style={{
            fontSize: "0.75rem",
            color: C.muted,
            textTransform: "uppercase",
            textAlign: "center",
            letterSpacing: "0.04em",
          }}
        >
          {h}
        </span>
      ))}
      {exposures.map((exp) => (
        <Fragment key={exp}>
          <span
            style={{
              fontSize: "0.875rem",
              color: C.muted,
              textTransform: "uppercase",
              alignSelf: "center",
            }}
          >
            {exp}
          </span>
          {healths.map((h) => {
            const count = lookup(exp, h);
            return (
              <div
                key={`${exp}-${h}`}
                style={{
                  background: cellColor(count),
                  borderRadius: 8,
                  padding: "1rem 0.5rem",
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: "1.25rem",
                  color: count > 0 ? C.text : C.muted,
                  border: `1px solid ${C.border}`,
                }}
                title={`Exposure ${exp} · health ${h}: ${count}`}
              >
                {count}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "1.25rem 1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.875rem",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            color: C.muted,
            textTransform: "uppercase",
            fontSize: "0.875rem",
            letterSpacing: "0.06em",
          }}
        >
          {title}
        </span>
        {subtitle && (
          <span style={{ color: C.muted, fontSize: "0.8125rem" }}>
            {subtitle}
          </span>
        )}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function LegendStrip({
  slices,
}: {
  slices: { label: string; value: number; color: string }[];
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.75rem 1rem",
        justifyContent: "center",
      }}
    >
      {slices.map((s) => (
        <span
          key={s.label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: "0.9375rem",
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              background: s.color,
              borderRadius: 3,
            }}
            aria-hidden
          />
          <span style={{ textTransform: "capitalize" }}>{s.label}</span>
          <span style={{ color: C.muted }}>{s.value}</span>
        </span>
      ))}
    </div>
  );
}

function Loading() {
  return <p style={{ color: C.muted }}>Loading slide…</p>;
}

// ────────────────────────── Slide components ────────────────────────────

function FleetSlide({ data }: { data: FleetReport | null }) {
  if (!data) return <Loading />;
  const total = data.asset_type.reduce((s, x) => s + x.count, 0);
  const win10 = data.win10_count;
  const win11 = data.win11_count;
  const otherOs = Math.max(0, total - win10 - win11);
  const osSlices = [
    { label: "Win 11", value: win11, color: C.success },
    { label: "Win 10", value: win10, color: win10 > 0 ? C.warning : C.muted },
    { label: "Other", value: otherOs, color: C.muted },
  ].filter((s) => s.value > 0);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: "1.25rem",
        flex: 1,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
        }}
      >
        <BigNumber label="Total devices" value={total} />
        <BigNumber
          label="Windows 11"
          value={win11}
          tone="success"
          sub={`${total > 0 ? Math.round((win11 / total) * 100) : 0}% of fleet`}
        />
        <BigNumber
          label="Windows 10"
          value={win10}
          tone={win10 > 0 ? "warning" : "success"}
          sub="EOL Oct 2025"
        />
        <BigNumber
          label="Manufacturers"
          value={data.manufacturer.length}
          sub={data.manufacturer[0]?.label ?? "—"}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "0.9fr 1fr 1fr",
          gap: "1.25rem",
          minHeight: 0,
        }}
      >
        <ChartCard title="OS split">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.875rem",
            }}
          >
            <Donut
              slices={osSlices}
              size={220}
              thickness={32}
              centerLabel={String(total)}
              centerSub="devices"
            />
            <LegendStrip slices={osSlices} />
          </div>
        </ChartCard>
        <ChartCard title="By asset type">
          <HorizontalBars
            rows={data.asset_type
              .slice(0, 6)
              .map((r) => ({ label: r.label, value: r.count }))}
            color={C.primary}
          />
        </ChartCard>
        <ChartCard title="Top manufacturers">
          <HorizontalBars
            rows={data.manufacturer
              .slice(0, 6)
              .map((r) => ({ label: r.label, value: r.count }))}
            color="#6CC3E0"
          />
        </ChartCard>
      </div>
    </div>
  );
}

function SecuritySlide({ data }: { data: SecurityReport | null }) {
  if (!data) return <Loading />;
  const healthSlices = data.health_status.map((r) => {
    const k = r.label.toLowerCase();
    const color =
      k.includes("active") || k.includes("healthy") || k.includes("secure")
        ? C.success
        : k.includes("inactive") || k.includes("noheartbeat")
          ? C.danger
          : k.includes("atrisk") || k.includes("at_risk") || k.includes("impaired")
            ? C.warning
            : C.muted;
    return { label: r.label, value: r.count, color };
  });
  const totalHealth = healthSlices.reduce((s, x) => s + x.value, 0);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: "1.25rem",
        flex: 1,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
        }}
      >
        <BigNumber
          label="Computers"
          value={data.counts.total_computers}
          sub="in inventory"
        />
        <BigNumber
          label="Defender onboarded"
          value={data.counts.defender_onboarded}
          tone="success"
          sub={`${
            data.counts.total_computers > 0
              ? Math.round(
                  (data.counts.defender_onboarded /
                    data.counts.total_computers) *
                    100,
                )
              : 0
          }% coverage`}
        />
        <BigNumber
          label="Need attention"
          value={data.counts.defender_unhealthy}
          tone={data.counts.defender_unhealthy === 0 ? "success" : "danger"}
          sub="unhealthy or inactive"
        />
        <BigNumber
          label="Missing"
          value={data.counts.defender_missing}
          tone={data.counts.defender_missing === 0 ? "success" : "warning"}
          sub="Intune w/o Defender"
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "0.9fr 1.3fr 1fr",
          gap: "1.25rem",
          minHeight: 0,
        }}
      >
        <ChartCard title="Health status">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.875rem",
            }}
          >
            <Donut
              slices={healthSlices}
              size={220}
              thickness={32}
              centerLabel={String(totalHealth)}
              centerSub="computers"
            />
            <LegendStrip slices={healthSlices} />
          </div>
        </ChartCard>
        <ChartCard title="Risk matrix" subtitle="exposure × health">
          <RiskMatrix data={data.risk_matrix} />
        </ChartCard>
        <ChartCard title="AV status">
          <HorizontalBars
            rows={data.av_status
              .slice(0, 6)
              .map((r) => ({ label: r.label, value: r.count }))}
            color={C.danger}
          />
        </ChartCard>
      </div>
    </div>
  );
}

function WarrantySlide({ data }: { data: WarrantyReport | null }) {
  if (!data) return <Loading />;
  const now = new Date();
  const monthsAhead = (n: number) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 7);
  };
  const next3Keys = [monthsAhead(0), monthsAhead(1), monthsAhead(2)];
  const next3 = data.calendar_12m.filter((p) => next3Keys.includes(p.month));
  const next3Count = next3.reduce((s, x) => s + x.count, 0);
  const candidates = data.replacement_candidates.slice(0, 5);
  const total12m = data.calendar_12m.reduce((s, p) => s + p.count, 0);

  const monthLabel = (iso: string) => {
    const [, m] = iso.split("-");
    return ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
      parseInt(m, 10)
    ];
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: "1.25rem",
        flex: 1,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
        }}
      >
        <BigNumber
          label="Expiring 90d"
          value={next3Count}
          tone={next3Count > 0 ? "warning" : "success"}
          sub="next quarter"
        />
        <BigNumber
          label="Expiring 12m"
          value={total12m}
          tone={total12m > 0 ? "warning" : "success"}
          sub="rolling year"
        />
        <BigNumber
          label="Out of warranty"
          value={data.replacement_candidates.length}
          tone={data.replacement_candidates.length > 0 ? "danger" : "success"}
          sub="replacement candidates"
        />
        <BigNumber
          label="Locations affected"
          value={data.out_by_location.length}
          sub={data.out_by_location[0]?.location ?? "—"}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: "1.25rem",
          minHeight: 0,
        }}
      >
        <ChartCard title="Warranty expirations · next 12 months">
          <VerticalBars
            rows={data.calendar_12m.map((p) => ({
              label: monthLabel(p.month),
              value: p.count,
            }))}
            color={C.warning}
            height={220}
          />
        </ChartCard>
        <ChartCard title="Top replacement candidates">
          {candidates.length === 0 ? (
            <p style={{ color: C.muted }}>Fleet is in warranty.</p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              {candidates.map((c) => (
                <li
                  key={c.asset_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.5rem 0.75rem",
                    background: C.bg,
                    borderRadius: 10,
                    gap: "0.5rem",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "1rem",
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.manufacturer} {c.model ?? c.serial_number}
                    </div>
                    <div
                      style={{
                        color: C.muted,
                        fontSize: "0.8125rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.assigned_upn ?? "unassigned"}
                    </div>
                  </div>
                  <span
                    style={{
                      color: C.warning,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.warranty_end_date
                      ? new Date(c.warranty_end_date).toLocaleDateString()
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function ShipmentsSlide({ data }: { data: ShipmentsReport | null }) {
  if (!data) return <Loading />;
  const total = data.funnel.reduce((s, x) => s + x.count, 0);
  const lateCount = data.late.length;
  const carrierPalette = [
    "#6CC3E0",
    "#C97CF4",
    C.success,
    C.warning,
    C.primary,
    C.danger,
  ];
  const carrierSlices = data.carrier_counts.slice(0, 6).map((c, i) => ({
    label: c.label || "unknown",
    value: c.count,
    color: carrierPalette[i % carrierPalette.length],
  }));
  const directionSlices = data.direction.map((d) => ({
    label: d.label,
    value: d.count,
    color:
      d.label.toLowerCase() === "outbound" ? C.primary : "#C97CF4",
  }));

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: "1.25rem",
        flex: 1,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
        }}
      >
        <BigNumber label="Active shipments" value={total} />
        <BigNumber
          label="Late"
          value={lateCount}
          tone={lateCount === 0 ? "success" : "danger"}
          sub="overdue vs carrier ETA"
        />
        <BigNumber
          label="Outbound"
          value={
            data.direction.find((d) => d.label.toLowerCase() === "outbound")
              ?.count ?? 0
          }
          tone="default"
          sub="leaving the warehouse"
        />
        <BigNumber
          label="Carriers active"
          value={data.carrier_counts.length}
          sub={data.carrier_counts[0]?.label?.toUpperCase() ?? "—"}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 0.9fr 1fr",
          gap: "1.25rem",
          minHeight: 0,
        }}
      >
        <ChartCard title="Funnel">
          <HorizontalBars
            rows={data.funnel.map((r) => ({ label: r.label, value: r.count }))}
            color="#6CC3E0"
          />
        </ChartCard>
        <ChartCard title="By carrier">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.875rem",
            }}
          >
            <Donut
              slices={carrierSlices}
              size={200}
              thickness={30}
              centerLabel={String(total)}
              centerSub="shipments"
            />
            <LegendStrip slices={carrierSlices} />
          </div>
        </ChartCard>
        <ChartCard title="Direction · avg days by carrier">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              minHeight: 0,
            }}
          >
            <LegendStrip slices={directionSlices} />
            <HorizontalBars
              rows={data.carrier_avg_days
                .filter((c) => c.avg_days !== null)
                .slice(0, 5)
                .map((c) => ({
                  label: c.carrier.toUpperCase(),
                  value: Math.round(c.avg_days ?? 0),
                }))}
              color={C.warning}
            />
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

function SoftwareSlide({ data }: { data: SoftwareReport | null }) {
  if (!data) return <Loading />;
  const dollars = data.totals.total_spend_cents / 100;
  const spendLabel =
    dollars >= 1_000_000
      ? `$${(dollars / 1_000_000).toFixed(2)}M`
      : dollars >= 1_000
        ? `$${(dollars / 1_000).toFixed(1)}k`
        : dollars > 0
          ? `$${Math.round(dollars).toLocaleString()}`
          : "—";
  const coverage = data.assignment_coverage;
  const unassigned = coverage.find((b) => b.bucket === "0")?.count ?? 0;
  const oneToNine = coverage.find((b) => b.bucket === "1-9")?.count ?? 0;
  const tenToFortyNine = coverage.find((b) => b.bucket === "10-49")?.count ?? 0;
  const fiftyPlus = coverage.find((b) => b.bucket === "50+")?.count ?? 0;
  const coverageSlices = [
    { label: "0 (unassigned)", value: unassigned, color: C.danger },
    { label: "1-9", value: oneToNine, color: C.warning },
    { label: "10-49", value: tenToFortyNine, color: C.primary },
    { label: "50+", value: fiftyPlus, color: C.success },
  ].filter((s) => s.value > 0);
  const topCats = data.spend_by_category.slice(0, 5);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: "1.25rem",
        flex: 1,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
        }}
      >
        <BigNumber
          label="Software tracked"
          value={data.totals.total_software}
        />
        <BigNumber
          label="Annual spend"
          value={spendLabel}
          tone={dollars > 0 ? "warning" : "default"}
          sub={
            data.totals.total_seats > 0
              ? `${data.totals.total_seats.toLocaleString()} seats`
              : "no costs entered"
          }
        />
        <BigNumber
          label="Unassigned"
          value={unassigned}
          tone={unassigned === 0 ? "success" : "danger"}
          sub="shelfware risk"
        />
        <BigNumber
          label="Top reach"
          value={data.top_software[0]?.assignment_count ?? 0}
          sub={data.top_software[0]?.name ?? "—"}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "0.9fr 1fr 1fr",
          gap: "1.25rem",
          minHeight: 0,
        }}
      >
        <ChartCard title="Assignment coverage">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.875rem",
            }}
          >
            <Donut
              slices={coverageSlices}
              size={220}
              thickness={32}
              centerLabel={String(data.totals.total_software)}
              centerSub="apps"
            />
            <LegendStrip slices={coverageSlices} />
          </div>
        </ChartCard>
        <ChartCard title="By category">
          <HorizontalBars
            rows={data.by_category
              .slice(0, 6)
              .map((c) => ({ label: c.label, value: c.count }))}
            color="#C97CF4"
          />
        </ChartCard>
        <ChartCard
          title={topCats.some((c) => c.total_cents > 0) ? "Spend by category" : "Top software"}
        >
          {topCats.some((c) => c.total_cents > 0) ? (
            <HorizontalBars
              rows={topCats
                .filter((c) => c.total_cents > 0)
                .map((c) => ({
                  label: c.category,
                  value: Math.round(c.total_cents / 100),
                }))}
              color={C.warning}
            />
          ) : (
            <HorizontalBars
              rows={data.top_software.slice(0, 6).map((s) => ({
                label: s.name,
                value: s.assignment_count,
              }))}
              color={C.success}
            />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function PeopleSlide({ data }: { data: PeopleReport | null }) {
  if (!data) return <Loading />;
  const coverage =
    data.totals.total_users > 0
      ? Math.round(
          (data.totals.users_with_device / data.totals.total_users) * 100,
        )
      : 0;
  const coverageSlices = [
    {
      label: "With device",
      value: data.totals.users_with_device,
      color: C.success,
    },
    {
      label: "No device",
      value: data.totals.users_without_device,
      color: C.warning,
    },
  ].filter((s) => s.value > 0);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: "1.25rem",
        flex: 1,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
        }}
      >
        <BigNumber
          label="Active users"
          value={data.totals.total_users}
          sub="from Microsoft Graph"
        />
        <BigNumber
          label="With device"
          value={data.totals.users_with_device}
          tone="success"
          sub={`${coverage}% coverage`}
        />
        <BigNumber
          label="Without device"
          value={data.totals.users_without_device}
          tone={data.totals.users_without_device === 0 ? "success" : "warning"}
          sub="active users"
        />
        <BigNumber
          label="Top owner"
          value={data.top_users_by_devices[0]?.device_count ?? 0}
          sub={
            data.top_users_by_devices[0]?.display_name ??
            data.top_users_by_devices[0]?.upn ??
            "—"
          }
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "0.9fr 1fr 1fr",
          gap: "1.25rem",
          minHeight: 0,
        }}
      >
        <ChartCard title="Device coverage">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.875rem",
            }}
          >
            <Donut
              slices={coverageSlices}
              size={220}
              thickness={32}
              centerLabel={`${coverage}%`}
              centerSub="with device"
            />
            <LegendStrip slices={coverageSlices} />
          </div>
        </ChartCard>
        <ChartCard title="By department">
          <HorizontalBars
            rows={data.devices_by_department
              .slice(0, 8)
              .map((d) => ({ label: d.label, value: d.count }))}
            color={C.success}
          />
        </ChartCard>
        <ChartCard title="By office">
          <HorizontalBars
            rows={data.devices_by_office
              .slice(0, 8)
              .map((d) => ({ label: d.label, value: d.count }))}
            color={C.primary}
          />
        </ChartCard>
      </div>
    </div>
  );
}

function ActivitySlide({ data }: { data: ActivityReport | null }) {
  if (!data) return <Loading />;
  const recent = data.recent.slice(0, 7);
  const lastMonth = data.monthly_180d[data.monthly_180d.length - 1] ?? {
    month: "",
    assign: 0,
    unassign: 0,
    in_repair: 0,
    retired: 0,
    lost: 0,
  };
  const totalLast = lastMonth.assign + lastMonth.unassign + lastMonth.in_repair;
  const total180d = data.monthly_180d.reduce(
    (s, m) => s + m.assign + m.unassign + m.in_repair,
    0,
  );

  const monthLabel = (iso: string) => {
    const [, m] = iso.split("-");
    return ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
      parseInt(m, 10)
    ];
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: "1.25rem",
        flex: 1,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
        }}
      >
        <BigNumber
          label="Events this month"
          value={totalLast}
          sub="assigns + unassigns + repairs"
        />
        <BigNumber
          label="Assignments"
          value={lastMonth.assign}
          tone="success"
        />
        <BigNumber
          label="In repair"
          value={lastMonth.in_repair}
          tone={lastMonth.in_repair > 0 ? "warning" : "default"}
        />
        <BigNumber
          label="Last 180 days"
          value={total180d}
          sub="all tracked events"
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: "1.25rem",
          minHeight: 0,
        }}
      >
        <ChartCard title="Activity · last 6 months">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              minHeight: 0,
            }}
          >
            <LegendStrip
              slices={[
                { label: "Assign", value: 0, color: C.success },
                { label: "Unassign", value: 0, color: C.warning },
                { label: "Repair", value: 0, color: C.danger },
              ]}
            />
            <StackedMonthlyBars
              rows={data.monthly_180d.map((m) => ({
                label: monthLabel(m.month),
                segments: [
                  { value: m.assign, color: C.success },
                  { value: m.unassign, color: C.warning },
                  { value: m.in_repair, color: C.danger },
                ],
              }))}
              height={200}
            />
          </div>
        </ChartCard>
        <ChartCard title="Recent activity">
          {recent.length === 0 ? (
            <p style={{ color: C.muted }}>No recent activity.</p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              {recent.map((ev) => (
                <li
                  key={ev.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.5rem 0.75rem",
                    background: C.bg,
                    borderRadius: 10,
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "1rem",
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Laptop
                        size={14}
                        style={{
                          verticalAlign: "middle",
                          marginRight: 8,
                          color: C.muted,
                        }}
                      />
                      {ev.asset_label}
                    </div>
                    <div
                      style={{
                        color: C.muted,
                        fontSize: "0.8125rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {eventLabel(ev.event_type, ev.from_value, ev.to_value)}
                    </div>
                  </div>
                  <span
                    style={{
                      color: C.muted,
                      fontSize: "0.8125rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ev.performed_at ? relative(ev.performed_at) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function StackedMonthlyBars({
  rows,
  height,
}: {
  rows: { label: string; segments: { value: number; color: string }[] }[];
  height: number;
}) {
  if (rows.length === 0) {
    return <p style={{ color: C.muted }}>No data.</p>;
  }
  const totals = rows.map((r) =>
    r.segments.reduce((s, x) => s + x.value, 0),
  );
  const peak = Math.max(...totals, 1);
  return (
    <div
      style={{
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: "1fr",
        alignItems: "end",
        gap: "0.5rem",
        height,
      }}
    >
      {rows.map((r, i) => {
        const total = totals[i];
        const barPct = total === 0 ? 0 : Math.max(6, Math.round((total / peak) * 100));
        return (
          <div
            key={`${r.label}-${i}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.375rem",
              height: "100%",
              minWidth: 0,
            }}
            title={`${r.label}: ${total}`}
          >
            <span
              style={{
                fontSize: "0.8125rem",
                fontWeight: 700,
                color: total === 0 ? C.muted : C.text,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {total}
            </span>
            <div
              style={{
                flex: 1,
                width: "100%",
                display: "flex",
                alignItems: "flex-end",
                minHeight: 0,
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: `${barPct}%`,
                  display: "flex",
                  flexDirection: "column-reverse",
                  borderRadius: "6px 6px 0 0",
                  overflow: "hidden",
                  background: C.bg,
                }}
              >
                {r.segments.map((seg, si) =>
                  total > 0 && seg.value > 0 ? (
                    <div
                      key={si}
                      style={{
                        height: `${(seg.value / total) * 100}%`,
                        background: seg.color,
                      }}
                    />
                  ) : null,
                )}
              </div>
            </div>
            <span
              style={{
                fontSize: "0.75rem",
                color: C.muted,
                textAlign: "center",
              }}
            >
              {r.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function eventLabel(
  type: string,
  from: string | null,
  to: string | null,
): string {
  switch (type) {
    case "assign":
      return `Assigned to ${to ?? "user"}`;
    case "unassign":
      return `Unassigned${from ? ` from ${from}` : ""}`;
    case "status_change":
      return `Status → ${to}`;
    case "location_change":
      return `Location → ${to}`;
    case "onboard":
      return "Onboarded";
    case "archive":
      return "Archived";
    default:
      return type;
  }
}

function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "<1m ago";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

