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
  AlertOctagon,
  AlertTriangle,
  Boxes,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Cpu,
  IdCard,
  Keyboard,
  Laptop,
  Maximize,
  Minimize,
  Network as NetworkIcon,
  Package,
  Radio,
  Wrench,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Truck,
  Users as UsersIcon,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import Donut from "../components/Donut";
import {
  getActivityReport,
  getDashboardStats,
  getFleetReport,
  getIntuneReport,
  getPeopleReport,
  getSecurityReport,
  getShipmentsReport,
  getSoftwareReport,
  getStockReport,
  getWarrantyReport,
} from "../services/inventory";
import { listControllers } from "../services/badges";
import { listNetworks } from "../services/networks";
import { listSims } from "../services/sims";
import { getLogisticsStats } from "../services/logistics";
import { getSyncHealth, listSyncRuns } from "../services/syncRuns";
import type {
  ActivityReport,
  FleetReport,
  IntuneReport,
  PeopleReport,
  SecurityReport,
  ShipmentsReport,
  SoftwareReport,
  StockReport,
  WarrantyReport,
} from "../types/reports";
import type { AxisController } from "../services/badges";
import type { Network } from "../types/network";
import type { DashboardStats } from "../types/inventory";
import type { Sim, SimReconcileState } from "../types/sim";
import type { LogisticsStats } from "../types/logistics";
import type { SyncHealth, SyncRun } from "../services/syncRuns";

const SLIDE_DURATION_MS = 25_000;
const REFRESH_MS = 60_000;
// "Stale" = no successful refresh in 3 cycles. Tile/footer turns red.
const STALE_MS = REFRESH_MS * 3;
// Auto-resume rotation if operator paused and walked away.
const PAUSE_AUTO_RESUME_MS = 5 * 60_000;
// Burn-in safety: dim the panel after 8h with no input.
const IDLE_DIM_MS = 8 * 60 * 60_000;

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
  dashboard: DashboardStats | null;
  controllers: AxisController[] | null;
  networks: Network[] | null;
  syncHealth: SyncHealth | null;
  stock: StockReport | null;
  intune: IntuneReport | null;
  recentRuns: SyncRun[] | null;
  sims: Sim[] | null;
  logistics: LogisticsStats | null;
}

const EMPTY_DATA: Data = {
  fleet: null,
  security: null,
  warranty: null,
  shipments: null,
  software: null,
  people: null,
  activity: null,
  dashboard: null,
  controllers: null,
  networks: null,
  syncHealth: null,
  stock: null,
  intune: null,
  recentRuns: null,
  sims: null,
  logistics: null,
};

/** Per-source error map. Empty when everything is healthy. */
type ErrorMap = Partial<Record<keyof Data, string>>;

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
    render: (d) => (
      <ActivitySlide data={d.activity} dashboard={d.dashboard} />
    ),
  },
  {
    key: "deployments",
    title: "Deployments & onboards",
    icon: <Rocket size={28} />,
    tint: "#C97CF4",
    render: (d) => <DeploymentsSlide data={d.dashboard} />,
  },
  {
    key: "stock",
    title: "Stock & spares",
    icon: <Package size={28} />,
    tint: "#86C285",
    render: (d) => <StockSlide data={d.stock} />,
  },
  {
    key: "intune_health",
    title: "Intune device health",
    icon: <ShieldCheck size={28} />,
    tint: C.primary,
    render: (d) => (
      <IntuneSlide intune={d.intune} dashboard={d.dashboard} />
    ),
  },
  {
    key: "sync_errors",
    title: "Recent sync failures",
    icon: <AlertOctagon size={28} />,
    tint: C.danger,
    render: (d) => <SyncErrorsSlide runs={d.recentRuns} />,
  },
  {
    key: "sync_health",
    title: "Integration health",
    icon: <RefreshCw size={28} />,
    tint: "#86C285",
    render: (d) => <SyncHealthSlide data={d.syncHealth} />,
  },
  {
    key: "access_control",
    title: "Access control (Axis)",
    icon: <IdCard size={28} />,
    tint: "#E5A23E",
    render: (d) => (
      <AccessControlSlide
        controllers={d.controllers}
        badges={d.dashboard?.badges ?? null}
      />
    ),
  },
  {
    key: "network",
    title: "Network infrastructure (Meraki)",
    icon: <NetworkIcon size={28} />,
    tint: "#6CC3E0",
    render: (d) => <NetworkSlide networks={d.networks} />,
  },
  {
    key: "sims",
    title: "Cellular SIMs",
    icon: <Radio size={28} />,
    tint: "#6CC3E0",
    render: (d) => <SimsSlide sims={d.sims} />,
  },
  {
    key: "logistics",
    title: "Logistics operations",
    icon: <Wrench size={28} />,
    tint: "#E5A23E",
    render: (d) => <LogisticsSlide stats={d.logistics} />,
  },
];

export default function Wallboard({ onExit }: { onExit: () => void }) {
  const [data, setData] = useState<Data>(EMPTY_DATA);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [tick, setTick] = useState(0); // forces "Xs ago" re-render
  const [errors, setErrors] = useState<ErrorMap>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [lastInteractionAt, setLastInteractionAt] = useState<number>(Date.now());
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
    /** Run a single source. On success, write it into `data`. On failure,
     *  record the message in `errors` and leave the previous value in place
     *  (so a transient blip doesn't wipe a slide). */
    async function track<K extends keyof Data>(
      key: K,
      thunk: () => Promise<Data[K]>,
    ) {
      try {
        const v = await thunk();
        setData((prev) => ({ ...prev, [key]: v }));
        setErrors((prev) => {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErrors((prev) => ({ ...prev, [key]: msg }));
      }
    }

    await Promise.all([
      track("fleet", getFleetReport),
      track("security", getSecurityReport),
      track("warranty", getWarrantyReport),
      track("shipments", getShipmentsReport),
      track("software", getSoftwareReport),
      track("people", getPeopleReport),
      track("activity", getActivityReport),
      track("dashboard", getDashboardStats),
      track("controllers", listControllers),
      track("networks", () => listNetworks(false)),
      track("syncHealth", getSyncHealth),
      track("stock", getStockReport),
      track("intune", getIntuneReport),
      // 100 most recent runs across all sources; drives the SyncErrors slide.
      track("recentRuns", () => listSyncRuns(undefined, 100)),
      track("sims", () => listSims().then((r) => r.sims)),
      track("logistics", getLogisticsStats),
    ]);
    setLastUpdated(Date.now());
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

  // "Xs ago" ticker — also drives idle-dim + auto-resume checks
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 5_000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-resume rotation if operator paused and walked away. Without this,
  // a TV that was paused for inspection stays stuck on one slide forever.
  useEffect(() => {
    if (!paused || pausedAt == null) return;
    const remaining = Math.max(0, PAUSE_AUTO_RESUME_MS - (Date.now() - pausedAt));
    const id = window.setTimeout(() => {
      setPaused(false);
      setPausedAt(null);
    }, remaining);
    return () => window.clearTimeout(id);
  }, [paused, pausedAt, tick]);

  // Record user interaction so idle-dim can reset
  const markInteraction = useCallback(() => {
    setLastInteractionAt(Date.now());
  }, []);

  // Pointer interactions reset idle timer (keyboard handler does so itself).
  useEffect(() => {
    window.addEventListener("mousemove", markInteraction);
    window.addEventListener("pointerdown", markInteraction);
    return () => {
      window.removeEventListener("mousemove", markInteraction);
      window.removeEventListener("pointerdown", markInteraction);
    };
  }, [markInteraction]);

  // Keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      markInteraction();
      if (helpOpen && e.key === "Escape") {
        setHelpOpen(false);
        return;
      }
      if (e.key === "ArrowRight") {
        setIndex((i) => (i + 1) % SLIDES.length);
      } else if (e.key === "ArrowLeft") {
        setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length);
      } else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setPaused((p) => {
          const next = !p;
          setPausedAt(next ? Date.now() : null);
          return next;
        });
      } else if (e.key === "Escape") {
        onExit();
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      } else if (e.key === "r" || e.key === "R") {
        void refresh();
      } else if (e.key === "?" || e.key === "/") {
        // "?" is shift+/ on US layouts — accept "/" so users without shift
        // discoverability still get the help overlay.
        e.preventDefault();
        setHelpOpen((o) => !o);
      } else if (
        e.key >= "1" &&
        e.key <= "9" &&
        Number(e.key) <= SLIDES.length
      ) {
        setIndex(Number(e.key) - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, toggleFullscreen, refresh, helpOpen, markInteraction]);

  const slide = SLIDES[index];

  // Hidden tick read keeps the "updated Xs ago" line fresh on each interval
  void tick;
  const now = Date.now();
  const ago = lastUpdated
    ? Math.max(0, Math.floor((now - lastUpdated) / 1000))
    : null;
  const isStale = lastUpdated !== null && now - lastUpdated > STALE_MS;
  const isDimmed = now - lastInteractionAt > IDLE_DIM_MS;
  const errorCount = Object.keys(errors).length;
  const nextRefreshIn = lastUpdated
    ? Math.max(0, Math.ceil((REFRESH_MS - (now - lastUpdated)) / 1000))
    : null;
  const envBadge = deriveEnvBadge();
  const wallClock = formatClock(now);
  const alarmActive = soundOn && (errorCount > 0 || isStale);

  // Audible alert — edge-triggered, fires once on transition into alarm state.
  // `playAlarmBeep` is a no-op when WebAudio isn't supported.
  useEffect(() => {
    if (alarmActive) playAlarmBeep();
  }, [alarmActive]);

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
        // Burn-in protection: drop brightness after long idle. Any keypress
        // or mousemove restores it via markInteraction().
        filter: isDimmed ? "brightness(0.35)" : undefined,
        transition: "filter 0.6s ease",
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
                display: "inline-flex",
                alignItems: "center",
                gap: "0.625rem",
              }}
            >
              IT Asset Wallboard
              <span
                style={{
                  padding: "0.125rem 0.5rem",
                  borderRadius: 4,
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  background: `rgb(from ${envBadge.color} r g b / 0.18)`,
                  color: envBadge.color,
                  letterSpacing: "0.08em",
                }}
                title={envBadge.host}
              >
                {envBadge.label}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: C.text,
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 600,
                }}
              >
                <Calendar size={12} aria-hidden style={{ opacity: 0.7 }} />
                {wallClock.date}
                <span style={{ opacity: 0.4 }}>·</span>
                {wallClock.time}
              </span>
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
          <span
            title={lastUpdated ? new Date(lastUpdated).toLocaleString() : ""}
            style={{
              color: isStale ? C.danger : undefined,
              fontWeight: isStale ? 600 : undefined,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {ago === null
              ? "loading…"
              : isStale
                ? `STALE · ${ago}s ago`
                : ago < 5
                  ? "just updated"
                  : `updated ${ago}s ago`}
            {nextRefreshIn !== null && !isStale && (
              <span style={{ marginLeft: 8, opacity: 0.6 }}>
                · next {nextRefreshIn}s
              </span>
            )}
          </span>
          {errorCount > 0 && (
            <span
              title={Object.entries(errors)
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: C.danger,
                fontWeight: 600,
              }}
            >
              <AlertTriangle size={14} />
              {errorCount}
            </span>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            title="Refresh now (r)"
            style={iconBtnStyle(C.muted, C.border)}
          >
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              setSoundOn((s) => !s);
              // Tickle WebAudio inside the click handler so future programmatic
              // beeps are allowed by autoplay policies.
              if (!soundOn) primeAudio();
            }}
            title={
              soundOn
                ? alarmActive
                  ? "Alarm armed · ringing"
                  : "Alarm armed — click to mute"
                : "Alarm muted — click to arm"
            }
            style={iconBtnStyle(
              alarmActive ? C.danger : soundOn ? C.warning : C.muted,
              alarmActive ? C.danger : soundOn ? C.warning : C.border,
            )}
          >
            {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setPaused((p) => {
                const next = !p;
                setPausedAt(next ? Date.now() : null);
                return next;
              });
            }}
            title={paused ? "Resume rotation (space)" : "Pause rotation (space)"}
            style={iconBtnStyle(
              paused ? C.warning : C.muted,
              paused ? C.warning : C.border,
            )}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            type="button"
            onClick={() => setHelpOpen((o) => !o)}
            title="Keyboard shortcuts (?)"
            style={iconBtnStyle(
              helpOpen ? C.primary : C.muted,
              helpOpen ? C.primary : C.border,
            )}
          >
            <Keyboard size={16} />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title={
              isFullscreen
                ? "Exit fullscreen (f)"
                : "Enter fullscreen (f)"
            }
            style={iconBtnStyle(
              isFullscreen ? C.primary : C.muted,
              isFullscreen ? C.primary : C.border,
            )}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button
            type="button"
            onClick={onExit}
            title="Exit wallboard (esc)"
            style={iconBtnStyle(C.muted, C.border)}
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
        {errorCount > 0 && (
          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: 8,
              background: `rgb(from ${C.danger} r g b / 0.12)`,
              color: C.danger,
              marginBottom: "1rem",
              fontSize: "0.95rem",
            }}
          >
            {errorCount === 1
              ? `One data source is failing: ${Object.keys(errors)[0]}`
              : `${errorCount} data sources are failing — hover stale indicator for details`}
          </div>
        )}
        {/* Per-slide fade-in keyed on index — defeats flash-of-prior-slide */}
        <div
          key={slide.key}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            animation: "wb-fade-in 200ms ease-out",
          }}
        >
          {slide.render(data)}
        </div>
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
                width: i === index ? 36 : 16,
                height: 16,
                borderRadius: 8,
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
            fontSize: "1rem",
            color: C.muted,
            letterSpacing: "0.04em",
          }}
        >
          ← / → switch · 1–{Math.min(9, SLIDES.length)} jump · space pause · r refresh · f
          fullscreen · ? help · esc exit
        </span>
      </footer>
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
      {paused && pausedAt !== null && (
        <PausedBanner
          pausedAt={pausedAt}
          autoResumeMs={PAUSE_AUTO_RESUME_MS}
          tick={tick}
        />
      )}
      {/* Keyframes for fade-in transition on slide change */}
      <style>{`
        @keyframes wb-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
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

function iconBtnStyle(
  color: string,
  border: string,
): React.CSSProperties {
  return {
    background: "transparent",
    color,
    border: `1px solid ${border}`,
    borderRadius: 8,
    width: 36,
    height: 36,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };
}

const SHORTCUTS: Array<[string, string]> = [
  ["← / →", "Previous / next slide"],
  ["1 – 9", "Jump to slide N"],
  ["Space", "Pause / resume rotation"],
  ["R", "Refresh data now"],
  ["F", "Toggle fullscreen"],
  ["?", "Show / hide this help"],
  ["Esc", "Exit wallboard"],
];

function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surface,
          color: C.text,
          border: `2px solid ${C.border}`,
          borderRadius: 16,
          padding: "2rem 2.5rem",
          minWidth: 480,
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "1.25rem",
          }}
        >
          <Keyboard size={28} style={{ color: C.primary }} />
          <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Keyboard shortcuts</h2>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {SHORTCUTS.map(([key, desc]) => (
              <tr key={key}>
                <td
                  style={{
                    padding: "0.5rem 1rem 0.5rem 0",
                    width: "8rem",
                  }}
                >
                  <kbd
                    style={{
                      display: "inline-block",
                      padding: "0.25rem 0.6rem",
                      borderRadius: 6,
                      border: `1px solid ${C.border}`,
                      background: C.bg,
                      color: C.text,
                      fontFamily: "ui-monospace, monospace",
                      fontSize: "0.95rem",
                    }}
                  >
                    {key}
                  </kbd>
                </td>
                <td style={{ padding: "0.5rem 0", color: C.muted }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div
          style={{
            marginTop: "1.5rem",
            fontSize: "0.875rem",
            color: C.muted,
          }}
        >
          Tap anywhere outside to close.
        </div>
      </div>
    </div>
  );
}

function PausedBanner({
  pausedAt,
  autoResumeMs,
  tick,
}: {
  pausedAt: number;
  autoResumeMs: number;
  tick: number;
}) {
  void tick;
  const remaining = Math.max(0, autoResumeMs - (Date.now() - pausedAt));
  const secs = Math.ceil(remaining / 1000);
  return (
    <div
      style={{
        position: "absolute",
        top: "5rem",
        right: "2rem",
        background: `rgb(from ${C.warning} r g b / 0.18)`,
        border: `1px solid ${C.warning}`,
        color: C.warning,
        borderRadius: 8,
        padding: "0.5rem 0.875rem",
        fontSize: "0.875rem",
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      <Pause size={14} />
      Paused — auto-resume in {Math.floor(secs / 60)}:
      {String(secs % 60).padStart(2, "0")}
    </div>
  );
}

// ────────────────────────── Big-number widgets ──────────────────────────

/** Count-up tween for big numerics. Drives a 600ms rAF interpolation so
 *  values feel alive on refresh, instead of snapping. */
function Tween({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const from = display;
    const to = value;
    if (from === to) return;
    const duration = 600;
    let raf = 0;
    const start = performance.now();
    function step(now: number) {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (to - from) * eased);
      setDisplay(v);
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{display.toLocaleString()}</>;
}

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
        border: `2px solid ${C.border}`,
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
        {typeof value === "number" ? <Tween value={value} /> : value}
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
        border: `2px solid ${C.border}`,
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

function ActivitySlide({
  data,
  dashboard,
}: {
  data: ActivityReport | null;
  dashboard: DashboardStats | null;
}) {
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
  const onboards30 = dashboard?.onboards_30d ?? [];
  const onboards30Total = onboards30.reduce((s, p) => s + p.count, 0);
  const warrantyChanges = dashboard?.warranty_changes_30d ?? [];
  const warrantyChangesTotal = warrantyChanges.reduce((s, p) => s + p.count, 0);

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
          gridTemplateColumns: "1.2fr 0.9fr 1fr",
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
        <ChartCard
          title="Last 30 days · trend"
          subtitle="daily counts from dashboard stats"
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              minHeight: 0,
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 4,
                }}
              >
                <span style={{ color: C.muted, fontSize: "0.875rem" }}>
                  Onboards
                </span>
                <span style={{ fontWeight: 700, fontSize: "1.125rem" }}>
                  {onboards30Total}
                </span>
              </div>
              <Sparkline
                points={onboards30.map((p) => p.count)}
                color={C.success}
              />
            </div>
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 4,
                }}
              >
                <span style={{ color: C.muted, fontSize: "0.875rem" }}>
                  Warranty changes
                </span>
                <span style={{ fontWeight: 700, fontSize: "1.125rem" }}>
                  {warrantyChangesTotal}
                </span>
              </div>
              <Sparkline
                points={warrantyChanges.map((p) => p.count)}
                color={C.warning}
              />
            </div>
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

// ────────────────────────── Header chrome helpers ───────────────────────

/** Map deployment host → DEV / STAGING / PROD badge + tint.
 *  Local/dev hostnames default to DEV; anything else assumed PROD. Override
 *  by setting `localStorage.WALLBOARD_ENV` to a custom label. */
function deriveEnvBadge(): { label: string; color: string; host: string } {
  const host =
    typeof window !== "undefined" ? window.location.hostname || "unknown" : "ssr";
  try {
    const override = window.localStorage.getItem("WALLBOARD_ENV");
    if (override) {
      const lower = override.toLowerCase();
      const color = lower.startsWith("prod")
        ? C.danger
        : lower.startsWith("stag")
          ? C.warning
          : C.success;
      return { label: override.toUpperCase(), color, host };
    }
  } catch {
    /* localStorage may throw under sandboxed contexts */
  }
  if (
    host === "localhost" ||
    host.startsWith("127.") ||
    host.endsWith(".local") ||
    host.includes(".dev.")
  ) {
    return { label: "DEV", color: C.success, host };
  }
  if (host.includes("staging") || host.includes(".stg.")) {
    return { label: "STAGING", color: C.warning, host };
  }
  return { label: "PROD", color: C.danger, host };
}

function formatClock(ms: number): { time: string; date: string } {
  const d = new Date(ms);
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const date = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return { time, date };
}

// ────────────────────────── WebAudio alarm beep ─────────────────────────

let _audioCtx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!_audioCtx) _audioCtx = new Ctor();
  return _audioCtx;
}
/** Wake the AudioContext from inside a user gesture so future beeps can play
 *  without hitting browser autoplay restrictions. */
function primeAudio() {
  const ctx = audioCtx();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}
/** Soft two-tone descending beep — distinctive, not annoying. */
function playAlarmBeep() {
  const ctx = audioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const t0 = ctx.currentTime;
  const tones = [
    { f: 880, t: 0, dur: 0.18 },
    { f: 660, t: 0.22, dur: 0.22 },
  ];
  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = tone.f;
    gain.gain.setValueAtTime(0, t0 + tone.t);
    gain.gain.linearRampToValueAtTime(0.12, t0 + tone.t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.t + tone.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + tone.t);
    osc.stop(t0 + tone.t + tone.dur);
  }
}

// ────────────────────────── Sparkline helper ────────────────────────────

function Sparkline({
  points,
  color,
  height = 56,
  fillBelow = true,
}: {
  points: number[];
  color: string;
  height?: number;
  fillBelow?: boolean;
}) {
  if (points.length === 0) {
    return <div style={{ height, color: C.muted }}>—</div>;
  }
  const W = 200;
  const H = height;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = Math.max(1, max - min);
  const step = points.length > 1 ? W / (points.length - 1) : 0;
  const coords = points.map((v, i) => {
    const x = i * step;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return [x, y] as const;
  });
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = fillBelow
    ? `${line} L${W},${H} L0,${H} Z`
    : "";
  const last = coords[coords.length - 1];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
      aria-hidden
    >
      {fillBelow && (
        <path d={area} fill={`rgb(from ${color} r g b / 0.18)`} />
      )}
      <path d={line} fill="none" stroke={color} strokeWidth={2} />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </svg>
  );
}

// ────────────────────────── Integration health slide ────────────────────

// Keyed on the backend `SYNC_SOURCES` identifiers (app/models/inventory.py).
// Keep in step when a source is added there. Unknown keys fall back to
// title-casing via `prettySource`.
const SYNC_SOURCE_LABEL: Record<string, string> = {
  intune: "Intune (devices)",
  defender: "Defender (security)",
  meraki_devices: "Meraki (devices)",
  meraki_networks: "Meraki (networks)",
  meraki_clients: "Meraki (clients)",
  meraki_sims: "SIM cards (Meraki)",
  snowflake_locations: "Snowflake (locations)",
  users: "Users (Graph)",
  entra_groups: "Groups (Entra)",
  software: "Software (Intune)",
  shipments_poll: "Shipments (carrier poll)",
  warranty: "Warranty (Dell/Lenovo)",
  axis_badges: "Axis (badges)",
};

function prettySource(s: string): string {
  return (
    SYNC_SOURCE_LABEL[s] ??
    s.split(/[_-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ")
  );
}

function SyncHealthSlide({ data }: { data: SyncHealth | null }) {
  if (!data) return <Loading />;
  const sources = [...data.sources].sort((a, b) =>
    a.source.localeCompare(b.source),
  );
  const total = sources.length;
  const stale = sources.filter((s) => s.stale).length;
  const failed = sources.filter((s) => s.last_run && !s.last_run.ok).length;
  const healthy = total - stale - failed;
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
        <BigNumber label="Sources tracked" value={total} />
        <BigNumber
          label="Healthy"
          value={healthy}
          tone={healthy === total ? "success" : "default"}
        />
        <BigNumber
          label="Stale"
          value={stale}
          tone={stale > 0 ? "warning" : "default"}
          sub="no recent run"
        />
        <BigNumber
          label="Last run failed"
          value={failed}
          tone={failed > 0 ? "danger" : "default"}
        />
      </div>
      <ChartCard title="Per-source status" subtitle="latest sync run per integration">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr auto 1fr 0.6fr",
            rowGap: "0.5rem",
            columnGap: "1.25rem",
            alignItems: "center",
            fontSize: "1rem",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {sources.length === 0 ? (
            <span style={{ color: C.muted, gridColumn: "1 / -1" }}>
              No sync sources reported yet.
            </span>
          ) : (
            sources.map((s) => {
              const lr = s.last_run;
              const ok = lr ? lr.ok : null;
              const dotColor = s.stale
                ? C.warning
                : ok === false
                  ? C.danger
                  : ok === true
                    ? C.success
                    : C.muted;
              const statusText = !lr
                ? "never run"
                : !ok
                  ? "failed"
                  : s.stale
                    ? "stale"
                    : "ok";
              const dur =
                lr && lr.duration_ms != null
                  ? lr.duration_ms < 1000
                    ? `${lr.duration_ms}ms`
                    : `${(lr.duration_ms / 1000).toFixed(1)}s`
                  : "—";
              return (
                <Fragment key={s.source}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: dotColor,
                      }}
                      aria-hidden
                    />
                    {prettySource(s.source)}
                  </span>
                  <span
                    style={{
                      color: dotColor,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      fontWeight: 700,
                      fontSize: "0.875rem",
                    }}
                  >
                    {statusText}
                  </span>
                  <span style={{ color: C.muted }}>
                    {lr ? `last ${relative(lr.started_at)}` : "—"}
                    {lr?.error ? (
                      <span style={{ color: C.danger, marginLeft: 8 }}>
                        · {lr.error.slice(0, 60)}
                        {lr.error.length > 60 ? "…" : ""}
                      </span>
                    ) : null}
                  </span>
                  <span
                    style={{
                      color: C.muted,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {dur}
                  </span>
                </Fragment>
              );
            })
          )}
        </div>
      </ChartCard>
    </div>
  );
}

// ────────────────────────── Access control (Axis) slide ─────────────────

function AccessControlSlide({
  controllers,
  badges,
}: {
  controllers: AxisController[] | null;
  badges: DashboardStats["badges"] | null;
}) {
  if (!controllers || !badges) return <Loading />;
  const reachable = badges.controllers_reachable;
  const configured = badges.controllers_configured;
  const linkedRate = badges.total > 0
    ? Math.round(((badges.total - badges.unlinked) / badges.total) * 100)
    : 0;
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
          label="Active badges"
          value={badges.enabled}
          sub={`${badges.total.toLocaleString()} total · ${badges.disabled} disabled`}
        />
        <BigNumber
          label="Unlinked"
          value={badges.unlinked}
          tone={badges.unlinked > 0 ? "warning" : "success"}
          sub="no Intune user"
        />
        <BigNumber
          label="Linked"
          value={linkedRate}
          tone={linkedRate >= 95 ? "success" : linkedRate >= 80 ? "warning" : "danger"}
          sub={`${linkedRate}% of badges`}
        />
        <BigNumber
          label="Controllers"
          value={
            reachable == null
              ? `${configured}`
              : `${reachable}/${configured}`
          }
          tone={
            reachable == null
              ? "default"
              : reachable === configured
                ? "success"
                : reachable === 0
                  ? "danger"
                  : "warning"
          }
          sub={
            badges.controllers_last_checked_at
              ? `checked ${relative(badges.controllers_last_checked_at)}`
              : "reachability not yet probed"
          }
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr",
          gap: "1.25rem",
          minHeight: 0,
        }}
      >
        <ChartCard title="Badges per controller">
          <HorizontalBars
            rows={badges.per_controller.map((c) => ({
              label: c.label,
              value: c.count,
            }))}
            color="#E5A23E"
          />
        </ChartCard>
        <ChartCard title="Controller inventory" subtitle="Axis door units">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.625rem",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {controllers.length === 0 ? (
              <p style={{ color: C.muted }}>No controllers configured.</p>
            ) : (
              controllers.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    padding: "0.625rem 0.875rem",
                    background: C.bg,
                    borderRadius: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "1.0625rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <IdCard
                        size={14}
                        style={{
                          verticalAlign: "middle",
                          marginRight: 8,
                          color: C.muted,
                        }}
                      />
                      {c.label}
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
                      {c.network_name ?? "no network linked"} · {c.base_url}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      fontWeight: 700,
                      color: c.configured ? C.success : C.muted,
                    }}
                  >
                    {c.configured ? "configured" : "not set"}
                  </span>
                </div>
              ))
            )}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

// ────────────────────────── Network infrastructure slide ────────────────

const SIM_STATE_META: {
  key: SimReconcileState;
  label: string;
  color: string;
}[] = [
  { key: "matched", label: "Matched", color: C.success },
  { key: "mismatched", label: "Mismatched", color: C.danger },
  { key: "assigned_not_live", label: "Assigned · not live", color: C.warning },
  { key: "unassigned_but_live", label: "Live · unassigned", color: C.warning },
  { key: "unassigned", label: "Unassigned", color: C.muted },
];

function SimsSlide({ sims }: { sims: Sim[] | null }) {
  if (!sims) return <Loading />;
  const active = sims.filter((s) => !s.archived_at);
  const total = active.length;
  const live = active.filter((s) => s.meraki_seen).length;

  const stateCounts: Record<SimReconcileState, number> = {
    matched: 0,
    mismatched: 0,
    assigned_not_live: 0,
    unassigned_but_live: 0,
    unassigned: 0,
  };
  for (const s of active) stateCounts[s.reconcile_state] += 1;

  const byCarrier = new Map<string, number>();
  for (const s of active) {
    const key = s.carrier?.trim() || "Unknown";
    byCarrier.set(key, (byCarrier.get(key) ?? 0) + 1);
  }
  const carrierRows = [...byCarrier.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const lastCheck = active
    .map((s) => s.meraki_checked_at)
    .filter((v): v is string => !!v)
    .sort()
    .pop();

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
          label="Total SIMs"
          value={total}
          sub={`${sims.length - total} archived`}
        />
        <BigNumber
          label="Live in Meraki"
          value={live}
          tone="success"
          sub={lastCheck ? `checked ${relative(lastCheck)}` : "never reconciled"}
        />
        <BigNumber
          label="Mismatched"
          value={stateCounts.mismatched}
          tone={stateCounts.mismatched > 0 ? "danger" : "success"}
          sub="assigned ≠ Meraki"
        />
        <BigNumber
          label="Assigned · not live"
          value={stateCounts.assigned_not_live}
          tone={stateCounts.assigned_not_live > 0 ? "warning" : "success"}
          sub="not seen in a firewall"
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr",
          gap: "1.25rem",
          minHeight: 0,
        }}
      >
        <ChartCard
          title="Reconcile state"
          subtitle="on-paper assignment vs Meraki reality"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {SIM_STATE_META.map((m) => {
              const value = stateCounts[m.key];
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              return (
                <div key={m.key}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "1rem",
                      marginBottom: 4,
                    }}
                  >
                    <span>{m.label}</span>
                    <span style={{ color: C.muted }}>
                      {value} · {pct}%
                    </span>
                  </div>
                  <div
                    style={{
                      height: 12,
                      background: C.bg,
                      borderRadius: 6,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: m.color,
                        borderRadius: 6,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>
        <ChartCard title="By carrier">
          <HorizontalBars rows={carrierRows} color="#6CC3E0" />
        </ChartCard>
      </div>
    </div>
  );
}

function LogisticsSlide({ stats }: { stats: LogisticsStats | null }) {
  if (!stats) return <Loading />;
  const attention = [
    { label: "Repairs overdue", value: stats.repairs.overdue },
    { label: "Loaners overdue", value: stats.loans.overdue },
    { label: "SIM mismatched", value: stats.sims.mismatched },
    { label: "SIM not live", value: stats.sims.assigned_not_live },
    { label: "Reorder short", value: stats.replenishment.short_items },
  ].filter((r) => r.value > 0);

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
          label="Repairs open"
          value={stats.repairs.open}
          tone={stats.repairs.overdue > 0 ? "danger" : "default"}
          sub={`${stats.repairs.overdue} overdue · ${stats.repairs.at_vendor} at vendor`}
        />
        <BigNumber
          label="Transfers in transit"
          value={stats.transfers.in_transit}
          sub={`${stats.transfers.draft} draft`}
        />
        <BigNumber
          label="Loaners out"
          value={stats.loans.out}
          tone={stats.loans.overdue > 0 ? "warning" : "default"}
          sub={
            stats.loans.overdue > 0 ? `${stats.loans.overdue} overdue` : "none overdue"
          }
        />
        <BigNumber
          label="Reorder short"
          value={stats.replenishment.short_items}
          tone={stats.replenishment.short_items > 0 ? "warning" : "success"}
          sub={`${stats.replenishment.suggested_units} units suggested`}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.25rem",
          minHeight: 0,
        }}
      >
        <ChartCard title="Repairs pipeline">
          <HorizontalBars
            rows={[
              { label: "Open", value: stats.repairs.open },
              { label: "At vendor", value: stats.repairs.at_vendor },
              { label: "Overdue", value: stats.repairs.overdue },
            ]}
            color="#E5A23E"
          />
        </ChartCard>
        <ChartCard title="Needs attention" subtitle="across logistics">
          {attention.length === 0 ? (
            <p style={{ color: C.success, fontSize: "1.25rem" }}>
              All clear — nothing overdue or short.
            </p>
          ) : (
            <HorizontalBars rows={attention} color={C.danger} />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function NetworkSlide({ networks }: { networks: Network[] | null }) {
  if (!networks) return <Loading />;
  const active = networks.filter((n) => !n.archived_at);
  const totalAssets = active.reduce((s, n) => s + n.asset_count, 0);
  const totalVlans = active.reduce((s, n) => s + n.vlan_count, 0);
  const unlinkedToLocation = active.filter((n) => n.location_id == null).length;
  const byAssets = [...active]
    .sort((a, b) => b.asset_count - a.asset_count)
    .slice(0, 8);
  const lastSync = active
    .map((n) => n.meraki_synced_at)
    .filter((s): s is string => !!s)
    .sort()
    .pop();
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
          label="Active networks"
          value={active.length}
          sub={`${networks.length - active.length} archived`}
        />
        <BigNumber label="Tracked assets" value={totalAssets} />
        <BigNumber label="VLANs" value={totalVlans} />
        <BigNumber
          label="Without location"
          value={unlinkedToLocation}
          tone={unlinkedToLocation > 0 ? "warning" : "success"}
          sub={
            lastSync
              ? `meraki sync ${relative(lastSync)}`
              : "no recent meraki sync"
          }
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr",
          gap: "1.25rem",
          minHeight: 0,
        }}
      >
        <ChartCard title="Top networks by tracked assets">
          <HorizontalBars
            rows={byAssets.map((n) => ({
              label: n.display_name,
              value: n.asset_count,
            }))}
            color="#6CC3E0"
          />
        </ChartCard>
        <ChartCard title="Recently active" subtitle="latest Meraki sync timestamp">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {active.length === 0 ? (
              <p style={{ color: C.muted }}>No active networks.</p>
            ) : (
              [...active]
                .sort((a, b) =>
                  (b.meraki_synced_at ?? "").localeCompare(
                    a.meraki_synced_at ?? "",
                  ),
                )
                .slice(0, 8)
                .map((n) => (
                  <div
                    key={n.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      padding: "0.5rem 0.875rem",
                      background: C.bg,
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "1rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <NetworkIcon
                          size={14}
                          style={{
                            verticalAlign: "middle",
                            marginRight: 8,
                            color: C.muted,
                          }}
                        />
                        {n.display_name}
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
                        {n.location_name ?? "no location"}
                        {n.wan_ip ? ` · WAN ${n.wan_ip}` : ""}
                      </div>
                    </div>
                    <span
                      style={{
                        color: C.muted,
                        fontSize: "0.8125rem",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n.meraki_synced_at
                        ? relative(n.meraki_synced_at)
                        : "—"}
                    </span>
                  </div>
                ))
            )}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

// ────────────────────────── Deployments & onboards slide ────────────────

function DeploymentsSlide({ data }: { data: DashboardStats | null }) {
  if (!data) return <Loading />;
  const dep = data.deployments;
  const onboards = data.onboards_30d ?? [];
  const onboardsTotal = onboards.reduce((s, p) => s + p.count, 0);
  // Last 7-day vs prior 7-day delta — quick momentum signal.
  const last7 = onboards.slice(-7).reduce((s, p) => s + p.count, 0);
  const prior7 = onboards.slice(-14, -7).reduce((s, p) => s + p.count, 0);
  const delta = last7 - prior7;
  const peak = onboards.reduce(
    (best, p) => (p.count > best.count ? p : best),
    onboards[0] ?? { date: "", count: 0 },
  );
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
          label="Planning"
          value={dep.planning}
          sub="not yet started"
        />
        <BigNumber
          label="In progress"
          value={dep.in_progress}
          tone={dep.in_progress > 0 ? "warning" : "default"}
          sub="active rollouts"
        />
        <BigNumber
          label="Completed · 30d"
          value={dep.completed_30d}
          tone="success"
          sub="shipped in last month"
        />
        <BigNumber
          label="Onboards · 30d"
          value={onboardsTotal}
          sub={
            delta === 0
              ? "flat vs prior 7d"
              : delta > 0
                ? `▲ ${delta} vs prior 7d`
                : `▼ ${Math.abs(delta)} vs prior 7d`
          }
          tone={delta >= 0 ? "success" : "warning"}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: "1.25rem",
          minHeight: 0,
        }}
      >
        <ChartCard
          title="Daily onboards · last 30 days"
          subtitle={
            peak.date
              ? `peak ${peak.count} on ${peak.date}`
              : "no onboards yet"
          }
        >
          <Sparkline
            points={onboards.map((p) => p.count)}
            color={C.success}
            height={220}
          />
        </ChartCard>
        <ChartCard title="Deployment pipeline">
          <HorizontalBars
            rows={[
              { label: "Planning", value: dep.planning },
              { label: "In progress", value: dep.in_progress },
              { label: "Completed (30d)", value: dep.completed_30d },
            ]}
            color="#C97CF4"
          />
        </ChartCard>
      </div>
    </div>
  );
}

// ────────────────────────── Stock & spares slide ────────────────────────

function StockSlide({ data }: { data: StockReport | null }) {
  if (!data) return <Loading />;
  const byModel = [...data.stock_by_model]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const totalStock = data.stock_by_model.reduce((s, r) => s + r.count, 0);
  const pipeCounts = data.deployment_pipeline?.counts ?? {};
  const reserved = Object.values(pipeCounts).reduce(
    (s, n) => s + (typeof n === "number" ? n : 0),
    0,
  );
  const staleStock = data.stale_stock ?? [];
  const avgCycle = data.deployment_avg_cycle_days;
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
          label="Spares on hand"
          value={totalStock}
          sub={`${data.stock_by_model.length} distinct models`}
        />
        <BigNumber
          label="Reserved"
          value={reserved}
          tone={reserved > 0 ? "warning" : "default"}
          sub="in active pipelines"
        />
        <BigNumber
          label="Stale > 90d"
          value={staleStock.length}
          tone={staleStock.length === 0 ? "success" : "warning"}
          sub="sitting at warehouse"
        />
        <BigNumber
          label="Avg deploy cycle"
          value={
            avgCycle == null ? "—" : `${avgCycle.toFixed(1)}d`
          }
          sub="onboard → assigned"
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
        <ChartCard title="Top spare models">
          <HorizontalBars
            rows={byModel.map((r) => ({
              label: `${r.manufacturer ?? ""} ${r.model ?? r.asset_type}`.trim(),
              value: r.count,
            }))}
            color="#86C285"
          />
        </ChartCard>
        <ChartCard title="Oldest stale stock" subtitle="warehouse > 90d">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {staleStock.length === 0 ? (
              <p style={{ color: C.muted }}>No stale stock. 🎉</p>
            ) : (
              [...staleStock]
                .sort(
                  (a, b) =>
                    (b.days_at_warehouse ?? 0) - (a.days_at_warehouse ?? 0),
                )
                .slice(0, 6)
                .map((s) => (
                  <div
                    key={s.asset_id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.5rem 0.875rem",
                      background: C.bg,
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "1rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <Package
                          size={14}
                          style={{
                            verticalAlign: "middle",
                            marginRight: 8,
                            color: C.muted,
                          }}
                        />
                        {(s.manufacturer ?? "") + " " + (s.model ?? s.asset_type)}
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
                        {s.serial_number}
                      </div>
                    </div>
                    <span
                      style={{
                        color: C.warning,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {s.days_at_warehouse ?? "?"}d
                    </span>
                  </div>
                ))
            )}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

// ────────────────────────── Intune device health slide ──────────────────

function IntuneSlide({
  intune,
  dashboard,
}: {
  intune: IntuneReport | null;
  dashboard: DashboardStats | null;
}) {
  if (!intune) return <Loading />;
  const dash = dashboard?.intune;
  const recencyRows = intune.recency_buckets.map((r) => ({
    label: r.label,
    value: r.count,
  }));
  const managedSlices = intune.managed_by.slice(0, 5).map((r, i) => ({
    label: r.label || "unknown",
    value: r.count,
    color: ["#6CC3E0", C.success, C.warning, "#C97CF4", C.muted][i % 5],
  }));
  const managedTotal = managedSlices.reduce((s, x) => s + x.value, 0);
  const stale = intune.stale_check_ins.slice(0, 5);
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
          label="Synced from Intune"
          value={dash?.synced_count ?? managedTotal}
          sub={
            dash?.last_bulk_sync_at
              ? `last bulk ${relative(dash.last_bulk_sync_at)}`
              : "no bulk sync recorded"
          }
        />
        <BigNumber
          label="Stale · 7d"
          value={intune.stale_count_7d}
          tone={intune.stale_count_7d === 0 ? "success" : "warning"}
          sub="not checked in this week"
        />
        <BigNumber
          label="Stale · 30d"
          value={intune.stale_count_30d}
          tone={intune.stale_count_30d === 0 ? "success" : "danger"}
          sub="not checked in this month"
        />
        <BigNumber
          label="Bulk sync gap"
          value={
            dash?.last_bulk_sync_at
              ? Math.max(
                  0,
                  Math.floor(
                    (Date.now() -
                      new Date(dash.last_bulk_sync_at).getTime()) /
                      3_600_000,
                  ),
                )
              : "—"
          }
          tone={
            dash?.last_bulk_sync_at &&
            Date.now() - new Date(dash.last_bulk_sync_at).getTime() <
              26 * 3_600_000
              ? "success"
              : "warning"
          }
          sub="hours since last full pass"
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "0.9fr 1fr 1.1fr",
          gap: "1.25rem",
          minHeight: 0,
        }}
      >
        <ChartCard title="Managed by">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.875rem",
            }}
          >
            <Donut
              slices={managedSlices}
              size={200}
              thickness={30}
              centerLabel={String(managedTotal)}
              centerSub="devices"
            />
            <LegendStrip slices={managedSlices} />
          </div>
        </ChartCard>
        <ChartCard title="Last check-in distribution">
          <HorizontalBars rows={recencyRows} color={C.primary} />
        </ChartCard>
        <ChartCard
          title="Oldest stale check-ins"
          subtitle="days since Intune last heard from device"
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {stale.length === 0 ? (
              <p style={{ color: C.muted }}>No stale check-ins.</p>
            ) : (
              stale.map((s) => (
                <div
                  key={s.asset_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.5rem 0.875rem",
                    background: C.bg,
                    borderRadius: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "1rem",
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
                      {s.intune_device_name ?? s.serial_number}
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
                      {s.assigned_upn ?? "unassigned"}
                    </div>
                  </div>
                  <span
                    style={{
                      color:
                        (s.days_since ?? 0) >= 30 ? C.danger : C.warning,
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {s.days_since ?? "?"}d
                  </span>
                </div>
              ))
            )}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

// ────────────────────────── Sync errors slide ───────────────────────────

/** Collapse a free-text error message to a short fingerprint so we can group
 *  repeated failures. Strips numbers/uuids/quotes to defeat per-run noise. */
function errorFingerprint(err: string): string {
  return err
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b\d+\b/g, "N")
    .replace(/'[^']*'|"[^"]*"/g, "<str>")
    .slice(0, 120);
}

function SyncErrorsSlide({ runs }: { runs: SyncRun[] | null }) {
  if (!runs) return <Loading />;
  const failed = runs.filter((r) => !r.ok && r.error);
  // Group by (source, fingerprint). Sorted by count desc, then recency desc.
  const groups = new Map<
    string,
    {
      source: string;
      fingerprint: string;
      exampleError: string;
      count: number;
      mostRecent: string;
    }
  >();
  for (const r of failed) {
    const fp = errorFingerprint(r.error!);
    const key = `${r.source}::${fp}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (r.started_at > existing.mostRecent) {
        existing.mostRecent = r.started_at;
      }
    } else {
      groups.set(key, {
        source: r.source,
        fingerprint: fp,
        exampleError: r.error!,
        count: 1,
        mostRecent: r.started_at,
      });
    }
  }
  const top = [...groups.values()]
    .sort((a, b) => b.count - a.count || b.mostRecent.localeCompare(a.mostRecent))
    .slice(0, 8);
  const totalFailures = failed.length;
  const sourcesAffected = new Set(failed.map((r) => r.source)).size;
  const last24h = failed.filter(
    (r) => Date.now() - new Date(r.started_at).getTime() < 24 * 3_600_000,
  ).length;
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
          label="Recent runs scanned"
          value={runs.length}
          sub="latest across all sources"
        />
        <BigNumber
          label="Failures"
          value={totalFailures}
          tone={totalFailures === 0 ? "success" : "danger"}
          sub="in scanned window"
        />
        <BigNumber
          label="Last 24h"
          value={last24h}
          tone={last24h === 0 ? "success" : last24h > 5 ? "danger" : "warning"}
        />
        <BigNumber
          label="Sources affected"
          value={sourcesAffected}
          tone={sourcesAffected === 0 ? "success" : "warning"}
        />
      </div>
      <ChartCard
        title="Top repeating failures"
        subtitle="grouped by source + error fingerprint"
      >
        {top.length === 0 ? (
          <p style={{ color: C.muted }}>
            No sync failures in the scanned window. ✓
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto auto 1fr auto",
              rowGap: "0.5rem",
              columnGap: "1.25rem",
              alignItems: "center",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {top.map((g) => (
              <Fragment key={`${g.source}-${g.fingerprint}`}>
                <span
                  style={{
                    color: C.danger,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    minWidth: "3ch",
                    textAlign: "right",
                  }}
                  title={`${g.count} occurrences`}
                >
                  ×{g.count}
                </span>
                <span
                  style={{
                    color: C.muted,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontWeight: 700,
                    fontSize: "0.8125rem",
                  }}
                >
                  {prettySource(g.source)}
                </span>
                <span
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "0.875rem",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={g.exampleError}
                >
                  {g.fingerprint}
                </span>
                <span
                  style={{
                    color: C.muted,
                    fontSize: "0.8125rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  last {relative(g.mostRecent)}
                </span>
              </Fragment>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  );
}
