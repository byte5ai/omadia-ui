import type { ReactElement } from "react";

interface LogoProps {
  size?: number;
  /** the dot anchor key; the agent dot rests here when omadia is idle */
  anchor?: string;
  /** draw the dot statically (wordmark use, onboarding) */
  withDot?: boolean;
  wordmark?: boolean;
}

/**
 * The omadia aperture. The dot is not part of the drawing in the app: it is
 * the agent dot, which leaves the logo whenever omadia works somewhere.
 * An empty aperture therefore always means: omadia is on its way.
 */
export function Logo({
  size = 18,
  anchor,
  withDot = false,
  wordmark = true,
}: LogoProps): ReactElement {
  // Dot centre inside the 150-unit viewBox: (64, 107.4) from (0, 32).
  const dotX = (64 / 150) * size;
  const dotY = ((107.4 - 32) / 150) * size;
  const dotSize = Math.max(3, (23 / 150) * size);
  return (
    <span className="logo">
      <span className="logo-mark" style={{ width: size, height: size }}>
        <svg
          aria-hidden="true"
          width={size}
          height={size}
          viewBox="0 32 150 150"
        >
          <path
            d="M24.14 82.49A47 47 0 1 1 24.14 132.31"
            fill="none"
            stroke="currentColor"
            strokeWidth="16"
            strokeLinecap="round"
          />
          {withDot ? (
            <circle cx="64" cy="107.4" r="11.5" fill="currentColor" />
          ) : null}
        </svg>
        {anchor ? (
          <span
            className="dot-anchor"
            data-dot-anchor={anchor}
            data-dot-size={dotSize}
            style={{ left: dotX, top: dotY }}
          />
        ) : null}
      </span>
      {wordmark ? <span className="logo-word">omadia</span> : null}
    </span>
  );
}

/** The mark that suggestions carry: omadia's sign, not the working dot. */
export function OmadiaMark({ size = 14 }: { size?: number }): ReactElement {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 32 150 150"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M24.14 82.49A47 47 0 1 1 24.14 132.31"
        fill="none"
        stroke="currentColor"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <circle cx="64" cy="107.4" r="11.5" fill="currentColor" />
    </svg>
  );
}
