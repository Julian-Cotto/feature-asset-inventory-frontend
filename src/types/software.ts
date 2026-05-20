export type SoftwareSource = "manual" | "intune";

export interface Software {
  id: number;
  name: string;
  link: string | null;
  description: string | null;
  category: string | null;
  vendor: string | null;
  license_cost_cents: number | null;
  seat_count: number | null;
  internal_owner_upn: string | null;
  source: SoftwareSource;
  intune_app_id: string | null;
  intune_app_type: string | null;
  intune_publisher: string | null;
  intune_synced_at: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  assignment_count: number;
}

export interface SoftwareUpsert {
  name?: string;
  link?: string | null;
  description?: string | null;
  category?: string | null;
  vendor?: string | null;
  license_cost_cents?: number | null;
  seat_count?: number | null;
  internal_owner_upn?: string | null;
  notes?: string | null;
}

export interface SoftwareSyncResult {
  fetched: number;
  created: number;
  updated: number;
}

export type AssignmentPrincipalType = "group" | "user";

export interface SoftwareAssignment {
  id: number;
  software_id: number;
  principal_type: AssignmentPrincipalType;
  principal_id: string;
  principal_display: string | null;
  notes: string | null;
  created_at: string;
  created_by_upn: string | null;
}

export interface SoftwareAssignmentCreate {
  principal_type: AssignmentPrincipalType;
  principal_id: string;
  notes?: string | null;
}

export interface SoftwareListQuery {
  q?: string;
  category?: string;
  source?: SoftwareSource;
  include_archived?: boolean;
}
