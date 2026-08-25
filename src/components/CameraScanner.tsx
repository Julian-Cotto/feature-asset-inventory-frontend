import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  onResult: (text: string) => void;
  onClose: () => void;
}

const TARGET_ID = "asset-camera-scanner";

const NATIVE_FORMATS = [
  "qr_code",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "itf",
  "data_matrix",
  "aztec",
  "pdf417",
];

/**
 * Ensure window.BarcodeDetector exists. On Android Chrome the native API is
 * already there — polyfill detects that and is a no-op (zero runtime cost).
 * Other browsers get a WASM-backed implementation (ZXing-cpp).
 */
async function ensureBarcodeDetector(): Promise<void> {
  if (typeof window.BarcodeDetector === "function") return;
  await import("barcode-detector/polyfill");
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface DetectedCode {
  rawValue: string;
  format?: string;
  boundingBox?: BoundingBox;
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => {
      detect: (
        src: HTMLVideoElement | ImageBitmap | Blob | HTMLCanvasElement,
      ) => Promise<DetectedCode[]>;
    };
  }
}

// Capability types — TS lib doesn't include zoom/torch/focusMode yet.
interface ExtendedTrackCapabilities {
  zoom?: { min: number; max: number; step?: number };
  torch?: boolean;
  focusMode?: string[];
  focusDistance?: { min: number; max: number; step?: number };
}

interface NormZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_ZONE = 0.05;
const MAX_ZONE = 1;
// How many consecutive frames a single code must hold the same value before
// we auto-accept. Suppresses single-frame flickers onto neighbouring codes.
const STABLE_FRAMES_NEEDED = 3;

function clampZone(z: NormZone): NormZone {
  const w = Math.max(MIN_ZONE, Math.min(MAX_ZONE, z.w));
  const h = Math.max(MIN_ZONE, Math.min(MAX_ZONE, z.h));
  const x = Math.max(0, Math.min(1 - w, z.x));
  const y = Math.max(0, Math.min(1 - h, z.y));
  return { x, y, w, h };
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(max-width: 720px)").matches
  );
}

export default function CameraScanner({ onResult, onClose }: Props) {
  const onResultRef = useRef(onResult);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const pausedRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Initializing camera…");
  const [tip, setTip] = useState<string>("Point camera at the code");
  const [tipTone, setTipTone] = useState<"info" | "warn" | "good">("info");
  const [native, setNative] = useState(false);
  const [fullscreen] = useState<boolean>(isMobileViewport);

  // Camera controls (only shown when track exposes the capability).
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [macroSupported, setMacroSupported] = useState(false);
  const [macroOn, setMacroOn] = useState(false);

  // Scan zone in normalized [0..1] coordinates of the displayed video.
  const [zone, setZone] = useState<NormZone>({
    x: 0.1,
    y: 0.35,
    w: 0.8,
    h: 0.3,
  });
  const zoneRef = useRef(zone);
  useEffect(() => {
    zoneRef.current = zone;
  }, [zone]);

  // Latest detected codes, in original video coordinates. Drives tap-to-pick
  // overlay. Updated every detection tick — flicker is acceptable because the
  // user is holding still when squaring up on a code.
  const [detected, setDetected] = useState<DetectedCode[]>([]);
  const detectedRef = useRef<DetectedCode[]>([]);
  useEffect(() => {
    detectedRef.current = detected;
  }, [detected]);

  // Multi-candidate selection — when more than one is steady in the zone we
  // pause autoplay so the user can tap deliberately without the overlay
  // moving under their finger.
  const [paused, setPaused] = useState(false);

  const handleSelect = useCallback((rawValue: string) => {
    onResultRef.current(rawValue);
  }, []);

  const handleResume = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
    setDetected([]);
    void videoRef.current?.play().catch(() => {});
  }, []);

  const applyZoom = useCallback((z: number) => {
    setZoom(z);
    const t = trackRef.current;
    if (!t) return;
    t.applyConstraints({
      advanced: [{ zoom: z } as unknown as MediaTrackConstraintSet],
    }).catch(() => {});
  }, []);

  const toggleTorch = useCallback(() => {
    setTorchOn((prev) => {
      const next = !prev;
      const t = trackRef.current;
      if (t) {
        t.applyConstraints({
          advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
        }).catch(() => {});
      }
      return next;
    });
  }, []);

  const toggleMacro = useCallback(() => {
    setMacroOn((prev) => {
      const next = !prev;
      const t = trackRef.current;
      if (t) {
        // Try manual+short focusDistance first (Android phones with a real
        // macro lens). Fall back to focusMode=continuous on toggle-off.
        const caps =
          (t.getCapabilities?.() as ExtendedTrackCapabilities | undefined) ??
          {};
        const advanced: MediaTrackConstraintSet[] = [];
        if (next) {
          if (caps.focusDistance) {
            advanced.push({
              focusMode: "manual",
              focusDistance: caps.focusDistance.min,
            } as unknown as MediaTrackConstraintSet);
          } else if (caps.focusMode?.includes("macro")) {
            advanced.push({
              focusMode: "macro",
            } as unknown as MediaTrackConstraintSet);
          }
        } else {
          advanced.push({
            focusMode: "continuous",
          } as unknown as MediaTrackConstraintSet);
        }
        t.applyConstraints({ advanced }).catch(() => {});
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const ctx: {
      cancelled: boolean;
      stream: MediaStream | null;
      video: HTMLVideoElement | null;
      rafId: number;
    } = {
      cancelled: false,
      stream: null,
      video: null,
      rafId: 0,
    };

    const releaseStream = (s: MediaStream | null) => {
      s?.getTracks().forEach((t) => t.stop());
    };

    const startNative = async () => {
      setStatus("Loading scanner…");
      await ensureBarcodeDetector();
      if (ctx.cancelled) return;

      setStatus("Requesting camera…");
      // Higher target resolution helps tiny barcodes; the device downsamples
      // if it can't deliver, so asking high is free.
      const acquired = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (ctx.cancelled) {
        releaseStream(acquired);
        return;
      }
      ctx.stream = acquired;

      const track = acquired.getVideoTracks()[0] ?? null;
      trackRef.current = track;

      // Best-effort continuous focus where supported.
      try {
        if (track) {
          await track.applyConstraints({
            advanced: [
              { focusMode: "continuous" } as MediaTrackConstraintSet,
            ],
          });
        }
      } catch {
        /* not supported — ignore */
      }

      // Discover camera capabilities for the optional controls.
      try {
        const caps =
          (track?.getCapabilities?.() as ExtendedTrackCapabilities | undefined) ??
          {};
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          setZoomCaps({
            min: caps.zoom.min,
            max: caps.zoom.max,
            step: caps.zoom.step ?? 0.1,
          });
        }
        if (caps.torch) setTorchSupported(true);
        if (
          (caps.focusDistance && caps.focusDistance.min !== undefined) ||
          caps.focusMode?.includes("macro")
        ) {
          setMacroSupported(true);
        }
      } catch {
        /* ignore */
      }

      const v = document.createElement("video");
      v.setAttribute("playsinline", "");
      v.setAttribute("autoplay", "");
      v.setAttribute("muted", "");
      v.muted = true;
      v.autoplay = true;
      v.srcObject = acquired;
      v.style.width = "100%";
      v.style.height = "100%";
      v.style.objectFit = "cover";
      v.style.borderRadius = "4px";
      v.style.display = "block";
      containerRef.current?.appendChild(v);
      try {
        await v.play();
      } catch {
        /* iOS sometimes throws on autoplay; video still renders */
      }
      if (ctx.cancelled) {
        v.parentElement?.removeChild(v);
        releaseStream(acquired);
        ctx.stream = null;
        return;
      }
      ctx.video = v;
      videoRef.current = v;

      const detector = new window.BarcodeDetector!({ formats: NATIVE_FORMATS });
      setStatus("");
      setNative(true);

      // Frame stats canvas — small downsample for brightness/contrast/motion.
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = 64;
      sampleCanvas.height = 36;
      const sampleCtx = sampleCanvas.getContext("2d", {
        willReadFrequently: true,
      });

      // Crop canvas — we feed only the user-selected zone to the detector,
      // scaled up. Acts as digital zoom on top of any hardware zoom.
      const cropCanvas = document.createElement("canvas");
      const cropCtx = cropCanvas.getContext("2d", {
        willReadFrequently: true,
      });

      const startTime = performance.now();
      let lastFrame: Uint8ClampedArray | null = null;
      let lastTipUpdate = 0;
      // Stability: track the most recently-seen single-code rawValue and
      // how many consecutive frames it has held the same value at roughly
      // the same position.
      const stab = {
        value: null as string | null,
        count: 0,
        box: null as BoundingBox | null,
      };

      const computeFrameStats = () => {
        if (!sampleCtx || !ctx.video) {
          return { motion: 0, mean: 128, contrast: 64 };
        }
        try {
          sampleCtx.drawImage(
            ctx.video,
            0,
            0,
            sampleCanvas.width,
            sampleCanvas.height,
          );
          const data = sampleCtx.getImageData(
            0,
            0,
            sampleCanvas.width,
            sampleCanvas.height,
          ).data;
          let sum = 0;
          let sumSq = 0;
          let motion = 0;
          const n = data.length / 4;
          if (!lastFrame || lastFrame.length !== n) {
            lastFrame = new Uint8ClampedArray(n);
          }
          for (let i = 0, p = 0; i < data.length; i += 4, p++) {
            const lum =
              0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            sum += lum;
            sumSq += lum * lum;
            motion += Math.abs(lum - lastFrame[p]);
            lastFrame[p] = lum;
          }
          const mean = sum / n;
          const variance = Math.max(0, sumSq / n - mean * mean);
          return { motion: motion / n, mean, contrast: Math.sqrt(variance) };
        } catch {
          return { motion: 0, mean: 128, contrast: 64 };
        }
      };

      const updateTip = (
        elapsedMs: number,
        stats: { motion: number; mean: number; contrast: number },
      ) => {
        const now = performance.now();
        if (now - lastTipUpdate < 350) return;
        lastTipUpdate = now;
        if (stats.mean < 35) {
          setTipTone("warn");
          setTip("Too dark — try the Torch button or add light");
          return;
        }
        if (stats.mean > 230) {
          setTipTone("warn");
          setTip("Too bright — reduce glare on the code");
          return;
        }
        if (stats.contrast < 18) {
          setTipTone("warn");
          setTip("Low contrast — zoom in or fill scan box");
          return;
        }
        if (stats.motion > 18) {
          setTipTone("warn");
          setTip("Hold still — moving too fast");
          return;
        }
        if (elapsedMs > 6000) {
          setTipTone("warn");
          setTip("Small code? Try Zoom or Macro; tap any code to pick");
          return;
        }
        if (elapsedMs > 2500) {
          setTipTone("info");
          setTip("Looking for code — fill scan box, hold steady");
          return;
        }
        setTipTone("info");
        setTip("Point camera at the code");
      };

      const tick = async () => {
        if (ctx.cancelled || !ctx.video) return;
        if (pausedRef.current) {
          ctx.rafId = requestAnimationFrame(tick);
          return;
        }
        const elapsed = performance.now() - startTime;
        try {
          const video = ctx.video;
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          if (vw && vh && cropCtx) {
            const z = zoneRef.current;
            const sx = z.x * vw;
            const sy = z.y * vh;
            const sw = Math.max(1, z.w * vw);
            const sh = Math.max(1, z.h * vh);
            // Scale crop up so a tiny zone still gets pixels for the
            // detector. Cap at 1600 to keep per-frame cost reasonable.
            const targetW = Math.min(1600, Math.max(640, Math.round(sw * 1.5)));
            const targetH = Math.round((sh / sw) * targetW);
            if (
              cropCanvas.width !== targetW ||
              cropCanvas.height !== targetH
            ) {
              cropCanvas.width = targetW;
              cropCanvas.height = targetH;
            }
            cropCtx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);
            const codes = await detector.detect(cropCanvas);

            // Map bounding boxes from crop space → original video space so
            // the overlay can paint them on top of the live video.
            const scaleX = sw / targetW;
            const scaleY = sh / targetH;
            const mapped: DetectedCode[] = codes.map((c) => ({
              rawValue: c.rawValue,
              format: c.format,
              boundingBox: c.boundingBox
                ? {
                    x: c.boundingBox.x * scaleX + sx,
                    y: c.boundingBox.y * scaleY + sy,
                    width: c.boundingBox.width * scaleX,
                    height: c.boundingBox.height * scaleY,
                  }
                : undefined,
            }));

            setDetected(mapped);

            if (mapped.length === 1) {
              const only = mapped[0];
              const box = only.boundingBox ?? null;
              // Treat boxes overlapping at least ~50% of either dimension as
              // the "same" code for stability tracking.
              const sameBox =
                stab.box && box
                  ? Math.abs(stab.box.x - box.x) < box.width * 0.5 &&
                    Math.abs(stab.box.y - box.y) < box.height * 0.5
                  : true;
              if (stab.value === only.rawValue && sameBox) {
                stab.count += 1;
              } else {
                stab.value = only.rawValue;
                stab.count = 1;
                stab.box = box;
              }
              if (stab.count >= STABLE_FRAMES_NEEDED) {
                setTipTone("good");
                setTip(`Detected: ${only.rawValue}`);
                setTimeout(() => onResultRef.current(only.rawValue), 120);
                return;
              }
              setTipTone("info");
              setTip("Hold steady — locking on…");
            } else if (mapped.length > 1) {
              stab.value = null;
              stab.count = 0;
              stab.box = null;
              pausedRef.current = true;
              video.pause();
              setPaused(true);
              setTipTone("info");
              setTip(
                `${mapped.length} codes in box — tap the one you want, or resize the box`,
              );
              ctx.rafId = requestAnimationFrame(tick);
              return;
            } else {
              stab.value = null;
              stab.count = 0;
              stab.box = null;
            }
          }
        } catch {
          /* per-frame errors ignored */
        }
        const stats = computeFrameStats();
        updateTip(elapsed, stats);
        ctx.rafId = requestAnimationFrame(tick);
      };
      ctx.rafId = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        if (!window.isSecureContext) {
          throw new Error("Page must be HTTPS for camera access.");
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("getUserMedia not supported by this browser.");
        }
        await startNative();
      } catch (err) {
        if (!ctx.cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      ctx.cancelled = true;
      cancelAnimationFrame(ctx.rafId);
      releaseStream(ctx.stream);
      ctx.stream = null;
      trackRef.current = null;
      if (ctx.video?.parentElement) {
        ctx.video.parentElement.removeChild(ctx.video);
      }
      ctx.video = null;
      videoRef.current = null;
    };
  }, []);

  // Backdrop click: only close if mousedown AND mouseup both fire on backdrop.
  // Prevents accidentally closing when a drag (e.g. resizing scan zone) ends
  // outside the panel.
  const downOnBackdropRef = useRef(false);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tipToneClass =
    tipTone === "good"
      ? "text-success"
      : tipTone === "warn"
        ? "text-warning"
        : "text-primary";

  const panelStyle: React.CSSProperties = fullscreen
    ? {
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        maxWidth: "none",
        maxHeight: "none",
        borderRadius: 0,
        padding: "0.6rem 0.6rem 0.8rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }
    : {};

  const stageStyle: React.CSSProperties = fullscreen
    ? { flex: 1, minHeight: 0 }
    : {};

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Scan barcode or QR code"
      onMouseDown={(e) => {
        downOnBackdropRef.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (downOnBackdropRef.current && e.target === e.currentTarget) {
          onCloseRef.current();
        }
        downOnBackdropRef.current = false;
      }}
    >
      <div
        className="modal-panel"
        style={panelStyle}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {!fullscreen && <h3 className="modal-title">Scan barcode / QR</h3>}
        <div
          className="relative w-full"
          style={{
            ...stageStyle,
            minHeight: fullscreen ? 0 : 250,
          }}
        >
          <div
            ref={containerRef}
            id={TARGET_ID}
            className="w-full rounded-md overflow-hidden bg-black"
            style={{
              width: "100%",
              height: fullscreen ? "100%" : undefined,
              minHeight: fullscreen ? 0 : 250,
            }}
          />
          {native && !error && (
            <ScanZoneOverlay
              tone={tipTone}
              zone={zone}
              onChange={(z) => setZone(clampZone(z))}
            />
          )}
          {native && !error && detected.length > 0 && videoRef.current && (
            <CandidateOverlay
              codes={detected}
              video={videoRef.current}
              showLabel={paused || detected.length > 1}
              onPick={handleSelect}
            />
          )}
        </div>

        {/* Camera controls — only render rows that are actually supported. */}
        {native && !error && (zoomCaps || torchSupported || macroSupported) && (
          <div
            className="cluster"
            style={{
              gap: "0.5rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {zoomCaps && (
              <label
                className="cluster"
                style={{
                  gap: "0.4rem",
                  alignItems: "center",
                  flex: "1 1 12rem",
                  minWidth: 0,
                }}
              >
                <span className="text-xs text-muted" style={{ minWidth: 36 }}>
                  Zoom
                </span>
                <input
                  type="range"
                  min={zoomCaps.min}
                  max={zoomCaps.max}
                  step={zoomCaps.step}
                  value={zoom}
                  onChange={(e) => applyZoom(parseFloat(e.target.value))}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <span
                  className="text-xs font-mono"
                  style={{ minWidth: 36, textAlign: "right" }}
                >
                  {zoom.toFixed(1)}×
                </span>
              </label>
            )}
            {torchSupported && (
              <button
                type="button"
                className={`btn btn-sm ${torchOn ? "btn-primary" : "btn-secondary"}`}
                onClick={toggleTorch}
                title="Toggle camera flashlight"
              >
                {torchOn ? "Torch on" : "Torch"}
              </button>
            )}
            {macroSupported && (
              <button
                type="button"
                className={`btn btn-sm ${macroOn ? "btn-primary" : "btn-secondary"}`}
                onClick={toggleMacro}
                title="Switch to macro / nearest focus distance"
              >
                {macroOn ? "Macro on" : "Macro"}
              </button>
            )}
          </div>
        )}

        {status && !error && (
          <p className="text-muted text-xs">{status}</p>
        )}
        {!status && !error && (
          <p className={`text-sm font-medium min-h-[18px] ${tipToneClass}`}>{tip}</p>
        )}
        {!fullscreen && (
          <p className="text-muted text-xs">
            Drag corners to resize the scan box. Tap any highlighted code to
            pick it.
          </p>
        )}
        {error && <div className="alert alert-error">{error}</div>}
        <div className="modal-actions">
          {paused ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleResume}
            >
              Resume scanning
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onCloseRef.current()}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================ Scan zone overlay ============================

interface OverlayProps {
  tone: "info" | "warn" | "good";
  zone: NormZone;
  onChange: (z: NormZone) => void;
}

function ScanZoneOverlay({ tone, zone, onChange }: OverlayProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stroke =
    tone === "good" ? "#0a7" : tone === "warn" ? "#e80" : "#fc0";

  const startDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    mode: "move" | "nw" | "ne" | "sw" | "se",
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startZone = { ...zone };
    (e.target as Element).setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dxN = (ev.clientX - startX) / rect.width;
      const dyN = (ev.clientY - startY) / rect.height;
      let next = { ...startZone };
      if (mode === "move") {
        next.x = startZone.x + dxN;
        next.y = startZone.y + dyN;
      } else if (mode === "nw") {
        next.x = startZone.x + dxN;
        next.y = startZone.y + dyN;
        next.w = startZone.w - dxN;
        next.h = startZone.h - dyN;
      } else if (mode === "ne") {
        next.y = startZone.y + dyN;
        next.w = startZone.w + dxN;
        next.h = startZone.h - dyN;
      } else if (mode === "sw") {
        next.x = startZone.x + dxN;
        next.w = startZone.w - dxN;
        next.h = startZone.h + dyN;
      } else if (mode === "se") {
        next.w = startZone.w + dxN;
        next.h = startZone.h + dyN;
      }
      onChange(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const boxStyle: React.CSSProperties = {
    position: "absolute",
    left: `${zone.x * 100}%`,
    top: `${zone.y * 100}%`,
    width: `${zone.w * 100}%`,
    height: `${zone.h * 100}%`,
    boxSizing: "border-box",
    border: `2px solid ${stroke}`,
    borderRadius: 6,
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
    touchAction: "none",
    cursor: "move",
  };

  const handle = (corner: "nw" | "ne" | "sw" | "se"): React.CSSProperties => ({
    position: "absolute",
    width: 28,
    height: 28,
    background: stroke,
    borderRadius: 4,
    opacity: 0.85,
    touchAction: "none",
    ...(corner === "nw" && { left: -14, top: -14, cursor: "nwse-resize" }),
    ...(corner === "ne" && { right: -14, top: -14, cursor: "nesw-resize" }),
    ...(corner === "sw" && { left: -14, bottom: -14, cursor: "nesw-resize" }),
    ...(corner === "se" && { right: -14, bottom: -14, cursor: "nwse-resize" }),
  });

  return (
    <div
      ref={wrapRef}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <div
        style={{ ...boxStyle, pointerEvents: "auto" }}
        onPointerDown={(e) => startDrag(e, "move")}
      >
        <div
          style={handle("nw")}
          onPointerDown={(e) => startDrag(e, "nw")}
        />
        <div
          style={handle("ne")}
          onPointerDown={(e) => startDrag(e, "ne")}
        />
        <div
          style={handle("sw")}
          onPointerDown={(e) => startDrag(e, "sw")}
        />
        <div
          style={handle("se")}
          onPointerDown={(e) => startDrag(e, "se")}
        />
      </div>
    </div>
  );
}

// ========================== Candidate selection ==========================

interface CandidateProps {
  codes: DetectedCode[];
  video: HTMLVideoElement;
  showLabel: boolean;
  onPick: (rawValue: string) => void;
}

function CandidateOverlay({ codes, video, showLabel, onPick }: CandidateProps) {
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  // Display vs intrinsic — video uses object-fit:cover in fullscreen so the
  // intrinsic frame may be cropped on screen. We can't perfectly reverse the
  // cover crop without measuring the element, but boundingBox values come
  // from the intrinsic frame and the overlay is positioned inside the same
  // element so percentage placement still tracks correctly for both
  // contain and cover within the visible portion.

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {codes.map((c, i) => {
        const bb = c.boundingBox;
        if (!bb) return null;
        const left = (bb.x / vw) * 100;
        const top = (bb.y / vh) * 100;
        const width = (bb.width / vw) * 100;
        const height = (bb.height / vh) * 100;
        return (
          <button
            key={`${c.rawValue}-${i}`}
            onClick={() => onPick(c.rawValue)}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              border: "3px solid #06c",
              background: "rgba(0,102,204,0.18)",
              borderRadius: 4,
              cursor: "pointer",
              padding: 0,
              pointerEvents: "auto",
              color: "#fff",
              fontSize: 11,
              fontFamily: "monospace",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              textShadow: "0 1px 2px rgba(0,0,0,0.8)",
            }}
            title={c.rawValue}
          >
            {showLabel && (
              <span
                style={{
                  background: "rgba(0,0,0,0.65)",
                  padding: "2px 4px",
                  borderRadius: 3,
                  whiteSpace: "nowrap",
                  maxWidth: "95%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  margin: 2,
                }}
              >
                {c.rawValue}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
