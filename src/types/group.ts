export type GroupMemberType = "user" | "group" | "device" | "other";

export interface EntraGroup {
  id: string;
  display_name: string;
  description: string | null;
  mail_nickname: string | null;
  mail: string | null;
  security_enabled: boolean;
  mail_enabled: boolean;
  group_types: string[];
  is_managed: boolean;
  member_count_cached: number | null;
  members_synced_at: string | null;
  last_synced_at: string;
  assigned_software_count: number;
}

export interface GroupMember {
  id: string;
  member_type: GroupMemberType;
  display_name: string | null;
  user_principal_name: string | null;
  mail: string | null;
}

export interface AssignedSoftware {
  assignment_id: number;
  software_id: number;
  name: string;
  category: string | null;
  vendor: string | null;
  archived: boolean;
}

export interface GroupDetail {
  group: EntraGroup;
  members: GroupMember[];
  members_truncated: boolean;
  assigned_software: AssignedSoftware[];
}

export interface GroupSyncResult {
  fetched: number;
  created: number;
  updated: number;
}

export interface GroupListQuery {
  q?: string;
  managed_only?: boolean;
}
