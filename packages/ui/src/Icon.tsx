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
