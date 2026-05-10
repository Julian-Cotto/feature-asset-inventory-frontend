/** Map a status code to a badge variant class. Status now tracks
 *  operational state only (active / in_repair / lost / retired).
 *  Assignment is derived from `assigned_upn`. */
export function statusBadgeClass(code: string): string {
  switch (code) {
    case "active":
      return "badge badge-success";
    case "in_repair":
      return "badge badge-warning";
    case "lost":
      return "badge badge-danger";
    case "retired":
      return "badge";
    default:
      return "badge";
  }
}

/** Short human-readable label for a status code. */
export function statusLabel(code: string): string {
  switch (code) {
    case "in_repair":
      return "In repair";
    default:
      return code.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
}
