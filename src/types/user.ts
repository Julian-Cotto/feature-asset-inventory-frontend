export type SignInStatus = "ok" | "permission_missing" | "license_unavailable";

export interface IntuneUser {
  id: string;
  user_principal_name: string;
  display_name: string | null;
  mail: string | null;
  job_title: string | null;
  department: string | null;
  office_location: string | null;
  account_enabled: boolean;
  user_type: string | null;
  last_sign_in_at: string | null;
  sign_in_status: SignInStatus;
  manager_id: string | null;
  manager_display_name: string | null;

  // Identity / org
  company_name: string | null;
  employee_id: string | null;
  employee_type: string | null;
  employee_hire_date: string | null;
  employee_org_division: string | null;
  employee_org_cost_center: string | null;

  // Contact
  street_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  mobile_phone: string | null;
  business_phones: string[];
  fax_number: string | null;
  mail_nickname: string | null;
  other_mails: string[];
  proxy_addresses: string[];
  im_addresses: string[];

  synced_at: string;
}

export interface Sponsor {
  id: string;
  display_name: string | null;
  user_principal_name: string | null;
  mail: string | null;
}

export interface DeviceSummary {
  intune_id: string;
  serial_number: string | null;
  device_name: string | null;
  manufacturer: string | null;
  model: string | null;
  operating_system: string | null;
  assigned_upn: string | null;
}

export interface UserDetail {
  user: IntuneUser;
  assigned_devices: DeviceSummary[];
  sponsors: Sponsor[];
  sponsors_status: "ok" | "unavailable";
}

export interface UserSyncResult {
  fetched: number;
  created: number;
  updated: number;
  sign_in_status: SignInStatus;
}

export interface AssignableDevicesResponse {
  staging_upn: string;
  devices: DeviceSummary[];
}

export interface UserSoftwareAssignment {
  assignment_id: number;
  software_id: number;
  name: string;
  category: string | null;
  vendor: string | null;
  source: string;
  archived: boolean;
}
