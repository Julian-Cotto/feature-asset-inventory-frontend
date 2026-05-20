import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronDown, X } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  /** When true, the trigger turns into a search input on open + filters
   *  options as the user types. */
  searchable?: boolean;
  /** Placeholder shown inside the search input. */
  searchPlaceholder?: string;
}

export default function Select({
  value,
  onChange,
  options,
  placeholder = "— select —",
  className,
  disabled,
  size = "md",
  searchable = false,
  searchPlaceholder = "Search…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  );
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchTerm.trim()) return options;
    const t = searchTerm.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(t) || o.value.toLowerCase().includes(t),
    );
  }, [options, searchable, searchTerm]);

  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Reset search + autofocus the input when popover opens (searchable only)
  useEffect(() => {
    if (!open) {
      setSearchTerm("");
      return;
    }
    if (searchable) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open, searchable]);

  // Highlight stays in range as filtered list changes
  useEffect(() => {
    if (highlight >= filteredOptions.length) {
      setHighlight(filteredOptions.length > 0 ? 0 : 0);
    }
  }, [filteredOptions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep highlight aligned with current selection when value changes (no search active)
  useEffect(() => {
    if (searchTerm) return;
    const idx = filteredOptions.findIndex((o) => o.value === value);
    if (idx >= 0) setHighlight(idx);
  }, [value, options, searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  function commit(idx: number) {
    const opt = filteredOptions[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  }

  function clear() {
    onChange("");
    setOpen(false);
  }

  function onTriggerKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
        const idx = options.findIndex((o) => o.value === value);
        if (idx >= 0) setHighlight(idx);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(filteredOptions.length - 1, h + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit(highlight);
      return;
    }
  }

  const showInput = open && searchable;

  return (
    <div ref={wrapperRef} className="select-wrapper">
      <div
        ref={triggerRef}
        className={
          "select select-trigger" +
          (className ? " " + className : "") +
          (size === "sm" ? " select-trigger-sm" : "") +
          (disabled ? " opacity-50 cursor-not-allowed" : "")
        }
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
      >
        {showInput ? (
          <input
            ref={searchInputRef}
            type="text"
            className="select-trigger-input"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setHighlight(0);
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) =>
                  Math.min(filteredOptions.length - 1, h + 1),
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(0, h - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                commit(highlight);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              }
            }}
          />
        ) : (
          <span
            className={
              "truncate" +
              // Treat any empty value as placeholder — applies even when
              // the caller registers an explicit `{ value: "", label: "—" }`
              // option as a "clear" affordance (we have the red X for that).
              (!current || current.value === "" ? " select-placeholder" : "")
            }
          >
            {current?.label ?? placeholder}
          </span>
        )}
        <div className="select-trigger-actions">
          {value && !disabled && (
            <button
              type="button"
              className="select-clear"
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              aria-label="Clear selection"
              title="Clear"
            >
              <X size={12} strokeWidth={2} />
            </button>
          )}
          <ChevronDown
            size={14}
            className={"select-chevron" + (open ? " select-chevron-open" : "")}
            aria-hidden
          />
        </div>
      </div>
      {open && (
        <div className="select-popover" role="dialog">
          <ul
            className="select-options"
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={
              filteredOptions[highlight]
                ? `opt-${filteredOptions[highlight].value}`
                : undefined
            }
          >
            {filteredOptions.length === 0 && (
              <li className="select-option text-text-muted text-xs">
                No matches.
              </li>
            )}
            {filteredOptions.map((o, i) => (
              <li
                key={o.value}
                id={`opt-${o.value}`}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                className={
                  "select-option" +
                  (i === highlight ? " select-option-highlight" : "") +
                  (o.value === value ? " select-option-selected" : "") +
                  (o.disabled ? " select-option-disabled" : "")
                }
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commit(i)}
              >
                {o.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
