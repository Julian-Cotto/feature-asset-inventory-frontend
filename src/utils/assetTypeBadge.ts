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
    case "pos_aio":
    case "pos_thin_client":
    case "pos_tablet":
      return "badge badge-info";
    case "card_reader":
      return "badge badge-soft";
    case "printer_office":
    case "printer_receipt":
      return "badge badge-soft";
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
    case "pos_aio":
      return "POS (AIO)";
    case "pos_thin_client":
      return "POS (thin client)";
    case "pos_tablet":
      return "POS tablet";
    case "card_reader":
      return "card reader";
    case "printer_office":
      return "office printer";
    case "printer_receipt":
      return "receipt printer";
    default:
      return type;
  }
}

/** Asset types that are manually onboarded only (no Intune/Meraki sync).
 *  Used to hide vendor-sync buttons on the detail page. */
export const MANUAL_ONLY_ASSET_TYPES = new Set([
  "pos_aio",
  "pos_thin_client",
  "pos_tablet",
  "card_reader",
  "printer_office",
  "printer_receipt",
]);
