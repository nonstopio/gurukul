import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AuthoringSession, Chapter, Course, Lesson } from '@gurukul/schema';
import { courseChanges } from '@gurukul/schema/changes';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DraftConflictError } from '../src/studio/errors';
import { createSessionStore } from '../src/studio/session/store';
import type { DraftDoc, Working } from '../src/studio/types';
import { axeViolations } from './axe';
import { fakeData, makeCourse } from './fake-data';
import { fakeAgent, fakeDesktop, installDesktop, uninstallDesktop } from './fake-desktop';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
const { log } = await import('../src/log');

afterEach(() => {
  uninstallDesktop();
  vi.clearAllMocks();
});

const REFUSED = new Error('Error invoking remote method: Error: Not allowed');

/** Git, with Arjun as a second Educator. */
const GIT: Course = makeCourse({
  educatorIds: ['u1', 'u2'],
  educatorNames: { u1: 'Priya N', u2: 'Arjun' },
});
const KEYS = { q1: { k1: ['a'] } };

const chapterOf = (course: Course, id: string) =>
  course.chapters.find((c) => c.id === id) as Chapter;
const itemOf = (course: Course, id: string) =>
  course.chapters.flatMap((c) => c.items).find((i) => i.id === id) as Lesson;

/** A copy of `w` with `edit` applied to a clone of it. */
function change(w: Working, edit: (c: Course, answers: Working['answers']) => void): Working {
  const next = structuredClone(w);
  edit(next.course, next.answers);
  return next;
}

const BASE: Working = { course: GIT, answers: KEYS };

/** This session's turn: a new title, and lesson l1 renamed. */
const mine = (w: Working) =>
  change(w, (c) => {
    c.title = 'Git, plainly';
    itemOf(c, 'l1').title = 'Why Git';
  });

/** What Arjun saved meanwhile: another title and l1 name (conflicts), l3 and the description (not). */
const THEIRS = change(BASE, (c) => {
  c.title = 'Git for teams';
  c.description = 'Learn Git with your team.';
  itemOf(c, 'l1').title = 'Git first';
  itemOf(c, 'l3').title = 'History, short';
});

const stored = (work: Working, over: Partial<DraftDoc> = {}) =>
  draftDoc(work.course, {
    rev: 4,
    updatedBy: 'u2',
    updatedAt: new Date('2026-11-18T09:10:00Z'),
    answers: work.answers,
    ...over,
  });

let sessions = 0;

async function open(
  init: {
    turns?: ((w: Working) => Working)[];
    kind?: 'new' | 'edit';
    edit?: (s: AuthoringSession) => AuthoringSession;
    /** What `getDraft` answers, in order; the last one from then on. Draft v3 by default. */
    drafts?: (DraftDoc | null | Error)[];
    data?: ReturnType<typeof fakeData>;
    path?: (id: string) => string;
    /** The draft the session starts from, Draft v3: `BASE` by default. */
    base?: Working;
  } = {},
) {
  const start = init.base ?? BASE;
  sessions += 1;
  const id = `v${sessions}`;
  const fake = fakeDesktop();
  const store = createSessionStore({ desktop: fake.desktop, uid: 'u1', newId: () => id });
  const started = await store.start(
    init.kind === 'new'
      ? { kind: 'new', goal: 'A course on code review.' }
      : { kind: 'edit', courseId: 'git', goal: 'Simplify the basics.' },
    async () => stored(start, { rev: 3, updatedBy: 'u1' }),
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
  const agent = fakeAgent(fake.desktop);
  installDesktop(fake.desktop);
  const studio = fakeStudio({ courses: [{ live: GIT, draft: null }] });
  const answers = init.drafts ?? [stored(start, { rev: 3, updatedBy: 'u1' })];
  let read = 0;
  vi.mocked(studio.data.getDraft).mockImplementation(async () => {
    const next = answers[Math.min(read, answers.length - 1)] as DraftDoc | null | Error;
    read += 1;
    if (next instanceof Error) throw next;
    return next;
  });
  const app = await openApp(init.path?.(id) ?? `/studio/sessions/${id}/review`, {
    roles: ['educator'],
    studio,
    data: init.data ?? fakeData({ courses: [GIT] }),
  });
  const disk = () =>
    JSON.parse(fake.files.get(`u1/${id}/session.json`) as string) as AuthoringSession;
  return { ...fake, ...agent, store, app, id, studio, disk };
}

type Opened = Awaited<ReturnType<typeof open>>;

const ready = (s: Opened) => waitFor(() => expect(s.agent.start).toHaveBeenCalled());
const checks = () => screen.getByRole('region', { name: 'Checks' });
const saveButton = () => screen.getByRole('button', { name: /^Save \d+ changes? to draft$/ });
const dialog = (name: string) => screen.getByRole('dialog', { name });

/** Presses Save, then the confirmation's Save. */
async function save(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
  const confirm = await screen.findByRole('dialog', { name: 'Save to draft?' });
  fireEvent.click(within(confirm).getByRole('button', { name: label }));
}

describe('Save to draft', () => {
  it('checks the draft once, then writes it once through Studio’s save and shows what was saved', async () => {
    const s = await open({ turns: [mine] });
    await ready(s);
    expect(await within(checks()).findByText('Draft is up to date')).toBeTruthy();
    expect(s.studio.data.getDraft).toHaveBeenCalledTimes(1);
    expect(s.studio.data.getDraft).toHaveBeenCalledWith('git');

    // The confirmation names the draft it replaces; Cancel writes nothing.
    fireEvent.click(saveButton());
    const confirm = await screen.findByRole('dialog', { name: 'Save to draft?' });
    expect(
      within(confirm).getByText(
        'This replaces Draft v3 with this session’s version. Learners see nothing until you publish.',
      ),
    ).toBeTruthy();
    expect(await axeViolations(confirm)).toEqual([]);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(s.studio.data.saveDraft).not.toHaveBeenCalled();

    await save('Save 2 changes to draft');
    expect(
      await screen.findByText(
        'Saved 2 changes to Draft v4. Learners see nothing until you publish.',
      ),
    ).toBeTruthy();
    expect(s.studio.data.saveDraft).toHaveBeenCalledTimes(1);
    const [courseId, work, rev, uid] = vi.mocked(s.studio.data.saveDraft).mock.calls[0] ?? [];
    expect([courseId, rev, uid]).toEqual(['git', 3, 'u1']);
    expect((work as Working).course.title).toBe('Git, plainly');
    await waitFor(() => expect(s.disk().status).toBe('saved'));

    // What was saved, with the way on: the course editor and Studio's publish dialog.
    const saved = screen.getByRole('region', { name: 'Saved to the draft' });
    expect(
      within(saved).getByText(
        '2 changes saved to Draft v4. Learners see nothing until you publish. The changes are listed below as they were saved.',
      ),
    ).toBeTruthy();
    expect(
      within(saved).getByRole('link', { name: 'Open the course editor' }).getAttribute('href'),
    ).toBe('/studio/courses/git');
    // Closed: no Save, and the chat ends its agent.
    expect(screen.queryByRole('button', { name: /^Save \d+ changes? to draft$/ })).toBeNull();
    expect(
      within(checks()).getByText('Draft is up to date: not checked once a session is closed'),
    ).toBeTruthy();
    expect(s.agent.close).toHaveBeenCalledWith(s.id);
    expect(await axeViolations(document.body)).toEqual([]);

    fireEvent.click(within(saved).getByRole('button', { name: 'Publish…' }));
    const publish = await screen.findByRole('dialog', { name: 'Publish v2' });
    expect(s.app.data.data.getCourse).toHaveBeenCalledWith('git', { fresh: true });
    fireEvent.click(await within(publish).findByRole('button', { name: 'Change who can open' }));
    await waitFor(() => expect(s.app.router.state.location.pathname).toBe('/studio/courses/git'));
  });

  it('opens a saved session on what was saved, without reading the draft', async () => {
    const s = await open({
      turns: [mine],
      edit: (x) => ({ ...x, status: 'saved' }),
      data: fakeData({ courses: [{ ...GIT, version: 0 }] }),
    });
    const saved = await screen.findByRole('region', { name: 'Saved to the draft' });
    expect(within(saved).getByText(/^2 changes saved to Draft v4\./)).toBeTruthy();
    expect(s.studio.data.getDraft).not.toHaveBeenCalled();
    // A course never published opens the first publication.
    fireEvent.click(within(saved).getByRole('button', { name: 'Publish…' }));
    const publish = await screen.findByRole('dialog', { name: 'Publish v1' });
    fireEvent.click(within(publish).getByRole('button', { name: 'Publish v1' }));
    await waitFor(() =>
      expect(s.studio.service.publishCourse).toHaveBeenCalledWith({ courseId: 'git' }),
    );
    expect(await screen.findByText(/^Published v1\./)).toBeTruthy();
  });

  it('sends the landing page’s publish issues to the course editor’s Landing page tab', async () => {
    const s = await open({
      turns: [(w) => change(w, (c) => void (c.description = ''))],
      edit: (x) => ({ ...x, status: 'saved' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Publish…' }));
    const publish = await screen.findByRole('dialog', { name: 'Publish v2' });
    fireEvent.click(
      within(publish).getAllByRole('button', { name: 'Open the Landing page' })[0] as HTMLElement,
    );
    await waitFor(() => expect(s.app.router.state.location.search).toBe('?tab=landing'));
  });

  it('says when the course cannot be read for publishing', async () => {
    const data = fakeData({ courses: [GIT] });
    vi.mocked(data.data.getCourse).mockRejectedValueOnce(new Error('offline'));
    await open({ turns: [mine], edit: (x) => ({ ...x, status: 'saved' }), data });
    fireEvent.click(await screen.findByRole('button', { name: 'Publish…' }));
    expect(await screen.findByText(/The course could not be read|offline|Try again/)).toBeTruthy();
    expect(log.warn).toHaveBeenCalledWith('Course not read for publishing', { courseId: 'git' });
    expect(screen.queryByRole('dialog', { name: /^Publish v/ })).toBeNull();
  });

  it('waits, saying why: nothing changed, a check that stops it, a turn running', async () => {
    const s = await open();
    await ready(s);
    expect(saveButton().hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Nothing has changed yet.')).toBeTruthy();
    s.app.unmount();

    const t = await open({
      turns: [
        (w) =>
          change(w, (c) => {
            c.title = 'Git';
            itemOf(c, 'l1').blocks = Array.from({ length: 50 }, (_, i) => ({
              type: 'markdown' as const,
              id: `m${i}`,
              md: 'x'.repeat(20_000),
            }));
          }),
      ],
    });
    await ready(t);
    expect(
      await screen.findByText('The course is over the size limit. Make it smaller first.'),
    ).toBeTruthy();
    expect(saveButton().getAttribute('aria-describedby')).toBe('ss-save-wait');
  });

  it('waits for a turn to end', async () => {
    const s = await open({ turns: [mine] });
    await ready(s);
    act(() => s.emit({ type: 'text', sessionId: s.id, text: 'Working on it.' }));
    expect(await screen.findByText('Wait for the agent to finish this turn.')).toBeTruthy();
    expect(saveButton().hasAttribute('disabled')).toBe(true);
  });

  it('says so when a turn began between pressing Save and confirming it', async () => {
    const s = await open({ turns: [mine] });
    await ready(s);
    await within(checks()).findByText('Draft is up to date');
    fireEvent.click(saveButton());
    const confirm = await screen.findByRole('dialog', { name: 'Save to draft?' });
    act(() => s.emit({ type: 'text', sessionId: s.id, text: 'Working on it.' }));
    fireEvent.click(within(confirm).getByRole('button', { name: 'Save 2 changes to draft' }));
    expect(
      await screen.findByText(
        'Save could not start just now. Wait for the agent to finish, then try again.',
      ),
    ).toBeTruthy();
    expect(s.studio.data.saveDraft).not.toHaveBeenCalled();
  });

  it('keeps the session open and says why when the save fails, logging it once with ids', async () => {
    const s = await open({ turns: [mine] });
    await ready(s);
    await within(checks()).findByText('Draft is up to date');
    const failure = Object.assign(new Error('internal detail'), { code: 'unavailable' });
    vi.mocked(s.studio.data.saveDraft).mockRejectedValueOnce(failure);
    await save('Save 2 changes to draft');
    expect(
      await screen.findByText(
        'Gurukul could not reach the server. Check the connection and try again; the session is kept on this computer.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/internal detail/)).toBeNull();
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith('Session save to draft failed', failure, {
      sessionId: s.id,
      courseId: 'git',
    });
    expect(s.disk().status).toBe('open');
    expect(saveButton().hasAttribute('disabled')).toBe(false);
    // Trying again works.
    await save('Save 2 changes to draft');
    await waitFor(() => expect(s.disk().status).toBe('saved'));
  });

  it('says so when the draft is written but this computer cannot mark the session saved', async () => {
    const s = await open({ turns: [mine] });
    await ready(s);
    await within(checks()).findByText('Draft is up to date');
    s.desktop.store.write.mockRejectedValueOnce(REFUSED);
    await save('Save 2 changes to draft');
    expect(
      await screen.findByText(/^This computer could not mark the session as saved\./),
    ).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Saved to the draft' })).toBeTruthy();
  });

  it('leaves a new course to its first save, and does not read a draft', async () => {
    const s = await open({ kind: 'new' });
    await ready(s);
    expect(
      await screen.findByText('Creating the course and saving its draft comes next.'),
    ).toBeTruthy();
    expect(
      within(checks()).getByText('Draft is up to date: a new course has no draft yet'),
    ).toBeTruthy();
    expect(s.studio.data.getDraft).not.toHaveBeenCalled();
  });
});

describe('when the draft moved underneath', () => {
  it('brings their changes in through a choice per conflict, then saves against their draft', async () => {
    const s = await open({ turns: [mine], drafts: [stored(THEIRS)] });
    await ready(s);
    const notice = await screen.findByText(
      /^The draft was saved by Arjun on .+, after this session started\.$/,
    );
    expect(notice).toBeTruthy();
    expect(
      within(checks()).getByText('The draft moved since this session started · stops Save'),
    ).toBeTruthy();
    expect(saveButton().hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Bring in their changes first.')).toBeTruthy();
    // No way to save over it.
    expect(screen.queryByRole('button', { name: /save anyway/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Bring in their changes' }));
    const merge = dialog('Bring in their changes');
    expect(within(merge).getByText(/^In the draft, Arjun changed 4 things\./)).toBeTruthy();
    expect(within(merge).getByText('Changed on both sides: 2 choices to make')).toBeTruthy();
    const confirm = within(merge).getByRole('button', { name: 'Bring in their changes' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    expect(within(merge).getByText('Choose a side for 2 more things.')).toBeTruthy();

    // Each conflict shows both changes, as Review shows them.
    const title = within(merge).getByRole('region', { name: 'Course details · Title' });
    expect(
      within(title).getByText('This session and Arjun both changed it, differently.'),
    ).toBeTruthy();
    const ours = within(title).getByRole('group', {
      name: 'Course details · Title, this session’s change, before and after',
    });
    expect(ours.querySelector('ins')?.textContent).toBe('added: plainly');
    expect(
      within(title).getByRole('group', {
        name: 'Course details · Title, their change, before and after',
      }),
    ).toBeTruthy();
    const lesson = within(merge).getByRole('region', { name: '1.1 · Why Git' });
    expect(within(lesson).getByRole('heading', { name: 'This session’s change' })).toBeTruthy();
    expect(within(lesson).getByRole('heading', { name: 'Their change' })).toBeTruthy();
    expect(await axeViolations(merge)).toEqual([]);

    fireEvent.click(within(title).getByRole('radio', { name: 'Keep theirs' }));
    expect(within(merge).getByText('Choose a side for 1 more thing.')).toBeTruthy();
    fireEvent.click(within(lesson).getByRole('radio', { name: 'Keep this session’s' }));
    expect(confirm.hasAttribute('disabled')).toBe(false);
    fireEvent.click(confirm);

    expect(
      await screen.findByText('Their changes are in. Review now compares with Draft v4.'),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Bring in their changes' })).toBeNull();
    await waitFor(() => expect(s.disk().base?.rev).toBe(4));
    const disk = s.disk();
    expect(disk.work.course.title).toBe('Git for teams');
    expect(itemOf(disk.work.course as Course, 'l1').title).toBe('Why Git');
    expect(itemOf(disk.work.course as Course, 'l3').title).toBe('History, short');
    expect(disk.work.course.description).toBe('Learn Git with your team.');
    expect(disk.turns.at(-1)).toMatchObject({
      by: 'educator',
      summary: 'Brought in Draft v4, saved by Arjun',
    });
    // Review is drawn again against their draft, and Save is offered again.
    expect(within(checks()).getByText('Draft is up to date')).toBeTruthy();
    expect(screen.getByText(/^Compared with Draft v4/)).toBeTruthy();
    await save('Save 1 change to draft');
    await waitFor(() => expect(s.disk().status).toBe('saved'));
    expect(vi.mocked(s.studio.data.saveDraft).mock.calls[0]?.[2]).toBe(4);
    expect(s.studio.data.getDraft).toHaveBeenCalledTimes(1);
  });

  it('repeats the merge when the draft moves again before the save, keeping this session’s order', async () => {
    // Both reorder chapter 2, differently; theirs also renames l4.
    const reordered = (w: Working) =>
      change(mine(w), (c) => {
        const p2 = chapterOf(c, 'p2');
        p2.items = [p2.items[1], p2.items[0], p2.items[2]] as Chapter['items'];
      });
    const later = change(BASE, (c) => {
      const p2 = chapterOf(c, 'p2');
      p2.items = [p2.items[0], p2.items[2], p2.items[1]] as Chapter['items'];
      itemOf(c, 'l4').title = 'Their l4';
    });
    const s = await open({
      turns: [reordered],
      drafts: [stored(BASE, { rev: 3, updatedBy: 'u1' }), stored(later, { rev: 5 })],
    });
    await ready(s);
    await within(checks()).findByText('Draft is up to date');
    vi.mocked(s.studio.data.saveDraft).mockRejectedValueOnce(new DraftConflictError());
    await save('Save 3 changes to draft');

    expect(await screen.findByText(/^The draft was saved by Arjun on .+/)).toBeTruthy();
    expect(log.error).not.toHaveBeenCalled();
    expect(s.disk().status).toBe('open');
    fireEvent.click(screen.getByRole('button', { name: 'Bring in their changes' }));
    const merge = dialog('Bring in their changes');
    expect(
      within(merge).getByText('Nothing was changed on both sides, so there is nothing to choose.'),
    ).toBeTruthy();
    expect(
      within(merge).getByText(
        'Both changed the order in chapter 2 · History: this session’s order is kept.',
      ),
    ).toBeTruthy();
    fireEvent.click(within(merge).getByRole('button', { name: 'Bring in their changes' }));
    await waitFor(() => expect(s.disk().base?.rev).toBe(5));
    expect(itemOf(s.disk().work.course as Course, 'l4').title).toBe('Their l4');
    expect(chapterOf(s.disk().work.course as Course, 'p2').items.map((i) => i.id)).toEqual([
      'q1',
      'l3',
      'l4',
    ]);
    await save('Save 3 changes to draft');
    await waitFor(() => expect(s.disk().status).toBe('saved'));
    expect(vi.mocked(s.studio.data.saveDraft).mock.calls.map((c) => c[2])).toEqual([3, 5]);
  });

  it('says what to do when the draft moved and could not be read again', async () => {
    const s = await open({
      turns: [mine],
      drafts: [stored(BASE, { rev: 3, updatedBy: 'u1' }), new Error('offline'), stored(THEIRS)],
    });
    await ready(s);
    await within(checks()).findByText('Draft is up to date');
    vi.mocked(s.studio.data.saveDraft).mockRejectedValueOnce(new DraftConflictError());
    await save('Save 2 changes to draft');
    expect(
      await screen.findByText(
        'The draft was saved again meanwhile, and it could not be read. Check the draft again, then bring in their changes.',
      ),
    ).toBeTruthy();
    expect(within(checks()).getByText('Draft is up to date: could not be checked')).toBeTruthy();
    fireEvent.click(within(checks()).getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText(/^The draft was saved by Arjun/)).toBeTruthy();
  });

  it('checks again when the first read failed or found no draft', async () => {
    const s = await open({
      turns: [mine],
      drafts: [new Error('offline'), null, stored(BASE, { rev: 3, updatedBy: 'u1' })],
    });
    await ready(s);
    expect(
      await within(checks()).findByText('Draft is up to date: could not be checked'),
    ).toBeTruthy();
    expect(within(checks()).getByText('Save still checks it before it writes.')).toBeTruthy();
    expect(log.warn).toHaveBeenCalledWith('Session draft not checked', {
      sessionId: s.id,
      courseId: 'git',
    });
    // A failed check does not stop Save: its transaction checks the rev itself.
    expect(saveButton().hasAttribute('disabled')).toBe(false);
    fireEvent.click(within(checks()).getByRole('button', { name: 'Check again' }));
    expect(within(checks()).getByText('Draft is up to date: checking…')).toBeTruthy();
    await waitFor(() =>
      expect(log.warn).toHaveBeenCalledWith('Session draft not found', {
        sessionId: s.id,
        courseId: 'git',
      }),
    );
    fireEvent.click(within(checks()).getByRole('button', { name: 'Check again' }));
    expect(await within(checks()).findByText('Draft is up to date')).toBeTruthy();
  });

  it('refuses a merge that does not fit a course, and one this computer cannot keep', async () => {
    // This session fills the course to 30 chapters; their draft adds one more.
    const full = (w: Working) =>
      change(w, (c) => {
        for (let i = c.chapters.length; i < 30; i += 1)
          c.chapters.push({ id: `m${i}`, title: `Mine ${i}`, items: [] });
      });
    const theirs = change(BASE, (c) => {
      c.chapters.push({ id: 'their', title: 'Theirs', items: [] });
    });
    const s = await open({ turns: [full], drafts: [stored(theirs)] });
    await ready(s);
    fireEvent.click(await screen.findByRole('button', { name: 'Bring in their changes' }));
    const merge = dialog('Bring in their changes');
    fireEvent.click(within(merge).getByRole('button', { name: 'Bring in their changes' }));
    expect(
      await within(merge).findByText(/^Together the two versions do not fit a course/),
    ).toBeTruthy();
    expect(s.disk().base?.rev).toBe(3);
    s.app.unmount();

    const t = await open({
      turns: [mine],
      drafts: [stored(change(BASE, (c) => void (c.summary = 'Theirs.')))],
    });
    await ready(t);
    fireEvent.click(await screen.findByRole('button', { name: 'Bring in their changes' }));
    t.desktop.store.write.mockRejectedValueOnce(REFUSED);
    const again = dialog('Bring in their changes');
    fireEvent.click(within(again).getByRole('button', { name: 'Bring in their changes' }));
    expect(
      await within(again).findByText(
        'Their changes could not be brought in: this computer did not keep the session. Try again.',
      ),
    ).toBeTruthy();
    expect(t.disk().base?.rev).toBe(3);
    fireEvent.click(within(again).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Bring in their changes' })).toBeNull();
  });

  it('pages the choices, 25 at a time', async () => {
    const lessons = Array.from({ length: 26 }, (_, i) => ({
      type: 'lesson' as const,
      id: `x${i}`,
      title: `Lesson ${i}`,
      minutes: 1,
      layout: 'stacked' as const,
      completeWhen: 'manual' as const,
      blocks: [],
    }));
    const base = change(BASE, (c) => {
      c.chapters.push({ id: 'many', title: 'Many', items: lessons });
    });
    const retitle = (word: string) => (w: Working) =>
      change(w, (c) => {
        for (const item of chapterOf(c, 'many').items) item.title = `${item.title}, ${word}`;
      });
    const s = await open({
      base,
      turns: [retitle('mine')],
      drafts: [stored(retitle('theirs')(base))],
    });
    await ready(s);
    fireEvent.click(await screen.findByRole('button', { name: 'Bring in their changes' }));
    const merge = dialog('Bring in their changes');
    expect(within(merge).getByText('Changed on both sides: 26 choices to make')).toBeTruthy();
    const keepTheirs = () => within(merge).getAllByRole('radio', { name: 'Keep theirs' });
    expect(keepTheirs()).toHaveLength(25);
    for (const radio of keepTheirs()) fireEvent.click(radio);
    expect(within(merge).getByText('Choose a side for 1 more thing.')).toBeTruthy();
    const pages = within(merge).getByRole('navigation', { name: 'Choices, pages' });
    fireEvent.click(within(pages).getByRole('button', { name: /next/i }));
    expect(keepTheirs()).toHaveLength(1);
    fireEvent.click(keepTheirs()[0] as HTMLElement);
    fireEvent.click(within(merge).getByRole('button', { name: 'Bring in their changes' }));
    await waitFor(() => expect(s.disk().base?.rev).toBe(4));
    expect(chapterOf(s.disk().work.course as Course, 'many').items[25]?.title).toBe(
      'Lesson 25, theirs',
    );
  });

  it('waits for a running turn before bringing their changes in', async () => {
    const s = await open({ turns: [mine], drafts: [stored(THEIRS)] });
    await ready(s);
    await screen.findByText(/^The draft was saved by Arjun/);
    act(() => s.emit({ type: 'text', sessionId: s.id, text: 'Working on it.' }));
    const bring = await screen.findByRole('button', { name: 'Bring in their changes' });
    await waitFor(() => expect(bring.hasAttribute('disabled')).toBe(true));
    expect(screen.getAllByText('Wait for the agent to finish this turn.').length).toBeGreaterThan(
      0,
    );
  });

  it('names the saver as you when it was saved from the browser', async () => {
    const s = await open({ turns: [mine], drafts: [stored(THEIRS, { updatedBy: 'u1' })] });
    await ready(s);
    expect(
      await screen.findByText(/^The draft was saved by you on .+, after this session started\.$/),
    ).toBeTruthy();
  });
});
