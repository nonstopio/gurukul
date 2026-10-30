import { useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router';
import * as ui from '@gurukul/ui';
import {
  Avatar,
  BarChart,
  BlockFrame,
  Breadcrumb,
  Button,
  Callout,
  Card,
  Certificate,
  Chip,
  CodeBlock,
  ColourSwatch,
  CommandPalette,
  DataTable,
  Dialog,
  DragList,
  EmailChipInput,
  EmptyState,
  FilterBar,
  FunnelBar,
  Input,
  LayoutPicker,
  Menu,
  NavItem,
  Page,
  PageHeader,
  PageSkeleton,
  Pagination,
  PenIcon,
  ProgressBar,
  ProgressRing,
  QuizOption,
  ResultRow,
  Seal,
  SegmentedControl,
  Select,
  Sidebar,
  SidebarGroup,
  Skeleton,
  StatCard,
  Stepper,
  Tabs,
  Textarea,
  Toggle,
  TopBar,
  TrashIcon,
  TypeTile,
  UserCard,
  UsersIcon,
  VideoBlock,
  largestDrop,
  topBarBackClass,
  useToast,
} from '@gurukul/ui';
import type {
  BlockLayout,
  ButtonVariant,
  CalloutTone,
  ChipTone,
  CoverTheme,
  EmailClassification,
  PaletteItem,
  QuizOptionState,
  ToastTone,
  TypeTileKind,
} from '@gurukul/ui';

const BUTTON_VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];
const CHROME_VARIANTS: ButtonVariant[] = ['chrome', 'chrome-secondary'];
const CHIP_TONES: ChipTone[] = ['neutral', 'accent', 'warning', 'danger', 'info', 'solid'];
const CALLOUT_TONES: CalloutTone[] = ['note', 'tip', 'warning'];
const QUIZ_STATES: Array<[QuizOptionState, 'A' | 'B' | 'C' | 'D']> = [
  ['idle', 'A'],
  ['correct', 'B'],
  ['incorrect', 'C'],
  ['locked', 'D'],
];
const TYPE_KINDS: TypeTileKind[] = ['reading', 'video', 'code', 'quiz'];
const TOAST_TONES: ToastTone[] = ['info', 'success', 'danger'];
const FUNNEL = [
  { label: 'Started', value: 120 },
  { label: 'Finished Chapter 1', value: 96 },
  { label: 'Finished Chapter 2', value: 52 },
  { label: 'Passed Quiz', value: 48 },
];
const MONTHS = [
  { label: 'Jul', value: 12 },
  { label: 'Aug', value: 30 },
  { label: 'Sep', value: 24 },
  { label: 'Oct', value: 41 },
];
const PEOPLE = [
  { id: 'a', name: 'Asha Rao', score: 92 },
  { id: 'b', name: 'Ravi Menon', score: 74 },
  { id: 'c', name: 'Meera Iyer', score: 58 },
];
const PALETTE_ITEMS: PaletteItem[] = [
  { id: 'home', label: 'Home', sub: 'Your courses', kind: 'Page' },
  { id: 'changelog', label: 'Changelog', sub: 'What changed', kind: 'Page' },
];
/** Every named icon the package exports, so a new one shows up here by itself. */
const ICONS = Object.entries(ui).filter(([name]) => /^[A-Z]\w*Icon$/.test(name)) as Array<
  [string, ComponentType<{ size?: number }>]
>;

const noop = () => undefined;
const byId = (p: { id: string }) => p.id;
const NAME_COLUMN = { id: 'name', header: 'Name', cell: (p: { name: string }) => p.name };

function classify(email: string): EmailClassification {
  if (email.startsWith('bad')) return { status: 'rejected', reason: 'not a NonStop address' };
  if (email.startsWith('new')) return { status: 'new' };
  if (email.startsWith('has')) return { status: 'alreadyAssigned' };
  return { status: 'signedIn' };
}

/** A box that keeps a full-size component (sidebar, page, certificate) from taking the page. */
function Frame({ size, children }: { size?: 'narrow' | 'wide'; children: ReactNode }) {
  return <div className={`ds-frame${size ? ` ds-frame--${size}` : ''}`}>{children}</div>;
}

function ButtonExample() {
  const [busy, setBusy] = useState(false);
  return (
    <>
      {BUTTON_VARIANTS.map((v) => (
        <Button key={v} variant={v}>
          {v}
        </Button>
      ))}
      <div className="ds-chrome">
        {CHROME_VARIANTS.map((v) => (
          <Button key={v} variant={v}>
            {v}
          </Button>
        ))}
      </div>
      <Button disabled>Disabled</Button>
      <Button variant="secondary" icon={<PenIcon />}>
        With icon
      </Button>
      <Button variant="secondary" size="sm">
        Small
      </Button>
      <Button loading={busy} onClick={() => setBusy(true)}>
        Save example
      </Button>
    </>
  );
}

function ToastExample() {
  const toast = useToast();
  return (
    <>
      {TOAST_TONES.map((tone) => (
        <Button
          key={tone}
          variant="secondary"
          onClick={() => toast.show(`A ${tone} toast`, { tone })}
        >
          Toast: {tone}
        </Button>
      ))}
    </>
  );
}

function DialogExample() {
  const [dialog, setDialog] = useState<'md' | 'drawer' | null>(null);
  return (
    <>
      <Button variant="secondary" onClick={() => setDialog('md')}>
        Open dialog
      </Button>
      <Button variant="secondary" onClick={() => setDialog('drawer')}>
        Open drawer
      </Button>
      <Dialog
        open={dialog !== null}
        size={dialog ?? 'md'}
        title="Example dialog"
        onClose={() => setDialog(null)}
        footer={<Button onClick={() => setDialog(null)}>Done</Button>}
      >
        <p>Focus is held inside until it closes.</p>
      </Dialog>
    </>
  );
}

function PaletteExample() {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState('Nothing picked yet');
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open command palette
      </Button>
      <p role="status">{picked}</p>
      <CommandPalette
        open={open}
        label="Example search"
        onClose={() => setOpen(false)}
        onSelect={(item) => {
          setPicked(`Picked ${item.label}`);
          setOpen(false);
        }}
        search={(q) =>
          PALETTE_ITEMS.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()))
        }
      />
    </>
  );
}

function ProgressExample({ ring }: { ring?: boolean }) {
  const [value, setValue] = useState(40);
  return (
    <>
      {ring ? (
        <>
          <ProgressRing label="Ring" value={value} />
          <ProgressRing label="Large ring" value={100} size={88} stroke={8} />
        </>
      ) : (
        <div className="ds-stack">
          <ProgressBar label="Example progress" value={value} />
          <ProgressBar label="Caption" value={44} caption="44% · 10 / 22" />
          <ProgressBar label="No value" value={100} showValue={false} />
        </div>
      )}
      <Button variant="ghost" onClick={() => setValue((v) => (v + 20) % 120)}>
        Advance {ring ? 'ring' : 'bar'}
      </Button>
    </>
  );
}

function ToggleExample() {
  const [on, setOn] = useState(true);
  return (
    <>
      <Toggle label="Published" checked={on} onChange={(e) => setOn(e.target.checked)} />
      <Toggle label="Disabled switch" disabled />
    </>
  );
}

function EmailExample() {
  const [emails, setEmails] = useState([
    'asha@example.com',
    'new.person@example.com',
    'has.course@example.com',
    'bad@x.org',
  ]);
  return (
    <EmailChipInput
      label="Assign to"
      value={emails}
      onChange={setEmails}
      classify={classify}
      placeholder="Paste emails"
    />
  );
}

function SwatchExample() {
  const [theme, setTheme] = useState<CoverTheme>('forest');
  return <ColourSwatch label="Cover theme" value={theme} onChange={setTheme} />;
}

function LayoutExample() {
  const [layout, setLayout] = useState<BlockLayout>('stacked');
  return <LayoutPicker label="Layout" value={layout} onChange={setLayout} />;
}

function QuizExample() {
  const [picked, setPicked] = useState(true);
  const [many, setMany] = useState(true);
  return (
    <div className="ds-stack">
      {QUIZ_STATES.map(([state, letter]) => (
        <QuizOption
          key={state}
          name="ds-quiz"
          letter={letter}
          state={state}
          checked={state === 'idle' ? picked : state !== 'locked'}
          onChange={setPicked}
        >
          Answer in the {state} state
        </QuizOption>
      ))}
      <QuizOption letter="A" multiple checked={many} onChange={setMany}>
        A checkbox answer
      </QuizOption>
    </div>
  );
}

function DataTableExample() {
  const [selected, setSelected] = useState<string[]>(['a']);
  return (
    <div className="ds-stack">
      <DataTable
        caption="Scores (read-only)"
        rows={PEOPLE}
        rowKey={byId}
        columns={[
          { ...NAME_COLUMN, rowHeader: true },
          { id: 'score', header: 'Score', cell: (p) => `${p.score}%`, align: 'end' },
        ]}
      />
      <DataTable
        caption="Learners (selectable)"
        rows={PEOPLE}
        rowKey={byId}
        selectable
        selected={selected}
        onSelectionChange={setSelected}
        rowLabel={(p) => p.name}
        columns={[NAME_COLUMN]}
      />
      <DataTable
        caption="No learners"
        rows={[] as typeof PEOPLE}
        rowKey={byId}
        columns={[NAME_COLUMN]}
        empty={<EmptyState title="Nobody yet">Assign a course to see learners here.</EmptyState>}
      />
    </div>
  );
}

function PaginationExample() {
  const [page, setPage] = useState(1);
  return <Pagination page={page} pageSize={3} total={9} onPageChange={setPage} />;
}

function DragExample() {
  const [items, setItems] = useState(['Intro', 'Basics', 'Quiz']);
  return (
    <DragList
      label="Lessons"
      items={items}
      itemKey={(i) => i}
      itemLabel={(i) => i}
      onMove={(from, to) =>
        setItems((list) => {
          const next = [...list];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved as string);
          return next;
        })
      }
      renderItem={(item, { handle }) => (
        <BlockFrame label={item.toUpperCase()} handle={handle}>
          Content of {item}
        </BlockFrame>
      )}
    />
  );
}

function BlockFrameExample() {
  const [note, setNote] = useState('');
  return (
    <>
      <BlockFrame label="TEXT" onDuplicate={() => setNote('Duplicated')}>
        A block
      </BlockFrame>
      <BlockFrame
        label="VIDEO"
        error="Add a video link"
        onDelete={() => setNote('Deleted')}
        selected
      >
        A block with an error
      </BlockFrame>
      <p role="status">{note}</p>
    </>
  );
}

function MenuExample() {
  const [picked, setPicked] = useState('No action yet');
  const pick = (what: string) => () => setPicked(what);
  return (
    <>
      <Menu
        label="Course actions"
        items={[
          { label: 'Edit', icon: <PenIcon />, onSelect: pick('Edit chosen') },
          { label: 'Duplicate', onSelect: pick('Duplicate chosen'), hint: 'D' },
          { label: 'Archive', onSelect: pick('Archive chosen'), disabled: true },
          { separator: true },
          { label: 'Delete', icon: <TrashIcon />, danger: true, onSelect: pick('Delete chosen') },
        ]}
      />
      <p role="status">{picked}</p>
    </>
  );
}

function SegmentedExample() {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  return (
    <SegmentedControl
      label="Editor mode"
      value={mode}
      onChange={setMode}
      options={[
        { value: 'write', label: 'Write' },
        { value: 'preview', label: 'Preview' },
      ]}
    />
  );
}

function FilterBarExample() {
  const [query, setQuery] = useState('');
  const [team, setTeam] = useState('');
  const shown = PEOPLE.filter(
    (p) => p.name.toLowerCase().includes(query.toLowerCase()) && (team === '' || p.id === team),
  );
  return (
    <FilterBar
      label="Filter example people"
      count={`${shown.length} of ${PEOPLE.length}`}
      canClear={query !== '' || team !== ''}
      onClear={() => {
        setQuery('');
        setTeam('');
      }}
    >
      <Input
        label="Search people"
        hideLabel
        type="search"
        placeholder="Search by name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Select label="Person" hideLabel value={team} onChange={(e) => setTeam(e.target.value)}>
        <option value="">Any person</option>
        {PEOPLE.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </FilterBar>
  );
}

function SidebarExample() {
  return (
    <Frame size="narrow">
      <Sidebar brand="Gurukul" label="Example main" footer={<p>Asha Rao</p>}>
        <SidebarGroup label="Learn">
          <NavItem href="#home" current icon={<span>H</span>}>
            Home
          </NavItem>
          <NavItem href="#courses" icon={<span>C</span>}>
            Courses
          </NavItem>
        </SidebarGroup>
        <SidebarGroup label="Manage">
          <NavItem href="#studio">Studio</NavItem>
        </SidebarGroup>
      </Sidebar>
    </Frame>
  );
}

const CERTIFICATE = {
  courseTitle: 'Git basics',
  issuedOn: '9 November 2026',
  verifyUrl: 'gurukul.example.com/verify/example',
  signatoryName: 'Meera Iyer',
  signatoryRole: 'Admin',
};

export interface Example {
  /** The one-line rule, from the skill's Need → Use table and recipes. */
  rule: string;
  /** Live examples in each variant and state. */
  Example: ComponentType;
}

/**
 * Exports that have no card of their own, and where they are shown instead. The test fails when
 * a component exported from `@gurukul/ui` is in neither this list nor `EXAMPLES`.
 */
export const SHOWN_ELSEWHERE: Readonly<Record<string, string>> = {
  AppShell: 'Patterns → Shell (it is the whole page frame)',
  SidebarGroup: 'inside the Sidebar example',
  NavItem: 'inside the Sidebar example',
  Field: 'the base of Input, Select and Textarea',
};

/** One card per `@gurukul/ui` component, keyed by its export name, in reading order. */
export const EXAMPLES: Readonly<Record<string, Example>> = {
  Page: {
    rule: 'Every screen’s column; its width (reading, default, wide) is the only max-width a page has.',
    Example: () => (
      <Frame size="wide">
        <Page width="reading">
          <Card>A reading-width page holds lessons, Quizzes, the changelog and the profile.</Card>
        </Page>
      </Frame>
    ),
  },
  PageHeader: {
    rule: 'The top of every page and its only h1: eyebrow, title, lead, at most one primary action.',
    Example: () => (
      <Frame size="wide">
        <PageHeader
          titleAs="h2"
          breadcrumb={
            <Breadcrumb
              label="Example page breadcrumb"
              items={[{ label: 'Courses', href: '#' }, { label: 'Git basics' }]}
            />
          }
          eyebrow="Area"
          title="Example page"
          meta={<Chip tone="accent">Published</Chip>}
          lead="One sentence on what this page is for."
          actions={
            <>
              <Button variant="secondary">Export CSV</Button>
              <Button>Invite people</Button>
            </>
          }
        />
      </Frame>
    ),
  },
  PageSkeleton: {
    rule: 'A page’s first load while its code or data arrives, in the page’s shape; never “Loading…”.',
    Example: () => (
      <Frame size="wide">
        <PageSkeleton width="reading" label="Loading the example page" />
      </Frame>
    ),
  },
  Button: {
    rule: 'One primary per view; secondary for the rest; danger only to confirm a destructive Dialog; loading while a click is pending.',
    Example: ButtonExample,
  },
  Card: {
    rule: 'Every page section is a Card with a title; it rests flat on a hairline.',
    Example: () => (
      <>
        <Card>A plain card</Card>
        <Card highlighted>The current chapter</Card>
        <Card
          title="A titled card"
          titleAs="h3"
          actions={
            <Button variant="ghost" size="sm">
              Edit
            </Button>
          }
        >
          With a title it is a section named by its heading.
        </Card>
      </>
    ),
  },
  StatCard: {
    rule: 'A number with its label, in an auto-fit KPI row; a number that failed reads “Unavailable”.',
    Example: () => (
      <div className="ds-stats">
        <StatCard label="Completion rate" value="40%" sub="48 of 120 learners" />
        <StatCard label="Active this week" value="—" sub="Still loading" />
        <StatCard label="Overdue" value="Unavailable" />
      </div>
    ),
  },
  Chip: {
    rule: 'A status word with a tone; never coloured text alone.',
    Example: () => (
      <>
        {CHIP_TONES.map((t) => (
          <Chip key={t} tone={t}>
            {t}
          </Chip>
        ))}
      </>
    ),
  },
  Avatar: {
    rule: 'A person: initials coloured by role, decorative beside the printed name; never a photo.',
    Example: () => (
      <>
        <Avatar name="Asha Rao" />
        <Avatar name="Ravi Menon" tone="educator" />
        <Avatar name="Meera Iyer" tone="admin" />
        <Avatar name="Asha Rao" size={24} />
        <Avatar name="Asha Rao" size={34} />
        <Avatar name="Asha Rao" size={48} label="Asha Rao" />
      </>
    ),
  },
  UserCard: {
    rule: 'The signed-in person at the foot of the sidebar; its Menu holds Profile, labels, What’s new and Sign out.',
    Example: () => (
      <Frame size="narrow">
        <div className="ds-chrome ds-chrome--block">
          <UserCard
            name="Asha Rao"
            detail="asha@example.com"
            tone="admin"
            menuLabel="Example account"
            items={[
              { label: 'Profile', onSelect: noop },
              { separator: true },
              { label: 'Sign out', onSelect: noop },
            ]}
          />
        </div>
      </Frame>
    ),
  },
  Menu: {
    rule: 'Actions on a thing (row, card, account): a menu button; destructive items last, after a separator.',
    Example: MenuExample,
  },
  FilterBar: {
    rule: 'Search and filters directly above the list they filter, labels hidden but present, a count and Clear filters.',
    Example: FilterBarExample,
  },
  Input: {
    rule: 'A labelled text field: label above, hint under it, error under the control; placeholder is never the label.',
    Example: () => (
      <div className="ds-form">
        <Input label="Title" hint="Shown on the course card" defaultValue="Git basics" />
        <Input label="Title with error" error="A title is required" defaultValue="" />
        <Input label="Disabled title" disabled defaultValue="Git basics" />
      </div>
    ),
  },
  Select: {
    rule: 'A choice from a list: a styled native select; filter selects start with “Any …”.',
    Example: () => (
      <div className="ds-form">
        <Select label="Team" defaultValue="web">
          <option value="web">Web</option>
          <option value="mobile">Mobile</option>
        </Select>
        <Select label="Team with hint" hint="Learners pick from this list" defaultValue="">
          <option value="">Any team</option>
          <option value="web">Web</option>
        </Select>
        <Select label="Team with error" error="Pick a team" defaultValue="">
          <option value="">Pick one</option>
        </Select>
        <Select label="Disabled team" disabled defaultValue="web">
          <option value="web">Web</option>
        </Select>
      </div>
    ),
  },
  Textarea: {
    rule: 'Longer text, labelled like Input.',
    Example: () => (
      <div className="ds-form">
        <Textarea label="Summary" rows={3} defaultValue="One line on what this teaches." />
      </div>
    ),
  },
  Toggle: {
    rule: 'A boolean setting, a real switch with its label.',
    Example: ToggleExample,
  },
  SegmentedControl: {
    rule: '2–4 mutually exclusive modes without panels; use Tabs when there are panels.',
    Example: SegmentedExample,
  },
  Tabs: {
    rule: 'Views with panels: one tab stop, arrows move, the selection can live in the URL.',
    Example: () => (
      <Tabs
        label="Example tabs"
        tabs={[
          { id: 'one', label: 'One', panel: 'First panel' },
          { id: 'two', label: 'Two', panel: 'Second panel' },
        ]}
      />
    ),
  },
  Breadcrumb: {
    rule: 'Where a page sits, only below a top-level page, passed to PageHeader breadcrumb.',
    Example: () => (
      <Breadcrumb
        label="Example breadcrumb"
        items={[{ label: 'Courses', href: '#' }, { label: 'Git basics' }]}
      />
    ),
  },
  StepCard: {
    rule: 'A numbered step of a multi-step task (Stepper.Step).',
    Example: () => (
      <div className="ds-stack">
        <Stepper.Step number={1} title="Pick people" headingAs="h3">
          Who gets the course.
        </Stepper.Step>
        <Stepper.Step number={2} title="Pick a course" headingAs="h3">
          What they learn.
        </Stepper.Step>
      </div>
    ),
  },
  Callout: {
    rule: 'Something true about this page or region, one per region; not for something that just happened.',
    Example: () => (
      <div className="ds-stack">
        {CALLOUT_TONES.map((t) => (
          <Callout key={t} tone={t} title={`A ${t}`}>
            Body text for the {t} callout.
          </Callout>
        ))}
      </div>
    ),
  },
  EmptyState: {
    rule: 'Nothing to show: say what empty means and give one action; never an invented zero.',
    Example: () => (
      <EmptyState
        icon={<UsersIcon />}
        title="Nothing here yet"
        action={<Button>Create one</Button>}
      >
        Courses you are assigned appear here.
      </EmptyState>
    ),
  },
  Skeleton: {
    rule: 'A region’s first load in the shape of its final layout.',
    Example: () => (
      <div aria-busy="true" className="ds-stack">
        <Skeleton />
        <Skeleton shape="block" />
        <Skeleton shape="circle" />
      </div>
    ),
  },
  ToastProvider: {
    rule: 'Something just happened: useToast(), not a Callout kept in state after a click.',
    Example: ToastExample,
  },
  Dialog: {
    rule: 'Confirm a destructive or costly action with a verb-plus-object primary, or a drawer for one record beside a list.',
    Example: DialogExample,
  },
  CommandPalette: {
    rule: 'Global search (⌘K): the caller decides what is searched and what choosing does.',
    Example: PaletteExample,
  },
  DataTable: {
    rule: 'Tabular data: a caption, numbers aligned end, a rowHeader column; selection and paging only on long lists.',
    Example: DataTableExample,
  },
  Pagination: {
    rule: 'Pages of a long DataTable, in its footer.',
    Example: PaginationExample,
  },
  ProgressBar: {
    rule: 'Progress of a course or list with its label; it prints the percentage.',
    Example: () => <ProgressExample />,
  },
  ProgressRing: {
    rule: 'Compact progress, as on a course card; its role carries the value.',
    Example: () => <ProgressExample ring />,
  },
  BarChart: {
    rule: 'Counts over time, with a table behind it for screen readers.',
    Example: () => (
      <BarChart title="Active learners" unit="learners" data={MONTHS} labelHeader="Month" />
    ),
  },
  FunnelBar: {
    rule: 'Where learners stop; the largest drop is highlighted.',
    Example: () => (
      <FunnelBar
        label="Where learners stop"
        rows={FUNNEL}
        highlight={largestDrop(FUNNEL.map((r) => r.value))}
      />
    ),
  },
  EmailChipInput: {
    rule: 'Pasted emails as chips, each classified: new, signed in, already assigned or rejected with a reason.',
    Example: EmailExample,
  },
  Sidebar: {
    rule: 'The ink navigation inside AppShell: brand, SidebarGroups of NavItems, the UserCard at the foot.',
    Example: SidebarExample,
  },
  TopBar: {
    rule: 'The focused layout’s sticky ink bar: back link, title, status, actions; never a page header.',
    Example: () => (
      <Frame>
        <TopBar
          titleAs="p"
          title="Git basics"
          back={
            <Link className={topBarBackClass} to="/courses">
              Back to courses
            </Link>
          }
          status={<span>Saved</span>}
          actions={<Button variant="chrome">Next lesson</Button>}
        />
      </Frame>
    ),
  },
  TypeTile: {
    rule: 'The kind of a lesson item: reading, video, code or Quiz, named for screen readers.',
    Example: () => (
      <>
        {TYPE_KINDS.map((k) => (
          <TypeTile key={k} kind={k} />
        ))}
      </>
    ),
  },
  CodeBlock: {
    rule: 'Code and terminal output with a copy button and highlighted lines.',
    Example: () => (
      <div className="ds-stack">
        <CodeBlock
          code={'git status\ngit add .\ngit commit'}
          fileName="terminal.sh"
          highlight="2"
        />
        <CodeBlock code="npm test" variant="terminal" />
      </div>
    ),
  },
  VideoBlock: {
    rule: 'A lesson video with a link out and a caption.',
    Example: () => (
      <Frame>
        <VideoBlock
          src="about:blank"
          title="Example lesson video"
          href="https://example.com/video"
          caption="Staging changes, in three minutes."
        />
      </Frame>
    ),
  },
  QuizOption: {
    rule: 'One Quiz answer, radio or checkbox, with correct, incorrect and locked states shown by icon and word.',
    Example: QuizExample,
  },
  ResultRow: {
    rule: 'One graded question on the result screen, with a link to revisit the lesson when it was wrong.',
    Example: () => (
      <ul className="ds-list">
        <ResultRow
          passed
          question="Which command stages changes?"
          yourAnswer="git add"
          correctAnswer="git add"
        />
        <ResultRow
          passed={false}
          question="Which command records them?"
          yourAnswer="git push"
          correctAnswer="git commit"
          revisit={{ href: '#', label: 'Revisit lesson: Commits' }}
        >
          A commit records staged changes locally.
        </ResultRow>
      </ul>
    ),
  },
  DragList: {
    rule: 'Reorder by dragging or with Alt + arrow keys from the grip.',
    Example: DragExample,
  },
  BlockFrame: {
    rule: 'A lesson block in the editor: label, grip, duplicate and delete, and its error.',
    Example: BlockFrameExample,
  },
  LayoutPicker: {
    rule: 'How a block lays out: stacked or split.',
    Example: LayoutExample,
  },
  ColourSwatch: {
    rule: 'A course cover theme, as radios that show their name.',
    Example: SwatchExample,
  },
  Seal: {
    rule: 'The certificate seal; ceremony surfaces only.',
    Example: () => (
      <Seal label="Seal of NonStop Gurukul" ringText="NONSTOP GURUKUL · CERTIFIED · " />
    ),
  },
  Certificate: {
    rule: 'The certificate artwork on paper; a long name shrinks to fit; a revoked one says so.',
    Example: () => (
      <>
        <Frame size="wide">
          <Certificate {...CERTIFICATE} learnerName="Asha Rao" credentialId="GK-EXAMPLE-0001" />
        </Frame>
        <Frame size="wide">
          <Certificate
            {...CERTIFICATE}
            revoked
            learnerName="Ravi Menon-Krishnamurthy of the Western Ghats Division"
            credentialId="GK-EXAMPLE-0002"
          />
        </Frame>
      </>
    ),
  },
  Icon: {
    rule: 'Every UI icon is a named icon from the package; never an emoji or a one-off SVG.',
    Example: () => (
      <ul className="ds-list ds-icons">
        {ICONS.map(([name, Glyph]) => (
          <li key={name}>
            <Glyph size={20} />
            {name}
          </li>
        ))}
      </ul>
    ),
  },
};
