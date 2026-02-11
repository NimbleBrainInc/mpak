interface MpakLogoIconProps {
  size?: number;
  className?: string;
}

/**
 * mpak sealed-box icon: circular certification seal with "m" inside.
 * Used as favicon, header icon, and trust badge.
 */
export function MpakLogoIcon({ size = 28, className }: MpakLogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer seal ring (dashed for stamp feel) */}
      <circle
        cx="32"
        cy="32"
        r="29"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="4 3"
        opacity="0.35"
      />
      {/* Main circle */}
      <circle
        cx="32"
        cy="32"
        r="24"
        fill="currentColor"
        opacity="0.12"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* Inner detail ring */}
      <circle
        cx="32"
        cy="32"
        r="18"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.25"
      />
      {/* m letterform */}
      <text
        x="32"
        y="39"
        textAnchor="middle"
        fontFamily="'Space Grotesk', system-ui, sans-serif"
        fontWeight="700"
        fontSize="24"
        fill="currentColor"
      >
        m
      </text>
    </svg>
  );
}

/**
 * Solid variant for small sizes (favicons, badges).
 * Gold fill with dark "m" for maximum contrast.
 */
export function MpakLogoIconSolid({ size = 28, className }: MpakLogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="32" cy="32" r="28" fill="currentColor" />
      <text
        x="32"
        y="40"
        textAnchor="middle"
        fontFamily="'Space Grotesk', system-ui, sans-serif"
        fontWeight="700"
        fontSize="28"
        fill="#0c0a0f"
      >
        m
      </text>
    </svg>
  );
}

interface MpakWordmarkProps {
  iconSize?: number;
  className?: string;
}

/**
 * Full mpak wordmark: sealed-box icon + "mpak" text.
 * Used in the site header.
 */
export function MpakWordmark({ iconSize = 28, className }: MpakWordmarkProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`}>
      <MpakLogoIcon size={iconSize} className="text-accent-gold-400" />
      <span className="text-[22px] font-bold tracking-tight text-mpak-gray-900">
        mpak
      </span>
    </span>
  );
}
