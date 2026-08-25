export type SimStatus = "active" | "spare" | "suspended" | "deactivated";

// Derived cross-check between the on-paper assignment and what Meraki
// actually reports on its cellular firewalls (see backend Sim.reconcile_state).
export type SimReconcileState =
  | "matched"
  | "mismatched"
  | "assigned_not_live"
  | "unassigned_but_live"
  | "unassigned";

export interface Sim {
  id: number;
  iccid: string;
  carrier: string | null;
  phone_number: string | null;
  imsi: string | null;
  data_plan: string | null;
  status: SimStatus;
  network_id: number | null;
  network_name: string | null;
  location_id: number | null;
  location_name: string | null;
  notes: string | null;
  meraki_seen: boolean;
  meraki_network_id: string | null;
  meraki_serial: string | null;
  meraki_status: string | null;
  meraki_checked_at: string | null;
  reconcile_state: SimReconcileState;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SimListResult {
  sims: Sim[];
  status_counts: Record<string, number>;
  statuses: SimStatus[];
  carriers: string[];
}

export interface SimCreatePayload {
  iccid: string;
  carrier?: string | null;
  phone_number?: string | null;
  imsi?: string | null;
  data_plan?: string | null;
  status?: SimStatus;
  network_id?: number | null;
  notes?: string | null;
}

export interface SimUpdatePayload {
  iccid?: string;
  carrier?: string | null;
  phone_number?: string | null;
  imsi?: string | null;
  data_plan?: string | null;
  status?: SimStatus;
  notes?: string | null;
}

export interface SimSyncResult {
  meraki_reported: number;
  inventory_sims: number;
  matched: number;
  mismatched: number;
  assigned_not_live: number;
  created: number;
  unknown_in_meraki: number;
  unknown: {
    iccid: string;
    network_id: string | null;
    network_name?: string | null;
    serial: string | null;
    status?: string | null;
    provider?: string | null;
  }[];
}

// Compact row for the "SIMs on this network" panel (NetworkDetail).
export interface NetworkSim {
  id: number;
  iccid: string;
  carrier: string | null;
  phone_number: string | null;
  status: SimStatus;
  meraki_seen: boolean;
  meraki_status: string | null;
  reconcile_state: SimReconcileState;
}

export const SIM_RECONCILE_LABEL: Record<SimReconcileState, string> = {
  matched: "Matched",
  mismatched: "Mismatched",
  assigned_not_live: "Not live",
  unassigned_but_live: "Live · unassigned",
  unassigned: "Unassigned",
};

// Tone maps to the shared accent-pill / chip vocabulary used elsewhere.
export const SIM_RECONCILE_TONE: Record<
  SimReconcileState,
  "success" | "warning" | "danger" | "muted"
> = {
  matched: "success",
  mismatched: "danger",
  assigned_not_live: "warning",
  unassigned_but_live: "warning",
  unassigned: "muted",
};
