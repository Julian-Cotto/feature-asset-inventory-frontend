interface Bar {
  label: string;
  value: number;
  color?: string;
}

interface Props {
  bars: Bar[];
  max?: number;
  /** Width of the label column in CSS units. Default "7rem". */
  labelWidth?: string;
}

export default function Bars({ bars, max, labelWidth = "7rem" }: Props) {
  const peak = max ?? Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="stack" style={{ gap: "0.6rem" }}>
      {bars.map((b, i) => {
        const pct = Math.max(2, Math.round((b.value / peak) * 100));
        const color = b.color ?? "rgb(var(--color-primary))";
        return (
          <div
            key={i}
            className="cluster"
            style={{ gap: "0.625rem", flexWrap: "nowrap" }}
          >
            <span
              className="text-xs text-text-muted truncate"
              style={{ minWidth: labelWidth, flexShrink: 0 }}
              title={b.label}
            >
              {b.label}
            </span>
            <div
              style={{
                flex: 1,
                height: 8,
                background: "rgb(var(--color-bg))",
                borderRadius: 4,
                overflow: "hidden",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: color,
                  borderRadius: 4,
                  transition: "width 0.3s ease-out",
                }}
              />
            </div>
            <span
              className="text-sm font-semibold"
              style={{ minWidth: "3ch", textAlign: "right", flexShrink: 0 }}
            >
              {b.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
