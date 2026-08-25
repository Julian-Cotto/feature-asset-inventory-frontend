// Shared logistics types — mirror the backend `app/api/logistics.py` schemas.

export interface AssetSummary {
  id: number;
  asset_tag: string | null;
  serial_number: string;
  asset_type: string;
  manufacturer: string | null;
  model: string | null;
  status_code: string;
  location_id: number | null;
  assigned_upn: string | null;
}

// ── Repairs / RMA ──
export type RepairStatus =
  | "open"
  | "sent"
  | "at_vendor"
  | "returned"
  | "closed"
  | "cancelled";

export interface Repair {
  id: number;
  asset_id: number;
  asset: AssetSummary | null;
  loaner_asset: AssetSummary | null;
  status: RepairStatus;
  vendor: string | null;
  rma_number: string | null;
  symptom: string | null;
  is_warranty: boolean;
  cost_cents: number | null;
  opened_at: string;
  expected_return_at: string | null;
  returned_at: string | null;
  closed_at: string | null;
  is_open: boolean;
  is_overdue: boolean;
  notes: string | null;
}

export interface RepairList {
  repairs: Repair[];
  statuses: RepairStatus[];
}

export interface RepairCreatePayload {
  asset_id: number;
  vendor?: string | null;
  rma_number?: string | null;
  symptom?: string | null;
  is_warranty?: boolean;
  loaner_asset_id?: number | null;
  expected_return_at?: string | null;
  set_in_repair?: boolean;
}

// ── Transfers ──
export type TransferStatus = "draft" | "in_transit" | "received" | "cancelled";

export interface TransferItem {
  id: number;
  asset: AssetSummary | null;
}

export interface Transfer {
  id: number;
  reference: string | null;
  from_location_id: number | null;
  from_location_name: string | null;
  to_location_id: number | null;
  to_location_name: string | null;
  status: TransferStatus;
  item_count: number;
  items: TransferItem[];
  notes: string | null;
  shipped_at: string | null;
  received_at: string | null;
  created_at: string;
}

export interface TransferList {
  transfers: Transfer[];
  statuses: TransferStatus[];
}

export interface TransferCreatePayload {
  from_location_id?: number | null;
  to_location_id?: number | null;
  asset_ids: number[];
  reference?: string | null;
  notes?: string | null;
}

// ── Disposal ──
export type DisposalStatus =
  | "scheduled"
  | "picked_up"
  | "completed"
  | "cancelled";
export type DisposalMethod =
  | "recycle"
  | "destroy"
  | "donate"
  | "return_to_vendor"
  | "resale";

export interface Disposal {
  id: number;
  asset_id: number;
  asset: AssetSummary | null;
  method: DisposalMethod;
  status: DisposalStatus;
  vendor: string | null;
  data_wiped: boolean;
  certificate_ref: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface DisposalList {
  disposals: Disposal[];
  statuses: DisposalStatus[];
  methods: DisposalMethod[];
}

export interface DisposalCreatePayload {
  asset_id: number;
  method?: DisposalMethod;
  vendor?: string | null;
  scheduled_at?: string | null;
  data_wiped?: boolean;
  certificate_ref?: string | null;
  notes?: string | null;
}

// ── Loaners ──
export type LoanStatus = "out" | "returned" | "cancelled";

export interface Loan {
  id: number;
  asset_id: number;
  asset: AssetSummary | null;
  borrower_upn: string | null;
  borrower_name: string | null;
  purpose: string | null;
  status: LoanStatus;
  is_overdue: boolean;
  checked_out_at: string;
  due_at: string | null;
  returned_at: string | null;
  notes: string | null;
}

export interface LoanList {
  loans: Loan[];
  statuses: LoanStatus[];
}

export interface LoanCreatePayload {
  asset_id: number;
  borrower_upn?: string | null;
  borrower_name?: string | null;
  purpose?: string | null;
  due_at?: string | null;
  notes?: string | null;
}

// ── Replenishment / reorder ──
export interface ReplenishmentRow {
  rule_id: number;
  location_id: number;
  location_name: string | null;
  asset_type: string;
  model: string | null;
  par_level: number;
  reorder_qty: number;
  on_hand: number;
  on_order: number;
  short: number;
  needs_reorder: boolean;
  suggested_order: number;
}

export interface ReorderRule {
  id: number;
  location_id: number;
  asset_type: string;
  model: string | null;
  par_level: number;
  reorder_qty: number;
  notes: string | null;
}

// ── Dashboard / Wallboard roll-up ──
export interface LogisticsStats {
  repairs: { open: number; overdue: number; at_vendor: number };
  transfers: { draft: number; in_transit: number };
  loans: { out: number; overdue: number };
  disposals: {
    scheduled: number;
    picked_up: number;
    pending: number;
    completed: number;
  };
  sims: {
    total: number;
    matched: number;
    mismatched: number;
    assigned_not_live: number;
    unassigned_but_live: number;
  };
  replenishment: { rules: number; short_items: number; suggested_units: number };
}

export interface ReorderRulePayload {
  location_id: number;
  asset_type: string;
  model?: string | null;
  par_level: number;
  reorder_qty: number;
  notes?: string | null;
}
