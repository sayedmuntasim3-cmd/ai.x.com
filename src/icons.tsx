import type { ReactNode, SVGProps } from "react";
import type { CategoryId } from "./data";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const BulbIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 18h5M10.5 21h3" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1V16h5v-.1c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z" />
  </Icon>
);

export const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Icon>
);

export const WandIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4 20 10.5-10.5M13 8l3 3" />
    <path d="M18 3v3.5M16.25 4.75h3.5M20 11v2.5M18.75 12.25h2.5M9 2.5V5M7.75 3.75h2.5" />
  </Icon>
);

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const MinusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 12h13" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const ArrowUpRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 17 17 7M8.5 7H17v8.5" />
  </Icon>
);

export const SparkleIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M10.5 3.5c.5 4.4 2.6 6.5 7 7-4.4.5-6.5 2.6-7 7-.5-4.4-2.6-6.5-7-7 4.4-.5 6.5-2.6 7-7z" />
    <path d="M18.5 14.5c.2 1.9 1.1 2.8 3 3-1.9.2-2.8 1.1-3 3-.2-1.9-1.1-2.8-3-3 1.9-.2 2.8-1.1 3-3z" />
  </Icon>
);

export const FilmIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
    <path d="M7.5 4v16M16.5 4v16M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4" />
  </Icon>
);

export const MusicIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 17.5V6l10-2v11.5" />
    <circle cx="6.5" cy="17.5" r="2.5" />
    <circle cx="16.5" cy="15.5" r="2.5" />
  </Icon>
);

export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
    <path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8M17.5 14c2.4.8 4 3.2 4 6" />
  </Icon>
);

export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8.5" r="4" />
    <path d="M4.5 20.5c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5" />
  </Icon>
);

export const PlayIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z" />
  </Icon>
);

export const PauseIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
  </Icon>
);

export const UploadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 15.5V4M7 9l5-5 5 5" />
    <path d="M4 15v3a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 18v-3" />
  </Icon>
);

export const CompassIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m15.5 8.5-2 5-5 2 2-5z" />
  </Icon>
);

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19z" />
  </Icon>
);

export const LayersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 3.5 8.5 4.75L12 13 3.5 8.25z" />
    <path d="m3.5 12.5 8.5 4.75 8.5-4.75M3.5 16.5l8.5 4.75 8.5-4.75" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </Icon>
);

export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="9" width="11.5" height="11.5" rx="2.5" />
    <path d="M15 5.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v8.5A1.5 1.5 0 0 0 5 15h.5" />
  </Icon>
);

export const CoinsIcon = (p: IconProps) => (
  <Icon {...p}>
    <ellipse cx="12" cy="6" rx="7" ry="2.75" />
    <path d="M5 6v6c0 1.5 3.1 2.75 7 2.75S19 13.5 19 12V6" />
    <path d="M5 12v6c0 1.5 3.1 2.75 7 2.75S19 19.5 19 18v-6" />
  </Icon>
);

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Icon>
);

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </Icon>
);

export const RecordIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
  </Icon>
);

export const StopIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
  </Icon>
);

export const WaveformIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 10v4M7.5 7v10M11.5 4v16M15.5 8v8M19.5 10.5v3" />
  </Icon>
);

// Category icons

export const LeafIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 19.5c-.5-8.5 4.5-14 15-15 .5 10.5-5.5 15.5-15 15z" />
    <path d="M5 19.5 13.5 11" />
  </Icon>
);

export const WaveIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 9c1.6-1.6 3.2-1.6 4.75 0s3.15 1.6 4.75 0 3.2-1.6 4.75 0 3.15 1.6 4.75 0" />
    <path d="M2.5 15c1.6-1.6 3.2-1.6 4.75 0s3.15 1.6 4.75 0 3.2-1.6 4.75 0 3.15 1.6 4.75 0" />
  </Icon>
);

export const PlanetIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="5.5" />
    <path d="M17.6 9.2c2.6-.9 4.2-.8 4.5 0 .5 1.5-3.6 4.5-9.1 6.5S2.4 18.3 1.9 16.8c-.3-.8.8-2 3-3.2" />
  </Icon>
);

export const ColumnsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 20.5 8h-17z" />
    <path d="M5.5 8v9.5M10 8v9.5M14 8v9.5M18.5 8v9.5M3.5 17.5h17M2.5 21h19" />
  </Icon>
);

export const AtomIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <ellipse cx="12" cy="12" rx="9.5" ry="3.8" />
    <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)" />
  </Icon>
);

export const LanternIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2.5V5M9 5h6" />
    <path d="M7 9c0-2.2 2.2-4 5-4s5 1.8 5 4v5.5c0 2.2-2.2 4-5 4s-5-1.8-5-4z" />
    <path d="M12 18.5v3M7 11.75h10" />
  </Icon>
);

export function CategoryIcon({ id, ...p }: IconProps & { id: CategoryId }) {
  switch (id) {
    case "nature":
      return <LeafIcon {...p} />;
    case "ocean":
      return <WaveIcon {...p} />;
    case "space":
      return <PlanetIcon {...p} />;
    case "history":
      return <ColumnsIcon {...p} />;
    case "science":
      return <AtomIcon {...p} />;
    case "culture":
      return <LanternIcon {...p} />;
  }
}
