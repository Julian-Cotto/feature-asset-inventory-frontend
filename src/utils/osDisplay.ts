/** Format OS + version for display.
 *
 *  Windows 10 and 11 both report os_version starting with "10.0". Windows 11
 *  builds start at 10.0.22000 — anything below is Win 10. Translate the
 *  internal build number into the user-visible major version.
 *
 *  Other OSes pass through unchanged.
 */
export function osDisplay(
  os: string | null | undefined,
  osVersion: string | null | undefined,
): string {
  const o = (os ?? "").trim();
  const v = (osVersion ?? "").trim();

  if (/^windows/i.test(o) && v.startsWith("10.0")) {
    const parts = v.split(".");
    const build = parts.length >= 3 ? parseInt(parts[2], 10) : NaN;
    if (!Number.isNaN(build)) {
      return `${o} ${build >= 22000 ? "11" : "10"}`;
    }
    return `${o} 10`;
  }

  return `${o}${v ? ` ${v}` : ""}`.trim();
}
