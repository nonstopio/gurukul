import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AuthoringSession, Block, Course, Lesson, Quiz } from '@gurukul/schema';
import { courseChanges } from '@gurukul/schema/changes';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionStore } from '../src/studio/session/store';
import type { Working } from '../src/studio/types';
import { axeViolations } from './axe';
import { lesson, makeCourse } from './fake-data';
import { fakeAgent, fakeDesktop, installDesktop, uninstallDesktop } from './fake-desktop';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';
import { choose } from './select';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
const { log } = await import('../src/log');

afterEach(() => {
  uninstallDesktop();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const L1_BLOCKS: Block[] = [
  { type: 'markdown', id: 'm1', md: 'Rebase before you raise a pull request.' },
  { type: 'markdown', id: 'm2', md: 'Unchanged two.' },
  { type: 'markdown', id: 'm3', md: 'Unchanged three.' },
  {
    type: 'code',
    id: 'c1',
    lang: 'bash',
    code: 'git fetch\ngit merge main',
    copy: true,
    terminal: true,
  },
  { type: 'image', id: 'i1', url: 'https://example.com/old.png', alt: 'Old diagram' },
  {
    type: 'check',
    id: 'k',
    prompt: 'Rebase first?',
    options: ['Yes', 'No'],
    correct: 0,
    explanation: 'It keeps history straight.',
  },
];

/** Git, with a first lesson rich enough to compare every kind of block. */
const GIT: Course = (() => {
  const course = makeCourse({ id: 'git', title: 'Git', educatorIds: ['u1'] });
  (course.chapters[0]?.items[0] as Lesson).blocks = L1_BLOCKS;
  return course;
})();

const chapterOf = (course: Course, id: string) =>
  course.chapters.find((c) => c.id === id) as Course['chapters'][number];

/** A copy of `w` with `edit` applied to a clone of it. */
function change(w: Working, edit: (c: Course, answers: Working['answers']) => void): Working {
  const next = structuredClone(w);
  edit(next.course, next.answers);
  return next;
}

/** The first turn: every kind of change Review compares. */
const turnOne = (w: Working) =>
  change(w, (c, answers) => {
    c.title = 'Git, plainly';
    const l1 = chapterOf(c, 'p1').items[0] as Lesson;
    l1.blocks = [
      { type: 'markdown', id: 'm1', md: 'Rebase before you open a pull request.' },
      L1_BLOCKS[1] as Block,
      L1_BLOCKS[2] as Block,
      {
        ...(L1_BLOCKS[3] as Extract<Block, { type: 'code' }>),
        code: 'git fetch\ngit rebase origin/main',
      },
      { type: 'image', id: 'i1', url: 'https://example.com/new.png', alt: 'New diagram' },
      {
        type: 'check',
        id: 'k',
        prompt: 'Rebase first?',
        options: ['Yes', 'No, never'],
        correct: 1,
        explanation: 'It keeps history straight.',
      },
      { type: 'callout', id: 'tip', tone: 'tip', md: 'Fetch first.' },
    ];
    // l2 goes.
    chapterOf(c, 'p1').items.pop();
    const p2 = chapterOf(c, 'p2');
    p2.title = 'History of Git';
    const quiz = p2.items[1] as Quiz;
    quiz.passMark = 0.8;
    (quiz.questions[0] as Quiz['questions'][number]).options[1] = { id: 'b', text: 'B, rebased' };
    answers.q1 = { k1: ['b'] };
    p2.items.push(lesson('n1', { title: 'Rebase, step by step' }) as Lesson);
  });

/** The second turn: the landing page. */
const turnTwo = (w: Working) =>
  change(w, (c) => {
    c.description = 'Learn Git the NonStop way.';
  });

let sessions = 0;

async function open(
  init: {
    turns?: ((w: Working) => Working)[];
    edit?: (s: AuthoringSession) => AuthoringSession;
    kind?: 'new' | 'edit';
    path?: (id: string) => string;
    studio?: ReturnType<typeof fakeStudio>;
    /** Removes these checkpoint files after the turns are written. */
    drop?: string[];
  } = {},
) {
  sessions += 1;
  const id = `r${sessions}`;
  const fake = fakeDesktop();
  const store = createSessionStore({ desktop: fake.desktop, uid: 'u1', newId: () => id });
  const started = await store.start(
    init.kind === 'new' ? { kind: 'new' } : { kind: 'edit', courseId: 'git' },
    async () =>
      draftDoc(GIT, {
        rev: 3,
        updatedAt: new Date('2026-11-18T10:00:00Z'),
        answers: { q1: { k1: ['a'] } },
      }),
  );
  if (started.status !== 'started') throw new Error('not started');
  let session = started.session;
  for (const [i, turn] of (init.turns ?? []).entries()) {
    const before = session.work as Working;
    const after = turn(before);
    if (i === 0) await store.saveStart(id, before);
    session = await store.saveTurn(
      session,
      {
        id: `t${i + 1}`,
        at: '2026-11-19T10:00:00.000Z',
        by: 'agent',
        summary: `Turn ${i + 1}`,
        checkpoint: `t${i + 1}.json`,
        changes: courseChanges(before, after).count,
      },
      after,
    );
  }
  if (init.edit) session = await store.save(init.edit(session));
  for (const file of init.drop ?? []) fake.files.delete(`u1/${id}/checkpoints/${file}`);
  const agent = fakeAgent(fake.desktop);
  installDesktop(fake.desktop);
  // The stored draft is the one the session started from, unless a test moves it.
  const studio =
    init.studio ?? fakeStudio({ courses: [{ live: GIT, draft: draftDoc(GIT, { rev: 3 }) }] });
  const app = await openApp(init.path?.(id) ?? `/studio/sessions/${id}/review`, {
    roles: ['educator'],
    studio,
  });
  const disk = () =>
    JSON.parse(fake.files.get(`u1/${id}/session.json`) as string) as AuthoringSession;
  return { ...fake, ...agent, store, app, id, studio, disk };
}

const list = () => screen.getByRole('list', { name: 'Changes' });
const pick = (name: RegExp) => fireEvent.click(within(list()).getByRole('button', { name }));
const detail = () => screen.getByRole('region', { name: 'The selected change' });
const ready = async (s: Awaited<ReturnType<typeof open>>) =>
  waitFor(() => expect(s.agent.start).toHaveBeenCalled());

describe('Review', () => {
  it('lists every change in course order with its words, and compares the first', async () => {
    await open({
      turns: [turnOne],
      edit: (x) => ({
        ...x,
        summary: 'Shorter sentences in chapter one.',
        goals: [
          { text: 'Simplify chapter one', done: true },
          { text: 'Add a screenshot', done: false },
        ],
      }),
    });
    expect(await screen.findByText('Compared with Draft v3, 18 Nov')).toBeTruthy();
    expect(screen.getByText('Shorter sentences in chapter one.')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Simplify chapter one' })).toHaveProperty(
      'checked',
      true,
    );
    expect(
      screen.getByRole('checkbox', { name: 'Add a screenshot (not done yet)' }),
    ).toHaveProperty('checked', false);
    expect(screen.getByText('6 changes · 0 viewed')).toBeTruthy();
    const names = within(list())
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toEqual([
      'Course details: changedChanged',
      '1.1 · Lesson l1: changedChanged',
      'Lesson l2: removedRemoved',
      '2 · History of Git: renamedRenamed',
      '2.2 · Quiz I: changedChanged',
      '2.4 · Rebase, step by step: addedAdded',
    ]);
    // The first row is open, marked by a sign as well as by aria-current.
    const first = within(list()).getByRole('button', { name: /^Course details/ });
    expect(first.getAttribute('aria-current')).toBe('true');
    expect(first.querySelector('svg')).not.toBeNull();
    expect(within(detail()).getByRole('heading', { name: 'Course details' })).toBeTruthy();
    const title = within(detail()).getByText('Title').nextElementSibling as HTMLElement;
    expect(title.querySelector('del')).toBeNull();
    expect(title.querySelector('ins')?.textContent).toBe('added: , plainly');
    // No accept button anywhere.
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('compares a lesson block by block, side by side or inline, folding the unchanged ones', async () => {
    const s = await open({ turns: [turnOne] });
    await ready(s);
    pick(/^1\.1 · Lesson l1/);
    const view = within(detail()).getByRole('group', { name: '1.1 · Lesson l1, before and after' });
    expect(view.className).toContain('g-diff--split');
    const text = within(view).getByRole('group', { name: 'changed: Text block 1' });
    const before = text.querySelector('.g-diff-row__cell--before') as HTMLElement;
    const after = text.querySelector('.g-diff-row__cell--after') as HTMLElement;
    expect(before.querySelector('del')?.textContent).toBe('removed: raise');
    expect(before.querySelector('ins')).toBeNull();
    expect(after.querySelector('ins')?.textContent).toBe('added: open');
    // Unchanged blocks folded, and opened on request.
    const fold = within(view).getByRole('button', { name: '2 unchanged blocks' });
    expect(within(view).queryByText('Unchanged two.')).toBeNull();
    fireEvent.click(fold);
    expect(within(view).getAllByText('Unchanged two.')).toHaveLength(1);
    // Code, line by line with − and +.
    const code = within(view).getByRole('group', { name: 'changed: Code block 4' });
    expect(within(code).getByLabelText('Code block 4: Code, before').textContent).toContain(
      '−removed line: git merge main',
    );
    expect(within(code).getByLabelText('Code block 4: Code, after').textContent).toContain(
      '+added line: git rebase origin/main',
    );
    // An image: both pictures and the fields that changed.
    const image = within(view).getByRole('group', { name: 'changed: Image block 5' });
    expect(within(image).getByRole('img', { name: 'Old diagram' })).toBeTruthy();
    expect(within(image).getByRole('img', { name: 'New diagram' })).toBeTruthy();
    expect(within(image).getAllByText('Alt text')).toHaveLength(2);
    // A check block: options with their marks, and the changed answer on a line of its own.
    const check = within(view).getByRole('group', { name: 'changed: Check block 6' });
    expect(within(check).getByText('Correct answer changed: A → B')).toBeTruthy();
    expect(check.querySelector('.g-diff-row__cell--after')?.textContent).toContain(
      'B. Noadded: , never (correct)',
    );
    const added = within(view).getByRole('group', { name: 'added: Callout block 7' });
    expect(within(added).getByText('Not there before')).toBeTruthy();
    expect(await axeViolations(detail())).toEqual([]);

    // Inline: one column, the words in one difference, media before above after.
    fireEvent.click(within(detail()).getByRole('button', { name: 'Inline' }));
    const inline = within(detail()).getByRole('group', {
      name: '1.1 · Lesson l1, before and after',
    });
    expect(inline.className).toContain('g-diff--inline');
    const merged = within(inline).getByRole('group', { name: 'changed: Text block 1' });
    expect(merged.textContent).toContain('removed: raiseadded: open');
    const pictures = within(inline).getByRole('group', { name: 'changed: Image block 5' });
    expect([...pictures.querySelectorAll('.g-diff-row__side')].map((p) => p.textContent)).toEqual([
      'Before',
      'After',
    ]);

    // Rendered: the text blocks as a learner reads them.
    fireEvent.click(within(detail()).getByRole('button', { name: 'Rendered' }));
    const rendered = within(detail()).getByRole('group', { name: 'changed: Text block 1' });
    expect(rendered.querySelector('del')).toBeNull();
    expect(within(rendered).getByText('Rebase before you open a pull request.')).toBeTruthy();
  });

  it('shows a lesson as a learner, before and after', async () => {
    const s = await open({ turns: [turnOne] });
    await ready(s);
    pick(/^1\.1 · Lesson l1/);
    fireEvent.click(within(detail()).getByRole('button', { name: 'As a learner' }));
    expect(within(detail()).getByText('Rebase before you open a pull request.')).toBeTruthy();
    fireEvent.click(within(detail()).getByRole('button', { name: 'Before' }));
    expect(within(detail()).getByText('Rebase before you raise a pull request.')).toBeTruthy();
    // The Rendered switch is for the comparison only.
    expect(within(detail()).queryByRole('button', { name: 'Rendered' })).toBeNull();
  });

  it('opens an added item as a learner, with no before', async () => {
    const s = await open({ turns: [turnOne] });
    await ready(s);
    pick(/^2\.4 · Rebase/);
    expect(
      within(detail()).getByRole('button', { name: 'As a learner' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(within(detail()).queryByRole('group', { name: 'Version' })).toBeNull();
    expect(within(detail()).getByText('Body of n1')).toBeTruthy();
    fireEvent.click(within(detail()).getByRole('button', { name: 'Side by side' }));
    expect(within(detail()).getByRole('group', { name: 'added: Text block 1' })).toBeTruthy();
  });

  it('shows what a removed lesson takes with it, and how many learners completed it', async () => {
    const studio = fakeStudio({ courses: [{ live: GIT, draft: draftDoc(GIT) }] });
    vi.mocked(studio.data.completedCount)
      .mockResolvedValueOnce(3)
      .mockRejectedValueOnce(new Error('x'));
    const s = await open({ turns: [turnOne], studio });
    await ready(s);
    // Asked only when the row is opened.
    expect(studio.data.completedCount).not.toHaveBeenCalled();
    pick(/^Lesson l2/);
    expect(within(detail()).getByText('Removed from the course')).toBeTruthy();
    expect(within(detail()).getByText('Counting the learners who completed it: —')).toBeTruthy();
    expect(await within(detail()).findByText('3 learners completed it.')).toBeTruthy();
    expect(studio.data.completedCount).toHaveBeenCalledWith('git', 'l2');
    expect(within(detail()).getByText('Body of l2')).toBeTruthy();
    // No editor and no Ask for something gone.
    expect(within(detail()).queryByRole('link', { name: 'Open in editor' })).toBeNull();
    expect(within(detail()).queryByRole('button', { name: 'Ask for a change' })).toBeNull();
    // Opened again, a failed count says so.
    pick(/^Course details/);
    pick(/^Lesson l2/);
    expect(
      await within(detail()).findByText('Learners who completed it: Unavailable'),
    ).toBeTruthy();
    expect(log.warn).toHaveBeenCalledWith('Counting lesson completions failed', {
      courseId: 'git',
      itemId: 'l2',
    });
  });

  it('says one learner, and a removed Quiz says it leaves the course', async () => {
    const studio = fakeStudio({ courses: [{ live: GIT, draft: draftDoc(GIT) }] });
    vi.mocked(studio.data.completedCount).mockResolvedValue(1);
    const s = await open({
      turns: [
        (w) =>
          change(w, (c) => {
            chapterOf(c, 'p1').items.pop();
            chapterOf(c, 'p2').items.splice(1, 1);
          }),
      ],
      studio,
    });
    await ready(s);
    pick(/^Lesson l2/);
    expect(await within(detail()).findByText('1 learner completed it.')).toBeTruthy();
    pick(/^Quiz I/);
    expect(
      within(detail()).getByText('This Quiz is not in the course once you save and publish.'),
    ).toBeTruthy();
  });

  it('compares a Quiz: settings in words, options, and a changed answer on its own line', async () => {
    const s = await open({ turns: [turnOne] });
    await ready(s);
    pick(/^2\.2 · Quiz I/);
    const settings = within(detail()).getByRole('region', { name: 'Settings' });
    expect(settings.textContent).toBe('SettingsPass markNot set→ changed to 80%');
    const question = within(detail()).getByRole('group', { name: 'changed: Question 1' });
    expect(within(question).getByText('Correct answer changed: A → B')).toBeTruthy();
    const after = question.querySelector('.g-diff-row__cell--after') as HTMLElement;
    expect(after.textContent).toContain('B. Badded: , rebased (correct)');
    const before = question.querySelector('.g-diff-row__cell--before') as HTMLElement;
    expect(before.textContent).toContain('A. A (correct)');
    fireEvent.click(within(detail()).getByRole('button', { name: 'Inline' }));
    expect(
      within(detail()).getByRole('group', { name: 'changed: Question 1' }).textContent,
    ).toContain('Badded: , rebased');
    fireEvent.click(within(detail()).getByRole('button', { name: 'As a learner' }));
    expect(within(detail()).getByText('Which?')).toBeTruthy();
    expect(await axeViolations(detail())).toEqual([]);
  });

  it('compares a renamed chapter and a changed landing page', async () => {
    const s = await open({ turns: [turnOne, turnTwo] });
    await ready(s);
    pick(/^2 · History of Git/);
    const title = within(detail()).getByText('Title').nextElementSibling as HTMLElement;
    expect(title.querySelector('ins')?.textContent).toBe('added:  of Git');
    expect(within(detail()).queryByRole('button', { name: 'As a learner' })).toBeNull();
    pick(/^Landing page/);
    expect(within(detail()).getByText('Description')).toBeTruthy();
  });

  it('ticks a row viewed, kept in the session file, and counts it', async () => {
    const s = await open({ turns: [turnOne] });
    await ready(s);
    const viewed = within(detail()).getByRole('checkbox', { name: 'Viewed' });
    fireEvent.click(viewed);
    await waitFor(() => expect(s.disk().viewed).toEqual(['course:course']));
    expect(screen.getByText('6 changes · 1 viewed')).toBeTruthy();
    expect(
      within(list()).getByRole('button', { name: /^Course details: changed, viewed/ }),
    ).toBeTruthy();
    fireEvent.click(within(detail()).getByRole('checkbox', { name: 'Viewed' }));
    await waitFor(() => expect(s.disk().viewed).toEqual([]));
  });

  it('filters by turn, from the chat’s link or the list', async () => {
    const s = await open({
      turns: [turnOne, turnTwo],
      path: (id) => `/studio/sessions/${id}/review?turn=t2`,
    });
    expect(await screen.findByText('1 change · 0 viewed')).toBeTruthy();
    expect(within(detail()).getByRole('heading', { name: 'Landing page' })).toBeTruthy();
    await ready(s);
    choose(screen.getByRole('combobox', { name: 'Show' }), 'Turn 1 · 6 changes');
    expect(await screen.findByText('6 changes · 0 viewed')).toBeTruthy();
    choose(screen.getByRole('combobox', { name: 'Show' }), 'All changes');
    expect(await screen.findByText('7 changes · 0 viewed')).toBeTruthy();
    expect(s.app.router.state.location.search).toBe('');
  });

  it('says when a turn’s copy is no longer kept, and goes back to all changes', async () => {
    const s = await open({
      turns: [turnOne, turnTwo],
      drop: ['t1.json'],
      path: (id) => `/studio/sessions/${id}/review?turn=t2`,
    });
    expect(await screen.findByText('This turn is no longer kept')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Nothing to show for this turn' })).toBeTruthy();
    await ready(s);
    fireEvent.click(screen.getByRole('button', { name: 'Show all changes' }));
    expect(await screen.findByText('7 changes · 0 viewed')).toBeTruthy();
  });

  it('logs a turn copy that could not be read', async () => {
    const s = await open({
      turns: [turnOne],
      path: (id) => `/studio/sessions/${id}/review?turn=t1`,
    });
    expect(await screen.findByText('6 changes · 0 viewed')).toBeTruthy();
    vi.mocked(s.desktop.store.read).mockRejectedValue(new Error('nope'));
    await ready(s);
    choose(screen.getByRole('combobox', { name: 'Show' }), 'All changes');
    await screen.findByText('6 changes · 0 viewed');
    choose(screen.getByRole('combobox', { name: 'Show' }), 'Turn 1 · 6 changes');
    expect(await screen.findByText('This turn is no longer kept')).toBeTruthy();
    expect(log.warn).toHaveBeenCalledWith('Session turn copies not read', {
      sessionId: s.id,
      reason: 'Error: nope',
    });
  });

  it('asks for a change: the row is attached and the chat opens', async () => {
    const s = await open({ turns: [turnOne] });
    await ready(s);
    pick(/^1\.1 · Lesson l1/);
    fireEvent.click(within(detail()).getByRole('button', { name: 'Ask for a change' }));
    expect(await screen.findByRole('log', { name: 'Chat with the agent' })).toBeTruthy();
    expect(screen.getByRole('list', { name: /attached/i }).textContent).toContain(
      'Lesson 1.1 · Lesson l1',
    );
  });

  it('says so when a message already carries the most parts', async () => {
    const s = await open({ turns: [turnOne] });
    await ready(s);
    // Ten blocks attached from the chat's preview: the seven of lesson 1.1, then three more.
    fireEvent.click(screen.getByRole('link', { name: 'Back to the chat' }));
    const attachAll = () => {
      for (const button of screen.getAllByRole('button', {
        name: /^Attach Lesson .* to your message$/,
      }))
        if (button.getAttribute('aria-pressed') === 'false') fireEvent.click(button);
    };
    await screen.findByRole('heading', { level: 2, name: 'Lesson l1' });
    attachAll();
    choose(screen.getByRole('combobox', { name: 'Lesson or Quiz' }), '2.1 · Lesson l3');
    attachAll();
    choose(screen.getByRole('combobox', { name: 'Lesson or Quiz' }), '2.3 · Lesson l4');
    attachAll();
    choose(
      screen.getByRole('combobox', { name: 'Lesson or Quiz' }),
      '2.4 · Rebase, step by step (added)',
    );
    attachAll();
    expect(screen.getByRole('list', { name: /attached/i }).children).toHaveLength(10);
    fireEvent.click(screen.getByRole('link', { name: 'Review' }));
    await screen.findByText('6 changes · 0 viewed');
    fireEvent.click(within(detail()).getByRole('button', { name: 'Ask for a change' }));
    expect(
      await screen.findByText(
        'A message carries at most 10 parts of the course. Remove one first.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('log')).toBeNull();
  });

  it('links a lesson or Quiz to its editor inside the session', async () => {
    const s = await open({ turns: [turnOne] });
    await ready(s);
    pick(/^2\.2 · Quiz I/);
    expect(
      within(detail()).getByRole('link', { name: 'Open in editor' }).getAttribute('href'),
    ).toBe(`/studio/sessions/${s.id}/items/q1`);
  });

  it('undoes one item, behind its menu and a confirmation, as a turn by the Educator', async () => {
    const s = await open({ turns: [turnOne] });
    await ready(s);
    await waitFor(() => expect(s.agent.start).toHaveBeenCalled());
    pick(/^1\.1 · Lesson l1/);
    fireEvent.click(within(detail()).getByRole('button', { name: 'More for 1.1 · Lesson l1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Undo this item' }));
    const dialog = screen.getByRole('dialog', { name: 'Undo this item?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(detail()).getByRole('button', { name: 'More for 1.1 · Lesson l1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Undo this item' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Undo this item?' })).getByRole('button', {
        name: 'Undo this item',
      }),
    );
    expect(
      await screen.findByText(
        '1.1 · Lesson l1 is back as it is in the draft. Undo it from the chat if you change your mind.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('5 changes · 0 viewed')).toBeTruthy();
    const turns = s.disk().turns;
    expect(turns.map((t) => [t.by, t.summary, t.changes])).toEqual([
      ['agent', 'Turn 1', 6],
      ['educator', 'Put back 1.1 · Lesson l1 as it is in the draft', 1],
    ]);
    expect((s.disk().work.course.chapters[0]?.items[0] as Lesson).blocks).toEqual(L1_BLOCKS);
  });

  it('says why an item cannot be put back', async () => {
    const s = await open({
      turns: [
        (w) =>
          change(w, (c) => {
            c.chapters.push({ id: 'p3', title: 'New', items: [lesson('n2') as Lesson] });
          }),
      ],
    });
    await ready(s);
    pick(/^3 · New/);
    fireEvent.click(within(detail()).getByRole('button', { name: 'More for 3 · New' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Undo this item' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Undo this item' }),
    );
    expect(
      await screen.findByText(
        'This chapter still holds lessons. Undo those first, then the chapter.',
      ),
    ).toBeTruthy();
    expect(s.disk().turns).toHaveLength(1);
  });

  it('refuses to put back what would leave the course invalid', async () => {
    const s = await open({
      turns: [
        (w) =>
          change(w, (c) => {
            // Chapter 1 goes, and 29 come: putting it back would make 31, one over the limit.
            c.chapters.shift();
            for (let i = 0; i < 29; i += 1)
              c.chapters.push({ id: `x${i}`, title: `X ${i}`, items: [] });
          }),
      ],
    });
    await ready(s);
    pick(/^Basics: removed/);
    fireEvent.click(within(detail()).getByRole('button', { name: 'More for Basics' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Undo this item' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Undo this item' }),
    );
    expect(
      await screen.findByText(
        'Putting this back would leave the course invalid, so nothing changed. Ask the agent instead.',
      ),
    ).toBeTruthy();
    expect(s.disk().turns).toHaveLength(1);
  });

  it('says so when the undo could not be written', async () => {
    const s = await open({ turns: [turnOne] });
    await ready(s);
    await act(async () => {
      await Promise.resolve();
    });
    vi.mocked(s.desktop.store.write).mockRejectedValue(new Error('disk full'));
    fireEvent.click(within(detail()).getByRole('button', { name: 'More for Course details' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Undo this item' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Undo this item' }),
    );
    expect(await screen.findByText('That could not be put back. Try again.')).toBeTruthy();
  });

  it('waits for the agent to finish before Undo this item', async () => {
    const s = await open({ turns: [turnOne] });
    await ready(s);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'More for Course details' })).toBeTruthy(),
    );
    // A turn running: from the chat.
    fireEvent.click(screen.getByRole('link', { name: 'Back to the chat' }));
    const box = (await screen.findByRole('textbox', {
      name: 'Ask for a change',
    })) as HTMLTextAreaElement;
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy());
    fireEvent.change(box, { target: { value: 'Go on.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(s.agent.send).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('link', { name: 'Review' }));
    await screen.findByText('6 changes · 0 viewed');
    fireEvent.click(within(detail()).getByRole('button', { name: 'More for Course details' }));
    const item = screen.getByRole('menuitem', { name: /Undo this item/ });
    expect(
      item.getAttribute('aria-disabled') ?? (item as HTMLButtonElement).disabled.toString(),
    ).toBe('true');
    expect(item.textContent).toContain('Wait for the agent to finish');
  });

  it('edits the summary and ticks goals, saved to the session file', async () => {
    const s = await open({
      turns: [turnOne],
      edit: (x) => ({ ...x, summary: '', goals: [{ text: 'Simplify chapter one', done: false }] }),
    });
    await ready(s);
    expect(screen.getByText('The agent has not written a summary yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Simplify chapter one (not done yet)' }));
    await waitFor(() =>
      expect(s.disk().goals).toEqual([{ text: 'Simplify chapter one', done: true }]),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit summary' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: 'Summary' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit summary' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Summary' }), {
      target: { value: '  Rewrote chapter one.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save summary' }));
    expect(await screen.findByText('Rewrote chapter one.')).toBeTruthy();
    expect(s.disk().summary).toBe('Rewrote chapter one.');
    // A write that fails keeps the box open with what was typed.
    vi.mocked(s.desktop.store.write).mockRejectedValueOnce(new Error('disk full'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit summary' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Summary' }), {
      target: { value: 'Lost?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save summary' }));
    await waitFor(() =>
      expect(log.warn).toHaveBeenCalledWith('Session review not saved', expect.anything()),
    );
    expect((screen.getByRole('textbox', { name: 'Summary' }) as HTMLTextAreaElement).value).toBe(
      'Lost?',
    );
  });

  it('says there is nothing to review yet, with the way back to the chat', async () => {
    const s = await open();
    expect(await screen.findByRole('heading', { name: 'Nothing has changed yet' })).toBeTruthy();
    expect(screen.getByText('0 changes · 0 viewed')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Show' })).toBeNull();
    expect(screen.getByText('Left for you: 0', { selector: '.ss-review__left' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Save 0 changes to draft' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText('Nothing has changed yet.')).toBeTruthy();
    const keep = screen.getAllByRole('link', { name: 'Keep working' });
    expect(keep[0]?.getAttribute('href')).toBe(`/studio/sessions/${s.id}`);
  });

  it('shows a closed session to read, with nothing to change', async () => {
    await open({ turns: [turnOne], edit: (x) => ({ ...x, status: 'saved' }) });
    expect(await screen.findByText('6 changes · 0 viewed')).toBeTruthy();
    expect(within(detail()).getByRole('checkbox', { name: 'Viewed' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.queryByRole('button', { name: 'Edit summary' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ask for a change' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^More for/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open in editor' })).toBeNull();
  });

  it('offers only Inline below 1024px', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: !query.includes('64rem'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const s = await open({ turns: [turnOne] });
    await ready(s);
    expect(within(detail()).queryByRole('button', { name: 'Side by side' })).toBeNull();
    expect(
      within(detail()).getByRole('button', { name: 'Inline' }).getAttribute('aria-pressed'),
    ).toBe('true');
    // Ask for a change opens the chat's drawer.
    fireEvent.click(within(detail()).getByRole('button', { name: 'Ask for a change' }));
    expect(await screen.findByRole('dialog', { name: 'Chat' })).toBeTruthy();
  });

  it('falls back to Inline when the window narrows below 1024px', async () => {
    let wide = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        get matches() {
          return query.includes('64rem') ? wide : true;
        },
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      })),
    );
    const s = await open({ turns: [turnOne] });
    await ready(s);
    expect(
      within(detail()).getByRole('button', { name: 'Side by side' }).getAttribute('aria-pressed'),
    ).toBe('true');
    act(() => {
      wide = false;
      for (const listener of listeners) listener();
    });
    expect(within(detail()).queryByRole('button', { name: 'Side by side' })).toBeNull();
    expect(
      within(detail()).getByRole('button', { name: 'Inline' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('shows a turn’s own change even when a later turn took it back', async () => {
    const rename = (title: string) => (w: Working) =>
      change(w, (c) => ((chapterOf(c, 'p2').items[0] as Lesson).title = title));
    const s = await open({
      turns: [rename('Renamed'), rename('Lesson l3')],
      edit: (x) => ({ ...x, goals: [] }),
      path: (id) => `/studio/sessions/${id}/review?turn=t1`,
    });
    expect(await screen.findByText('1 change · 0 viewed')).toBeTruthy();
    await ready(s);
    expect(within(detail()).getByRole('heading', { name: '2.1 · Renamed' })).toBeTruthy();
    // Against the draft it is unchanged, so there is nothing to put back; asking still attaches it.
    expect(within(detail()).queryByRole('button', { name: /^More for/ })).toBeNull();
    expect(within(detail()).getByRole('button', { name: 'Ask for a change' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Goals' })).toBeNull();
  });

  it('ticks one goal of several, leaving the others', async () => {
    const s = await open({
      turns: [turnOne],
      edit: (x) => ({
        ...x,
        goals: [
          { text: 'One', done: false },
          { text: 'Two', done: true },
        ],
      }),
    });
    await ready(s);
    fireEvent.click(screen.getByRole('checkbox', { name: 'One (not done yet)' }));
    await waitFor(() =>
      expect(s.disk().goals).toEqual([
        { text: 'One', done: true },
        { text: 'Two', done: true },
      ]),
    );
  });

  it('shows an empty lesson as a learner, and a lesson removed from a new course', async () => {
    const s = await open({
      kind: 'new',
      turns: [
        (w) =>
          change(w, (c) => {
            c.chapters = [
              { id: 'p1', title: 'Basics', items: [lesson('l1', { blocks: [] }) as Lesson] },
            ];
          }),
        (w) => change(w, (c) => (c.chapters[0] as Course['chapters'][number]).items.pop()),
      ],
      path: (id) => `/studio/sessions/${id}/review?turn=t1`,
    });
    expect(await screen.findByText('2 changes · 0 viewed')).toBeTruthy();
    await ready(s);
    pick(/^1\.1 · Lesson l1/);
    expect(within(detail()).getByText('This lesson is empty.')).toBeTruthy();
    choose(screen.getByRole('combobox', { name: 'Show' }), 'Turn 2 · 1 change');
    expect(await screen.findByText('1 change · 0 viewed')).toBeTruthy();
    expect(
      within(detail()).getByText('This lesson is not in the course after you save.'),
    ).toBeTruthy();
  });

  it('a new course: everything added, nothing to put back', async () => {
    const s = await open({
      kind: 'new',
      turns: [
        (w) =>
          change(w, (c) => {
            c.chapters = [{ id: 'p1', title: 'Basics', items: [lesson('l1') as Lesson] }];
          }),
      ],
    });
    expect(await screen.findByText('A new course: everything in it is added.')).toBeTruthy();
    await ready(s);
    // Nothing to compare with: the list is the outline, and a row shows what it holds.
    expect(screen.getByRole('region', { name: 'Outline' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Changes' })).toBeNull();
    // It opens on the first lesson, as a learner sees it, with no view to pick.
    expect(within(detail()).getByRole('heading', { name: /^1\.1 · Lesson l1/ })).toBeTruthy();
    expect(within(detail()).getByText('Body of l1')).toBeTruthy();
    expect(within(detail()).queryByRole('button', { name: 'Inline' })).toBeNull();
    expect(within(detail()).queryByRole('button', { name: /^More for/ })).toBeNull();
    // The course details show what they hold, with no Side by side to pick (1024px wide).
    pick(/^Course details/);
    expect(within(detail()).getByRole('heading', { name: 'Course details' })).toBeTruthy();
    expect(within(detail()).queryByRole('button', { name: 'Side by side' })).toBeNull();
    expect(within(detail()).queryByRole('button', { name: 'Inline' })).toBeNull();
  });

  it('a new course’s turn is still a difference: its first turn compares with the blank course', async () => {
    const s = await open({
      kind: 'new',
      turns: [
        (w) =>
          change(w, (c) => {
            c.title = 'Code review';
          }),
      ],
      path: (id) => `/studio/sessions/${id}/review?turn=t1`,
    });
    expect(await screen.findByText('1 change · 0 viewed')).toBeTruthy();
    await ready(s);
    expect(screen.getByRole('region', { name: 'Outline' })).toBeTruthy();
    expect(within(detail()).getByRole('button', { name: 'Inline' })).toBeTruthy();
  });
});

describe('Review’s checks', () => {
  const checks = () => screen.getByRole('region', { name: 'Checks' });

  it('passes what passes, and says what only informs', async () => {
    await open({ turns: [turnTwo] });
    expect(
      await within(await screen.findByRole('region', { name: 'Checks' })).findByText(
        'Course is valid',
      ),
    ).toBeTruthy();
    const c = checks();
    expect(within(c).getByText(/^Size \d+ KB of 900 KB$/)).toBeTruthy();
    expect(await within(c).findByText('Draft is up to date')).toBeTruthy();
    expect(within(c).getByText('Writing: no notes')).toBeTruthy();
    expect(await within(c).findByText('Answers: no Quiz questions changed')).toBeTruthy();
    expect(within(c).getByText('Ready to publish')).toBeTruthy();
    expect(within(c).getByText('Left for you: 0')).toBeTruthy();
    expect(c.querySelectorAll('.g-visually-hidden')[0]?.textContent).toBe('Passes: ');
    expect(await axeViolations(c)).toEqual([]);
  });

  it('lists writing notes on changed text, each linking to its row, and sends them to the agent', async () => {
    const s = await open({
      turns: [
        turnOne,
        (w) =>
          change(w, (c) => {
            (
              (chapterOf(c, 'p1').items[0] as Lesson).blocks[0] as Extract<
                Block,
                { type: 'markdown' }
              >
            ).md = 'In today’s fast-paced world we delve into rebasing.';
          }),
      ],
    });
    await ready(s);
    const c = checks();
    expect(within(c).getByText('Writing: 2 notes')).toBeTruthy();
    const notes = within(c).getByRole('list', { name: 'Writing notes' });
    expect(notes.textContent).toContain('is a worn phrase');
    fireEvent.click(
      within(notes).getAllByRole('button', { name: 'Show 1.1 · Lesson l1' })[0] as HTMLElement,
    );
    expect(within(detail()).getByRole('heading', { name: '1.1 · Lesson l1' })).toBeTruthy();
    fireEvent.click(within(c).getByRole('button', { name: 'Ask the agent to fix these' }));
    const box = (await screen.findByRole('textbox', {
      name: 'Ask for a change',
    })) as HTMLTextAreaElement;
    expect(box.value).toMatch(/^Review found writing notes in the attached parts/);
    expect(screen.getByRole('list', { name: /attached/i }).textContent).toContain(
      'Lesson 1.1 · Lesson l1',
    );
  });

  it('pages a long list of notes', async () => {
    const s = await open({
      turns: [
        (w) =>
          change(w, (c) => {
            (chapterOf(c, 'p1').items[0] as Lesson).blocks = Array.from({ length: 30 }, (_, i) => ({
              type: 'markdown' as const,
              id: `w${i}`,
              md: 'We leverage Git.',
            }));
          }),
      ],
    });
    await ready(s);
    const notes = within(checks()).getByRole('list', { name: 'Writing notes' });
    expect(within(notes).getAllByRole('listitem')).toHaveLength(25);
    fireEvent.click(within(checks()).getByRole('button', { name: 'Next' }));
    expect(within(notes).getAllByRole('listitem')).toHaveLength(5);
  });

  it('says what is left for the Educator, each to-do linking to its row', async () => {
    const s = await open({
      turns: [turnOne],
      edit: (x) => ({
        ...x,
        todos: [
          {
            id: 'a',
            text: 'Add a screenshot of the diff view',
            itemId: 'l1',
            done: false,
            createdAt: '2026-11-19T10:00:00.000Z',
          },
          { id: 'b', text: 'Check the slides', done: false, createdAt: '2026-11-19T10:00:00.000Z' },
          { id: 'c', text: 'Done already', done: true, createdAt: '2026-11-19T10:00:00.000Z' },
        ],
      }),
    });
    await ready(s);
    const c = checks();
    expect(within(c).getByText('Left for you: 2')).toBeTruthy();
    expect(screen.getByText('Left for you: 2', { selector: '.ss-review__left' })).toBeTruthy();
    const left = within(c).getByRole('list', { name: 'Left for you' });
    expect(left.textContent).toContain('Check the slides');
    expect(left.textContent).not.toContain('Done already');
    fireEvent.click(within(left).getByRole('button', { name: 'Show 1.1 · Lesson l1' }));
    expect(within(detail()).getByRole('heading', { name: '1.1 · Lesson l1' })).toBeTruthy();
  });

  it('points one finding at the landing page and one at the course details', async () => {
    const s = await open({
      turns: [
        (w) =>
          change(w, (c) => {
            c.description = '';
            c.summary = '';
          }),
      ],
    });
    await ready(s);
    const publish = within(checks()).getByRole('list', { name: 'Before publishing' });
    expect(within(publish).getByRole('button', { name: 'Show Landing page' })).toBeTruthy();
    expect(within(publish).getByRole('button', { name: 'Show Course details' })).toBeTruthy();
  });
});

describe('Review and the session’s editors together', () => {
  it('opens a lesson from Review in the editor on the working copy, and the edit comes back as a turn', async () => {
    const s = await open({ turns: [turnOne] });
    await ready(s);
    pick(/^1\.1 · Lesson l1/);
    fireEvent.click(within(detail()).getByRole('link', { name: 'Open in editor' }));

    // Studio's lesson editor, bound to the session: the working copy, not the stored draft.
    const title = (await screen.findByLabelText('Lesson title')) as HTMLInputElement;
    expect(screen.getByRole('heading', { level: 1, name: 'Lesson l1' })).toBeTruthy();
    expect(screen.getByText(/^In the session · saved/)).toBeTruthy();
    expect(screen.getByDisplayValue('Rebase before you open a pull request.')).toBeTruthy();
    // Only the page's one check of the stored draft, made when it opened.
    expect(s.studio.data.getDraft).toHaveBeenCalledTimes(1);

    fireEvent.change(title, { target: { value: 'Why rebase' } });
    fireEvent.click(screen.getByRole('link', { name: 'Session' }));
    await screen.findByRole('link', { name: 'Turn 2 · by hand · 1 change' });
    await waitFor(() => expect(s.disk().turns.map((t) => t.by)).toEqual(['agent', 'educator']));

    // Review lists the lesson under its new title, from both turns.
    fireEvent.click(screen.getByRole('link', { name: 'Review' }));
    expect(await within(list()).findByRole('button', { name: /^1\.1 · Why rebase/ })).toBeTruthy();
    expect(s.studio.data.saveDraft).not.toHaveBeenCalled();
  });

  it('opens a Quiz from Review in the Quiz builder on the working copy', async () => {
    const s = await open({ turns: [turnOne] });
    await ready(s);
    pick(/^2\.2 · Quiz I/);
    fireEvent.click(within(detail()).getByRole('link', { name: 'Open in editor' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Quiz I' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Question editor' })).toBeTruthy();
    // The option the first turn reworded: the session's copy is the one being edited.
    expect(screen.getByDisplayValue('B, rebased')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Session' }).getAttribute('href')).toBe(
      `/studio/sessions/${s.id}?item=quiz%3Aq1`,
    );
  });
});
