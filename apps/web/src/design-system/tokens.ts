/** How a token is shown: the sample element sets this one CSS property to `var(--name)`. */
export type SampleKind =
  | 'colour'
  | 'font'
  | 'size'
  | 'leading'
  | 'tracking'
  | 'length'
  | 'radius'
  | 'shadow'
  | 'layer'
  | 'motion'
  | 'none';

export interface Token {
  name: string;
  /** As declared in tokens.css, e.g. `var(--g-gray-50)` or `0.75rem`. */
  value: string;
}

export interface TokenGroup {
  label: string;
  sample: SampleKind;
  tokens: Token[];
}

/** Display order. A token joins the first group whose pattern matches its name. */
const GROUPS: ReadonlyArray<readonly [string, SampleKind, RegExp]> = [
  [
    'Surfaces, text and lines',
    'colour',
    /^--(bg|surface|border|scrim)|^--text(-(body|muted|subtle))?$/,
  ],
  ['Accent', 'colour', /^--(accent|saffron)/],
  ['Chrome and covers', 'colour', /^--(chrome|cover)/],
  ['People', 'colour', /^--avatar/],
  ['State', 'colour', /^--(success|warning|danger|info)/],
  ['Ceremony', 'colour', /^--(paper|gold)/],
  ['Code', 'colour', /^--code/],
  ['Type families', 'font', /^--font-/],
  ['Type sizes', 'size', /^--text-(xs|sm|md|lg|\d?xl)$/],
  ['Leading', 'leading', /^--leading-/],
  ['Tracking', 'tracking', /^--tracking-/],
  ['Space', 'length', /^--space-/],
  ['Radius', 'radius', /^--radius-/],
  ['Layout sizes', 'length', /^--(width-|sidebar-width|control-height)/],
  ['Layers', 'layer', /^--z-/],
  ['Shadow and focus', 'shadow', /^--(shadow|focus-ring)/],
  ['Motion', 'motion', /^--(ease|dur-)/],
  ['Scale steps', 'colour', /^--g-/],
];

/**
 * Every `--name: value;` in the first `:root` block of tokens.css, in file order. The
 * reduced-motion block re-declares durations inside a media query; it is not the definition.
 */
export function parseTokens(css: string): Token[] {
  const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  const body = root.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => ({
    name: name as string,
    value: (value as string).trim(),
  }));
}

/** Tokens grouped for display; empty groups dropped; unknown names land in "Other". */
export function groupTokens(tokens: readonly Token[]): TokenGroup[] {
  const groups: TokenGroup[] = [
    ...GROUPS.map(([label, sample]) => ({ label, sample, tokens: [] as Token[] })),
    { label: 'Other', sample: 'none', tokens: [] },
  ];
  for (const token of tokens) {
    const at = GROUPS.findIndex(([, , re]) => re.test(token.name));
    (groups[at === -1 ? GROUPS.length : at] as TokenGroup).tokens.push(token);
  }
  return groups.filter((g) => g.tokens.length > 0);
}
