import type { Location } from "../types/inventory";

/** Dropdown label for a location. Includes address_line1 when present so
 *  multi-location cities (same name, different street) stay distinguishable.
 *  Format: "Name — Addr1 (type)" or "Name (type)" when no street known. */
export function locationLabel(l: Location): string {
  const street = (l.address_line1 ?? "").trim();
  if (street) return `${l.name} — ${street} (${l.type})`;
  return `${l.name} (${l.type})`;
}
