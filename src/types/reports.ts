export interface LabelCount {
  label: string;
  count: number;
}

export interface FleetSlice {
  os: LabelCount[];
  win10_count: number;
  win11_count: number;
  manufacturer: LabelCount[];
  top_models: LabelCount[];
  asset_type: LabelCount[];
  compliance: LabelCount[];
  age_buckets: LabelCount[];
}

export interface FleetReport extends FleetSlice {
  network: FleetSlice;
}

export interface WarrantyCalendarPoint {
  month: string;
  count: number;
}

export interface WarrantyReport {
  calendar_12m: WarrantyCalendarPoint[];
  out_by_location: { location: string; count: number }[];
  replacement_candidates: {
    asset_id: number;
    serial_number: string;
    model: string | null;
    manufacturer: string | null;
    assigned_upn: string | null;
    onboarded_at: string | null;
    warranty_end_date: string | null;
  }[];
}

export interface StockReport {
  stock_by_model: {
    asset_type: string;
    manufacturer: string | null;
    model: string | null;
    count: number;
  }[];
  stale_stock: {
    asset_id: number;
    serial_number: string;
    asset_type: string;
    manufacturer: string | null;
    model: string | null;
    days_at_warehouse: number | null;
    onboarded_at: string | null;
  }[];
  deployment_pipeline: {
    counts: Record<string, number>;
    samples: Record<string, { id: number; name: string }[]>;
  };
  deployment_avg_cycle_days: number | null;
}

export interface ShipmentsReport {
  funnel: LabelCount[];
  carrier_counts: LabelCount[];
  direction: LabelCount[];
  late: {
    shipment_id: number;
    tracking_number: string;
    carrier: string;
    carrier_status: string;
    direction: string;
    created_at: string | null;
    days_open: number | null;
  }[];
  carrier_avg_days: { carrier: string; avg_days: number | null; count: number }[];
}

export interface IntuneReport {
  stale_check_ins: {
    asset_id: number;
    serial_number: string;
    intune_device_name: string | null;
    assigned_upn: string | null;
    last_check_in: string | null;
    days_since: number | null;
  }[];
  stale_count_7d: number;
  stale_count_30d: number;
  managed_by: LabelCount[];
  recency_buckets: LabelCount[];
}

export interface ActivityReport {
  monthly_180d: {
    month: string;
    assign: number;
    unassign: number;
    lost: number;
    retired: number;
    in_repair: number;
  }[];
  recent: {
    id: number;
    asset_id: number;
    asset_label: string;
    event_type: string;
    from_value: string | null;
    to_value: string | null;
    performed_at: string | null;
    performed_by_upn: string | null;
    notes: string | null;
  }[];
}

export interface SecurityReport {
  counts: {
    total_computers: number;
    defender_onboarded: number;
    defender_unhealthy: number;
    defender_missing: number;
  };
  health_status: LabelCount[];
  exposure_level: LabelCount[];
  risk_score: LabelCount[];
  onboarding_status: LabelCount[];
  av_status: LabelCount[];
  risk_matrix: { exposure: string; health: string; count: number }[];
  top_at_risk: {
    asset_id: number;
    serial_number: string;
    device_name: string | null;
    manufacturer: string | null;
    model: string | null;
    health_status: string | null;
    risk_score: string | null;
    exposure_level: string | null;
    last_seen_at: string | null;
    assigned_upn: string | null;
  }[];
  missing_defender: {
    asset_id: number;
    serial_number: string;
    device_name: string | null;
    intune_synced_at: string | null;
  }[];
}

export interface SoftwareReport {
  totals: {
    total_software: number;
    archived: number;
    total_spend_cents: number;
    total_seats: number;
  };
  by_source: LabelCount[];
  by_category: LabelCount[];
  spend_by_category: {
    category: string;
    total_cents: number;
    software_count: number;
  }[];
  assignment_coverage: { bucket: string; count: number }[];
  unassigned_software: {
    software_id: number;
    name: string;
    source: string;
    vendor: string | null;
    category: string | null;
    license_cost_cents: number | null;
  }[];
  top_groups: {
    group_id: string;
    display_name: string;
    software_count: number;
  }[];
  top_software: {
    software_id: number;
    name: string;
    vendor: string | null;
    category: string | null;
    assignment_count: number;
  }[];
}

export interface PeopleReport {
  totals: {
    total_users: number;
    users_with_device: number;
    users_without_device: number;
    total_assigned_devices: number;
  };
  devices_by_department: LabelCount[];
  devices_by_office: LabelCount[];
  users_without_devices_sample: {
    user_id: string;
    upn: string;
    display_name: string | null;
    department: string | null;
    office: string | null;
    job_title: string | null;
  }[];
  top_managers: {
    manager_id: string;
    manager_name: string;
    direct_reports_with_devices: number;
    devices_total: number;
  }[];
  top_users_by_devices: {
    upn: string;
    display_name: string | null;
    department: string | null;
    device_count: number;
  }[];
}
