import type { Asset } from "../types/inventory";

export interface WarrantyDisplay {
  label: string;
  date: string | null;
  variant: "success" | "danger" | "warning";
}

export function warrantyDisplay(
  a: Pick<Asset, "warranty_active" | "warranty_end_date">,
): WarrantyDisplay {
  if (a.warranty_active === null && !a.warranty_end_date) {
    return { label: "Unknown", date: null, variant: "warning" };
  }
  const date = a.warranty_end_date ? a.warranty_end_date.slice(0, 10) : null;
  if (a.warranty_active) {
    return { label: "On", date, variant: "success" };
  }
  return { label: "Off", date, variant: "danger" };
}
