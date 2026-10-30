/**
 * Role token names, typed, for the rare case a component needs a token in JS
 * (an inline SVG fill, a chart series). CSS should use `var(--name)` directly.
 */
export const roleTokens = [
  'bg',
  'surface',
  'surface-sunken',
  'surface-hover',
  'text',
  'text-body',
  'text-muted',
  'text-subtle',
  'border',
  'border-strong',
  'accent',
  'accent-hover',
  'accent-on',
  'accent-soft',
  'accent-soft-text',
  'accent-decor',
  'accent-line',
  'accent-ring',
  'chrome',
  'chrome-raised',
  'chrome-text',
  'chrome-label',
  'chrome-accent',
  'cover-forest',
  'cover-sand',
  'cover-sky',
  'cover-stone',
  'avatar-learner',
  'avatar-educator',
  'avatar-admin',
  'avatar-on',
  'scrim',
  'success',
  'warning',
  'danger',
  'danger-on',
  'danger-line',
  'info',
  'info-line',
  'paper',
  'gold',
  'gold-text',
] as const;

export type RoleToken = (typeof roleTokens)[number];

/** `cssVar('accent')` → `'var(--accent)'`. */
export function cssVar(token: RoleToken): string {
  return `var(--${token})`;
}
