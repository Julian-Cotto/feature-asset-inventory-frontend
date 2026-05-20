/** Shared visual treatments — palettes, deterministic accents, avatar +
 *  pill components. Used across Users / Software / Groups list views to keep
 *  the same look-and-feel without duplicating palette + hashing logic. */

import type { ReactNode } from "react";

/** Stable hash → palette index. Deterministically picks an accent for a
 *  given string (department, vendor, kind, etc.) so the same value always
 *  renders with the same color. */
export function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}

/** Atlassian Design System accent palette (dark-mode soft variants).
 *  `bg` / `fg` pairs are tuned so text reads well on the tinted backdrop. */
export const ACCENT_PALETTE = [
  { bg: "#1c2b42", fg: "#8fb8f6" }, // blue
  { bg: "#1c3329", fg: "#7ee2b8" }, // green
  { bg: "#28311b", fg: "#b3df72" }, // lime
  { bg: "#3d2232", fg: "#f797d2" }, // magenta
  { bg: "#3a2c1f", fg: "#fbc828" }, // orange / yellow
  { bg: "#35243f", fg: "#d8a0f7" }, // purple
  { bg: "#42221f", fg: "#fd9891" }, // red
  { bg: "#1e3137", fg: "#9dd9ee" }, // teal
] as const;

/** Saturated avatar fills. Paired with dark foreground text. */
export const AVATAR_PALETTE = [
  "#669DF1", // blue
  "#4BCE97", // green
  "#94C748", // lime
  "#E774BB", // magenta
  "#FCA700", // orange
  "#C97CF4", // purple
  "#F87168", // red
  "#6CC3E0", // teal
];

export function accentFor(value: string | null | undefined) {
  if (!value) return null;
  return ACCENT_PALETTE[hashIndex(value, ACCENT_PALETTE.length)];
}

export function avatarColorFor(seed: string): string {
  return AVATAR_PALETTE[hashIndex(seed, AVATAR_PALETTE.length)];
}

/** Up to two initials from a display name; falls back to the local part of
 *  an email/identifier when name is empty. */
export function initials(name: string | null, fallback: string): string {
  const source = (name && name.trim()) || fallback.split("@")[0];
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  seed,
  name,
}: {
  seed: string;
  name: string | null;
}) {
  const bg = avatarColorFor(seed);
  return (
    <span
      className="avatar avatar-sm shrink-0"
      style={{ background: bg, color: "#0b0d10" }}
      aria-hidden="true"
    >
      {initials(name, seed)}
    </span>
  );
}

/** Soft-tinted pill colored deterministically from its own value. Renders
 *  an em-dash for null/empty to keep table cells stable. */
export function AccentPill({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted">—</span>;
  const c = accentFor(value)!;
  return (
    <span
      className="badge"
      style={{ background: c.bg, color: c.fg, borderColor: "transparent" }}
    >
      {value}
    </span>
  );
}

export function daysSince(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const diffMs = Math.max(0, Date.now() - d.getTime());
  const totalMin = Math.floor(diffMs / 60_000);
  if (totalMin < 1) return "<1m ago";
  if (totalMin < 60) return `${totalMin}m ago`;

  const totalHr = Math.floor(totalMin / 60);
  if (totalHr < 24) {
    const m = totalMin % 60;
    return m > 0 ? `${totalHr}h ${m}m ago` : `${totalHr}h ago`;
  }

  const totalDay = Math.floor(totalHr / 24);
  if (totalDay < 30) {
    const h = totalHr % 24;
    return h > 0 ? `${totalDay}d ${h}h ago` : `${totalDay}d ago`;
  }

  return d.toLocaleDateString();
}

export type SectionTint = "info" | "purple" | "green" | "amber" | "pink" | "teal";

/** Soft chip backgrounds for section headers. Same dark-mode palette family
 *  as `ACCENT_PALETTE`, but indexed by semantic role rather than hashed so
 *  the same section always renders the same color. */
const SECTION_TINTS: Record<SectionTint, { bg: string; fg: string }> = {
  info: { bg: "#1c2b42", fg: "#8fb8f6" },
  purple: { bg: "#35243f", fg: "#d8a0f7" },
  green: { bg: "#1c3329", fg: "#7ee2b8" },
  amber: { bg: "#3a2c1f", fg: "#fbc828" },
  pink: { bg: "#3d2232", fg: "#f797d2" },
  teal: { bg: "#1e3137", fg: "#9dd9ee" },
};

/** Section header used on detail-view cards: a small colored icon chip
 *  next to an h3 title. Replaces plain "Identity" / "Details" h3s with a
 *  bit of color to break up dense forms. */
export function SectionHeader({
  icon,
  title,
  tint,
  right,
}: {
  icon: ReactNode;
  title: string;
  tint: SectionTint;
  /** Optional content rendered flush-right (badges, action buttons). */
  right?: ReactNode;
}) {
  const c = SECTION_TINTS[tint];
  return (
    <div
      className="cluster"
      style={{ gap: "0.625rem", justifyContent: "space-between" }}
    >
      <div className="cluster" style={{ gap: "0.625rem", alignItems: "center" }}>
        <span
          className="cluster"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: c.bg,
            color: c.fg,
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <h3 className="heading-3" style={{ margin: 0 }}>
          {title}
        </h3>
      </div>
      {right}
    </div>
  );
}

/** Color tiered by recency: fresh (≤7d) green, stale (≤30d) amber,
 *  cold (>30d) red. Bumps users toward the rows that need attention. */
export function FreshnessCell({
  iso,
  fallback = "never",
}: {
  iso: string | null | undefined;
  fallback?: ReactNode;
}) {
  if (!iso)
    return (
      <span className="text-muted text-xs">{fallback}</span>
    );
  const days = daysSince(iso);
  let className = "text-success-soft-fg";
  if (days > 30) className = "text-danger-soft-fg";
  else if (days > 7) className = "text-warning-soft-fg";
  return (
    <span
      className={`${className} text-xs`}
      title={new Date(iso).toLocaleString()}
    >
      {relativeTime(iso)}
    </span>
  );
}
