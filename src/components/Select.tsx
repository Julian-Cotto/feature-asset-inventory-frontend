import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronDown } from "lucide-react";

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
}

export default function Select({
  value,
  onChange,
  options,
  placeholder = "— select —",
  className,
  disabled,
  size = "md",
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  );
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  // Keep highlight aligned with current selection when value changes
  useEffect(() => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) setHighlight(idx);
  }, [value, options]);

  function commit(idx: number) {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  }

  function onKey(e: ReactKeyboardEvent<HTMLButtonElement>) {
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
      setHighlight((h) => Math.min(options.length - 1, h + 1));
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

  return (
    <div ref={wrapperRef} className="select-wrapper">
      <button
        type="button"
        className={
          "select select-trigger" +
          (className ? " " + className : "") +
          (size === "sm" ? " select-trigger-sm" : "")
        }
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKey}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={current ? "truncate" : "text-text-muted truncate"}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown
          size={14}
          className={"select-chevron" + (open ? " select-chevron-open" : "")}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          className="select-popover"
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={
            options[highlight] ? `opt-${options[highlight].value}` : undefined
          }
        >
          {options.map((o, i) => (
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
      )}
    </div>
  );
}
