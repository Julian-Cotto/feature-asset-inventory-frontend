/** Map loose OS strings (Intune / Lenovo / Dell lookups) into the
 *  Windows 10/11/Server/Linux/Mac dropdown values. Returns null if no
 *  confident match — caller can leave the field blank. */
export function normalizeOs(
  os: string | null | undefined,
  osVersion: string | null | undefined,
): string | null {
  if (!os) return null;
  const o = os.trim().toLowerCase();
  const v = (osVersion ?? "").trim();

  if (o.includes("server")) return "Windows Server";
  if (o.includes("windows")) {
    if (v.startsWith("10.0.2") || v.startsWith("11")) return "Windows 11";
    if (v.startsWith("10.")) return "Windows 10";
    return null;
  }
  if (o.includes("mac") || o.includes("osx") || o.includes("os x")) return "Mac";
  if (
    o.includes("linux") ||
    o.includes("ubuntu") ||
    o.includes("debian") ||
    o.includes("rhel")
  ) {
    return "Linux";
  }
  return null;
}
