interface Slice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}

export default function Donut({
  slices,
  size = 140,
  thickness = 18,
  centerLabel,
  centerSub,
}: Props) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;

  let cumulative = 0;
  const segments = slices
    .filter((s) => s.value > 0)
    .map((s, i) => {
      const segLen = (s.value / total) * circumference;
      const offset = circumference - cumulative;
      cumulative += segLen;
      return {
        key: s.label + i,
        color: s.color,
        dashArray: `${segLen} ${circumference - segLen}`,
        offset,
      };
    });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
    >
      {/* track */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="rgb(var(--color-border))"
        strokeOpacity={0.4}
        strokeWidth={thickness}
      />
      {segments.map((seg) => (
        <circle
          key={seg.key}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={seg.color}
          strokeWidth={thickness}
          strokeDasharray={seg.dashArray}
          strokeDashoffset={seg.offset}
          strokeLinecap="butt"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ))}
      {centerLabel && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgb(var(--color-text))"
          fontSize={size * 0.18}
          fontWeight={700}
        >
          {centerLabel}
        </text>
      )}
      {centerSub && (
        <text
          x={cx}
          y={cy + size * 0.14}
          textAnchor="middle"
          fill="rgb(var(--color-text-muted))"
          fontSize={size * 0.08}
        >
          {centerSub}
        </text>
      )}
    </svg>
  );
}
