/** Rich error-detail modal. Opened from a toast that carries `details`.
 *  Shows the headline message, request/response metadata, any structured
 *  context and per-item failures, the raw response body (pretty JSON), and
 *  the stack/traceback — with a one-click copy of everything. */
import { useEffect, useState } from "react";
import { AlertOctagon, Check, ChevronDown, Copy, X } from "lucide-react";

import {
  errorDetailsToText,
  prettyBody,
  type ErrorDetails,
  type ErrorDetailItem,
} from "../lib/errors";

interface Props {
  details: ErrorDetails;
  title?: string;
  onClose: () => void;
}

const ITEM_DOT: Record<NonNullable<ErrorDetailItem["kind"]>, string> = {
  error: "var(--color-danger, #dc2626)",
  warning: "var(--color-warning, #d97706)",
  info: "var(--color-info, #2563eb)",
};

export default function ErrorDetailModal({ details, title, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [showStack, setShowStack] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const body = prettyBody(details.body);
  const contextEntries = Object.entries(details.context ?? {}).filter(
    ([, v]) => v != null && v !== "",
  );
  const heading = title ?? details.title ?? "Error details";

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(errorDetailsToText({ ...details, title: heading }));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: "1rem",
      }}
    >
      <div
        className="card stack"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(44rem, 100%)",
          maxHeight: "calc(100vh - 4rem)",
          overflow: "auto",
          padding: "1.5rem",
          gap: "1rem",
        }}
      >
        {/* Header */}
        <div
          className="cluster"
          style={{ justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}
        >
          <div className="cluster" style={{ gap: "0.6rem", alignItems: "flex-start" }}>
            <AlertOctagon
              size={20}
              strokeWidth={1.75}
              style={{ color: "rgb(var(--color-danger))", flexShrink: 0, marginTop: 2 }}
            />
            <div className="stack" style={{ gap: 2 }}>
              <h3 className="heading-3" style={{ margin: 0 }}>
                {heading}
              </h3>
              {details.message && (
                <p className="text-sm" style={{ margin: 0, color: "rgb(var(--color-text))" }}>
                  {details.message}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Request / status chips */}
        {(details.status != null || details.method || details.url || details.occurredAt) && (
          <div className="cluster" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
            {details.status != null && (
              <span className={`badge ${details.status >= 500 ? "badge-danger" : "badge-warning"}`}>
                {details.status} {details.statusText}
              </span>
            )}
            {details.method && (
              <span className="badge">
                <span className="font-mono text-xs">{details.method}</span>
              </span>
            )}
            {details.occurredAt && (
              <span className="text-xs text-muted" style={{ alignSelf: "center" }}>
                {details.occurredAt}
              </span>
            )}
          </div>
        )}
        {details.url && (
          <div
            className="font-mono text-xs"
            style={{
              wordBreak: "break-all",
              color: "rgb(var(--color-text-muted))",
              background: "rgb(var(--color-bg) / 0.5)",
              padding: "0.4rem 0.6rem",
              borderRadius: 8,
            }}
          >
            {details.url}
          </div>
        )}

        {/* Context table */}
        {contextEntries.length > 0 && (
          <div className="stack" style={{ gap: "0.3rem" }}>
            <span className="eyebrow">Context</span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "0.25rem 0.75rem",
                fontSize: "0.8125rem",
              }}
            >
              {contextEntries.map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <span className="text-muted">{k}</span>
                  <span className="font-mono" style={{ wordBreak: "break-word" }}>
                    {String(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-item failures */}
        {details.items && details.items.length > 0 && (
          <div className="stack" style={{ gap: "0.35rem" }}>
            <span className="eyebrow">
              {details.items.length} affected{" "}
              {details.items.length === 1 ? "item" : "items"}
            </span>
            <ul className="stack" style={{ gap: "0.35rem", margin: 0, padding: 0, listStyle: "none" }}>
              {details.items.map((it, i) => (
                <li
                  key={`${it.label}-${i}`}
                  className="cluster"
                  style={{
                    gap: "0.5rem",
                    alignItems: "flex-start",
                    padding: "0.5rem 0.6rem",
                    borderRadius: 8,
                    background: "rgb(var(--color-bg) / 0.5)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      marginTop: 6,
                      flexShrink: 0,
                      background: ITEM_DOT[it.kind ?? "error"],
                    }}
                  />
                  <div className="stack" style={{ gap: 0 }}>
                    <span className="font-medium text-sm">{it.label}</span>
                    <span className="text-xs" style={{ color: "rgb(var(--color-text-muted))" }}>
                      {it.message}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Response body */}
        {body && (
          <div className="stack" style={{ gap: "0.3rem" }}>
            <span className="eyebrow">Response body</span>
            <pre
              className="font-mono text-xs"
              style={{
                margin: 0,
                padding: "0.6rem 0.75rem",
                borderRadius: 8,
                background: "rgb(var(--color-bg))",
                border: "1px solid rgb(var(--color-border))",
                overflowX: "auto",
                maxHeight: "16rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {body}
            </pre>
          </div>
        )}

        {/* Stack / traceback (collapsed) */}
        {details.stack && (
          <div className="stack" style={{ gap: "0.3rem" }}>
            <button
              type="button"
              className="cluster"
              onClick={() => setShowStack((s) => !s)}
              style={{
                gap: "0.35rem",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "rgb(var(--color-text-muted))",
                alignSelf: "flex-start",
              }}
            >
              <ChevronDown
                size={14}
                strokeWidth={1.75}
                style={{ transform: showStack ? "none" : "rotate(-90deg)", transition: "transform 0.15s" }}
              />
              <span className="eyebrow" style={{ margin: 0 }}>
                Stack trace
              </span>
            </button>
            {showStack && (
              <pre
                className="font-mono text-xs"
                style={{
                  margin: 0,
                  padding: "0.6rem 0.75rem",
                  borderRadius: 8,
                  background: "rgb(var(--color-bg))",
                  border: "1px solid rgb(var(--color-border))",
                  overflowX: "auto",
                  maxHeight: "14rem",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: "rgb(var(--color-text-muted))",
                }}
              >
                {details.stack}
              </pre>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="cluster" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copyAll()}>
            {copied ? (
              <>
                <Check size={14} strokeWidth={1.75} /> Copied
              </>
            ) : (
              <>
                <Copy size={14} strokeWidth={1.75} /> Copy details
              </>
            )}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
