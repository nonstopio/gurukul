import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Course, CourseStats } from '@gurukul/schema';
import { DraftConflictError } from '../src/studio/errors';
import type { DraftDoc } from '../src/studio/types';
import { log } from '../src/log';
import { axeViolations } from './axe';
import { fakeConsole } from './fake-console';
import { fakeData, lesson, makeCourse } from './fake-data';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';
import { apiFailure } from './studio-fixtures';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { ERROR_CODES } from '@gurukul/schema';
const ROLLBACK_MISSING = ERROR_CODES.CRS_2002.userMessage;
const KEYS = { q1: { k1: ['a'] } };
const mine = (over: Partial<Course> = {}) =>
  makeCourse({ acharyaIds: ['u1'], version: 3, ...over });

interface Setup {
  live?: Course;
  draft?: Course | null;
  roles?: Array<'acharya' | 'kulapati'>;
  versions?: Array<{ version: number; publishedAt: Date | null; title: string }>;
  consoleApi?: ReturnType<typeof fakeConsole>;
  getCourse?: ReturnType<typeof fakeData>;
}

async function open(s: Setup = {}) {
  const live = s.live ?? mine();
  const draft = s.draft === undefined ? live : s.draft;
  const studio = fakeStudio({
    draft: draft ? draftDoc(draft, { rev: 5, answers: KEYS }) : null,
    versions: s.versions ?? [],
  });
  const data = s.getCourse ?? fakeData({ courses: [live] });
  const app = await openApp(`/studio/courses/${live.id}`, {
    roles: s.roles ?? ['acharya'],
    studio,
    data,
    console: s.consoleApi ?? fakeConsole(),
  });
  return { ...app, studio, learner: data, live };
}

const titles = () =>
  screen
    .getAllByRole('link')
    .map((l) => l.textContent)
    .filter((t) => /^(Lesson|Pariksha) /.test(t ?? ''));
const ready = () => screen.findByRole('tab', { name: 'Structure' });

describe('Course editor: who and what loads', () => {
  it('says when the course does not exist, or did not load', async () => {
    const empty = fakeData({ courses: [] });
    await openApp('/studio/courses/nope', { roles: ['acharya'], data: empty });
    expect(await screen.findByRole('heading', { name: 'This course does not exist' })).toBeTruthy();
    const broken = fakeData();
    broken.data.getCourse = vi.fn().mockRejectedValue(new Error('x'));
    await openApp('/studio/courses/git', { roles: ['acharya'], data: broken });
    expect(await screen.findAllByText('This did not load')).not.toHaveLength(0);
  });

  it('shows a view-only notice to an Acharya who may not edit, but not to a Kulapati', async () => {
    const other = mine({ acharyaIds: ['someone'] });
    const view = await open({ live: other });
    expect(await screen.findByText('View only')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Structure' })).toBeNull();
    expect(view.studio.data.getDraft).not.toHaveBeenCalled();
    expect(await axeViolations(document.body)).toEqual([]);
    await open({ live: other, roles: ['kulapati'] });
    expect(await ready()).toBeTruthy();
  });

  it('shows loading, missing and failed drafts', async () => {
    const view = await open({ draft: null });
    expect(
      await screen.findByRole('heading', { name: 'There is no draft for this course' }),
    ).toBeTruthy();
    expect(view.studio.data.getDraft).toHaveBeenCalled();
    const live = mine();
    const studio = fakeStudio();
    let release: (v: null) => void = () => {};
    studio.data.getDraft = vi.fn(() => new Promise<DraftDoc | null>((r) => (release = r)));
    await openApp('/studio/courses/git', {
      roles: ['acharya'],
      studio,
      data: fakeData({ courses: [live] }),
    });
    expect(await screen.findByText('Loading the draft')).toBeTruthy();
    await act(async () => release(null));
    studio.data.getDraft = vi.fn().mockRejectedValue(new Error('x'));
    await openApp('/studio/courses/git', {
      roles: ['acharya'],
      studio,
      data: fakeData({ courses: [live] }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(studio.data.getDraft).toHaveBeenCalledTimes(2);
  });
});

describe('Course editor: the shell', () => {
  it('shows the live version, save state, preview and publish', async () => {
    await open();
    await ready();
    expect(screen.getByRole('heading', { level: 1, name: 'Git, the NonStop Way' })).toBeTruthy();
    expect(screen.getByText('Live: v3')).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Vyasa Studio/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Preview as learner' }).getAttribute('href')).toBe(
      '/studio/courses/git/preview/l1',
    );
    expect(screen.getByRole('button', { name: 'Publish v4' })).toBeTruthy();
    expect(
      screen.getByText('Learners on v3 keep their progress — matched by lesson id.'),
    ).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('handles a never-published, empty course', async () => {
    await open({ live: mine({ version: 0, status: 'draft', parvas: [], title: '' }) });
    await ready();
    expect(screen.getByText('Not published')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publish v1' })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Preview as learner' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole('heading', { level: 1, name: 'Untitled course' })).toBeTruthy();
    expect(screen.getByText('Start with a parva')).toBeTruthy();
    expect(screen.getByText(/Learners keep their progress by lesson id/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add parva' }));
    expect(screen.getByRole('textbox', { name: 'Title of parva 1' })).toBeTruthy();
    expect(screen.getByText('Nothing here yet.')).toBeTruthy();
  });
});

describe('Course editor: deleting a lesson learners may have completed', () => {
  const askToDelete = (name: string) =>
    fireEvent.click(screen.getByRole('button', { name: `Delete ${name}` }));

  it('says how many learners completed a published lesson', async () => {
    const { studio } = await open();
    await ready();
    vi.mocked(studio.data.completedCount).mockResolvedValueOnce(12);
    askToDelete('Lesson l1');
    expect(await screen.findByText(/12 learners have completed it; they keep their/)).toBeTruthy();
    expect(studio.data.completedCount).toHaveBeenCalledWith('git', 'l1');
  });

  it('uses the singular for one learner and says nothing extra for none', async () => {
    const { studio } = await open();
    await ready();
    vi.mocked(studio.data.completedCount).mockResolvedValueOnce(1);
    askToDelete('Lesson l1');
    expect(await screen.findByText(/1 learner has completed it; they keep/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep it' }));
    askToDelete('Lesson l2');
    await waitFor(() => expect(studio.data.completedCount).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/Learners who completed it keep their progress/)).toBeTruthy();
  });

  it('does not count a lesson that was never published, or a Pariksha', async () => {
    const { studio } = await open({
      draft: mine({ version: 3, parvas: [{ id: 'p1', title: 'Basics', items: [lesson('new1')] }] }),
      live: mine(),
    });
    await ready();
    askToDelete('Lesson new1');
    expect(studio.data.completedCount).not.toHaveBeenCalled();
  });

  it('still lets the Acharya delete when the count cannot be read', async () => {
    const { studio } = await open();
    await ready();
    vi.mocked(studio.data.completedCount).mockRejectedValueOnce(new Error('offline'));
    askToDelete('Lesson l1');
    await waitFor(() =>
      expect(log.warn).toHaveBeenCalledWith('Counting lesson completions failed', {
        courseId: 'git',
      }),
    );
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('link', { name: 'Lesson l1' })).toBeNull();
  });

  it('ignores a count that arrives after the dialog moved on', async () => {
    const { studio } = await open();
    await ready();
    let late: (n: number) => void = () => {};
    vi.mocked(studio.data.completedCount).mockReturnValueOnce(new Promise((r) => (late = r)));
    askToDelete('Lesson l1');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep it' }));
    await act(async () => late(9));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Course editor: structure', () => {
  it('renames, adds and deletes parvas, items; collapses', async () => {
    await open();
    await ready();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title of parva 1' }), {
      target: { value: 'Start' },
    });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole('button', { name: '+ Lesson in parva 1' })[0] as HTMLElement,
    );
    expect(screen.getByRole('link', { name: 'Untitled lesson' }).getAttribute('href')).toMatch(
      /^\/studio\/courses\/git\/lessons\/lesson-/,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Pariksha in parva 1' }));
    expect(screen.getByRole('link', { name: 'Untitled Pariksha' }).getAttribute('href')).toMatch(
      /pariksha\/pariksha-/,
    );
    expect(screen.getByText('0 questions')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add parva' }));
    expect(screen.getAllByText(/^Parva \d$/)).toHaveLength(3);
    // collapse and expand
    const collapse = screen.getAllByRole('button', { name: /^Collapse parva 1/ })[0] as HTMLElement;
    fireEvent.click(collapse);
    expect(screen.queryByRole('textbox', { name: 'Title of parva 1' })).toBeNull();
    expect(screen.getByText('Start', { selector: '.sc-parva__title' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Expand parva 1/ }));
    expect(screen.getByRole('textbox', { name: 'Title of parva 1' })).toBeTruthy();
    // delete an item
    fireEvent.click(screen.getByRole('button', { name: 'Delete Lesson l1' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this item?' });
    expect(within(dialog).getByText(/will be removed from the draft/)).toBeTruthy();
    expect(within(dialog).getByText(/keep their progress record/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(screen.getByRole('link', { name: 'Lesson l1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Lesson l1' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('link', { name: 'Lesson l1' })).toBeNull();
    // delete a parva with items, then an empty one
    fireEvent.click(screen.getByRole('button', { name: 'Delete parva History' }));
    expect(
      within(screen.getByRole('dialog')).getByText(/and its 3 items will be removed/),
    ).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('link', { name: 'Pariksha I' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete parva New parva' }));
    expect(
      within(screen.getByRole('dialog')).getByText(/^“New parva” will be removed/),
    ).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('textbox', { name: 'Title of parva 2' })).toBeNull();
  });

  it('labels empty titles and a single item', async () => {
    await open({
      live: mine({ parvas: [{ id: 'p1', title: '', items: [lesson('l1', { title: '' })] }] }),
    });
    await ready();
    expect(screen.getByRole('button', { name: 'Delete parva Untitled parva' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Untitled' })).toBeTruthy();
    expect(screen.getByText('1 item · 5 min')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete parva Untitled parva' }));
    expect(
      within(screen.getByRole('dialog')).getByText(/and its 1 item will be removed/),
    ).toBeTruthy();
  });

  it('moves an item to another parva', async () => {
    await open();
    await ready();
    const select = screen.getByLabelText('Move Lesson l1 to another parva') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'p2' } });
    expect(
      within(screen.getByRole('list', { name: 'Items in Basics' })).queryByText('Lesson l1'),
    ).toBeNull();
    expect(
      within(screen.getByRole('list', { name: 'Items in History' })).getByText('Lesson l1'),
    ).toBeTruthy();
    cleanupSingle();
  });

  it('hides the move control when there is one parva', async () => {
    await open({ live: mine({ parvas: [{ id: 'p1', title: 'Only', items: [lesson('l1')] }] }) });
    await ready();
    expect(screen.queryByLabelText(/to another parva/)).toBeNull();
  });

  it('reorders items and parvas from the keyboard', async () => {
    await open();
    await ready();
    expect(titles().slice(0, 2)).toEqual(['Lesson l1', 'Lesson l2']);
    const grip = screen.getByRole('button', { name: 'Move Lesson l1' });
    grip.focus();
    fireEvent.keyDown(grip, { key: ' ' });
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    fireEvent.keyDown(grip, { key: ' ' });
    expect(titles().slice(0, 2)).toEqual(['Lesson l2', 'Lesson l1']);
    expect(
      screen.getAllByRole('status').some((s) => /Dropped Lesson l1/.test(s.textContent ?? '')),
    ).toBe(true);
    const parva = screen.getByRole('button', { name: 'Move Basics' });
    fireEvent.keyDown(parva, { key: 'ArrowDown', altKey: true });
    expect(
      screen
        .getAllByRole('textbox', { name: /Title of parva/ })
        .map((i) => (i as HTMLInputElement).value),
    ).toEqual(['History', 'Basics']);
  });

  it('marks new and edited items against the live course', async () => {
    const live = mine();
    const draft = mine({
      parvas: [
        {
          id: 'p1',
          title: 'Basics',
          items: [lesson('l1', { title: 'Changed' }), lesson('fresh', { title: 'Fresh' })],
        },
      ],
    });
    await open({ live, draft });
    await ready();
    expect(screen.getByText('Edited')).toBeTruthy();
    expect(screen.getByText('New')).toBeTruthy();
  });
});

function cleanupSingle() {}

describe('Course editor: dialogs close with Escape', () => {
  it('closes the delete, rollback and archive dialogs', async () => {
    await open({
      roles: ['kulapati'],
      versions: [
        { version: 3, publishedAt: null, title: 'Git' },
        { version: 2, publishedAt: null, title: 'Old' },
      ],
    });
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Lesson l1' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Versions' }));
    fireEvent.click(await screen.findByRole('button', { name: /Roll back.*v2/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Archive course' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Course editor: saving', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('autosaves after a second', async () => {
    const { studio } = await open();
    await ready();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renamed' } });
    expect(screen.getByRole('heading', { level: 1, name: 'Renamed' })).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    expect(studio.data.saveDraft).toHaveBeenCalledWith(
      'git',
      expect.objectContaining({ course: expect.objectContaining({ title: 'Renamed' }) }),
      5,
      'u1',
    );
  });

  it('offers a retry when saving fails', async () => {
    const { studio } = await open();
    await ready();
    studio.data.saveDraft = vi.fn().mockRejectedValueOnce(new Error('x'));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'R' } });
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    const retry = await screen.findByRole('button', { name: 'retry' });
    expect(screen.getByText(/Couldn.t save/)).toBeTruthy();
    studio.data.saveDraft = vi.fn().mockResolvedValue(6);
    await act(async () => {
      fireEvent.click(retry);
    });
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
  });

  it('warns about a conflict and reloads on request', async () => {
    const { studio } = await open();
    await ready();
    studio.data.saveDraft = vi.fn().mockRejectedValue(new DraftConflictError());
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'R' } });
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(
      await screen.findByText('Someone else saved this draft. Reload to continue.'),
    ).toBeTruthy();
    expect(screen.getByText('Not saved')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(studio.data.getDraft).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText('Someone else saved this draft. Reload to continue.')).toBeNull(),
    );
  });
});

describe('Course editor: details, landing page, certificate', () => {
  it('edits the details panel', async () => {
    await open({ live: mine({ acharyaIds: ['u1', 'u2'] }) });
    await ready();
    const addr = screen.getByLabelText('Address') as HTMLInputElement;
    expect(addr.readOnly).toBe(true);
    expect(addr.value).toBe('git');
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'New summary' } });
    expect((screen.getByLabelText('Summary') as HTMLTextAreaElement).value).toBe('New summary');
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: 'advanced' } });
    expect((screen.getByLabelText('Level') as HTMLSelectElement).value).toBe('advanced');
    fireEvent.change(screen.getByLabelText('Pass mark (%)'), { target: { value: '80' } });
    expect((screen.getByLabelText('Pass mark (%)') as HTMLInputElement).value).toBe('80');
    fireEvent.change(screen.getByLabelText('Pass mark (%)'), { target: { value: '' } });
    expect((screen.getByLabelText('Pass mark (%)') as HTMLInputElement).value).toBe('80');
    fireEvent.click(screen.getByRole('radio', { name: 'Stone' }));
    expect((screen.getByRole('radio', { name: 'Stone' }) as HTMLInputElement).checked).toBe(true);
    for (const name of ['Learners go in order', 'Issue a certificate', 'Require watching videos']) {
      const toggle = screen.getByRole('switch', { name }) as HTMLInputElement;
      const before = toggle.checked;
      fireEvent.click(toggle);
      expect((screen.getByRole('switch', { name }) as HTMLInputElement).checked).toBe(!before);
    }
    expect(
      (screen.getByRole('button', { name: 'Upload cover image' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText('2 people. A Kulapati changes this list in the console.')).toBeTruthy();
    expect(screen.getByText('u2')).toBeTruthy();
  });

  it('says one person for a single Acharya', async () => {
    await open();
    await ready();
    expect(screen.getByText(/^1 person\./)).toBeTruthy();
  });

  it('edits the description and outcomes', async () => {
    await open();
    await ready();
    fireEvent.click(screen.getByRole('tab', { name: 'Landing page' }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '# Hi' } });
    fireEvent.change(screen.getByLabelText('Outcome 1'), { target: { value: 'Rebase' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add outcome' }));
    fireEvent.change(screen.getByLabelText('Outcome 2'), { target: { value: 'Merge' } });
    expect((screen.getByLabelText('Outcome 1') as HTMLInputElement).value).toBe('Rebase');
    fireEvent.click(screen.getByRole('button', { name: 'Remove outcome 1' }));
    expect((screen.getByLabelText('Outcome 1') as HTMLInputElement).value).toBe('Merge');
    fireEvent.click(screen.getByRole('button', { name: 'Remove outcome 1' }));
    expect(screen.getByText('No outcomes yet.')).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('stops adding outcomes at twelve', async () => {
    await open({ live: mine({ outcomes: Array.from({ length: 12 }, (_, i) => `O${i}`) }) });
    await ready();
    fireEvent.click(screen.getByRole('tab', { name: 'Landing page' }));
    expect(
      (screen.getByRole('button', { name: 'Add outcome' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('edits the certificate and notes when it is off', async () => {
    await open({
      live: mine({
        rules: { sequential: true, passMark: 0.7, certificate: false, requireVideoWatch: false },
      }),
    });
    await ready();
    fireEvent.click(screen.getByRole('tab', { name: 'Certificate' }));
    expect(screen.getByText(/switched off for this course/)).toBeTruthy();
    for (const label of ['Certificate title', 'Signatory name', 'Signatory role']) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: `${label}!` } });
      expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(`${label}!`);
    }
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('hides the note when certificates are on', async () => {
    await open();
    await ready();
    fireEvent.click(screen.getByRole('tab', { name: 'Certificate' }));
    expect(screen.queryByText(/switched off/)).toBeNull();
  });
});

describe('Course editor: analytics', () => {
  it('shows the numbers, with a funnel link for a Kulapati', async () => {
    const consoleApi = fakeConsole({
      course: { assigned: 9, started: 5, completed: 3, certified: 2 },
    });
    await open({ roles: ['kulapati'], consoleApi });
    await ready();
    fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }));
    expect(await screen.findByText('9')).toBeTruthy();
    expect(consoleApi.data.courseStats).toHaveBeenCalledWith('git');
    expect(screen.getByText('Certified')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the full funnel' }).getAttribute('href')).toBe(
      '/kulapati/courses/git',
    );
    expect(screen.queryByText('Not published yet')).toBeNull();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('shows loading, a not-published note and a failure for an Acharya', async () => {
    const consoleApi = fakeConsole();
    let reject: (e: Error) => void = () => {};
    consoleApi.data.courseStats = vi.fn(() => new Promise<CourseStats>((_, r) => (reject = r)));
    await open({ live: mine({ version: 0, status: 'draft' }), consoleApi });
    await ready();
    fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }));
    expect(screen.getByText('Loading the numbers…')).toBeTruthy();
    expect(screen.getByText('Not published yet')).toBeTruthy();
    await act(async () => reject(new Error('denied')));
    expect(await screen.findByText('The numbers are not available')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open the full funnel' })).toBeNull();
    expect(log.warn).toHaveBeenCalledWith('Loading course stats failed', { courseId: 'git' });
  });
});

describe('Course editor: versions', () => {
  const versions = [
    { version: 3, publishedAt: new Date('2026-03-01T00:00:00Z'), title: 'Git' },
    { version: 2, publishedAt: null, title: 'Git old' },
  ];

  it('lists versions and rolls back after confirming', async () => {
    const { studio, learner } = await open({ versions });
    await ready();
    fireEvent.click(screen.getByRole('tab', { name: 'Versions' }));
    expect(await screen.findByText('v2')).toBeTruthy();
    expect(screen.getByText('2026-03-01')).toBeTruthy();
    expect(screen.getByText('No date')).toBeTruthy();
    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Archive course' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Roll back.*v2/ }));
    const dialog = screen.getByRole('dialog', { name: 'Roll back to v2?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Roll back.*v2/ }));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Roll back' }),
      );
    });
    expect(studio.service.rollbackCourse).toHaveBeenCalledWith({ courseId: 'git', version: 2 });
    expect(await screen.findByText('Version 2 is live again, as v3.')).toBeTruthy();
    await waitFor(() => expect(studio.data.getDraft).toHaveBeenCalledTimes(2));
    expect(learner.data.getCourse).toHaveBeenCalledTimes(2);
  });

  it('shows a rollback failure and an empty list', async () => {
    const { studio } = await open({ versions });
    studio.service.rollbackCourse = vi.fn().mockRejectedValue(apiFailure('CRS_2002'));
    await ready();
    fireEvent.click(screen.getByRole('tab', { name: 'Versions' }));
    fireEvent.click(await screen.findByRole('button', { name: /Roll back.*v2/ }));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Roll back' }),
      );
    });
    expect(await screen.findByText(ROLLBACK_MISSING)).toBeTruthy();
  });

  it('explains an empty version list', async () => {
    await open();
    await ready();
    fireEvent.click(screen.getByRole('tab', { name: 'Versions' }));
    expect(await screen.findByText('No earlier versions')).toBeTruthy();
  });

  it('archives and restores for a Kulapati', async () => {
    const { studio } = await open({ roles: ['kulapati'], versions });
    await ready();
    fireEvent.click(screen.getByRole('tab', { name: 'Versions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Archive course' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep it live' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Archive course' }));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive course' }),
      );
    });
    expect(studio.service.archiveCourse).toHaveBeenCalledWith({ courseId: 'git', archived: true });
    expect(await screen.findByText('This course is archived')).toBeTruthy();
    studio.service.archiveCourse = vi.fn().mockResolvedValue({ status: 'published' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restore course' }));
    });
    expect(studio.service.archiveCourse).toHaveBeenCalledWith({ courseId: 'git', archived: false });
    expect(await screen.findByText('Retire this course')).toBeTruthy();
  });

  it('shows an archive failure, and no archive control for a draft course', async () => {
    const { studio } = await open({ roles: ['kulapati'], versions });
    studio.service.archiveCourse = vi.fn().mockRejectedValue(new Error('x'));
    await ready();
    fireEvent.click(screen.getByRole('tab', { name: 'Versions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Archive course' }));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive course' }),
      );
    });
    expect(await screen.findByText('Could not change the course. Try again.')).toBeTruthy();
  });

  it('has no archive control for a course that was never published', async () => {
    await open({ roles: ['kulapati'], live: mine({ status: 'draft', version: 0 }) });
    await ready();
    fireEvent.click(screen.getByRole('tab', { name: 'Versions' }));
    expect(await screen.findByText('No earlier versions')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Archive course' })).toBeNull();
  });
});

describe('Course editor: publishing', () => {
  const bump = (live: Course) => {
    const data = fakeData({ courses: [live] });
    data.data.getCourse = vi
      .fn()
      .mockResolvedValueOnce(live)
      .mockResolvedValue({ ...live, version: 4 });
    return data;
  };

  it('lists changes, publishes, and updates the live chip', async () => {
    const live = mine();
    const draft = mine({
      title: 'Git 2',
      parvas: [
        {
          id: 'p1',
          title: 'Basics',
          items: [lesson('l1', { title: 'Changed' }), lesson('fresh', { title: 'Fresh' })],
        },
        makeCourse().parvas[1] as never,
      ],
    });
    const { studio } = await open({ live, draft, getCourse: bump(live) });
    await ready();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish v4' }));
    });
    const dialog = await screen.findByRole('dialog', { name: 'Publish v4' });
    expect(within(dialog).getByText('Added (1)')).toBeTruthy();
    expect(within(dialog).getByText('Fresh')).toBeTruthy();
    expect(within(dialog).getByText('Edited (1)')).toBeTruthy();
    expect(within(dialog).getByText('Removed (1)')).toBeTruthy();
    expect(within(dialog).getByText('Lesson l2')).toBeTruthy();
    expect(within(dialog).getByText(/keep their progress record/)).toBeTruthy();
    expect(within(dialog).getByText(/Course details or the order of parvas changed/)).toBeTruthy();
    expect(within(dialog).queryByText(/Fix these first/)).toBeNull();
    expect(await axeViolations(document.body)).toEqual([]);
    studio.service.publishCourse = vi.fn().mockResolvedValue({ version: 4 });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Publish v4' }));
    });
    expect(studio.service.publishCourse).toHaveBeenCalledWith({ courseId: 'git' });
    expect(await screen.findByText('Published v4. Learners see it now.')).toBeTruthy();
    expect(await screen.findByText('Live: v4')).toBeTruthy();
    expect(studio.data.getDraft).toHaveBeenCalledTimes(2);
  });

  it('lists only an edit, without course-level or removal notes', async () => {
    const live = mine();
    const draft = structuredClone(live);
    const [first] = (draft.parvas[0] as { items: { title: string }[] }).items;
    (first as { title: string }).title = 'Changed';
    await open({ live, draft, getCourse: bump(live) });
    await ready();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish v4' }));
    });
    const dialog = await screen.findByRole('dialog', { name: 'Publish v4' });
    expect(within(dialog).getByText('Edited (1)')).toBeTruthy();
    expect(within(dialog).queryByText(/Course details or the order/)).toBeNull();
    expect(within(dialog).queryByText(/keep their progress record/)).toBeNull();
  });

  it('falls back to the published number when the live copy cannot be reloaded', async () => {
    const live = mine();
    const data = fakeData({ courses: [live] });
    data.data.getCourse = vi.fn().mockResolvedValueOnce(live).mockRejectedValue(new Error('x'));
    const { studio } = await open({ live, getCourse: data });
    await ready();
    studio.service.publishCourse = vi.fn().mockResolvedValue({ version: 4 });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish v4' }));
    });
    expect(await screen.findByText(/Nothing has changed since v3/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Publish v4' }),
      );
    });
    expect(await screen.findByText('Live: v4')).toBeTruthy();
    expect(log.warn).toHaveBeenCalledWith('Reloading the live course failed', { courseId: 'git' });
  });

  it('publishes a first version and can be cancelled', async () => {
    await open({ live: mine({ version: 0, status: 'draft' }) });
    await ready();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish v1' }));
    });
    expect(await screen.findByText(/first publication/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('blocks publishing while problems exist, with links to fix them', async () => {
    const draft = mine({
      summary: '',
      parvas: [
        { id: 'p1', title: 'Basics', items: [lesson('l1', { blocks: [], title: '' })] },
        { id: 'p2', title: 'Exam', items: [makeCourse().parvas[1]?.items[1] as never] },
      ],
    });
    await open({ draft });
    await ready();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish v4' }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Fix these first/)).toBeTruthy();
    expect(within(dialog).getByText('The course needs a one-sentence summary.')).toBeTruthy();
    expect(within(dialog).getAllByRole('link', { name: 'Open it' })[0]?.getAttribute('href')).toBe(
      '/studio/courses/git/lessons/l1',
    );
    expect(
      (within(dialog).getByRole('button', { name: 'Publish v4' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(within(dialog).getByText('Untitled')).toBeTruthy();
  });

  it('shows the issues the server refuses with', async () => {
    const live = mine();
    const { studio } = await open({ live });
    await ready();
    studio.service.publishCourse = vi.fn().mockRejectedValue(
      apiFailure('CRS_1003', {
        issues: [
          { code: 'a', message: 'Server says fix this', itemId: 'q1' },
          { code: 'b', message: 'No link here' },
        ],
      }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish v4' }));
    });
    await act(async () => {
      fireEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Publish v4' }),
      );
    });
    expect(await screen.findByText('Server says fix this')).toBeTruthy();
    expect(screen.getByText('No link here')).toBeTruthy();
    expect(
      screen.getByText('This course has problems to fix before it can be published.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Pariksha I' }).getAttribute('href')).toBe(
      '/studio/courses/git/pariksha/q1',
    );
  });

  it('shows other publish failures', async () => {
    const { studio } = await open();
    await ready();
    studio.service.publishCourse = vi
      .fn()
      .mockRejectedValueOnce(apiFailure('AUTH_1001'))
      .mockRejectedValueOnce(new Error('x'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish v4' }));
    });
    const publish = async () =>
      act(async () => {
        fireEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', { name: 'Publish v4' }),
        );
      });
    await publish();
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toBeTruthy();
    await publish();
    expect(await screen.findByText('Could not publish. Try again.')).toBeTruthy();
    expect(log.error).toHaveBeenCalledWith('Publishing failed', expect.anything(), {
      courseId: 'git',
    });
  });

  it('will not open the dialog when the draft cannot be saved', async () => {
    const { studio } = await open();
    await ready();
    studio.data.saveDraft = vi.fn().mockRejectedValue(new DraftConflictError());
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Changed' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish v4' }));
    });
    expect(await screen.findByText('Save your changes before publishing.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
