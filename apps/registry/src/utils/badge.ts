/**
 * SVG Badge Generator
 *
 * Generates shields.io-style badges for mpak packages.
 * Two states:
 *   - Uncertified: "mpak | v1.2.3" (green)
 *   - Certified:   "mpak | [lock] L1 Basic" (color by level)
 */

const CHAR_WIDTH = 6.5;
const PADDING = 10;
const LOCK_ICON_WIDTH = 14;

function getTextWidth(text: string): number {
  return Math.ceil(text.length * CHAR_WIDTH) + PADDING;
}

const CERT_LEVELS: Record<number, { label: string; color: string }> = {
  1: { label: 'L1 Basic', color: '#007ec6' },
  2: { label: 'L2 Standard', color: '#44cc11' },
  3: { label: 'L3 Verified', color: '#97ca00' },
  4: { label: 'L4 Attested', color: '#dfb317' },
};

// SVG lock icon path (12x12 viewBox, positioned inside the badge)
const LOCK_SVG = `<svg x="__X__" y="4" width="10" height="12" viewBox="0 0 12 12" fill="#fff"><path d="M9 4V3a3 3 0 0 0-6 0v1a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zM6 8.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM7.5 4h-3V3a1.5 1.5 0 1 1 3 0v1z"/></svg>`;

/**
 * Generate an SVG badge for a package.
 *
 * @param version - Package version string (e.g. "1.2.3")
 * @param certLevel - Optional certification level (1-4). If set, shows lock + level.
 */
export function generateBadge(version: string, certLevel?: number | null): string {
  const label = 'mpak';
  const labelWidth = getTextWidth(label);

  if (certLevel && certLevel >= 1 && certLevel <= 4) {
    return generateCertifiedBadge(label, labelWidth, certLevel);
  }

  return generateVersionBadge(label, labelWidth, version);
}

function generateVersionBadge(label: string, labelWidth: number, version: string): string {
  const value = `v${version}`;
  const valueWidth = getTextWidth(value);
  const totalWidth = labelWidth + valueWidth;
  const labelX = labelWidth / 2;
  const valueX = labelWidth + valueWidth / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="#16a34a"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${labelX}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelX}" y="14">${label}</text>
    <text aria-hidden="true" x="${valueX}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${valueX}" y="14">${value}</text>
  </g>
</svg>`;
}

function generateCertifiedBadge(label: string, labelWidth: number, certLevel: number): string {
  const cert = CERT_LEVELS[certLevel]!;
  const certTextWidth = getTextWidth(cert.label);
  const valueWidth = LOCK_ICON_WIDTH + certTextWidth;
  const totalWidth = labelWidth + valueWidth;
  const labelX = labelWidth / 2;
  const lockX = labelWidth + 4;
  const certTextX = labelWidth + LOCK_ICON_WIDTH + certTextWidth / 2;
  const ariaLabel = `${label} certified: ${cert.label}`;

  const lockIcon = LOCK_SVG.replace('__X__', String(lockX));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${ariaLabel}">
  <title>${ariaLabel}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${cert.color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${labelX}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelX}" y="14">${label}</text>
    <text aria-hidden="true" x="${certTextX}" y="15" fill="#010101" fill-opacity=".3">${cert.label}</text>
    <text x="${certTextX}" y="14">${cert.label}</text>
  </g>
  ${lockIcon}
</svg>`;
}
