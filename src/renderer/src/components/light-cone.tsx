import { type ReactElement, useId } from "react";

/**
 * The light falls from the top right. What stands in it has the attention.
 * The cone takes the user's light temperature; at night it is faint, by day
 * it is nearly white.
 */
export function LightCone({
  height = 0.66,
}: {
  height?: number;
}): ReactElement {
  const id = useId().replace(/:/g, "");
  const bottom = 900 * height;
  return (
    <svg
      className="light-cone"
      aria-hidden="true"
      viewBox="0 0 1440 900"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient
          id={`${id}g`}
          x1="0"
          y1="0"
          x2="0"
          y2={bottom}
          gradientUnits="userSpaceOnUse"
        >
          <stop
            offset="0"
            style={{
              stopColor: "var(--light)",
              stopOpacity: "var(--cone-top)",
            }}
          />
          <stop
            offset="1"
            style={{
              stopColor: "var(--light)",
              stopOpacity: "var(--cone-bottom)",
            }}
          />
        </linearGradient>
        <filter id={`${id}f`} x="-30%" y="-10%" width="160%" height="120%">
          <feGaussianBlur stdDeviation="22" />
        </filter>
      </defs>
      <polygon
        points={`1040,0 1130,0 900,${bottom} 470,${bottom}`}
        fill={`url(#${id}g)`}
        filter={`url(#${id}f)`}
      />
    </svg>
  );
}
