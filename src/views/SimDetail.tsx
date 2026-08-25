import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Radio,
  Save,
  SignalHigh,
} from "lucide-react";

import { useConfirm } from "../components/ConfirmProvider";
import EntityHistoryList from "../components/EntityHistoryList";
import SimReconcileChip from "../components/SimReconcileChip";
import { useToast } from "../components/ToastProvider";
import { FreshnessCell, SectionHeader } from "../components/visual";
import { listNetworks } from "../services/networks";
import {
  archiveSim,
  assignSim,
  getSim,
  unarchiveSim,
  unassignSim,
  updateSim,
} from "../services/sims";
import type { Network } from "../types/network";
import type { Sim, SimStatus } from "../types/sim";

interface Props {
  simId: number;
  onBack: () => void;
  onNetworkClick?: (id: number) => void;
}

const STATUSES: SimStatus[] = ["active", "spare", "suspended", "deactivated"];

export default function SimDetail({ simId, onBack, onNetworkClick }: Props) {
  const toast = useToast();
  const confirm = useConfirm();

  const [sim, setSim] = useState<Sim | null>(null);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [carrier, setCarrier] = useState("");
  const [phone, setPhone] = useState("");
  const [imsi, setImsi] = useState("");
  const [dataPlan, setDataPlan] = useState("");
  const [status, setStatus] = useState<SimStatus>("spare");
  const [notes, setNotes] = useState("");
  const [networkSel, setNetworkSel] = useState<string>("");

  const hydrate = (s: Sim) => {
    setSim(s);
    setCarrier(s.carrier ?? "");
    setPhone(s.phone_number ?? "");
    setImsi(s.imsi ?? "");
    setDataPlan(s.data_plan ?? "");
    setStatus(s.status);
    setNotes(s.notes ?? "");
    setNetworkSel(s.network_id != null ? String(s.network_id) : "");
  };

  const reload = () =>
    getSim(simId)
      .then(hydrate)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simId]);

  useEffect(() => {
    void listNetworks().then(setNetworks).catch(() => setNetworks([]));
  }, []);

  const saveFields = async () => {
    setSaving(true);
    try {
      const updated = await toast.run(
        () =>
          updateSim(simId, {
            carrier: carrier || null,
            phone_number: phone || null,
            imsi: imsi || null,
            data_plan: dataPlan || null,
            status,
            notes: notes || null,
          }),
        {
          pending: "Saving…",
          success: "SIM updated",
          error: (e) => (e instanceof Error ? e.message : "Save failed"),
        },
      );
      hydrate(updated);
    } catch {
      /* toast surfaced */
    } finally {
      setSaving(false);
    }
  };

  const applyAssignment = async () => {
    const target = networkSel ? Number(networkSel) : null;
    try {
      const updated = await toast.run(
        () => (target === null ? unassignSim(simId) : assignSim(simId, target)),
        {
          pending: target === null ? "Unassigning…" : "Assigning…",
          success: target === null ? "SIM unassigned" : "SIM assigned to network",
          error: (e) => (e instanceof Error ? e.message : "Assignment failed"),
        },
      );
      hydrate(updated);
    } catch {
      /* toast surfaced */
    }
  };

  const toggleArchive = async () => {
    if (!sim) return;
    const archiving = sim.archived_at === null;
    if (archiving) {
      const ok = await confirm({
        title: "Archive this SIM?",
        message: "It will be hidden from the default list. You can unarchive later.",
        tone: "warning",
        confirmLabel: "Archive",
      });
      if (!ok) return;
    }
    try {
      const updated = await toast.run(
        () => (archiving ? archiveSim(simId) : unarchiveSim(simId)),
        {
          pending: archiving ? "Archiving…" : "Unarchiving…",
          success: archiving ? "SIM archived" : "SIM unarchived",
          error: "Failed",
        },
      );
      hydrate(updated);
    } catch {
      /* toast surfaced */
    }
  };

  if (error) {
    return (
      <div className="stack-lg">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  if (!sim) {
    return (
      <div className="stack-lg">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  const assignmentDirty = networkSel !== (sim.network_id != null ? String(sim.network_id) : "");

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> SIM cards
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void toggleArchive()}>
          {sim.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          {sim.archived_at ? "Unarchive" : "Archive"}
        </button>
      </div>

      {/* Hero */}
      <div
        className="card"
        style={{
          padding: "1.5rem",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: "1.5rem",
          alignItems: "center",
        }}
      >
        <span
          className="cluster"
          style={{
            width: 72,
            height: 72,
            borderRadius: 16,
            background: "rgb(from rgb(var(--color-primary)) r g b / 0.16)",
            color: "rgb(var(--color-primary))",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden
        >
          <Radio size={32} strokeWidth={1.75} />
        </span>
        <div className="stack" style={{ gap: "0.375rem", minWidth: 0 }}>
          <h2 className="heading-2 font-mono" style={{ margin: 0 }}>
            {sim.iccid}
          </h2>
          <span className="text-muted text-sm truncate">
            {sim.carrier ?? "Unknown carrier"}
            {sim.phone_number ? ` · ${sim.phone_number}` : ""}
          </span>
          <div className="cluster" style={{ gap: "0.375rem", flexWrap: "wrap" }}>
            <span className="badge">{sim.status}</span>
            <SimReconcileChip state={sim.reconcile_state} />
            {sim.archived_at && <span className="badge badge-danger">Archived</span>}
          </div>
        </div>
        <div className="stack text-sm" style={{ gap: "0.25rem", textAlign: "right" }}>
          <div>
            <span className="text-muted text-xs uppercase tracking-wide">Network</span>{" "}
            <span>{sim.network_name ?? "Unassigned"}</span>
          </div>
          <div>
            <span className="text-muted text-xs uppercase tracking-wide">Location</span>{" "}
            <span>{sim.location_name ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Meraki reconciliation */}
      <section className="section-block">
        <SectionHeader
          icon={<SignalHigh size={18} />}
          title="Meraki cellular status"
          tint="teal"
        />
        <div className="stack" style={{ gap: "0.5rem" }}>
          <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <SimReconcileChip state={sim.reconcile_state} />
            {sim.meraki_checked_at ? (
              <span className="text-xs text-muted">
                last checked <FreshnessCell iso={sim.meraki_checked_at} />
              </span>
            ) : (
              <span className="text-xs text-muted">never reconciled — run Reconcile with Meraki</span>
            )}
          </div>
          {sim.reconcile_state === "mismatched" && (
            <div className="alert alert-error">
              Assigned to <strong>{sim.network_name}</strong> in inventory, but Meraki reports this
              ICCID on network <span className="font-mono">{sim.meraki_network_id}</span>
              {sim.meraki_serial ? ` (firewall ${sim.meraki_serial})` : ""}. Fix the assignment or
              move the SIM.
            </div>
          )}
          {sim.reconcile_state === "assigned_not_live" && (
            <div className="alert alert-warning">
              Assigned to <strong>{sim.network_name}</strong> but not seen in any Meraki firewall.
              Either the SIM isn't installed yet, or the firewall isn't cellular-capable.
            </div>
          )}
          {sim.reconcile_state === "unassigned_but_live" && (
            <div className="alert alert-warning">
              Meraki reports this SIM live on network{" "}
              <span className="font-mono">{sim.meraki_network_id}</span>
              {sim.meraki_serial ? ` (firewall ${sim.meraki_serial})` : ""}, but it's unassigned in
              inventory. Assign it below to match reality.
            </div>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "0.75rem",
            }}
          >
            <div className="stack" style={{ gap: 2 }}>
              <span className="eyebrow">Seen in Meraki</span>
              <span>{sim.meraki_seen ? "Yes" : "No"}</span>
            </div>
            <div className="stack" style={{ gap: 2 }}>
              <span className="eyebrow">Meraki status</span>
              <span>{sim.meraki_status ?? "—"}</span>
            </div>
            <div className="stack" style={{ gap: 2 }}>
              <span className="eyebrow">Meraki network</span>
              <span className="font-mono text-xs">{sim.meraki_network_id ?? "—"}</span>
            </div>
            <div className="stack" style={{ gap: 2 }}>
              <span className="eyebrow">Firewall serial</span>
              <span className="font-mono text-xs">{sim.meraki_serial ?? "—"}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Assignment */}
      <section className="section-block">
        <span className="eyebrow">Assignment (network → firewall → location)</span>
        <div className="cluster" style={{ gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="stack" style={{ gap: 2, minWidth: 280 }}>
            <span className="text-xs text-muted">Network (firewall)</span>
            <select
              className="input input-sm"
              value={networkSel}
              onChange={(e) => setNetworkSel(e.target.value)}
            >
              <option value="">Unassigned</option>
              {networks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.display_name}
                  {n.location_name ? ` · ${n.location_name}` : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void applyAssignment()}
            disabled={!assignmentDirty}
          >
            <Save size={14} /> Apply
          </button>
          {sim.network_id != null && onNetworkClick && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onNetworkClick(sim.network_id!)}
            >
              Open network →
            </button>
          )}
        </div>
        <p className="text-xs text-muted">
          Location resolves through the network:{" "}
          {sim.location_name ? <strong>{sim.location_name}</strong> : "no location set on this network"}.
        </p>
      </section>

      {/* Editable identity */}
      <section className="section-block">
        <span className="eyebrow">Details</span>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "0.75rem",
          }}
        >
          <label className="stack" style={{ gap: 2 }}>
            <span className="text-xs text-muted">Carrier</span>
            <input className="input input-sm" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
          </label>
          <label className="stack" style={{ gap: 2 }}>
            <span className="text-xs text-muted">Phone number</span>
            <input className="input input-sm" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="stack" style={{ gap: 2 }}>
            <span className="text-xs text-muted">IMSI</span>
            <input className="input input-sm" value={imsi} onChange={(e) => setImsi(e.target.value)} />
          </label>
          <label className="stack" style={{ gap: 2 }}>
            <span className="text-xs text-muted">Data plan</span>
            <input className="input input-sm" value={dataPlan} onChange={(e) => setDataPlan(e.target.value)} />
          </label>
          <label className="stack" style={{ gap: 2 }}>
            <span className="text-xs text-muted">Status</span>
            <select className="input input-sm" value={status} onChange={(e) => setStatus(e.target.value as SimStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="stack" style={{ gap: 2, gridColumn: "1 / -1" }}>
            <span className="text-xs text-muted">Notes</span>
            <input className="input input-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <div className="cluster" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveFields()} disabled={saving}>
            <Save size={14} /> {saving ? "Saving…" : "Save details"}
          </button>
        </div>
      </section>

      <EntityHistoryList entityType="sim" entityId={sim.id} title="History" />
    </div>
  );
}
