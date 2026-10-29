import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertIcon,
  BookIcon,
  CheckIcon,
  ChecklistIcon,
  ChevronRightIcon,
  CodeIcon,
  CopyIcon,
  EmbedIcon,
  FileIcon,
  ImageIcon,
  InfoIcon,
  LightbulbIcon,
  LockIcon,
  PlayIcon,
  SearchIcon,
  StarIcon,
  TextIcon,
  TrashIcon,
  XIcon,
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
  FunnelBar,
  Input,
  LayoutPicker,
  NavItem,
  Pagination,
  ProgressBar,
  ProgressRing,
  QuizOption,
  ResultRow,
  Seal,
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
  TypeTile,
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
import './ui-gallery.css';

const BUTTON_VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'chrome'];
const CHIP_TONES: ChipTone[] = ['neutral', 'accent', 'warning', 'danger', 'info', 'solid'];
const CALLOUT_TONES: CalloutTone[] = ['note', 'tip', 'warning'];
const QUIZ_STATES: Array<[QuizOptionState, 'A' | 'B' | 'C' | 'D']> = [
  ['idle', 'A'],
  ['correct', 'B'],
  ['incorrect', 'C'],
  ['locked', 'D'],
];
const TYPE_KINDS: TypeTileKind[] = ['reading', 'video', 'code', 'pariksha'];
const ICONS = {
  AlertIcon,
  BookIcon,
  CheckIcon,
  ChecklistIcon,
  ChevronRightIcon,
  CodeIcon,
  CopyIcon,
  EmbedIcon,
  FileIcon,
  ImageIcon,
  InfoIcon,
  LightbulbIcon,
  LockIcon,
  PlayIcon,
  SearchIcon,
  StarIcon,
  TextIcon,
  TrashIcon,
  XIcon,
};
const TOAST_TONES: ToastTone[] = ['info', 'success', 'danger'];
const FUNNEL = [
  { label: 'Started', value: 120 },
  { label: 'Finished Parva 1', value: 96 },
  { label: 'Finished Parva 2', value: 52 },
  { label: 'Passed Pariksha', value: 48 },
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

const byId = (p: { id: string }) => p.id;
const NAME_COLUMN = { id: 'name', header: 'Name', cell: (p: { name: string }) => p.name };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="ui-gallery__section" aria-labelledby={`ui-${id}`}>
      <h2 id={`ui-${id}`} className="ui-gallery__heading">
        {title}
      </h2>
      <div className="ui-gallery__row">{children}</div>
    </section>
  );
}

function classify(email: string): EmailClassification {
  if (email.startsWith('bad')) return { status: 'rejected', reason: 'not a NonStop address' };
  if (email.startsWith('new')) return { status: 'new' };
  if (email.startsWith('has')) return { status: 'alreadyAssigned' };
  return { status: 'signedIn' };
}

function ToastButtons() {
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

function Overlays() {
  const [dialog, setDialog] = useState<'md' | 'drawer' | null>(null);
  const [palette, setPalette] = useState(false);
  const [picked, setPicked] = useState('Nothing picked yet');
  return (
    <>
      <Button variant="secondary" onClick={() => setDialog('md')}>
        Open dialog
      </Button>
      <Button variant="secondary" onClick={() => setDialog('drawer')}>
        Open drawer
      </Button>
      <Button variant="secondary" onClick={() => setPalette(true)}>
        Open command palette
      </Button>
      <p role="status">{picked}</p>
      <Dialog
        open={dialog !== null}
        size={dialog ?? 'md'}
        title="Example dialog"
        onClose={() => setDialog(null)}
        footer={<Button onClick={() => setDialog(null)}>Done</Button>}
      >
        <p>Focus is held inside until it closes.</p>
      </Dialog>
      <CommandPalette
        open={palette}
        label="Example search"
        onClose={() => setPalette(false)}
        onSelect={(item) => {
          setPicked(`Picked ${item.label}`);
          setPalette(false);
        }}
        search={(q) =>
          PALETTE_ITEMS.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()))
        }
      />
    </>
  );
}

function Forms() {
  const [on, setOn] = useState(true);
  const [emails, setEmails] = useState([
    'asha@example.com',
    'new.person@example.com',
    'has.course@example.com',
    'bad@x.org',
  ]);
  const [theme, setTheme] = useState<CoverTheme>('forest');
  const [layout, setLayout] = useState<BlockLayout>('stacked');
  return (
    <>
      <Input label="Title" hint="Shown on the course card" defaultValue="Git basics" />
      <Input label="Title with error" error="A title is required" defaultValue="" />
      <Select label="Team" defaultValue="web">
        <option value="web">Web</option>
        <option value="mobile">Mobile</option>
      </Select>
      <Textarea label="Summary" rows={3} defaultValue="One line on what this teaches." />
      <Toggle label="Published" checked={on} onChange={(e) => setOn(e.target.checked)} />
      <Toggle label="Disabled switch" disabled />
      <EmailChipInput
        label="Assign to"
        value={emails}
        onChange={setEmails}
        classify={classify}
        placeholder="Paste emails"
      />
      <ColourSwatch label="Cover theme" value={theme} onChange={setTheme} />
      <LayoutPicker label="Layout" value={layout} onChange={setLayout} />
    </>
  );
}

function Quiz() {
  const [picked, setPicked] = useState(true);
  const [many, setMany] = useState(true);
  return (
    <>
      {QUIZ_STATES.map(([state, letter]) => (
        <QuizOption
          key={state}
          name="ui-quiz"
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
      <ul className="ui-gallery__list">
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
    </>
  );
}

function Data() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>(['a']);
  const [items, setItems] = useState(['Intro', 'Basics', 'Pariksha']);
  const [note, setNote] = useState('');
  return (
    <>
      <DataTable
        caption="Learners"
        rows={PEOPLE}
        rowKey={byId}
        selectable
        selected={selected}
        onSelectionChange={setSelected}
        rowLabel={(p) => p.name}
        columns={[
          NAME_COLUMN,
          { id: 'score', header: 'Score', cell: (p) => `${p.score}%`, align: 'end' },
        ]}
        footer={<Pagination page={page} pageSize={3} total={9} onPageChange={setPage} />}
      />
      <DataTable
        caption="No learners"
        rows={[] as typeof PEOPLE}
        rowKey={byId}
        columns={[NAME_COLUMN]}
        empty={<EmptyState title="Nobody yet">Assign a course to see learners here.</EmptyState>}
      />
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
          <BlockFrame
            label={item.toUpperCase()}
            handle={handle}
            onDuplicate={() => setNote('Duplicated')}
          >
            Content of {item}
          </BlockFrame>
        )}
      />
      <BlockFrame
        label="VIDEO"
        error="Add a video link"
        onDelete={() => setNote('Deleted')}
        selected
      >
        A block with an error
      </BlockFrame>
      <p role="status">{note}</p>
      <BarChart title="Active learners" unit="learners" data={MONTHS} labelHeader="Month" />
      <FunnelBar
        label="Where learners stop"
        rows={FUNNEL}
        highlight={largestDrop(FUNNEL.map((r) => r.value))}
      />
    </>
  );
}

function Chrome() {
  return (
    <>
      <div className="ui-gallery__frame ui-gallery__frame--sidebar">
        <Sidebar
          brand="Gurukul"
          label="Example main"
          footer={<p className="ui-gallery__plain">Asha Rao</p>}
        >
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
      </div>
      <div className="ui-gallery__frame">
        <TopBar
          titleAs="p"
          title="Git basics"
          back={
            <a className={topBarBackClass} href="#course">
              Back to course
            </a>
          }
          status={<span>Saved</span>}
          actions={<Button variant="chrome">Next lesson</Button>}
        />
      </div>
    </>
  );
}

function Media() {
  return (
    <>
      <div className="ui-gallery__frame">
        <VideoBlock
          src="about:blank"
          title="Example lesson video"
          href="https://example.com/video"
          caption="Staging changes, in three minutes."
        />
      </div>
      <div className="ui-gallery__frame ui-gallery__frame--cert">
        <Certificate
          learnerName="Asha Rao"
          courseTitle="Git basics"
          issuedOn="9 November 2026"
          credentialId="GK-EXAMPLE-0001"
          verifyUrl="gurukul.example.com/verify/example"
          signatoryName="Meera Iyer"
          signatoryRole="Kulapati"
        />
      </div>
      <div className="ui-gallery__frame ui-gallery__frame--cert">
        <Certificate
          revoked
          learnerName="Ravi Menon-Krishnamurthy of the Western Ghats Division"
          courseTitle="Git basics"
          issuedOn="9 November 2026"
          credentialId="GK-EXAMPLE-0002"
          verifyUrl="gurukul.example.com/verify/example"
          signatoryName="Meera Iyer"
          signatoryRole="Kulapati"
        />
      </div>
    </>
  );
}

/** The `/__ui` component gallery: every design-system component, every variant and state. Development builds only. */
export function UiGalleryPage() {
  const [value, setValue] = useState(40);
  return (
    <main className="ui-gallery" id="main">
      <h1>Component gallery</h1>
      <p>Every design-system component in every variant and state. Development builds only.</p>
      <Section id="button" title="Button">
        {BUTTON_VARIANTS.map((v) => (
          <span key={v} className={v === 'chrome' ? 'ui-gallery__dark' : undefined}>
            <Button variant={v}>{v}</Button>
          </span>
        ))}
        <Button disabled>Disabled</Button>
        <Button variant="secondary" icon={<span>+</span>}>
          With icon
        </Button>
      </Section>
      <Section id="chip" title="Chip">
        {CHIP_TONES.map((t) => (
          <Chip key={t} tone={t}>
            {t}
          </Chip>
        ))}
      </Section>
      <Section id="progress" title="Progress">
        <ProgressBar label="Course progress" value={value} />
        <ProgressBar label="Caption" value={44} caption="44% · 10 / 22" />
        <ProgressBar label="No value" value={100} showValue={false} />
        <ProgressRing label="Ring" value={value} />
        <ProgressRing label="Large ring" value={100} size={88} stroke={8} />
        <Button variant="ghost" onClick={() => setValue((v) => (v + 20) % 120)}>
          Advance
        </Button>
      </Section>
      <Section id="surfaces" title="Card, callout, empty state">
        <Card>A card</Card>
        <Card highlighted>The current parva</Card>
        {CALLOUT_TONES.map((t) => (
          <Callout key={t} tone={t} title={`A ${t}`}>
            Body text for the {t} callout.
          </Callout>
        ))}
        <EmptyState title="Nothing here yet" action={<Button>Create one</Button>}>
          Courses you are assigned appear here.
        </EmptyState>
      </Section>
      <Section id="loading" title="Skeleton">
        <div aria-busy="true" className="ui-gallery__stack">
          <Skeleton />
          <Skeleton shape="block" />
          <Skeleton shape="circle" />
        </div>
      </Section>
      <Section id="forms" title="Forms">
        <Forms />
      </Section>
      <Section id="navigation" title="Tabs, breadcrumb, stepper">
        <Tabs
          label="Example tabs"
          tabs={[
            { id: 'one', label: 'One', panel: 'First panel' },
            { id: 'two', label: 'Two', panel: 'Second panel' },
          ]}
        />
        <Breadcrumb items={[{ label: 'Courses', href: '#' }, { label: 'Git basics' }]} />
        <div>
          <Stepper.Step number={1} title="Pick people" headingAs="h3">
            Who gets the course.
          </Stepper.Step>
          <Stepper.Step number={2} title="Pick a course" headingAs="h3">
            What they learn.
          </Stepper.Step>
        </div>
      </Section>
      <Section id="icons" title="Icons">
        <ul className="ui-gallery__list ui-gallery__icons">
          {Object.entries(ICONS).map(([name, Glyph]) => (
            <li key={name}>
              <Glyph size={20} />
              {name}
            </li>
          ))}
        </ul>
      </Section>
      <Section id="content" title="Content">
        {TYPE_KINDS.map((k) => (
          <TypeTile key={k} kind={k} />
        ))}
        <StatCard label="Completion rate" value="40%" sub="48 of 120 learners" />
        <CodeBlock
          code={'git status\ngit add .\ngit commit'}
          fileName="terminal.sh"
          highlight="2"
        />
        <CodeBlock code="npm test" variant="terminal" />
        <Seal label="Seal of NonStop Gurukul" ringText="NONSTOP GURUKUL · CERTIFIED · " />
      </Section>
      <Section id="chrome" title="Sidebar and top bar">
        <Chrome />
      </Section>
      <Section id="media" title="Video and certificate">
        <Media />
      </Section>
      <Section id="quiz" title="Pariksha">
        <Quiz />
      </Section>
      <Section id="data" title="Tables, lists and charts">
        <Data />
      </Section>
      <Section id="overlays" title="Dialog, drawer, palette, toast">
        <Overlays />
        <ToastButtons />
      </Section>
    </main>
  );
}
