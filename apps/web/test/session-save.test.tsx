import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { blankCourse } from '@gurukul/schema';
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
import { apiFailure } from './studio-fixtures';

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
});

describe('a new course’s first save', () => {
  /** The draft `createCourse` writes for `code-review`, as Studio would read it. */
  const created = () =>
    draftDoc(
      blankCourse({
        id: 'code-review',
        title: 'Code review',
        level: 'foundation',
        theme: 'forest',
        educatorId: 'u1',
      }),
      { rev: 1, updatedBy: 'u1' },
    );

  /** A new-course session the agent titled "Code review" and gave one chapter. */
  const titled = (s: AuthoringSession): AuthoringSession => ({
    ...s,
    work: change(s.work as Working, (c) => {
      c.title = 'Code review';
      c.chapters = [{ id: 'p1', title: 'Basics', items: [] }];
    }),
  });

  const openNew = async (init: Parameters<typeof open>[0] = {}) => {
    const s = await open({ kind: 'new', edit: titled, drafts: [created()], ...init });
    await ready(s);
    return s;
  };

  const createButton = () => screen.getByRole('button', { name: 'Create course and save draft' });

  /** Opens Create the course and presses its Create course and save draft. */
  async function create(address?: string) {
    fireEvent.click(createButton());
    const form = await screen.findByRole('dialog', { name: 'Create the course' });
    if (address !== undefined)
      fireEvent.change(within(form).getByLabelText('Address'), { target: { value: address } });
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Create course and save draft' }));
    });
    return form;
  }

  it('asks for the title and address, creates the course, then saves its draft once', async () => {
    const s = await openNew();
    expect(
      within(checks()).getByText('Draft is up to date: a new course has no draft yet'),
    ).toBeTruthy();
    expect(s.studio.data.getDraft).not.toHaveBeenCalled();

    // The title comes from the session's course; the address from the title, with its warning.
    fireEvent.click(createButton());
    const form = await screen.findByRole('dialog', { name: 'Create the course' });
    expect(
      within(form).getByText(
        'Gurukul creates the course with this title and address, then saves this session’s 3 changes to its draft. Learners see nothing until you publish.',
      ),
    ).toBeTruthy();
    expect((within(form).getByLabelText('Title') as HTMLInputElement).value).toBe('Code review');
    expect((within(form).getByLabelText('Address') as HTMLInputElement).value).toBe('code-review');
    expect(within(form).getByText('Used in links, and it cannot change later.')).toBeTruthy();
    expect(await axeViolations(form)).toEqual([]);
    // Cancel creates nothing.
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Create the course' })).toBeNull();
    expect(s.studio.service.createCourse).not.toHaveBeenCalled();

    vi.mocked(s.studio.service.createCourse).mockResolvedValueOnce({ courseId: 'code-review' });
    await create();
    expect(
      await screen.findByText(
        'Created “Code review” and saved its draft as Draft v2. Learners see nothing until you publish.',
      ),
    ).toBeTruthy();
    expect(s.studio.service.createCourse).toHaveBeenCalledTimes(1);
    expect(s.studio.service.createCourse).toHaveBeenCalledWith({
      title: 'Code review',
      slug: 'code-review',
      level: 'foundation',
      theme: 'forest',
      duplicateFrom: null,
    });
    expect(s.studio.data.saveDraft).toHaveBeenCalledTimes(1);
    const [courseId, work, rev, uid] = vi.mocked(s.studio.data.saveDraft).mock.calls[0] ?? [];
    expect([courseId, rev, uid]).toEqual(['code-review', 1, 'u1']);
    expect((work as Working).course).toMatchObject({
      id: 'code-review',
      title: 'Code review',
      educatorIds: ['u1'],
      certificate: { title: 'Code review' },
    });
    // The session became an edit session on the course, and is closed as saved.
    await waitFor(() => expect(s.disk().status).toBe('saved'));
    expect(s.disk()).toMatchObject({ kind: 'edit', courseId: 'code-review', base: { rev: 1 } });
    expect(s.disk().work.course.id).toBe('code-review');
    const saved = screen.getByRole('region', { name: 'Saved to the draft' });
    expect(
      within(saved).getByRole('link', { name: 'Open the course editor' }).getAttribute('href'),
    ).toBe('/studio/courses/code-review');
    expect(log.error).not.toHaveBeenCalled();
  });

  it('says an address is taken and keeps the dialog open; another one goes on', async () => {
    const s = await openNew();
    vi.mocked(s.studio.service.createCourse).mockRejectedValueOnce(apiFailure('CRS_1002'));
    const form = await create();
    expect(await within(form).findByText('That address is taken')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Create the course' })).toBeTruthy();
    expect(s.studio.data.saveDraft).not.toHaveBeenCalled();
    expect(s.disk()).toMatchObject({ kind: 'new', courseId: null, base: null });
    // Typing clears it; a free address creates the course and saves it.
    fireEvent.change(within(form).getByLabelText('Address'), {
      target: { value: 'code-review-2' },
    });
    expect(within(form).queryByText('That address is taken')).toBeNull();
    vi.mocked(s.studio.service.createCourse).mockResolvedValueOnce({ courseId: 'code-review-2' });
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Create course and save draft' }));
    });
    await waitFor(() => expect(s.disk().status).toBe('saved'));
    expect(s.disk().courseId).toBe('code-review-2');
    expect(vi.mocked(s.studio.data.saveDraft).mock.calls[0]?.[0]).toBe('code-review-2');
  });

  it('says why the course was not created, in words, and logs it once', async () => {
    const s = await openNew();
    vi.mocked(s.studio.service.createCourse).mockRejectedValueOnce(new Error('internal detail'));
    const form = await create();
    expect(await within(form).findByText('Could not create the course. Try again.')).toBeTruthy();
    expect(within(form).getByText('The course was not created')).toBeTruthy();
    expect(screen.queryByText(/internal detail/)).toBeNull();
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith('Creating a course failed', expect.any(Error), {
      sessionId: s.id,
    });
    expect(s.disk().kind).toBe('new');
  });

  it('starts with an empty title while the course is still untitled', async () => {
    const s = await openNew({
      edit: (x) => ({
        ...x,
        work: change(x.work as Working, (c) => {
          c.chapters = [{ id: 'p1', title: 'Basics', items: [] }];
        }),
      }),
    });
    fireEvent.click(createButton());
    const form = await screen.findByRole('dialog', { name: 'Create the course' });
    expect((within(form).getByLabelText('Title') as HTMLInputElement).value).toBe('');
    const submit = within(form).getByRole('button', {
      name: 'Create course and save draft',
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    // Enter in a field does nothing while the title is missing, nor a second time while creating.
    const fields = submit.form as HTMLFormElement;
    fireEvent.submit(fields);
    expect(s.studio.service.createCourse).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Code review' } });
    let answer: (v: { courseId: string }) => void = () => undefined;
    vi.mocked(s.studio.service.createCourse).mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)),
    );
    fireEvent.submit(fields);
    fireEvent.submit(fields);
    expect(s.studio.service.createCourse).toHaveBeenCalledTimes(1);
    await act(async () => answer({ courseId: 'code-review' }));
    await waitFor(() => expect(s.disk().status).toBe('saved'));
  });

  it('offers the save again when the draft fails after the course was created, never creating it twice', async () => {
    const s = await openNew();
    vi.mocked(s.studio.service.createCourse).mockResolvedValueOnce({ courseId: 'code-review' });
    vi.mocked(s.studio.data.saveDraft).mockRejectedValueOnce(
      Object.assign(new Error('offline'), { code: 'unavailable' }),
    );
    await create();
    expect(
      await screen.findByText(
        'The course “Code review” was created, but its draft was not saved. Gurukul could not reach the server. Check the connection and try again; the session is kept on this computer.',
      ),
    ).toBeTruthy();
    // On this computer it is an edit session on the new course now, still open.
    expect(s.disk()).toMatchObject({
      kind: 'edit',
      courseId: 'code-review',
      status: 'open',
      base: { rev: 1 },
    });
    expect(log.error).toHaveBeenCalledWith('Session save to draft failed', expect.any(Error), {
      sessionId: s.id,
      courseId: 'code-review',
    });
    // Save is offered as an edit session's: against Draft v1, and the course is not created again.
    expect(screen.queryByRole('button', { name: 'Create course and save draft' })).toBeNull();
    await save(saveButton().textContent as string);
    await waitFor(() => expect(s.disk().status).toBe('saved'));
    expect(s.studio.service.createCourse).toHaveBeenCalledTimes(1);
    expect(s.studio.data.saveDraft).toHaveBeenCalledTimes(2);
    expect(vi.mocked(s.studio.data.saveDraft).mock.calls[1]?.slice(0, 3)).toEqual([
      'code-review',
      expect.anything(),
      1,
    ]);
  });

  it('notes the created course again when this computer could not, without creating it again', async () => {
    const s = await openNew();
    vi.mocked(s.studio.service.createCourse).mockResolvedValueOnce({ courseId: 'code-review' });
    // Neither `created.json` nor `session.json` can be written: only the runtime holds the course.
    s.desktop.store.write.mockRejectedValueOnce(REFUSED).mockRejectedValueOnce(REFUSED);
    await create();
    expect(
      await screen.findByText(
        'The course “Code review” was created, but this computer could not note it, so its draft was not saved. Save the draft again: the course is not created twice.',
      ),
    ).toBeTruthy();
    expect(s.disk()).toMatchObject({ kind: 'new', courseId: null });
    expect(s.studio.data.saveDraft).not.toHaveBeenCalled();

    // Leaving Review for the chat and coming back keeps the created course: the runtime holds it.
    fireEvent.click(screen.getAllByRole('link', { name: 'Keep working' })[0] as HTMLElement);
    fireEvent.click(await screen.findByRole('link', { name: 'Review' }));
    await screen.findByRole('region', { name: 'Checks' });
    expect(screen.queryByRole('button', { name: 'Create course and save draft' })).toBeNull();
    expect(
      screen.getByText(
        'The course “Code review” was created, but this computer could not note it, so its draft was not saved. Save the draft again: the course is not created twice.',
      ),
    ).toBeTruthy();

    // Save the draft notes it and saves, with no second createCourse and no dialog.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save the draft' }));
    });
    await waitFor(() => expect(s.disk().status).toBe('saved'));
    expect(screen.queryByRole('dialog', { name: 'Create the course' })).toBeNull();
    expect(s.studio.service.createCourse).toHaveBeenCalledTimes(1);
    expect(s.disk()).toMatchObject({ kind: 'edit', courseId: 'code-review' });
    expect(vi.mocked(s.studio.data.saveDraft).mock.calls[0]?.[0]).toBe('code-review');
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

  it('offers the merge again after Undo takes the merge back, and never saves over their draft', async () => {
    const s = await open({ turns: [mine], drafts: [stored(THEIRS)] });
    await ready(s);
    fireEvent.click(await screen.findByRole('button', { name: 'Bring in their changes' }));
    const merge = dialog('Bring in their changes');
    for (const region of ['Course details · Title', '1.1 · Why Git'])
      fireEvent.click(
        within(within(merge).getByRole('region', { name: region })).getByRole('radio', {
          name: 'Keep this session’s',
        }),
      );
    fireEvent.click(within(merge).getByRole('button', { name: 'Bring in their changes' }));
    await screen.findByText('Their changes are in. Review now compares with Draft v4.');

    // Undo, from the chat, takes back the merge and the base it moved to.
    await act(async () => {
      await s.app.router.navigate(`/studio/sessions/${s.id}`);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Undo turn 2' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Undo turn 2' }),
    );
    await waitFor(() => expect(s.disk().base?.rev).toBe(3));
    await act(async () => {
      await s.app.router.navigate(`/studio/sessions/${s.id}/review`);
    });
    expect(
      await screen.findByText(/^The draft was saved by Arjun on .+, after this session started\.$/),
    ).toBeTruthy();
    expect(saveButton().hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Bring in their changes first.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bring in their changes' })).toBeTruthy();
    expect(s.studio.data.saveDraft).not.toHaveBeenCalled();
  });

  it('reads the next session’s own draft when the page moves to another session in place', async () => {
    // Global search can open a session from a session page: the page stays mounted.
    const OTHER = makeCourse({ id: 'other', title: 'Other course' });
    const fake = fakeDesktop();
    const ids = ['sa', 'sb'];
    const store = createSessionStore({
      desktop: fake.desktop,
      uid: 'u1',
      newId: () => ids.shift() as string,
    });
    const drafts: Record<string, DraftDoc> = {
      // Session A's draft moved; session B's did not.
      git: stored(THEIRS),
      other: draftDoc(OTHER, { rev: 7, updatedBy: 'u1' }),
    };
    await store.start({ kind: 'edit', courseId: 'git', goal: 'A' }, async () =>
      stored(BASE, { rev: 3, updatedBy: 'u1' }),
    );
    await store.start(
      { kind: 'edit', courseId: 'other', goal: 'B' },
      async () => drafts.other as DraftDoc,
    );
    fakeAgent(fake.desktop);
    installDesktop(fake.desktop);
    const studio = fakeStudio({ courses: [{ live: GIT, draft: null }] });
    vi.mocked(studio.data.getDraft).mockImplementation(async (id) => drafts[id] ?? null);
    const app = await openApp('/studio/sessions/sa/review', {
      roles: ['educator'],
      studio,
      data: fakeData({ courses: [GIT, OTHER] }),
    });
    expect(await screen.findByText(/^The draft was saved by Arjun on /)).toBeTruthy();

    await act(async () => {
      await app.router.navigate('/studio/sessions/sb/review');
    });
    expect(await within(checks()).findByText('Draft is up to date')).toBeTruthy();
    expect(vi.mocked(studio.data.getDraft).mock.calls).toEqual([['git'], ['other']]);
    expect(screen.queryByText(/^The draft was saved by/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bring in their changes' })).toBeNull();
  });

  it('names the saver as you when it was saved from the browser', async () => {
    const s = await open({ turns: [mine], drafts: [stored(THEIRS, { updatedBy: 'u1' })] });
    await ready(s);
    expect(
      await screen.findByText(/^The draft was saved by you on .+, after this session started\.$/),
    ).toBeTruthy();
  });
});
