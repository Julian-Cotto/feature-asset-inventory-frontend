/** Reusable audit-log card. Drops into any detail page where the
 *  backend records `EntityHistory` rows. Hides itself when there's
 *  nothing recorded (typical for entities created before the audit
 *  table existed). */

import { useEffect, useState } from "react";
import { History } from "lucide-react";

import {
  listEntityHistory,
  type EntityHistoryEntry,
  type EntityType,
} from "../services/entityHistory";

interface Props {
  entityType: EntityType;
  entityId: string | number;
  /** Title for the section. Defaults to "History". */
  title?: string;
  /** Hide the whole card when no rows. Defaults true. */
  hideWhenEmpty?: boolean;
}

function parseUtc(iso: string): number {
  if (!iso) return NaN;
  const hasTz =
    iso.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(iso.split("T")[1] ?? "");
  return new Date(hasTz ? iso : iso + "Z").getTime();
}

function relTime(iso: string): string {
  const ts = parseUtc(iso);
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 0 && diff > -60_000) return "just now";
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

const EVENT_TINTS: Record<string, { bg: string; fg: string }> = {
  create: {
    bg: "rgb(from rgb(var(--color-success)) r g b / 0.16)",
    fg: "rgb(var(--color-success))",
  },
  delete: {
    bg: "rgb(from rgb(var(--color-danger)) r g b / 0.16)",
    fg: "rgb(var(--color-danger))",
  },
  archive: {
    bg: "rgb(from rgb(var(--color-warning)) r g b / 0.16)",
    fg: "rgb(var(--color-warning))",
  },
  unarchive: {
    bg: "rgb(from rgb(var(--color-success)) r g b / 0.16)",
    fg: "rgb(var(--color-success))",
  },
  enable: {
    bg: "rgb(from rgb(var(--color-success)) r g b / 0.16)",
    fg: "rgb(var(--color-success))",
  },
  disable: {
    bg: "rgb(from rgb(var(--color-warning)) r g b / 0.16)",
    fg: "rgb(var(--color-warning))",
  },
  link: {
    bg: "rgb(from rgb(var(--color-info)) r g b / 0.16)",
    fg: "rgb(var(--color-info))",
  },
  unlink: {
    bg: "rgb(from rgb(var(--color-text-muted)) r g b / 0.16)",
    fg: "rgb(var(--color-text-muted))",
  },
};

function eventTint(event_type: string): { bg: string; fg: string } {
  return (
    EVENT_TINTS[event_type] ?? {
      bg: "rgb(var(--color-bg) / 0.5)",
      fg: "rgb(var(--color-text))",
    }
  );
}

export default function EntityHistoryList({
  entityType,
  entityId,
  title = "History",
  hideWhenEmpty = true,
}: Props) {
  const [rows, setRows] = useState<EntityHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    void listEntityHistory(entityType, entityId)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }
  if (rows === null) {
    return null;
  }
  if (rows.length === 0 && hideWhenEmpty) {
    return null;
  }

  return (
    <section className="card stack" style={{ padding: "1.25rem" }}>
      <div className="cluster" style={{ gap: "0.5rem", alignItems: "center" }}>
        <History size={16} />
        <h3 className="heading-3" style={{ margin: 0 }}>
          {title}
        </h3>
        <span className="text-muted text-xs" style={{ marginLeft: "auto" }}>
          {rows.length} event{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      {rows.length === 0 ? (
        <p
          className="text-muted text-sm"
          style={{ margin: 0, fontStyle: "italic" }}
        >
          No events recorded yet.
        </p>
      ) : (
        <ul
          className="stack"
          style={{ listStyle: "none", padding: 0, margin: 0, gap: 4 }}
        >
          {rows.map((r) => {
            const tint = eventTint(r.event_type);
            return (
              <li
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: "0.6rem",
                  alignItems: "center",
                  padding: "0.45rem 0.65rem",
                  borderBottom:
                    "1px solid rgb(var(--color-border) / 0.25)",
                }}
              >
                <span
                  className="badge"
                  style={{
                    background: tint.bg,
                    color: tint.fg,
                    borderColor: "transparent",
                    fontSize: "0.7rem",
                    padding: "2px 8px",
                  }}
                >
                  {r.event_type}
                </span>
                <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                  <span className="text-sm" style={{ wordBreak: "break-word" }}>
                    {r.from_value && r.to_value ? (
                      <>
                        <span className="text-muted">{r.from_value}</span>{" "}
                        <span className="text-muted">→</span>{" "}
                        <span>{r.to_value}</span>
                      </>
                    ) : r.to_value ? (
                      r.to_value
                    ) : r.from_value ? (
                      <span className="text-muted">{r.from_value}</span>
                    ) : (
                      <span
                        className="text-muted"
                        style={{ fontStyle: "italic" }}
                      >
                        (no detail)
                      </span>
                    )}
                    {r.notes && (
                      <span
                        className="text-muted text-xs"
                        style={{ marginLeft: 6 }}
                      >
                        · {r.notes}
                      </span>
                    )}
                  </span>
                  {r.actor_upn && (
                    <span className="text-xs text-muted font-mono">
                      {r.actor_upn}
                    </span>
                  )}
                </div>
                <span
                  className="text-muted text-xs"
                  title={new Date(parseUtc(r.occurred_at)).toLocaleString()}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {relTime(r.occurred_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
