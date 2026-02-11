export interface TableOptions {
  /** Column indices to right-align (0-based) */
  rightAlign?: number[];
}

/**
 * Render an aligned text table with auto-calculated column widths.
 */
export function table(
  headers: string[],
  rows: string[][],
  opts?: TableOptions,
): string {
  const rightAlign = new Set(opts?.rightAlign ?? []);

  // Calculate column widths from headers and data
  const widths = headers.map((h, i) => {
    const maxData = rows.reduce(
      (max, row) => Math.max(max, (row[i] ?? "").length),
      0,
    );
    return Math.max(h.length, maxData);
  });

  const pad = (text: string, width: number, colIdx: number): string =>
    rightAlign.has(colIdx) ? text.padStart(width) : text.padEnd(width);

  const lines: string[] = [];

  // Header
  lines.push(
    headers.map((h, i) => pad(h, widths[i]!, i)).join("  "),
  );

  // Rows
  for (const row of rows) {
    lines.push(
      headers
        .map((_, i) => pad(row[i] ?? "", widths[i]!, i))
        .join("  "),
    );
  }

  return lines.join("\n");
}

/**
 * Return a short trust label for a certification level.
 */
export function certLabel(level: number | null | undefined): string {
  if (level == null) return "-";
  return `L${level}`;
}

/**
 * Human-readable file size.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Truncate text to a maximum length, appending "..." if truncated.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

/**
 * Print a standardized error message and exit.
 */
export function fmtError(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}
