/** Inline "claim this serial into Meraki org" panel. Used by OnboardAsset
 *  and AssetDetail for gear (gateway/switch/AP). Idempotent on the backend
 *  side — re-clicking with an already-claimed serial reports
 *  `already_in_org` instead of an error. */

import { useState } from "react";
import { CheckCircle2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";

import { claimMerakiSerial, type MerakiClaimResult } from "../services/inventory";

interface Props {
  serial: string;
  /** Render compact (single row, no card chrome) for embedding in forms. */
  compact?: boolean;
  /** When provided, the backend persists the result on the asset row so
   *  the chip shows on subsequent visits. */
  assetId?: number;
  /** Pre-populates the chip with the most recently saved status, so the
   *  operator sees state before they click Refresh. */
  initialStatus?: MerakiClaimResult["status"] | null;
  /** Called after a successful claim/refresh so the parent can update
   *  its cached Asset object. */
  onResult?: (result: MerakiClaimResult) => void;
}

export default function MerakiClaimPanel({
  serial,
  compact = false,
  assetId,
  initialStatus = null,
  onResult,
}: Props) {
  const [result, setResult] = useState<MerakiClaimResult | null>(() =>
    initialStatus
      ? {
          serial,
          status: initialStatus,
          ok:
            initialStatus === "claimed" || initialStatus === "already_in_org",
          message: "Cached from last check.",
        }
      : null,
  );
  const [busy, setBusy] = useState(false);

  const trimmed = serial.trim();
  const disabled = busy || trimmed.length === 0;

  async function run() {
    if (disabled) return;
    setBusy(true);
    try {
      const r = await claimMerakiSerial(trimmed, assetId);
      setResult(r);
      onResult?.(r);
    } catch (e) {
      const errResult: MerakiClaimResult = {
        serial: trimmed,
        status: "error",
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
      setResult(errResult);
      onResult?.(errResult);
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div
      className="cluster"
      style={{ gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}
    >
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => void run()}
        disabled={disabled}
        title="POST /organizations/{org}/inventory/claim"
      >
        <ShieldCheck size={14} />
        {busy ? "Claiming…" : "Claim in Meraki"}
      </button>
      {result && <ClaimBadge result={result} />}
    </div>
  );

  if (compact) return body;

  return (
    <section
      className="card stack"
      style={{ padding: "1rem 1.25rem", gap: "0.5rem" }}
    >
      <div className="cluster" style={{ gap: "0.5rem", alignItems: "center" }}>
        <ShieldCheck size={16} />
        <span className="font-medium">Meraki org claim</span>
      </div>
      <p className="text-muted text-xs" style={{ margin: 0 }}>
        Adds this serial to the Meraki org inventory. Already-claimed serials
        report as a no-op.
      </p>
      {body}
    </section>
  );
}

function ClaimBadge({ result }: { result: MerakiClaimResult }) {
  const tone = badgeTone(result.status);
  return (
    <span
      className="badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: `rgb(from rgb(var(--color-${tone})) r g b / 0.16)`,
        color: `rgb(var(--color-${tone}))`,
        borderColor: "transparent",
        maxWidth: "32rem",
      }}
      title={result.message}
    >
      {iconFor(result.status)}
      {labelFor(result.status)}
    </span>
  );
}

function badgeTone(s: MerakiClaimResult["status"]): string {
  switch (s) {
    case "claimed":
    case "already_in_org":
      return "success";
    case "claimed_elsewhere":
    case "error":
      return "danger";
    case "invalid":
    case "meraki_disabled":
      return "warning";
  }
}

function iconFor(s: MerakiClaimResult["status"]) {
  switch (s) {
    case "claimed":
      return <CheckCircle2 size={12} />;
    case "already_in_org":
      return <ShieldCheck size={12} />;
    case "claimed_elsewhere":
    case "error":
      return <XCircle size={12} />;
    default:
      return <ShieldAlert size={12} />;
  }
}

function labelFor(s: MerakiClaimResult["status"]): string {
  switch (s) {
    case "claimed":
      return "Claimed just now";
    case "already_in_org":
      return "Already in org";
    case "claimed_elsewhere":
      return "Claimed by another org";
    case "invalid":
      return "Invalid serial";
    case "meraki_disabled":
      return "Meraki not configured";
    case "error":
      return "Error";
  }
}
