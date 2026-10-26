/**
 * Role token names, typed, for the rare case a component needs a token in JS
 * (an inline SVG fill, a chart series). CSS should use `var(--name)` directly.
 */
export const roleTokens = [
  'bg',
  'surface',
  'surface-sunken',
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
  'chrome',
  'chrome-raised',
  'chrome-text',
  'chrome-label',
  'chrome-accent',
  'success',
  'warning',
  'danger',
  'info',
  'paper',
  'gold',
  'gold-text',
] as const;

export type RoleToken = (typeof roleTokens)[number];

/** `cssVar('accent')` → `'var(--accent)'`. */
export function cssVar(token: RoleToken): string {
  return `var(--${token})`;
}
