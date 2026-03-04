/**
 * Extract the scanner version from a scan report's metadata.
 *
 * Looks for `report.scan.scanner_version` in the JSON report structure
 * produced by mpak-scanner.
 *
 * Returns the version string, or `null` if missing/malformed.
 */
export function extractScannerVersion(
  report: Record<string, unknown> | undefined | null,
): string | null {
  const scanMeta = report?.['scan'] as Record<string, unknown> | undefined;
  return (scanMeta?.['scanner_version'] as string) ?? null;
}
