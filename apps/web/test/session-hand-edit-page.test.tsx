import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringSession } from '@gurukul/schema';
import { createSessionStore } from '../src/studio/session/store';
import type { Working } from '../src/studio/types';
import { pdfBlurHash } from '../src/studio/media/blurHash';
import { axeViolations } from './axe';
import { lesson, makeCourse } from './fake-data';
import { fakeAgent, fakeDesktop, installDesktop, uninstallDesktop } from './fake-desktop';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
// The hashing has its own tests: here only that an upload from a session's editor goes through.
vi.mock('../src/studio/media/blurHash', () => ({ imageBlurHash: vi.fn(), pdfBlurHash: vi.fn() }));

const GIT = makeCourse({ id: 'git', title: 'Git', educatorIds: ['u1'] });

afterEach(() => {
  uninstallDesktop();
  vi.clearAllMocks();
});

let sessions = 0;

/**
 * A session on this computer, in the desktop app with a fake agent, opened at `path` (the
 * workspace by default). `edit` changes the session file first.
 */
async function open(
  init: {
    kind?: 'new' | 'edit';
    path?: (id: string) => string;
    edit?: (session: AuthoringSession) => AuthoringSession;
  } = {},
) {
  // A new id each time: a runtime still writing a turn outlives its test (`acquireAgentSession`).
  sessions += 1;
  const id = `h${sessions}`;
  const fake = fakeDesktop();
  const store = createSessionStore({ desktop: fake.desktop, uid: 'u1', newId: () => id });
  const started = await store.start(
    init.kind === 'new'
      ? { kind: 'new', goal: 'A course on code review.' }
      : { kind: 'edit', courseId: 'git', goal: 'Simplify the basics.' },
    async () => draftDoc(GIT, { rev: 3 }),
  );
  if (started.status !== 'started') throw new Error('not started');
  if (init.edit) await store.save(init.edit(started.session));
  const agent = fakeAgent(fake.desktop);
  installDesktop(fake.desktop);
  const studio = fakeStudio({ courses: [{ live: GIT, draft: draftDoc(GIT, { rev: 3 }) }] });
  const app = await openApp(init.path?.(id) ?? `/studio/sessions/${id}`, {
    roles: ['educator'],
    studio,
  });
  const disk = () =>
    JSON.parse(fake.files.get(`u1/${id}/session.json`) as string) as AuthoringSession;
  return {
    ...fake,
    ...agent,
    app,
    studio,
    id,
    disk,
    emit: (event: Record<string, unknown>) =>
      agent.emit({ ...event, sessionId: id } as Parameters<typeof agent.emit>[0]),
  };
}

const itemPath = (id: string, itemId: string) => `/studio/sessions/${id}/items/${itemId}`;
const titleOf = (work: Working | AuthoringSession['work'], id: string) =>
  work.course.chapters.flatMap((c) => c.items).find((i) => i.id === id)?.title;

describe('Open in editor from the session workspace', () => {
  it('edits a lesson by hand and brings the edits back to the session as one turn', async () => {
    const s = await open();
    await screen.findByRole('heading', { level: 2, name: 'Lesson l1' });
    const link = screen.getByRole('link', { name: 'Open in editor' });
    expect(link.getAttribute('href')).toBe(itemPath(s.id, 'l1'));
    fireEvent.click(link);

    const title = (await screen.findByLabelText('Lesson title')) as HTMLInputElement;
    expect(screen.getByRole('heading', { level: 1, name: 'Lesson l1' })).toBeTruthy();
    expect(screen.getByText(/^In the session · saved/)).toBeTruthy();
    // No preview of the stored draft: the workspace is the preview.
    expect(screen.queryByRole('link', { name: /Preview as/ })).toBeNull();
    const back = screen.getByRole('link', { name: 'Session' });
    expect(back.getAttribute('href')).toBe(`/studio/sessions/${s.id}?item=lesson%3Al1`);
    const rail = screen.getByRole('navigation', { name: 'Lessons in this course' });
    expect(within(rail).getByRole('link', { name: 'Lesson l2' }).getAttribute('href')).toBe(
      itemPath(s.id, 'l2'),
    );
    expect(
      within(rail)
        .getByRole('link', { name: /Quiz I/ })
        .getAttribute('href'),
    ).toBe(itemPath(s.id, 'q1'));
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Simplify the basics.' })).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);

    fireEvent.change(title, { target: { value: 'Why Git' } });
    expect(screen.getByText('In the session · unsaved changes')).toBeTruthy();
    fireEvent.click(back);

    // Back in the workspace, on the lesson that was edited, with the hand edits as a turn.
    const turn = await screen.findByRole('link', { name: 'Turn 1 · by hand · 1 change' });
    expect(turn).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Why Git' })).toBeTruthy();
    expect(screen.getByText('Edited by hand: Why Git')).toBeTruthy();
    await waitFor(() => expect(s.disk().turns).toMatchObject([{ by: 'educator', changes: 1 }]));
    expect(titleOf(s.disk().work, 'l1')).toBe('Why Git');
    // Never Firestore: the one read is the page's check of the stored draft when it opened.
    expect(s.studio.data.saveDraft).not.toHaveBeenCalled();
    expect(s.studio.data.getDraft).toHaveBeenCalledTimes(1);
  });

  it('opens a Quiz from the Outline in the Quiz builder, with nothing that writes Firestore', async () => {
    const s = await open();
    fireEvent.click(await screen.findByRole('tab', { name: 'Outline' }));
    const open1 = screen.getByRole('link', { name: 'Open 2.2 · Quiz I in the editor' });
    expect(open1.getAttribute('href')).toBe(itemPath(s.id, 'q1'));
    fireEvent.click(open1);
    expect(await screen.findByRole('heading', { level: 1, name: 'Quiz I' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Question editor' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save to question bank' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Try it as/ })).toBeNull();
    expect(s.app.console.data.courseStats).not.toHaveBeenCalled();
    expect(await axeViolations(document.body)).toEqual([]);

    // Deleting a question says where it goes, and Undo brings it back.
    fireEvent.click(screen.getByRole('button', { name: 'Delete this question' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this question?' });
    expect(within(dialog).getByText(/this session’s copy of the course/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it('says the item is gone when it is not in the working copy', async () => {
    const s = await open({ path: (id) => itemPath(id, 'nope') });
    expect(await screen.findByRole('heading', { level: 1, name: 'Lesson not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the session' }).getAttribute('href')).toBe(
      `/studio/sessions/${s.id}?item=lesson%3Anope`,
    );
  });

  it('says where a deleted block goes', async () => {
    await open({ path: (id) => itemPath(id, 'l1') });
    const group = await screen.findByRole('group', { name: 'Text block' });
    fireEvent.change(within(group).getByRole('textbox'), { target: { value: 'More words.' } });
    fireEvent.click(within(group).getByRole('button', { name: /Delete/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this text block?' });
    expect(within(dialog).getByText(/this session’s copy of the course/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete block' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Text block' })).toBeNull());
  });

  it('asks before leaving edits the session cannot keep yet, and drops them', async () => {
    const s = await open({ path: (id) => itemPath(id, 'l1') });
    const title = (await screen.findByLabelText('Lesson title')) as HTMLInputElement;
    fireEvent.change(title, { target: { value: '' } });
    fireEvent.click(screen.getByRole('link', { name: 'Session' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave with unfinished edits?' });
    expect(screen.getByText('In the session · not kept until complete')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave and drop them' }));
    await screen.findByRole('heading', { level: 2, name: 'Lesson l1' });
    expect(screen.queryByRole('link', { name: /^Turn/ })).toBeNull();
    expect(titleOf(s.disk().work, 'l1')).toBe('Lesson l1');
  });

  it('makes no turn of a visit that only measured a linked image', async () => {
    const image = {
      type: 'image' as const,
      id: 'l1-img',
      url: 'https://example.com/graph.png',
      alt: 'A graph',
    };
    const s = await open({
      path: (id) => itemPath(id, 'l1'),
      edit: (session) => ({
        ...session,
        work: {
          ...session.work,
          course: {
            ...session.work.course,
            chapters: session.work.course.chapters.map((c, i) =>
              i === 0
                ? {
                    ...c,
                    items: c.items.map((item) =>
                      item.id === 'l1' ? { ...item, blocks: [image] } : item,
                    ),
                  }
                : c,
            ),
          },
        },
      }),
    });
    await screen.findByLabelText('Lesson title');
    const loaded = (width: number, height: number) => {
      const img = screen.getByRole('img', { name: 'A graph' });
      Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
      Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
      fireEvent.load(img);
    };
    // The picture loads: in Studio its size would be stored, an edit nobody made here.
    loaded(800, 600);
    expect(screen.getByText(/^In the session · saved/)).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Session' }));
    await screen.findByRole('heading', { level: 2, name: 'Lesson l1' });
    // Send opens once the visit has ended, turn or not.
    fireEvent.change(screen.getByRole('textbox', { name: 'Ask for a change' }), {
      target: { value: 'Shorten it.' },
    });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    expect(screen.queryByRole('link', { name: /^Turn/ })).toBeNull();
    expect(s.disk().turns).toEqual([]);

    // An address typed in the session is a new image, and its size is read as in Studio.
    fireEvent.click(screen.getByRole('link', { name: 'Open in editor' }));
    const group = await screen.findByRole('group', { name: 'Image block' });
    fireEvent.change(within(group).getByLabelText('Image address'), {
      target: { value: 'https://example.com/other.png' },
    });
    loaded(400, 300);
    fireEvent.click(screen.getByRole('link', { name: 'Session' }));
    await screen.findByRole('link', { name: /^Turn 1 · by hand/ });
    const blocks = (s.disk().work.course.chapters[0]?.items[0] as ReturnType<typeof lesson>)
      .blocks as unknown[];
    expect(blocks[0]).toMatchObject({
      url: 'https://example.com/other.png',
      width: 400,
      height: 300,
    });
  });

  it('drops edits it cannot keep when the Educator moves to another item and leaves them', async () => {
    const s = await open({ path: (id) => itemPath(id, 'l1') });
    const title = (await screen.findByLabelText('Lesson title')) as HTMLInputElement;
    fireEvent.change(title, { target: { value: '' } });
    const rail = screen.getByRole('navigation', { name: 'Lessons in this course' });
    fireEvent.click(within(rail).getByRole('link', { name: 'Lesson l2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave with unfinished edits?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave and drop them' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Lesson l2' })).toBeTruthy();
    // Dropped now, not when the editor closes: the rail and the bar say so, and leaving asks nothing.
    await waitFor(() => expect(within(rail).getByRole('link', { name: 'Lesson l1' })).toBeTruthy());
    expect(within(rail).queryByRole('link', { name: 'Untitled lesson' })).toBeNull();
    expect(screen.getByText(/^In the session · saved/)).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Session' }));
    await screen.findByRole('heading', { level: 2, name: 'Lesson l2' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('link', { name: /^Turn/ })).toBeNull();
    expect(titleOf(s.disk().work, 'l1')).toBe('Lesson l1');
  });

  it('uploads a PDF from a session’s editor to the course, as Studio does', async () => {
    vi.mocked(pdfBlurHash).mockResolvedValue(undefined);
    const s = await open({ path: (id) => itemPath(id, 'l1') });
    await screen.findByLabelText('Lesson title');
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    const group = await screen.findByRole('group', { name: 'File block' });
    fireEvent.click(within(group).getByRole('tab', { name: 'Upload' }));
    const head = new TextEncoder().encode('%PDF-1.7\n');
    const file = new File([head, new Uint8Array(2000)], 'handout.pdf', { type: 'application/pdf' });
    await act(async () => {
      fireEvent.change(group.querySelector('input[type="file"]') as HTMLInputElement, {
        target: { files: [file] },
      });
    });
    fireEvent.click(await within(group).findByRole('button', { name: 'Upload PDF' }));
    await waitFor(() => expect(s.studio.storage.upload).toHaveBeenCalledTimes(1));
    const [request] = vi.mocked(s.studio.storage.upload).mock.calls[0] as [{ path: string }];
    expect(request.path).toMatch(/^courses\/git\/media\//);
    fireEvent.click(screen.getByRole('link', { name: 'Session' }));
    await screen.findByRole('link', { name: /^Turn 1 · by hand/ });
    const blocks = (s.disk().work.course.chapters[0]?.items[0] as ReturnType<typeof lesson>).blocks;
    expect(blocks.at(-1)).toMatchObject({ type: 'file', upload: { name: 'handout.pdf' } });
  });
});

describe('when hand edits wait', () => {
  it('waits for the agent’s turn to end, offers Stop, then opens the editor', async () => {
    const s = await open();
    const box = (await screen.findByRole('textbox', { name: 'Ask for a change' })) as HTMLElement;
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy());
    fireEvent.change(box, { target: { value: 'Shorten it.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(s.agent.send).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('link', { name: 'Open in editor' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'The agent is working on this course' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Edit by hand' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the session' }).getAttribute('href')).toBe(
      `/studio/sessions/${s.id}?item=lesson%3Al1`,
    );
    expect(await axeViolations(document.body)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Stop the agent' }));
    await waitFor(() => expect(s.agent.stop).toHaveBeenCalledWith(s.id));
    expect(
      (screen.getByRole('button', { name: 'Stop the agent' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    act(() => s.emit({ type: 'turn_end', agentSessionId: 'claude-1', outcome: 'stopped' }));
    expect(await screen.findByLabelText('Lesson title')).toBeTruthy();
  });

  it('shows a closed session to read, with no editor', async () => {
    const closed = (session: AuthoringSession): AuthoringSession => ({
      ...session,
      status: 'saved',
    });
    await open({ edit: closed });
    await screen.findByRole('heading', { level: 2, name: 'Lesson l1' });
    expect(screen.queryByRole('link', { name: 'Open in editor' })).toBeNull();
    uninstallDesktop();

    await open({ edit: closed, path: (id) => itemPath(id, 'l1') });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'This session is closed' }),
    ).toBeTruthy();
  });

  it('waits while hand edits the app closed on become a turn', async () => {
    let finish: () => void = () => undefined;
    const fake = fakeDesktop();
    const store = createSessionStore({ desktop: fake.desktop, uid: 'u1', newId: () => 'hx' });
    const started = await store.start(
      { kind: 'edit', courseId: 'git', goal: 'Simplify the basics.' },
      async () => draftDoc(GIT, { rev: 3 }),
    );
    if (started.status !== 'started') throw new Error('not started');
    await store.saveHandEdits('hx', {
      since: '2026-11-19T10:00:00.000Z',
      before: started.session.work,
    });
    await store.save({
      ...started.session,
      work: {
        ...started.session.work,
        course: makeCourse({ ...GIT, title: 'Git by hand' }),
      },
    });
    fakeAgent(fake.desktop);
    // The first checkpoint write waits, so the page is seen while the turn is written.
    const write = fake.desktop.store.write;
    const held = new Promise<void>((r) => (finish = r));
    fake.desktop.store.write = vi.fn(async (ref, data) => {
      if (ref.path.startsWith('checkpoints/')) await held;
      return write(ref, data);
    });
    installDesktop(fake.desktop);
    await openApp(itemPath('hx', 'l1'), {
      roles: ['educator'],
      studio: fakeStudio({ courses: [{ live: GIT, draft: draftDoc(GIT, { rev: 3 }) }] }),
    });
    expect(await screen.findByText('Opening the editor')).toBeTruthy();
    finish();
    expect(await screen.findByLabelText('Lesson title')).toBeTruthy();
  });
});

describe('a new course’s editor', () => {
  it('offers links, not uploads, until the course exists', async () => {
    await open({
      kind: 'new',
      path: (id) => itemPath(id, 'l1'),
      edit: (session) => ({
        ...session,
        work: {
          ...session.work,
          course: {
            ...session.work.course,
            chapters: [{ id: 'p1', title: 'Start', items: [lesson('l1')] }],
          },
        },
      }),
    });
    await screen.findByLabelText('Lesson title');
    fireEvent.click(screen.getByRole('button', { name: 'Image' }));
    const image = await screen.findByRole('group', { name: 'Image block' });
    fireEvent.click(within(image).getByRole('tab', { name: 'Upload' }));
    expect(within(image).getByText(/Uploads open once the course is created/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    const file = await screen.findByRole('group', { name: 'File block' });
    fireEvent.click(within(file).getByRole('tab', { name: 'Upload' }));
    expect(within(file).getByText(/Uploads open once the course is created/)).toBeTruthy();
  });
});
