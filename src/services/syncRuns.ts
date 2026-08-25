import { apiGet, apiPost } from "./apiClient";

export interface SyncRun {
  id: number;
  source: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean;
  duration_ms: number | null;
  summary: Record<string, unknown> | null;
  error: string | null;
  actor_upn: string | null;
  trigger: string | null;
}

export interface SyncSourceHealth {
  source: string;
  last_run: SyncRun | null;
  stale: boolean;
  staleness_threshold_seconds: number;
}

export interface SyncHealth {
  sources: SyncSourceHealth[];
}

export const getSyncHealth = () => apiGet<SyncHealth>("/sync-runs/health");

export const listSyncRuns = (source?: string, limit = 50) => {
  const params = new URLSearchParams();
  if (source) params.set("source", source);
  params.set("limit", String(limit));
  return apiGet<SyncRun[]>(`/sync-runs?${params.toString()}`);
};

export interface TriggerableSources {
  sources: string[];
}

export const listTriggerableSources = () =>
  apiGet<TriggerableSources>("/sync-runs/triggerable");

export interface TriggerResult {
  source: string;
  ok: boolean;
  detail: string;
}

export const triggerSync = (source: string) =>
  apiPost<TriggerResult>(
    `/sync-runs/trigger/${encodeURIComponent(source)}`,
    {},
  );

export interface SyncRunErrorBucket {
  fingerprint: string;
  count: number;
}

export interface SyncRunStats {
  source: string;
  window_days: number;
  total: number;
  succeeded: number;
  failed: number;
  success_rate: number;
  avg_duration_ms: number | null;
  max_duration_ms: number | null;
  error_buckets: SyncRunErrorBucket[];
}

export const getSyncRunStats = (source: string, days = 30) =>
  apiGet<SyncRunStats>(
    `/sync-runs/stats?source=${encodeURIComponent(source)}&days=${days}`,
  );
