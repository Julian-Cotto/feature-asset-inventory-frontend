import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  value: string; // YYYY-MM-DD or ""
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parse(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function DatePicker({
  value,
  onChange,
  placeholder = "— select date —",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = parse(value);
  const [view, setView] = useState<Date>(selected ?? new Date());

  useEffect(() => {
    if (selected) setView(selected);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

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
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = fmt(new Date());
  const selectedKey = selected ? fmt(selected) : "";

  type Cell = { date: Date; key: string; outside: boolean };
  const cells: Cell[] = [];
  const prevLast = new Date(year, month, 0).getDate();
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const dt = new Date(year, month - 1, prevLast - i);
    cells.push({ date: dt, key: fmt(dt), outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    cells.push({ date: dt, key: fmt(dt), outside: false });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const dt = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    cells.push({ date: dt, key: fmt(dt), outside: true });
  }

  function display(): string {
    if (!selected) return placeholder;
    return selected.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div ref={wrapperRef} className="datepicker-wrapper">
      <button
        type="button"
        className={"select select-trigger" + (className ? " " + className : "")}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={selected ? "truncate" : "text-text-muted truncate"}>
          {display()}
        </span>
        <Calendar size={14} className="select-chevron" aria-hidden />
      </button>
      {open && (
        <div className="datepicker-popover" role="dialog">
          <div className="datepicker-header">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setView(new Date(year, month - 1, 1))}
              aria-label="Previous month"
            >
              <ChevronLeft size={14} strokeWidth={1.75} />
            </button>
            <span className="datepicker-title">
              {view.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setView(new Date(year, month + 1, 1))}
              aria-label="Next month"
            >
              <ChevronRight size={14} strokeWidth={1.75} />
            </button>
          </div>
          <div className="datepicker-weekdays">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="datepicker-weekday">
                {d}
              </span>
            ))}
          </div>
          <div className="datepicker-grid">
            {cells.map((c) => {
              const isSelected = c.key === selectedKey;
              const isToday = c.key === todayKey;
              const cls =
                "datepicker-cell" +
                (c.outside ? " datepicker-cell-outside" : "") +
                (isToday && !isSelected ? " datepicker-cell-today" : "") +
                (isSelected ? " datepicker-cell-selected" : "");
              return (
                <button
                  key={c.key}
                  type="button"
                  className={cls}
                  onClick={() => {
                    onChange(c.key);
                    setOpen(false);
                  }}
                >
                  {c.date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="datepicker-footer">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                onChange(fmt(new Date()));
                setOpen(false);
              }}
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
