import type { Asset } from "../types/inventory";

/** Display label for an asset's model. Priority:
 *   1. override_model (manual entry, highest)
 *   2. "series · generation" (Lenovo enrichment)
 *   3. raw model
 *   4. "—" if everything blank
 */
export function friendlyModel(a: Pick<Asset, "override_model" | "series" | "generation" | "model">): string {
  if (a.override_model && a.override_model.trim()) return a.override_model.trim();
  const parts = [a.series, a.generation].filter(Boolean) as string[];
  const friendly = parts.join(" · ");
  if (friendly && friendly !== a.model) return friendly;
  return a.model ?? "—";
}
