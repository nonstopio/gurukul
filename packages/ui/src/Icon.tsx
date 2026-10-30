import type { ReactNode, SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'ref'> {
  /** Width and height in px. Default: 16. */
  size?: number;
  /** Names the icon for a screen reader. Without it the icon is decorative and hidden from one. */
  label?: string;
}

/**
 * A Lucide-style stroke icon on a 16-unit grid: `currentColor`, 1.5 stroke, round caps and joins.
 * Decorative (`aria-hidden`) unless given a `label`. Any SVG attribute, `strokeWidth` included, can
 * be overridden.
 */
export function Icon({ size = 16, label, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      {...rest}
    >
      {children}
    </svg>
  );
}

function icon(name: string, glyph: ReactNode) {
  const Named = (props: IconProps) => <Icon {...props}>{glyph}</Icon>;
  Named.displayName = name;
  return Named;
}

export const AlertIcon = icon(
  'AlertIcon',
  <>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 4.5v4M8 11v.01" />
  </>,
);
export const BookIcon = icon(
  'BookIcon',
  <path d="M3.2 4h4a1.6 1.6 0 0 1 .8.24A1.6 1.6 0 0 1 8.8 4h4v8h-4a1.6 1.6 0 0 0-.8.24 1.6 1.6 0 0 0-.8-.24h-4z" />,
);
export const CheckIcon = icon('CheckIcon', <path d="M3 8.5l3.5 3.5L13 4.5" />);
export const ChecklistIcon = icon(
  'ChecklistIcon',
  <path d="M2.5 4.5l1.2 1.2 2-2M2.5 10.5l1.2 1.2 2-2M8 5h5.5M8 11h5.5" />,
);
export const ChevronRightIcon = icon('ChevronRightIcon', <path d="M6 3.5L10.5 8 6 12.5" />);
export const CodeIcon = icon('CodeIcon', <path d="M6 4.5L2.5 8L6 11.5M10 4.5L13.5 8L10 11.5" />);
export const CopyIcon = icon(
  'CopyIcon',
  <>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5" />
  </>,
);
export const EmbedIcon = icon('EmbedIcon', <path d="M2.5 3.5h11v9h-11zM2.5 6.5h11" />);
export const FileIcon = icon('FileIcon', <path d="M4 1.5h5l3 3v10H4zM9 1.5v3h3" />);
export const ImageIcon = icon(
  'ImageIcon',
  <path d="M2.5 3.5h11v9h-11zM2.5 11l3.5-3.5 3 3 1.5-1.5 3 3" />,
);
export const InfoIcon = icon(
  'InfoIcon',
  <>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 7v4.5M8 4.5v.01" />
  </>,
);
export const LightbulbIcon = icon(
  'LightbulbIcon',
  <path d="M8 3a3.5 3.5 0 0 0-2 6.4V11h4V9.4A3.5 3.5 0 0 0 8 3zM6.5 13h3" />,
);
export const LockIcon = icon(
  'LockIcon',
  <>
    <rect x="3" y="7" width="10" height="6.5" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </>,
);
export const PlayIcon = icon('PlayIcon', <path d="M6 4.5v7l5.5-3.5z" />);
export const SearchIcon = icon(
  'SearchIcon',
  <>
    <circle cx="7.33" cy="7.33" r="4.67" />
    <path d="M13.33 13.33l-2.66-2.66" />
  </>,
);
export const StarIcon = icon(
  'StarIcon',
  <path d="M8 2.4l1.6 3.6 4 .4-2.96 2.72.8 4L8 11.2l-3.44 1.92.8-4L2.4 6.4l4-.4z" />,
);
export const TextIcon = icon('TextIcon', <path d="M3 4h10M3 8h10M3 12h6" />);
export const TrashIcon = icon(
  'TrashIcon',
  <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.6 8.5h6.8l.6-8.5" />,
);
export const XIcon = icon('XIcon', <path d="M4 4l8 8M12 4l-8 8" />);

// Shell, menu and profile icons.
export const AwardIcon = icon(
  'AwardIcon',
  <>
    <circle cx="8" cy="6" r="4" />
    <path d="M5.6 9.2L4.5 14.5 8 12.5l3.5 2-1.1-5.3" />
  </>,
);
export const ChartIcon = icon('ChartIcon', <path d="M2.5 13.5h11M4.5 11V7.5M8 11V3.5M11.5 11V6" />);
export const ChevronDownIcon = icon('ChevronDownIcon', <path d="M3.5 6L8 10.5 12.5 6" />);
export const ChevronLeftIcon = icon('ChevronLeftIcon', <path d="M10 3.5L5.5 8l4.5 4.5" />);
export const ClockIcon = icon(
  'ClockIcon',
  <>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 4.5V8l2.5 1.5" />
  </>,
);
export const GridIcon = icon(
  'GridIcon',
  <path d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z" />,
);
export const HomeIcon = icon(
  'HomeIcon',
  <path d="M2.5 7.5L8 3l5.5 4.5V13.5h-3.5V10h-4v3.5H2.5z" />,
);
export const LanguagesIcon = icon(
  'LanguagesIcon',
  <path d="M2 4h7M5.5 2.5V4M4 4c.5 2.5 2 4.5 4.5 5.5M7.5 4C7 6.5 5 8.5 2.5 9.5M8.5 14l2.5-6 2.5 6M9.3 12h3.4" />,
);
export const LogOutIcon = icon('LogOutIcon', <path d="M6 13.5H3.5v-11H6M10 11l3-3-3-3M13 8H6" />);
export const MenuIcon = icon('MenuIcon', <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />);
export const MoreIcon = icon(
  'MoreIcon',
  <path d="M3.5 8h.01M8 8h.01M12.5 8h.01" strokeWidth="2.5" />,
);
export const PenIcon = icon('PenIcon', <path d="M10.5 2.5l3 3L6 13H3v-3zM9 4l3 3" />);
export const SendIcon = icon('SendIcon', <path d="M14 2L7 9M14 2l-4.5 12L7 9 2 6.5z" />);
export const SettingsIcon = icon(
  'SettingsIcon',
  <>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
  </>,
);
export const ShieldIcon = icon(
  'ShieldIcon',
  <path d="M8 1.5l5 2v4c0 3.2-2.1 5.6-5 7-2.9-1.4-5-3.8-5-7v-4z" />,
);
export const SparkIcon = icon(
  'SparkIcon',
  <path d="M8 1.5v4M8 10.5v4M1.5 8h4M10.5 8h4M3.5 3.5l2 2M10.5 10.5l2 2M3.5 12.5l2-2M10.5 5.5l2-2" />,
);
export const UserIcon = icon(
  'UserIcon',
  <>
    <circle cx="8" cy="5.5" r="3" />
    <path d="M2.5 14c.6-2.8 2.8-4.5 5.5-4.5s4.9 1.7 5.5 4.5" />
  </>,
);
export const UsersIcon = icon(
  'UsersIcon',
  <>
    <circle cx="6" cy="5.5" r="2.5" />
    <path d="M1.5 13.5c.4-2.4 2.2-4 4.5-4s4.1 1.6 4.5 4M10.5 3.2a2.5 2.5 0 0 1 0 4.6M12 9.8c1.4.5 2.3 1.8 2.5 3.7" />
  </>,
);
