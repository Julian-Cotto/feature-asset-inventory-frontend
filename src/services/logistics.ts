import { apiGet, apiPatch, apiPost, apiDelete } from "./apiClient";
import type {
  Disposal,
  DisposalCreatePayload,
  DisposalList,
  LogisticsStats,
  Loan,
  LoanCreatePayload,
  LoanList,
  ReorderRule,
  ReorderRulePayload,
  ReplenishmentRow,
  Repair,
  RepairCreatePayload,
  RepairList,
  Transfer,
  TransferCreatePayload,
  TransferList,
} from "../types/logistics";

// ── Repairs ──
export const listRepairs = (params: { status?: string; open_only?: boolean; q?: string } = {}) => {
  const p = new URLSearchParams();
  if (params.status) p.set("status", params.status);
  if (params.open_only) p.set("open_only", "true");
  if (params.q) p.set("q", params.q);
  const qs = p.toString();
  return apiGet<RepairList>(`/repairs${qs ? `?${qs}` : ""}`);
};
export const createRepair = (payload: RepairCreatePayload) =>
  apiPost<Repair>("/repairs", payload);
export const getRepair = (id: number) => apiGet<Repair>(`/repairs/${id}`);
export const setRepairStatus = (id: number, status: string) =>
  apiPost<Repair>(`/repairs/${id}/status`, { status });
export const updateRepair = (id: number, payload: Partial<RepairCreatePayload> & { cost_cents?: number | null; notes?: string | null }) =>
  apiPatch<Repair>(`/repairs/${id}`, payload);

// ── Transfers ──
export const listTransfers = (status?: string) =>
  apiGet<TransferList>(`/transfers${status ? `?status=${encodeURIComponent(status)}` : ""}`);
export const createTransfer = (payload: TransferCreatePayload) =>
  apiPost<Transfer>("/transfers", payload);
export const getTransfer = (id: number) => apiGet<Transfer>(`/transfers/${id}`);
export const setTransferStatus = (id: number, status: string) =>
  apiPost<Transfer>(`/transfers/${id}/status`, { status });

// ── Disposals ──
export const listDisposals = (status?: string) =>
  apiGet<DisposalList>(`/disposals${status ? `?status=${encodeURIComponent(status)}` : ""}`);
export const getDisposal = (id: number) => apiGet<Disposal>(`/disposals/${id}`);
export const createDisposal = (payload: DisposalCreatePayload) =>
  apiPost<Disposal>("/disposals", payload);
export const setDisposalStatus = (id: number, status: string) =>
  apiPost<Disposal>(`/disposals/${id}/status`, { status });
export const updateDisposal = (id: number, payload: Partial<DisposalCreatePayload>) =>
  apiPatch<Disposal>(`/disposals/${id}`, payload);

// ── Loaners ──
export const listLoans = (params: { status?: string; overdue_only?: boolean } = {}) => {
  const p = new URLSearchParams();
  if (params.status) p.set("status", params.status);
  if (params.overdue_only) p.set("overdue_only", "true");
  const qs = p.toString();
  return apiGet<LoanList>(`/loans${qs ? `?${qs}` : ""}`);
};
export const getLoan = (id: number) => apiGet<Loan>(`/loans/${id}`);
export const createLoan = (payload: LoanCreatePayload) =>
  apiPost<Loan>("/loans", payload);
export const returnLoan = (id: number) => apiPost<Loan>(`/loans/${id}/return`);
export const cancelLoan = (id: number) => apiPost<Loan>(`/loans/${id}/cancel`);

// ── Replenishment / reorder ──
export const getLogisticsStats = () => apiGet<LogisticsStats>("/logistics/stats");

export const getReplenishment = () => apiGet<ReplenishmentRow[]>("/replenishment");
export const listReorderRules = () => apiGet<ReorderRule[]>("/reorder-rules");
export const upsertReorderRule = (payload: ReorderRulePayload) =>
  apiPost<ReorderRule>("/reorder-rules", payload);
export const deleteReorderRule = (id: number) =>
  apiDelete<{ ok: boolean }>(`/reorder-rules/${id}`);
