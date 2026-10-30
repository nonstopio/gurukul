// Fails when a screen draws what the design system owns (.claude/skills/gurukul-design/SKILL.md).
//   node scripts/check-design.mjs [repoDir]
// apps/web: no raw <select>, <table>, <h1> or email field in TSX (use Select, DataTable, PageHeader,
// PeoplePicker), and CSS is
// layout only: no colour literal, px font size, shadow, radius, z-index or max-width literal.
// packages/ui: components use role tokens, never a scale step (--g-*) or a colour literal; only
// tokens.css holds values. An exception is listed in ALLOW with its reason.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MARKUP = [
  ['select', /<select\b/, 'raw <select>: use Select from @gurukul/ui'],
  ['table', /<table\b/, 'raw <table>: use DataTable from @gurukul/ui'],
  ['h1', /<h1\b/, 'raw <h1>: the page title comes from PageHeader'],
  ['main', /<main\b/, 'raw <main>: the shell owns <main>; a page is a Page'],
  [
    'tick-box',
    /\btype=["'](?:checkbox|radio)["']/,
    'a raw checkbox or radio: use Toggle (on/off), Checkbox (tick in a list) or Radio (one of many)',
  ],
  [
    'email-box',
    /\btype=["']email["']/,
    'an email field: people are picked with PeoplePicker (PeopleField in the console)',
  ],
];

const COLOUR = [
  ['hex', /#[0-9a-fA-F]{3,8}\b/, 'colour literal: use a role token'],
  ['colour-fn', /\b(?:rgba?|hsla?)\(/, 'colour literal: use a role token'],
];

const APP_CSS = [
  ...COLOUR,
  ['font-size', /font-size:\s*[\d.]+px/, 'px font size: use --text-*'],
  [
    'shadow',
    /box-shadow:(?!\s*(?:none\b|var\())/,
    'shadow literal: use --shadow-* or --focus-ring',
  ],
  ['radius', /border-radius:\s*[\d.]+(?:px|rem)/, 'radius literal: use --radius-*'],
  ['z-index', /z-index:\s*-?\d/, 'z-index literal: use --z-*'],
  ['width', /max-width:\s*[\d.]+(?:px|rem)/, 'width literal: use Page width or a --width-* token'],
];

const UI_CSS = [
  ...COLOUR,
  ['scale', /var\(--g-/, 'scale step: components use role tokens'],
  ['z-index', /z-index:\s*-?\d/, 'z-index literal: use --z-*'],
];

/** path relative to the repo → { rule: reason }. Keep it short; every entry is a debt. */
export const ALLOW = {
  'apps/web/src/Shell.tsx': { main: 'the shells own the one <main>' },
  'apps/web/src/auth/SignInPage.tsx': { main: 'outside the shell: before sign-in' },
  'apps/web/src/auth/RequireSession.tsx': { main: 'outside the shell: the session is loading' },
  'apps/web/src/labels/LabelChoice.tsx': { main: 'outside the shell: before the first page' },
  'apps/web/src/certificates/pages.tsx': { main: 'the public verify page has no shell' },
  'packages/ui/src/tokens.css': {
    hex: 'defines the values',
    'colour-fn': 'defines the values',
    scale: 'defines the roles',
  },
};

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));

function files(dir, ext) {
  try {
    return readdirSync(dir, { recursive: true })
      .filter((f) => f.endsWith(ext))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function scan(root, file, rules, text) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const allowed = ALLOW[rel] ?? {};
  const found = [];
  text.split('\n').forEach((line, i) => {
    for (const [rule, re, message] of rules) {
      if (!allowed[rule] && re.test(line)) found.push({ file: rel, line: i + 1, rule, message });
    }
  });
  return found;
}

export function check(root) {
  const web = path.join(root, 'apps/web/src');
  const ui = path.join(root, 'packages/ui/src');
  return [
    ...files(web, '.tsx').flatMap((f) => scan(root, f, MARKUP, readFileSync(f, 'utf8'))),
    ...files(web, '.css').flatMap((f) =>
      scan(root, f, APP_CSS, stripComments(readFileSync(f, 'utf8'))),
    ),
    ...files(ui, '.css').flatMap((f) =>
      scan(root, f, UI_CSS, stripComments(readFileSync(f, 'utf8'))),
    ),
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const found = check(path.resolve(process.argv[2] ?? '.'));
  for (const f of found) console.error(`${f.file}:${f.line}  ${f.rule}  ${f.message}`);
  if (found.length > 0) {
    console.error(
      `x ${found.length} design-system violations (see .claude/skills/gurukul-design/SKILL.md)`,
    );
    process.exit(1);
  }
}
