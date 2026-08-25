import {
  SIM_RECONCILE_LABEL,
  SIM_RECONCILE_TONE,
  type SimReconcileState,
} from "../types/sim";

const TONE_VARS: Record<
  "success" | "warning" | "danger" | "muted",
  { color: string; soft: boolean }
> = {
  success: { color: "var(--color-success)", soft: false },
  warning: { color: "var(--color-warning)", soft: false },
  danger: { color: "var(--color-danger)", soft: false },
  muted: { color: "var(--color-text-muted)", soft: true },
};

/** Small pill summarising a SIM's Meraki reconcile state. Shared by the
 *  Sims list, SimDetail, and the NetworkDetail "SIMs on this network" panel
 *  so the vocabulary stays identical everywhere. */
export default function SimReconcileChip({
  state,
  title,
}: {
  state: SimReconcileState;
  title?: string;
}) {
  const tone = TONE_VARS[SIM_RECONCILE_TONE[state]];
  return (
    <span
      className="badge"
      title={title}
      style={{
        background: `rgb(from rgb(${tone.color}) r g b / 0.16)`,
        color: `rgb(${tone.color})`,
        borderColor: "transparent",
        whiteSpace: "nowrap",
      }}
    >
      {SIM_RECONCILE_LABEL[state]}
    </span>
  );
}
