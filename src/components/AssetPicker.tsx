import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { listAssets } from "../services/inventory";
import type { Asset } from "../types/inventory";

interface Props {
  /** Allow selecting more than one asset (chips). Default single-select. */
  multiple?: boolean;
  selected: Asset[];
  onChange: (assets: Asset[]) => void;
  placeholder?: string;
  /** Restrict the search to available (unassigned/in-stock) assets. */
  availableOnly?: boolean;
}

const assetLabel = (a: Asset) =>
  `${a.asset_tag ?? a.serial_number} · ${a.asset_type}${
    a.override_model || a.model ? ` · ${a.override_model ?? a.model}` : ""
  }`;

/** Reusable asset search + select. Debounced typeahead over `listAssets`;
 *  renders selected assets as removable chips. Shared by the logistics
 *  create forms (repairs, transfers, disposals, loaners). */
export default function AssetPicker({
  multiple = false,
  selected,
  onChange,
  placeholder = "Search by tag / serial / model…",
  availableOnly = false,
}: Props) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Asset[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!term.trim()) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      void listAssets({ q: term, limit: 20, available_only: availableOnly || undefined })
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [term, availableOnly]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (a: Asset) => {
    if (selected.some((s) => s.id === a.id)) return;
    onChange(multiple ? [...selected, a] : [a]);
    setTerm("");
    setResults([]);
    setOpen(false);
  };

  const remove = (id: number) => onChange(selected.filter((s) => s.id !== id));

  return (
    <div className="stack" style={{ gap: "0.4rem" }} ref={ref}>
      {selected.length > 0 && (
        <div className="cluster" style={{ gap: "0.375rem", flexWrap: "wrap" }}>
          {selected.map((a) => (
            <span
              key={a.id}
              className="badge"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
            >
              <span className="font-mono text-xs">{a.asset_tag ?? a.serial_number}</span>
              <button
                type="button"
                onClick={() => remove(a.id)}
                aria-label="Remove asset"
                style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, display: "flex" }}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <div className="cluster" style={{ gap: "0.4rem" }}>
          <Search size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
          <input
            className="input input-sm"
            style={{ flex: 1 }}
            placeholder={placeholder}
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
        </div>
        {open && results.length > 0 && (
          <div
            className="card"
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              zIndex: 30,
              maxHeight: "16rem",
              overflowY: "auto",
              padding: 4,
            }}
          >
            {results.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => pick(a)}
                className="row-clickable"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.4rem 0.5rem",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "rgb(var(--color-text))",
                  borderRadius: 6,
                }}
              >
                <span className="text-sm">{assetLabel(a)}</span>{" "}
                <span className="badge">{a.status_code}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
