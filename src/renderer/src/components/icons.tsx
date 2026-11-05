import type { ReactElement, SVGProps } from "react";

/** Stroke icons on a 16 px grid, 1.5 px. Active means: in the light. */

const PATHS = {
  back: "M10 3L5 8l5 5",
  forward: "M6 3l5 5-5 5",
  refresh: "M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3",
  close: "M4 4l8 8M12 4l-8 8",
  plus: "M8 3v10M3 8h10",
  splitColumns: "M2.5 3.5h11v9h-11zM8 3.5v9",
  splitRows: "M2.5 3.5h11v9h-11zM2.5 8h11",
  bell: "M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3zM6.5 14h3",
  library: "M3 3h3v10H3zM7 3h3v10H7zM11 4l2.5-.5 1.5 9.5-2.5.5z",
  search: "M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM14 14l-3.5-3.5",
  send: "M3 8h10M9 4l4 4-4 4",
  chevronDown: "M4 6l4 4 4-4",
  chevronRight: "M6 4l4 4-4 4",
  check: "M3 8.5l3 3 7-7",
  lock: "M4.5 7.5h7v6h-7zM6 7.5V5.5a2 2 0 0 1 4 0v2",
  server: "M2.5 3h11v4h-11zM2.5 9h11v4h-11zM5 5h.01M5 11h.01",
  sun: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1",
  moon: "M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z",
  more: "M3.5 8h.01M8 8h.01M12.5 8h.01",
  stop: "M4.5 4.5h7v7h-7z",
  desktop: "M2 3h12v8H2zM6 14h4M8 11v3",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 9h6l.5-9",
  edit: "M10 2.5l3.5 3.5-8 8H2v-3.5z",
  sidebar: "M2 3h12v10H2zM6 3v10",
  play: "M5 3l8 5-8 5z",
  pause: "M5 3v10M11 3v10",
  brush: "M10 2l4 4-6 6-4-4zM4 8l-2 6 6-2",
  crop: "M4 1v11h11M1 4h11v11",
  wand: "M3 13l7-7M11 2v2M14 5h-2M12.5 3.5l-1 1",
  logout: "M6 2.5H3v11h3M10 5l3 3-3 3M13 8H6",
  image: "M2.5 3h11v10h-11zM2.5 11l3.5-3.5 3 3 2-2 2.5 2.5M10.5 6h.01",
  bolt: "M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z",
} as const;

export type IconName = keyof typeof PATHS;

export const iconNames = Object.keys(PATHS) as IconName[];

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, ...rest }: IconProps): ReactElement {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Maps protocol icon refs (app:play, lib:foo) onto the built-in set. */
export function iconForRef(ref: unknown): IconName | undefined {
  if (typeof ref !== "string") return undefined;
  const name = ref
    .replace(/^(app|lib):/, "")
    .replace(/[-_.](\w)/g, (_m, c: string) => c.toUpperCase());
  return (name in PATHS ? name : undefined) as IconName | undefined;
}
