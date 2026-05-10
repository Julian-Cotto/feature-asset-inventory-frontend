/** Map asset_type to a colored badge variant. */
export function assetTypeBadgeClass(type: string): string {
  switch (type) {
    case "laptop":
      return "badge badge-soft";
    case "desktop":
      return "badge badge-success";
    case "thin_client":
      return "badge badge-warning";
    case "ap":
      return "badge badge-soft";
    case "switch":
      return "badge badge-warning";
    case "gateway":
      return "badge badge-danger";
    default:
      return "badge";
  }
}

export function assetTypeLabel(type: string): string {
  switch (type) {
    case "thin_client":
      return "thin client";
    case "ap":
      return "AP";
    default:
      return type;
  }
}
