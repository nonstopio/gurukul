import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import tokensCss from '@gurukul/ui/tokens.css?raw';
import {
  Button,
  Callout,
  Card,
  DataTable,
  EmptyState,
  FilterBar,
  Input,
  LockIcon,
  Page,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
  Toggle,
  UsersIcon,
} from '@gurukul/ui';
import type { TabItem } from '@gurukul/ui';
import { EXAMPLES } from './examples';
import { groupTokens, parseTokens } from './tokens';
import type { SampleKind, Token } from './tokens';
import './design-system.css';

const TOKENS = parseTokens(tokensCss);
const BY_GROUP = Object.fromEntries(groupTokens(TOKENS).map((g) => [g.label, g.tokens]));

const SECTIONS = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'type', label: 'Type' },
  { id: 'components', label: 'Components' },
  { id: 'patterns', label: 'Patterns' },
] as const;
type Section = (typeof SECTIONS)[number]['id'];

/** The element that shows a token: it sets one property to `var(--name)`, so it is the real value. */
const SAMPLES: Record<SampleKind, (v: string, name: string) => ReactNode> = {
  colour: (v) => <span className="ds-swatch" style={{ background: v }} />,
  font: (v) => <span style={{ fontFamily: v }}>Aa</span>,
  size: (v) => <span style={{ fontSize: v }}>Aa</span>,
  leading: (v) => (
    <span className="ds-leading" style={{ lineHeight: v }}>
      Two lines of text to show the leading
    </span>
  ),
  tracking: (v) => <span style={{ letterSpacing: v }}>MICRO LABEL</span>,
  length: (v) => <span className="ds-bar" style={{ width: `min(${v}, 100%)` }} />,
  radius: (v) => <span className="ds-shape" style={{ borderRadius: v }} />,
  shadow: (v) => <span className="ds-shape" style={{ boxShadow: v }} />,
  layer: (v) => <span className="ds-shape" style={{ position: 'relative', zIndex: v }} />,
  motion: (v, name) => {
    const style: CSSProperties = name.startsWith('--ease')
      ? { transitionTimingFunction: v }
      : { transitionDuration: v };
    return <span className="ds-motion" style={style} />;
  },
  none: () => null,
};

/** One row per token: the live sample, its name and its declared value. */
export function TokenList({ tokens, sample }: { tokens: Token[]; sample: SampleKind }) {
  return (
    <ul className="ds-list ds-tokens">
      {tokens.map((t) => (
        <li key={t.name} className="ds-token">
          <span className="ds-token__sample" aria-hidden="true">
            {SAMPLES[sample](`var(${t.name})`, t.name)}
          </span>
          <code>{t.name}</code>
          <code className="ds-token__value">{t.value}</code>
        </li>
      ))}
    </ul>
  );
}

function Tokens() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => TOKENS.filter((t) => `${t.name} ${t.value}`.toLowerCase().includes(q)),
    [q],
  );
  const groups = groupTokens(shown);
  return (
    <div className="ds-section">
      <Callout tone="note" title="Roles, not scale steps">
        Components use role tokens (<code>--accent</code>, <code>--text-muted</code>). Scale steps (
        <code>--g-*</code>) only define the roles, inside tokens.css;{' '}
        <code>npm run check:design</code> fails a component that uses one. A new colour need is a
        new role.
      </Callout>
      <FilterBar
        label="Filter tokens"
        count={`${shown.length} of ${TOKENS.length}`}
        canClear={query !== ''}
        onClear={() => setQuery('')}
      >
        <Input
          label="Filter tokens by name or value"
          hideLabel
          type="search"
          placeholder="Filter by name or value"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </FilterBar>
      {groups.length === 0 ? (
        <EmptyState
          title="No token matches"
          action={
            <Button variant="secondary" onClick={() => setQuery('')}>
              Show every token
            </Button>
          }
        >
          Nothing in tokens.css has that name or value.
        </EmptyState>
      ) : (
        groups.map((g) => (
          <Card key={g.label} title={g.label}>
            <TokenList tokens={g.tokens} sample={g.sample} />
          </Card>
        ))
      )}
    </div>
  );
}

const FAMILIES = [
  ['--font-display', 'Display · Fraunces', 'Page, course and section titles; moments that matter'],
  ['--font-ui', 'UI · Inter', 'Everything you read and click'],
  ['--font-mono', 'Mono · JetBrains Mono', 'Code and terminal output'],
] as const;
const WEIGHTS = [400, 500, 600, 700] as const;
const PANGRAM = 'Resolving merge conflicts, one chapter at a time';

function Type() {
  return (
    <div className="ds-section">
      <Card title="Families">
        <ul className="ds-list ds-rows">
          {FAMILIES.map(([name, label, use]) => (
            <li key={name}>
              <p className="ds-specimen" style={{ fontFamily: `var(${name})` }}>
                {PANGRAM}
              </p>
              <p>
                {label} · <code>{name}</code> · {use}
              </p>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Sizes">
        <ul className="ds-list ds-rows">
          {(BY_GROUP['Type sizes'] as Token[]).map((t) => (
            <li key={t.name}>
              <p className="ds-specimen" style={{ fontSize: `var(${t.name})` }}>
                {PANGRAM}
              </p>
              <p>
                <code>{t.name}</code> · {t.value}
              </p>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Line heights">
        <TokenList tokens={BY_GROUP.Leading as Token[]} sample="leading" />
      </Card>
      <Card title="Weights">
        <p>Weights 400, 500, 600 and 700 only. Fraunces is set at 500.</p>
        <ul className="ds-list ds-rows">
          {WEIGHTS.map((w) => (
            <li key={w}>
              <p className="ds-specimen" style={{ fontWeight: w }}>
                {w} · {PANGRAM}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Components() {
  return (
    <div className="ds-section">
      {Object.entries(EXAMPLES).map(([name, { rule, Example }]) => (
        <Card key={name} title={name}>
          <p>{rule}</p>
          <div className="ds-examples">
            <Example />
          </div>
        </Card>
      ))}
    </div>
  );
}

const SHELLS = [
  {
    layout: 'AppShell',
    routes: 'Home, catalogue, course, certificates, profile, console, Studio lists, changelog',
    chrome: 'Ink sidebar: brand, nav groups, the UserCard at the foot. Search in a sticky top bar.',
  },
  {
    layout: 'FocusedShell',
    routes: 'Lesson, Quiz, result, Studio course editor, lesson editor, Quiz builder, preview',
    chrome: 'Sticky ink top bar: back link, title, status, actions. No sidebar.',
  },
];
const STATES = [
  { state: 'Loading', pattern: 'Skeletons in the final layout’s shape; PageSkeleton for a page' },
  { state: 'Empty', pattern: 'EmptyState: what empty means and one action' },
  { state: 'Error', pattern: 'Loaded: a warning Callout with Retry inside the region' },
  { state: 'Not allowed', pattern: 'NotAllowedPage inside the shell, with a link home' },
];

function Patterns() {
  return (
    <div className="ds-section">
      <Card title="Page anatomy">
        <ol>
          <li>Page, its width reading, default or wide.</li>
          <li>PageHeader: eyebrow, the only h1, lead, at most one primary action.</li>
          <li>At most one page-level Callout, then an optional StatCard row.</li>
          <li>FilterBar, directly above what it filters.</li>
          <li>Content in Cards with titles.</li>
        </ol>
        <div className="ds-frame ds-frame--wide">
          <Page width="reading">
            <PageHeader
              titleAs="h2"
              eyebrow="Area"
              title="Example page"
              lead="One sentence on what the page is for."
              actions={<Button>Invite people</Button>}
            />
            <FilterBar label="Filter the example" count="2 of 2">
              <Input label="Search the example" hideLabel type="search" placeholder="Search" />
              <Select label="Example status" hideLabel defaultValue="">
                <option value="">Any status</option>
              </Select>
            </FilterBar>
            <Card title="Example section">Content sits in titled Cards, spaced by the Page.</Card>
          </Page>
        </div>
      </Card>
      <Card title="Shell">
        <DataTable
          caption="The two layouts, chosen per route in routes.tsx"
          rows={SHELLS}
          rowKey={(s) => s.layout}
          columns={[
            { id: 'layout', header: 'Layout', cell: (s) => s.layout, rowHeader: true },
            { id: 'routes', header: 'Routes', cell: (s) => s.routes },
            { id: 'chrome', header: 'Chrome', cell: (s) => s.chrome },
          ]}
        />
        <ul>
          <li>The chrome never scrolls away: the sidebar and the top bars are sticky.</li>
          <li>Below 64rem the sidebar is a drawer opened from the Menu button.</li>
          <li>The document scrolls, never a full-height wrapper.</li>
          <li>Sign out is in the UserCard menu, never more than two clicks away.</li>
        </ul>
      </Card>
      <Card title="States">
        <DataTable
          caption="Every region that loads data designs each of these"
          rows={STATES}
          rowKey={(s) => s.state}
          columns={[
            { id: 'state', header: 'State', cell: (s) => s.state, rowHeader: true },
            { id: 'pattern', header: 'Pattern', cell: (s) => s.pattern },
          ]}
        />
        <div className="ds-grid">
          <Card title="Loading" titleAs="h3">
            <div role="status" aria-busy="true" className="ds-stack">
              <span className="sr-only">Loading</span>
              <Skeleton width="40%" />
              <Skeleton shape="block" height="4rem" />
            </div>
          </Card>
          <Card title="Empty" titleAs="h3">
            <EmptyState icon={<UsersIcon />} title="No learners yet" headingAs="h4">
              Assign a course to see people here.
            </EmptyState>
          </Card>
          <Card title="Error" titleAs="h3">
            <Callout tone="warning" title="This did not load">
              <p>Check your connection and try again.</p>
              <Button variant="secondary">Retry</Button>
            </Callout>
          </Card>
          <Card title="Not allowed" titleAs="h3">
            <EmptyState icon={<LockIcon />} title="Not for this role" headingAs="h4">
              The page says so inside the shell and links home.
            </EmptyState>
          </Card>
        </div>
      </Card>
      <Card title="Motion">
        <ul>
          <li>
            A route change fades and rises 8px over the page duration; focus goes to the title.
          </li>
          <li>
            Menus and lists rise 6px over the base duration; dialogs and drawers take the slow one.
          </li>
          <li>Lists stagger by 30ms a row, the first eight only: set --i on each row.</li>
          <li>Only opacity and transform move; reduced motion sets every duration to 0.</li>
        </ul>
        <ul className="g-stagger ds-stack" aria-label="Staggered list example">
          {['First row', 'Second row', 'Third row'].map((row, i) => (
            <li key={row} style={{ '--i': i } as CSSProperties}>
              {row}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Forms">
        <ul>
          <li>One column, label above the control, help under it, error under that.</li>
          <li>Every control has a visible label, except inside a FilterBar.</li>
          <li>The footer: secondary left of primary, the primary a verb plus an object.</li>
          <li>Saving is a button, and the button shows loading while it waits.</li>
        </ul>
        <div className="ds-form">
          <Input label="Course title" hint="Shown on the course card" defaultValue="Git basics" />
          <Select label="Course team" defaultValue="web">
            <option value="web">Web</option>
            <option value="mobile">Mobile</option>
          </Select>
          <Toggle label="Mandatory course" defaultChecked />
          <div className="ds-footer">
            <Button variant="secondary">Discard changes</Button>
            <Button>Save course</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

const VIEWS: Record<Section, () => ReactNode> = {
  tokens: Tokens,
  type: Type,
  components: Components,
  patterns: Patterns,
};

/**
 * Org settings → Design system: the real tokens (read from tokens.css), the type scale, every
 * `@gurukul/ui` component live with its rule, and the page patterns. The section is in the URL.
 */
export function DesignSystem() {
  const [params, setParams] = useSearchParams();
  const section = SECTIONS.find((s) => s.id === params.get('section'))?.id ?? 'tokens';
  const View = VIEWS[section];
  return (
    <div className="ds-section">
      <p>
        The live components and the real tokens. The rules behind them are in the gurukul-design
        skill; when a component changes, this tab changes with it.
      </p>
      <Tabs
        label="Design system sections"
        value={section}
        onValueChange={(id) =>
          setParams((prev) => {
            prev.set('section', id);
            return prev;
          })
        }
        tabs={
          SECTIONS.map((s) => ({
            id: s.id,
            label: s.label,
            panel: s.id === section ? <View /> : null,
          })) as [TabItem, ...TabItem[]]
        }
      />
    </div>
  );
}
