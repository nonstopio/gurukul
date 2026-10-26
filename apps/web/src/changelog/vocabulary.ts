/**
 * Areas, so the filter offers a fixed vocabulary rather than whatever people typed.
 * Adding an area is a change to this file; `satisfies ChangelogEntry` makes an unknown
 * area a type error instead of an entry that silently never matches a filter.
 */
export const AREAS = {
  LEARN: 'Learning',
  PARIKSHA: 'Parikshas & certificates',
  KULAPATI: 'Kulapati console',
  STUDIO: 'Vyasa Studio',
  DESIGN: 'Design system',
  PLATFORM: 'Platform',
} as const;

export type Tone = 'accent' | 'warning' | 'danger' | 'info' | 'neutral';

/**
 * Kinds. Deliberately few: a taxonomy with fifteen options is one nobody applies consistently.
 */
export const KINDS = {
  feature: { label: 'New', tone: 'accent' },
  fix: { label: 'Fix', tone: 'warning' },
  security: { label: 'Security', tone: 'danger' },
  ops: { label: 'Operability', tone: 'info' },
  docs: { label: 'Docs', tone: 'neutral' },
  /** No user-visible change: renames, moves, dependency bumps, tooling. */
  chore: { label: 'Housekeeping', tone: 'neutral' },
} as const satisfies Record<string, { label: string; tone: Tone }>;
