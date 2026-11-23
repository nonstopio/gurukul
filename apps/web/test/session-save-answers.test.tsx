import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AuthoringSession, Course, Lesson, Question, Quiz } from '@gurukul/schema';
import { courseChanges } from '@gurukul/schema/changes';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionStore } from '../src/studio/session/store';
import type { DraftDoc, Working } from '../src/studio/types';
import { fakeData, makeCourse } from './fake-data';
import {
  fakeAgent,
  fakeAsk,
  fakeDesktop,
  flushPromises,
  installDesktop,
  uninstallDesktop,
} from './fake-desktop';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';

/*
 * Review's Save footer (`DSK-15`) and its Answers check (`DSK-18`) on one screen, against the real
 * runtime and store over the fake bridge: the second opinion never stops Save, whether it runs,
 * disagrees or fails, and bringing in a draft that moved asks again about every question the merge
 * changed (its words or its lessons), never showing an opinion on words the course no longer has.
 */

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

afterEach(() => {
  uninstallDesktop();
  vi.clearAllMocks();
});

const GIT: Course = makeCourse({
  educatorIds: ['u1', 'u2'],
  educatorNames: { u1: 'Priya N', u2: 'Arjun' },
});
const BASE: Working = { course: GIT, answers: { q1: { k1: ['a'] } } };

const items = (c: Course) => c.chapters.flatMap((ch) => ch.items);
const quizOf = (c: Course) => items(c).find((i) => i.id === 'q1') as Quiz;
const lessonOf = (c: Course, id: string) => items(c).find((i) => i.id === id) as Lesson;

function change(w: Working, edit: (c: Course, answers: Working['answers']) => void): Working {
  const next = structuredClone(w);
  edit(next.course, next.answers);
  return next;
}

/** This session's turn: k1 reworded (key A), and k2 added (key B). */
const mine = (w: Working) =>
  change(w, (c, answers) => {
    const quiz = quizOf(c);
    (quiz.questions[0] as Question).prompt = 'Which one is first?';
    quiz.questions.push({
      id: 'k2',
      kind: 'single',
      prompt: 'Which command rewrites history?',
      options: [
        { id: 'r', text: 'git rebase' },
        { id: 's', text: 'git status' },
      ],
      explanation: '',
    });
    answers.q1 = { k1: ['a'], k2: ['s'] };
  });

/** What Arjun saved meanwhile: lesson l3, in the Quiz's chapter, renamed. No conflict. */
const THEIRS = change(BASE, (c) => {
  lessonOf(c, 'l3').title = 'History, short';
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

async function open(drafts: DraftDoc[] = [stored(BASE, { rev: 3, updatedBy: 'u1' })]) {
  sessions += 1;
  const id = `w${sessions}`;
  const fake = fakeDesktop();
  const store = createSessionStore({ desktop: fake.desktop, uid: 'u1', newId: () => id });
  const started = await store.start({ kind: 'edit', courseId: 'git' }, async () =>
    stored(BASE, { rev: 3, updatedBy: 'u1' }),
  );
  if (started.status !== 'started') throw new Error('not started');
  const before = started.session.work as Working;
  const after = mine(before);
  await store.saveStart(id, before);
  await store.saveTurn(
    started.session,
    {
      id: 't1',
      at: '2026-11-19T10:00:00.000Z',
      by: 'agent',
      summary: 'Turn 1',
      checkpoint: 't1.json',
      changes: courseChanges(before, after).count,
    },
    after,
  );
  const agent = fakeAgent(fake.desktop);
  const asks = fakeAsk(fake.desktop);
  installDesktop(fake.desktop);
  const studio = fakeStudio({ courses: [{ live: GIT, draft: null }] });
  let read = 0;
  vi.mocked(studio.data.getDraft).mockImplementation(async () => {
    const next = drafts[Math.min(read, drafts.length - 1)] as DraftDoc;
    read += 1;
    return next;
  });
  await openApp(`/studio/sessions/${id}/review`, {
    roles: ['educator'],
    studio,
    data: fakeData({ courses: [GIT] }),
  });
  await waitFor(() => expect(agent.agent.start).toHaveBeenCalled());
  const disk = () =>
    JSON.parse(fake.files.get(`u1/${id}/session.json`) as string) as AuthoringSession;
  return { ...fake, ...agent, ...asks, id, studio, disk };
}

const checks = () => screen.getByRole('region', { name: 'Checks' });
const saveButton = () => screen.getByRole('button', { name: /^Save \d+ changes? to draft$/ });

describe('Save and the answer check on one Review', () => {
  it('keeps Save open while the answer check runs, disagrees or fails, and saves once', async () => {
    const s = await open();
    expect(await within(checks()).findByText('Draft is up to date')).toBeTruthy();
    await waitFor(() => expect(s.waiting()).toHaveLength(2));
    expect(await within(checks()).findByText('Answers: 0 of 2 checked')).toBeTruthy();
    // Running: Save is there to press, with no reason to wait.
    expect(saveButton().hasAttribute('disabled')).toBe(false);

    s.reply(['B'], 'Which one is first?', 'The lesson says B.');
    s.answer({ ok: false, error: { code: 'timeout' } }, 'rewrites history');
    await flushPromises();
    expect(await within(checks()).findByText('Answers: 1 answer to check')).toBeTruthy();
    expect(screen.getAllByText('Check this answer').length).toBeGreaterThan(0);
    expect(within(checks()).getByRole('button', { name: 'Try again' })).toBeTruthy();
    // A disagreement and a failure only inform.
    expect(saveButton().hasAttribute('disabled')).toBe(false);

    fireEvent.click(saveButton());
    const confirm = await screen.findByRole('dialog', { name: 'Save to draft?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Save 1 change to draft' }));
    await waitFor(() => expect(s.disk().status).toBe('saved'));
    expect(s.studio.data.saveDraft).toHaveBeenCalledTimes(1);
    expect(vi.mocked(s.studio.data.saveDraft).mock.calls[0]?.[2]).toBe(3);
    // A saved session asks nothing more, and offers no Try again.
    expect(within(checks()).queryByRole('button', { name: 'Try again' })).toBeNull();
    await flushPromises();
    expect(s.ask).toHaveBeenCalledTimes(2);
  });

  it('asks again about the questions a merge changed, and drops an opinion on the old words', async () => {
    const s = await open([stored(THEIRS)]);
    expect(await screen.findByText('Bring in their changes first.')).toBeTruthy();
    await waitFor(() => expect(s.waiting()).toHaveLength(2));
    expect(s.waiting().every((p) => p.includes('## Lesson l3'))).toBe(true);
    s.reply(['A'], 'Which one is first?');
    s.reply(['B'], 'rewrites history');
    await flushPromises();
    expect(await within(checks()).findByText('Answers: 2 checked, all agree')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Bring in their changes' }));
    const merge = screen.getByRole('dialog', { name: 'Bring in their changes' });
    fireEvent.click(within(merge).getByRole('button', { name: 'Bring in their changes' }));
    expect(
      await screen.findByText('Their changes are in. Review now compares with Draft v4.'),
    ).toBeTruthy();

    // Arjun's lesson is in both questions' prompts now: the opinions on the old words are gone,
    // and each question is asked again, in the merged words.
    await waitFor(() => expect(s.ask).toHaveBeenCalledTimes(4));
    expect(s.waiting().every((p) => p.includes('## History, short'))).toBe(true);
    expect(within(checks()).getByText('Answers: 0 of 2 checked')).toBeTruthy();
    expect(within(checks()).getByText('Draft is up to date')).toBeTruthy();
    expect(saveButton().hasAttribute('disabled')).toBe(false);

    s.reply(['B'], 'Which one is first?');
    s.reply(['B'], 'rewrites history');
    await flushPromises();
    expect(await within(checks()).findByText('Answers: 1 answer to check')).toBeTruthy();
    expect(saveButton().hasAttribute('disabled')).toBe(false);
  });

  it('cancels the asks a merge made stale while they ran', async () => {
    const s = await open([stored(THEIRS)]);
    await waitFor(() => expect(s.waiting()).toHaveLength(2));
    const stale = s.ask.mock.calls.map((c) => c[0].askId);

    fireEvent.click(await screen.findByRole('button', { name: 'Bring in their changes' }));
    const merge = screen.getByRole('dialog', { name: 'Bring in their changes' });
    fireEvent.click(within(merge).getByRole('button', { name: 'Bring in their changes' }));
    await screen.findByText('Their changes are in. Review now compares with Draft v4.');

    await waitFor(() => expect(s.cancelAsk.mock.calls.map((c) => c[0])).toEqual(stale));
    await waitFor(() => expect(s.waiting()).toHaveLength(2));
    expect(s.waiting().every((p) => p.includes('## History, short'))).toBe(true);
    // Cancelled is not a failure: nothing says a question could not be checked.
    expect(within(checks()).getByText('Answers: 0 of 2 checked')).toBeTruthy();
    expect(saveButton().hasAttribute('disabled')).toBe(false);
  });
});
