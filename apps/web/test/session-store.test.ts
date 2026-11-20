import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_FILE_BYTES } from '@gurukul/desktop/bridge';
import { SESSION_CHECKPOINTS_KEPT, authoringSessionSchema, blankCourse } from '@gurukul/schema';
import type { AuthoringSession, Turn } from '@gurukul/schema';
import {
  HISTORY_FILE,
  NEW_COURSE_ID,
  SESSION_FILE,
  START_CHECKPOINT,
  StoredTimestamp,
  UNREADABLE_FILE,
  checkpointPath,
  createSessionStore,
  creatorName,
  historyOf,
  isDue,
  namedCourse,
  sessionHistorySchema,
  sessionPath,
  titleFromGoal,
} from '../src/studio/session/store';
import {
  FILE_MAX_BYTES,
  TRANSCRIPT_FILE,
  TRANSCRIPT_MAX_BYTES,
  parseTranscript,
  transcriptText,
} from '../src/studio/session/transcript';
import { makeCourse } from './fake-data';
import { fakeDesktop } from './fake-desktop';
import { draftDoc } from './fake-studio';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
const { log } = await import('../src/log');

const T0 = new Date('2026-11-01T10:00:00.000Z');
const DAY = 86_400_000;

function setup(init: Parameters<typeof fakeDesktop>[0] = {}) {
  const fake = fakeDesktop(init);
  let clock = T0;
  let n = 0;
  const store = createSessionStore({
    desktop: fake.desktop,
    uid: 'u1',
    now: () => clock,
    newId: () => `s${++n}`,
  });
  return {
    ...fake,
    store,
    at: (date: Date) => {
      clock = date;
    },
  };
}

const getDraft = vi.fn(async (id: string) =>
  id === 'git' ? draftDoc(makeCourse(), { rev: 4, answersChanged: true }) : null,
);

async function editSession(s: ReturnType<typeof setup>, goal = 'Simplify chapter one.') {
  const result = await s.store.start({ kind: 'edit', courseId: 'git', goal }, getDraft);
  if (result.status !== 'started') throw new Error('not started');
  return result.session;
}

const turn = (id: string, changes = 1): Turn => ({
  id,
  at: T0.toISOString(),
  by: 'agent',
  summary: 'Rewrote a lesson',
  checkpoint: `${id}.json`,
  changes,
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('titleFromGoal', () => {
  it('takes the first sentence', () => {
    expect(titleFromGoal('  Simplify the rebase chapter.  Then add a Quiz. ')).toBe(
      'Simplify the rebase chapter.',
    );
  });

  it('keeps a goal with no sentence end whole', () => {
    expect(titleFromGoal('Add a Quiz\nat the end')).toBe('Add a Quiz at the end');
  });

  it('cuts a long sentence on a word', () => {
    const title = titleFromGoal(`${'word '.repeat(40)}end.`);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title).toMatch(/word…$/);
  });

  it('cuts a long run with no space where it must', () => {
    expect(titleFromGoal('x'.repeat(200))).toBe(`${'x'.repeat(79)}…`);
  });
});

describe('creatorName', () => {
  it('names the Educator as createCourse does: Google name, else the email’s local part', () => {
    expect(creatorName({ displayName: ' Priya N ', email: 'priya@nonstopio.com' })).toBe('Priya N');
    expect(creatorName({ displayName: '  ', email: 'priya.n@nonstopio.com' })).toBe('priya.n');
    expect(creatorName({ displayName: null, email: 'priya@nonstopio.com' })).toBe('priya');
    expect(creatorName({ displayName: null, email: null })).toBeUndefined();
  });
});

describe('namedCourse', () => {
  const made = blankCourse({
    id: 'code-review',
    title: 'Code review',
    level: 'foundation',
    theme: 'forest',
    educatorId: 'u1',
    educatorName: 'Priya N',
  });
  const note = (slug: string, title: string) => ({ slug, title, since: '2026-11-19T10:00:00Z' });

  it('keeps the title the last attempt at the address typed, and what createCourse makes of it', () => {
    expect(namedCourse(made, note('code-review', 'Better name'))).toEqual({
      ...made,
      title: 'Better name',
      certificate: { title: 'Better name' },
      cover: { ...made.cover, glyph: 'B' },
    });
  });

  it('is the course itself with no note, a note for another address, or the same title', () => {
    expect(namedCourse(made, null)).toBe(made);
    expect(namedCourse(made, note('code-review-2', 'Better name'))).toBe(made);
    expect(namedCourse(made, note('code-review', 'Code review'))).toBe(made);
  });
});

describe('sessionPath', () => {
  it('is the session route', () => {
    expect(sessionPath('s1')).toBe('/studio/sessions/s1');
  });
});

describe('start', () => {
  it('starts an edit session from the draft, read once, with the draft as its base', async () => {
    const s = setup();
    const session = await editSession(s);
    expect(getDraft).toHaveBeenCalledTimes(1);
    expect(session).toMatchObject({
      id: 's1',
      uid: 'u1',
      kind: 'edit',
      courseId: 'git',
      title: 'Simplify chapter one.',
      goals: [{ text: 'Simplify chapter one.', done: false }],
      status: 'open',
      base: { rev: 4, savedAt: '2026-03-01T10:00:00.000Z' },
      agentSessionId: null,
      createdAt: T0.toISOString(),
      updatedAt: T0.toISOString(),
    });
    expect(session.work).toEqual(session.base?.work);
    expect(session.work.answersChanged).toBe(true);
    expect(JSON.parse(s.files.get(`u1/s1/${SESSION_FILE}`) as string)).toEqual(session);
    expect(log.info).toHaveBeenCalledWith('Session started', {
      sessionId: 's1',
      kind: 'edit',
      courseId: 'git',
    });
  });

  it('keeps a draft never saved, and one without the answer mark, as they are', async () => {
    const s = setup();
    const result = await s.store.start({ kind: 'edit', courseId: 'git', goal: 'Go.' }, async () =>
      draftDoc(makeCourse(), { updatedAt: null }),
    );
    expect(result.status === 'started' && result.session.base?.savedAt).toBeNull();
    expect(result.status === 'started' && 'answersChanged' in result.session.work).toBe(false);
  });

  it('starts a new course with no base and a blank course, its goal trimmed to fit', async () => {
    const s = setup();
    const goal = `  ${'a'.repeat(400)}`;
    const result = await s.store.start({ kind: 'new', goal, educatorName: 'Meera' }, getDraft);
    expect(getDraft).not.toHaveBeenCalled();
    if (result.status !== 'started') throw new Error('not started');
    expect(result.session).toMatchObject({ kind: 'new', courseId: null, base: null });
    expect(result.session.goals[0]?.text).toHaveLength(300);
    expect(result.session.work.course).toMatchObject({
      id: NEW_COURSE_ID,
      educatorIds: ['u1'],
      educatorNames: { u1: 'Meera' },
      chapters: [],
    });
  });

  it('offers the open session instead of a second one on the same course, reading no draft', async () => {
    const s = setup();
    const first = await editSession(s);
    getDraft.mockClear();
    const again = await s.store.start({ kind: 'edit', courseId: 'git', goal: 'More.' }, getDraft);
    expect(again).toEqual({ status: 'already_open', session: first });
    expect(getDraft).not.toHaveBeenCalled();
    expect(await s.store.openFor('git')).toEqual(first);
  });

  it('starts another once the first is closed', async () => {
    const s = setup();
    await s.store.close(await editSession(s), 'saved');
    expect(await s.store.openFor('git')).toBeNull();
    expect((await editSession(s)).id).toBe('s2');
  });

  it('lets several new courses be open at once', async () => {
    const s = setup();
    await s.store.start({ kind: 'new', goal: 'One.' }, getDraft);
    const second = await s.store.start({ kind: 'new', goal: 'Two.' }, getDraft);
    expect(second.status).toBe('started');
  });

  it('writes nothing for a course with no draft', async () => {
    const s = setup();
    const result = await s.store.start({ kind: 'edit', courseId: 'gone', goal: 'Go.' }, getDraft);
    expect(result).toEqual({ status: 'no_draft' });
    expect(s.desktop.store.write).not.toHaveBeenCalled();
  });

  it('refuses to write an invalid session', async () => {
    const s = setup();
    await expect(s.store.start({ kind: 'new', goal: '   ' }, getDraft)).rejects.toThrow();
    expect(s.desktop.store.write).not.toHaveBeenCalled();
  });
});

describe('read, save and list', () => {
  it('reads back what it wrote, and null for a session not on this computer', async () => {
    const s = setup();
    const session = await editSession(s);
    expect(await s.store.read('s1')).toEqual(session);
    expect(await s.store.read('nope')).toBeNull();
  });

  it('reads back a session on a published course, its publishedAt a timestamp again', async () => {
    // Firestore's Timestamp: seconds and nanoseconds as its own fields, `toJSON` adding a type.
    const published = {
      seconds: 1_790_000_000,
      nanoseconds: 250_000_000,
      toMillis: () => 1_790_000_000_250,
      toDate: () => new Date(1_790_000_000_250),
      toJSON: () => ({ seconds: 1_790_000_000, nanoseconds: 250_000_000, type: 'timestamp' }),
    };
    const s = setup();
    const result = await s.store.start(
      { kind: 'edit', courseId: 'git', goal: 'Shorter.' },
      async () => draftDoc({ ...makeCourse(), publishedAt: published }, { rev: 4 }),
    );
    if (result.status !== 'started') throw new Error('not started');
    const read = await s.store.read('s1');
    const stamp = read?.work.course.publishedAt;
    expect(stamp).toBeInstanceOf(StoredTimestamp);
    expect(stamp?.toMillis()).toBe(1_790_000_000_250);
    expect(stamp?.toDate().toISOString()).toBe('2026-09-21T14:13:20.250Z');
    expect(read?.base?.work.course.publishedAt).toEqual(stamp);
    // Written again, it is the same file.
    await s.store.save(read as AuthoringSession);
    expect((await s.store.read('s1'))?.work.course.publishedAt).toEqual(stamp);
    expect(
      JSON.parse(s.files.get(`u1/s1/${SESSION_FILE}`) as string).work.course.publishedAt,
    ).toEqual({ seconds: 1_790_000_000, nanoseconds: 250_000_000 });
  });

  it('leaves a publishedAt that is not seconds and nanoseconds to the schema', async () => {
    const s = setup();
    const session = await editSession(s);
    const file = `u1/s1/${SESSION_FILE}`;
    const stored = JSON.parse(s.files.get(file) as string) as AuthoringSession;
    for (const publishedAt of [{ seconds: 1 }, 'yesterday']) {
      s.files.set(
        file,
        JSON.stringify({
          ...stored,
          work: { ...stored.work, course: { ...stored.work.course, publishedAt } },
        }),
      );
      expect(await s.store.read('s1')).toBeNull();
    }
    s.files.set(file, JSON.stringify(stored));
    expect(await s.store.read('s1')).toEqual(session);
  });

  it('saves with updatedAt set to now', async () => {
    const s = setup();
    const session = await editSession(s);
    s.at(new Date(T0.getTime() + 60_000));
    const saved = await s.store.save({ ...session, summary: 'Shorter now.' });
    expect(saved.updatedAt).toBe('2026-11-01T10:01:00.000Z');
    expect(await s.store.read('s1')).toEqual(saved);
  });

  it('treats a file that is not JSON, or not a session, as unreadable', async () => {
    const s = setup({
      files: { [`u1/bad/${SESSION_FILE}`]: '{oops', [`u1/odd/${SESSION_FILE}`]: '{"id":1}' },
    });
    expect(await s.store.read('bad')).toBeNull();
    expect(await s.store.read('odd')).toBeNull();
    expect(log.warn).toHaveBeenCalledWith('Session file unreadable', {
      sessionId: 'bad',
      file: 'session',
      reason: 'json',
    });
    expect(log.warn).toHaveBeenCalledWith('Session file unreadable', {
      sessionId: 'odd',
      file: 'session',
      reason: 'schema',
    });
  });

  it('lists sessions newest first, with the history of removed ones', async () => {
    const s = setup();
    const first = await editSession(s);
    s.at(new Date(T0.getTime() + 1000));
    await s.store.start({ kind: 'new', goal: 'New.' }, getDraft);
    const history = historyOf({ ...first, status: 'saved' }, '2026-10-01T00:00:00.000Z');
    s.files.set(`u1/h1/${HISTORY_FILE}`, JSON.stringify({ ...history, id: 'h1' }));
    s.files.set(
      `u1/h2/${HISTORY_FILE}`,
      JSON.stringify({ ...history, id: 'h2', closedAt: '2026-09-01T00:00:00.000Z' }),
    );
    s.files.set('u1/empty/notes.txt', 'x');
    const list = await s.store.list();
    expect(list.sessions.map((x) => x.id)).toEqual(['s2', 's1']);
    expect(list.history.map((h) => h.id)).toEqual(['h1', 'h2']);
  });
});

describe('saveTurn and checkpoints', () => {
  it('writes the checkpoint, then the session with the turn, after every turn', async () => {
    const s = setup();
    const session = await editSession(s);
    const work = { ...session.work, course: { ...session.work.course, title: 'Git, shorter' } };
    s.at(new Date(T0.getTime() + 5000));
    const next = await s.store.saveTurn(session, turn('t1', 3), work);
    expect(next.turns).toEqual([turn('t1', 3)]);
    expect(next.work.course.title).toBe('Git, shorter');
    expect(next.updatedAt).toBe('2026-11-01T10:00:05.000Z');
    expect(await s.store.readCheckpoint('s1', 't1.json')).toEqual(work);
    // A restart reads the session as the last turn left it.
    expect(await s.store.read('s1')).toEqual(next);
    const writes = s.desktop.store.write.mock.calls.map(([f]) => f.path);
    expect(writes.slice(-2)).toEqual([checkpointPath('t1.json'), SESSION_FILE]);
  });

  it('keeps the newest 30 checkpoints and removes the older ones', async () => {
    const s = setup();
    let session = await editSession(s);
    for (let i = 1; i <= SESSION_CHECKPOINTS_KEPT + 2; i += 1) {
      session = await s.store.saveTurn(session, turn(`t${i}`), session.work);
    }
    const left = (await s.desktop.store.list({ uid: 'u1', sessionId: 's1' })).filter((f) =>
      f.startsWith('checkpoints/'),
    );
    expect(left).toHaveLength(SESSION_CHECKPOINTS_KEPT);
    expect(left).not.toContain(checkpointPath('t1.json'));
    expect(left).not.toContain(checkpointPath('t2.json'));
    expect(await s.store.readCheckpoint('s1', 't1.json')).toBeNull();
    expect(await s.store.readCheckpoint('s1', 't32.json')).toEqual(session.work);
    expect(session.turns).toHaveLength(SESSION_CHECKPOINTS_KEPT + 2);
  });

  it('refuses a working copy that is not one, before writing', async () => {
    const s = setup();
    const session = await editSession(s);
    s.desktop.store.write.mockClear();
    await expect(
      s.store.saveTurn(session, turn('t1'), { course: {} } as unknown as AuthoringSession['work']),
    ).rejects.toThrow();
    expect(s.desktop.store.write).not.toHaveBeenCalled();
  });

  it('reads an unreadable checkpoint as null', async () => {
    const s = setup({ files: { 'u1/s1/checkpoints/t1.json': '[]' } });
    expect(await s.store.readCheckpoint('s1', 't1.json')).toBeNull();
    expect(log.warn).toHaveBeenCalledWith('Session file unreadable', {
      sessionId: 's1',
      file: 'checkpoint',
      reason: 'schema',
    });
  });

  it('keeps the start checkpoint however many turns follow', async () => {
    const s = setup();
    let session = await editSession(s);
    await s.store.saveStart('s1', session.work);
    for (let i = 1; i <= SESSION_CHECKPOINTS_KEPT + 1; i += 1) {
      session = await s.store.saveTurn(session, turn(`t${i}`), session.work);
    }
    expect(await s.store.readCheckpoint('s1', START_CHECKPOINT)).toEqual(session.work);
    expect(await s.store.readCheckpoint('s1', 't1.json')).toBeNull();
  });

  it('refuses a start checkpoint that is not a working copy', async () => {
    const s = setup();
    await expect(
      s.store.saveStart('s1', { course: {} } as unknown as AuthoringSession['work']),
    ).rejects.toThrow();
    expect(s.files.has(`u1/s1/checkpoints/${START_CHECKPOINT}`)).toBe(false);
  });
});

describe('undoTurn', () => {
  it('drops the newest turn, takes the working copy given and removes its checkpoint', async () => {
    const s = setup();
    let session = await editSession(s);
    const first = session.work;
    const changed = { ...first, course: { ...first.course, title: 'Changed' } };
    session = await s.store.saveTurn(session, turn('t1'), changed);
    s.at(new Date(T0.getTime() + 1000));
    const undone = await s.store.undoTurn(session, first);
    expect(undone).toMatchObject({ turns: [], updatedAt: '2026-11-01T10:00:01.000Z' });
    expect(undone.work).toEqual(first);
    expect(await s.store.read('s1')).toEqual(undone);
    expect(s.files.has('u1/s1/checkpoints/t1.json')).toBe(false);
  });

  it('only saves a session that has no turn to drop', async () => {
    const s = setup();
    const session = await editSession(s);
    s.desktop.store.remove.mockClear();
    expect((await s.store.undoTurn(session, session.work)).turns).toEqual([]);
    expect(s.desktop.store.remove).not.toHaveBeenCalled();
  });
});

describe('transcript', () => {
  const entry = (text: string) =>
    ({ kind: 'agent', turnId: 't1', at: T0.toISOString(), text }) as const;

  it('writes the chat as lines and reads it back', async () => {
    const s = setup();
    expect(await s.store.readTranscript('s1')).toEqual([]);
    await s.store.writeTranscript('s1', [entry('One'), entry('Two')]);
    expect(s.files.get(`u1/s1/${TRANSCRIPT_FILE}`)?.split('\n')).toHaveLength(3);
    expect(await s.store.readTranscript('s1')).toEqual([entry('One'), entry('Two')]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('leaves out damaged lines and says how many', async () => {
    const s = setup({
      files: {
        [`u1/s1/${TRANSCRIPT_FILE}`]: `${JSON.stringify(entry('One'))}\n{"kind":"agent"}\n\n{oops\n`,
      },
    });
    expect(await s.store.readTranscript('s1')).toEqual([entry('One')]);
    expect(log.warn).toHaveBeenCalledWith('Session transcript lines unreadable', {
      sessionId: 's1',
      count: 2,
    });
  });

  it('keeps the newest entries that fit', () => {
    const [one, two, three] = [entry('One'), entry('Two'), entry('Three')];
    const line = (e: ReturnType<typeof entry>) => `${JSON.stringify(e)}\n`;
    const fits = line(two).length + line(three).length;
    expect(transcriptText([one, two, three], fits)).toBe(line(two) + line(three));
    expect(transcriptText([one, two, three], fits - 1)).toBe(line(three));
    expect(transcriptText([one, two, three])).toBe(line(one) + line(two) + line(three));
  });

  it('counts what it keeps in bytes of UTF-8, so a chat in Hindi stays under the shell’s limit', () => {
    expect(FILE_MAX_BYTES).toBe(MAX_FILE_BYTES);
    expect(TRANSCRIPT_MAX_BYTES).toBeLessThan(MAX_FILE_BYTES);
    // Devanagari takes 3 bytes a character: 7 entries of 990,000 characters, about 21 MB. Six of
    // them are under 6 million characters, yet about 18 MB.
    const hindi = Array.from({ length: 7 }, () => entry('क'.repeat(990_000)));
    const text = transcriptText(hindi);
    const bytes = new TextEncoder().encode(text).length;
    expect(bytes).toBeLessThanOrEqual(MAX_FILE_BYTES);
    expect(bytes).toBeLessThanOrEqual(TRANSCRIPT_MAX_BYTES);
    // The newest entries that fit are kept, not none.
    expect(parseTranscript(text).entries.length).toBeGreaterThan(0);
    const [one, two] = [entry('दो'), entry('तीन')];
    const line = (e: ReturnType<typeof entry>) => `${JSON.stringify(e)}\n`;
    const twoBytes = new TextEncoder().encode(line(two)).length;
    expect(transcriptText([one, two], twoBytes)).toBe(line(two));
    // In characters the line is shorter than in bytes: a cap in characters would keep too much.
    expect(transcriptText([one, two], twoBytes - 1)).toBe('');
  });
});

describe('close', () => {
  it('marks the session and logs only its id and status', async () => {
    const s = setup();
    const closed = await s.store.close(await editSession(s), 'discarded');
    expect(closed.status).toBe('discarded');
    expect(log.info).toHaveBeenCalledWith('Session closed', {
      sessionId: 's1',
      status: 'discarded',
    });
  });
});

describe('historyOf and isDue', () => {
  it('keeps the title, summary and counts, and the chat to forget', async () => {
    const s = setup();
    const session = authoringSessionSchema.parse({
      ...(await editSession(s)),
      status: 'saved',
      summary: 'Did it.',
      goals: [
        { text: 'One', done: true },
        { text: 'Two', done: false },
      ],
      turns: [turn('t1', 2), turn('t2', 3)],
      todos: [
        { id: 'd1', text: 'A picture', done: false, createdAt: T0.toISOString() },
        { id: 'd2', text: 'Done', done: true, createdAt: T0.toISOString() },
      ],
      agentSessionId: '7a3c1b52-1f0e-4f3c-9d2a-0b1c2d3e4f50',
    });
    const history = historyOf(session, '2026-11-02T00:00:00.000Z');
    expect(history).toEqual({
      schemaVersion: 1,
      id: 's1',
      kind: 'edit',
      courseId: 'git',
      title: 'Simplify chapter one.',
      summary: 'Did it.',
      status: 'saved',
      turns: 2,
      changes: 5,
      goals: 2,
      goalsDone: 1,
      todosLeft: 1,
      createdAt: T0.toISOString(),
      closedAt: '2026-11-02T00:00:00.000Z',
      forgetPending: '7a3c1b52-1f0e-4f3c-9d2a-0b1c2d3e4f50',
    });
    expect(sessionHistorySchema.parse(history)).toEqual(history);
    expect(historyOf({ ...session, status: 'discarded' }, T0.toISOString()).status).toBe(
      'discarded',
    );
  });

  it('is due 30 days after a session closed, never while it is open', async () => {
    const s = setup();
    const session = await editSession(s);
    const later = (days: number) => new Date(T0.getTime() + days * DAY);
    expect(isDue(session, later(40))).toBe(false);
    const closed = { ...session, status: 'saved' as const };
    expect(isDue(closed, later(29))).toBe(false);
    expect(isDue(closed, later(30))).toBe(true);
  });
});

describe('sweep', () => {
  const CLAUDE_ID = '7a3c1b52-1f0e-4f3c-9d2a-0b1c2d3e4f50';

  async function closedWithFiles(s: ReturnType<typeof setup>) {
    let session = await editSession(s);
    session = await s.store.saveTurn(session, turn('t1'), session.work);
    s.files.set('u1/s1/transcript.jsonl', '{}');
    s.files.set('u1/s1/skills/humanize/SKILL.md', '# x');
    return s.store.close({ ...session, agentSessionId: CLAUDE_ID }, 'saved');
  }

  it('leaves open sessions and recent closed ones alone', async () => {
    const s = setup();
    await editSession(s);
    await s.store.start({ kind: 'new', goal: 'New.' }, getDraft);
    await s.store.close((await s.store.read('s2')) as AuthoringSession, 'discarded');
    s.at(new Date(T0.getTime() + 29 * DAY));
    expect(await s.store.sweep()).toBe(0);
    expect(s.desktop.store.remove).not.toHaveBeenCalled();
    expect(s.desktop.agent.forget).not.toHaveBeenCalled();
  });

  it('after 30 days removes the files, keeps history and forgets Claude Code’s copy', async () => {
    const s = setup();
    await closedWithFiles(s);
    s.at(new Date(T0.getTime() + 31 * DAY));
    expect(await s.store.sweep()).toBe(1);
    expect([...s.files.keys()]).toEqual([`u1/s1/${HISTORY_FILE}`]);
    expect(s.desktop.agent.forget).toHaveBeenCalledWith(CLAUDE_ID);
    const history = sessionHistorySchema.parse(
      JSON.parse(s.files.get(`u1/s1/${HISTORY_FILE}`) as string),
    );
    expect(history).toMatchObject({ id: 's1', status: 'saved', turns: 1, forgetPending: null });
    // session.json goes last of the files, so a crash midway is retried whole; the folder, which
    // holds the agent bridge's files, goes after it.
    expect(s.desktop.store.remove.mock.calls.slice(-2).map(([ref]) => ref)).toEqual([
      { uid: 'u1', sessionId: 's1', path: SESSION_FILE },
      { uid: 'u1', sessionId: 's1' },
    ]);
    expect(log.info).toHaveBeenCalledWith('Session files removed', { count: 1 });
    expect((await s.store.list()).history.map((h) => h.id)).toEqual(['s1']);
  });

  it('removes the agent bridge’s own files with the whole folder, in any case, and keeps history', async () => {
    const s = setup();
    await closedWithFiles(s);
    s.files.set('u1/s1/MCP.json', '{}');
    s.files.set('u1/s1/workdir/notes.md', 'x');
    s.at(new Date(T0.getTime() + 31 * DAY));
    expect(await s.store.sweep()).toBe(1);
    // The shell refuses them one by one; none was asked for that way.
    const paths = s.desktop.store.remove.mock.calls.map(([ref]) => ref.path);
    expect(paths).not.toContain('MCP.json');
    expect(paths).not.toContain('skills/humanize/SKILL.md');
    expect(s.desktop.store.remove).toHaveBeenCalledWith({ uid: 'u1', sessionId: 's1' });
    expect([...s.files.keys()]).toEqual([`u1/s1/${HISTORY_FILE}`]);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('removes a session that never reached Claude Code without asking to forget', async () => {
    const s = setup();
    await s.store.close(await editSession(s), 'discarded');
    s.at(new Date(T0.getTime() + 30 * DAY));
    expect(await s.store.sweep()).toBe(1);
    expect(s.desktop.agent.forget).not.toHaveBeenCalled();
    // No agent files: the folder stays, holding the history.
    expect(s.desktop.store.remove).not.toHaveBeenCalledWith({ uid: 'u1', sessionId: 's1' });
  });

  it('keeps the forget pending when the app cannot do it yet, and tries again next time', async () => {
    const s = setup();
    await closedWithFiles(s);
    s.desktop.agent.forget.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'gurukul:agent.forget': Error: Not available in this version",
      ),
    );
    s.at(new Date(T0.getTime() + 31 * DAY));
    expect(await s.store.sweep()).toBe(1);
    expect(log.warn).toHaveBeenCalledWith('Session transcript not forgotten', {
      sessionId: 's1',
      reason: 'not_available',
    });
    expect(JSON.parse(s.files.get(`u1/s1/${HISTORY_FILE}`) as string).forgetPending).toBe(
      CLAUDE_ID,
    );
    expect(await s.store.sweep()).toBe(0);
    expect(s.desktop.agent.forget).toHaveBeenCalledTimes(2);
    expect(JSON.parse(s.files.get(`u1/s1/${HISTORY_FILE}`) as string).forgetPending).toBeNull();
    // Nothing left to forget: a third sweep asks nothing.
    await s.store.sweep();
    expect(s.desktop.agent.forget).toHaveBeenCalledTimes(2);
  });

  it('logs a session it could not clean up and carries on with the rest', async () => {
    const s = setup();
    await closedWithFiles(s);
    s.files.set(`u1/zzz/${SESSION_FILE}`, '{oops');
    s.at(new Date(T0.getTime() + 31 * DAY));
    const failure = new Error('store.write failed (EACCES)');
    s.desktop.store.write.mockRejectedValueOnce(failure);
    expect(await s.store.sweep()).toBe(0);
    expect(log.error).toHaveBeenCalledWith('Session clean-up failed', failure, { sessionId: 's1' });
    expect(s.files.has(`u1/s1/${SESSION_FILE}`)).toBe(true);
  });
});

describe('sweep of folders it cannot read', () => {
  const CLAUDE_ID = '7a3c1b52-1f0e-4f3c-9d2a-0b1c2d3e4f50';
  const days = (n: number) => new Date(T0.getTime() + n * DAY);

  async function discardedWithCheckpoint(s: ReturnType<typeof setup>) {
    const session = await editSession(s);
    const after = await s.store.saveTurn(session, turn('t1'), session.work);
    await s.store.close(after, 'discarded');
  }

  it('removes the whole folder 30 days after it was first found unreadable', async () => {
    const s = setup();
    await discardedWithCheckpoint(s);
    // A file from a newer app reads no better than a damaged one: its keys must still go.
    s.files.set(`u1/s1/${SESSION_FILE}`, '{"schemaVersion":2}');
    s.at(days(60));
    expect(await s.store.sweep()).toBe(0);
    expect(log.warn).toHaveBeenCalledWith('Session file unreadable', {
      sessionId: 's1',
      file: 'session',
      reason: 'newer',
    });
    expect(log.warn).toHaveBeenCalledWith('Session folder unreadable', {
      sessionId: 's1',
      removeInDays: 30,
    });
    expect(JSON.parse(s.files.get(`u1/s1/${UNREADABLE_FILE}`) as string)).toEqual({
      since: days(60).toISOString(),
    });
    expect(s.files.has(`u1/s1/${checkpointPath('t1.json')}`)).toBe(true);

    // Later sweeps keep the first date, and the folder, until its 30 days are up.
    s.at(days(89));
    expect(await s.store.sweep()).toBe(0);
    expect(JSON.parse(s.files.get(`u1/s1/${UNREADABLE_FILE}`) as string).since).toBe(
      days(60).toISOString(),
    );
    expect(s.files.has(`u1/s1/${checkpointPath('t1.json')}`)).toBe(true);

    s.at(days(90));
    expect(await s.store.sweep()).toBe(1);
    expect([...s.files.keys()]).toEqual([]);
    expect(s.desktop.store.remove).toHaveBeenLastCalledWith({ uid: 'u1', sessionId: 's1' });
    expect(log.warn).toHaveBeenCalledWith('Unreadable session folder removed', { sessionId: 's1' });
    expect(log.info).toHaveBeenCalledWith('Session files removed', { count: 1 });
  });

  it('treats an open session that is not JSON, and stray files with no session, the same', async () => {
    const s = setup();
    await editSession(s);
    s.files.set(`u1/s1/${SESSION_FILE}`, 'not json');
    s.files.set(`u1/stray/${checkpointPath('t9.json')}`, '{}');
    await s.store.sweep();
    expect(s.files.has(`u1/s1/${UNREADABLE_FILE}`)).toBe(true);
    expect(s.files.has(`u1/stray/${UNREADABLE_FILE}`)).toBe(true);
    s.at(days(30));
    expect(await s.store.sweep()).toBe(2);
    expect([...s.files.keys()]).toEqual([]);
  });

  it('starts the 30 days again when its own note cannot be read', async () => {
    const s = setup();
    s.files.set(`u1/s1/${SESSION_FILE}`, '{oops');
    s.files.set(`u1/s1/${UNREADABLE_FILE}`, '{"since":"yesterday"}');
    s.at(days(45));
    expect(await s.store.sweep()).toBe(0);
    expect(JSON.parse(s.files.get(`u1/s1/${UNREADABLE_FILE}`) as string).since).toBe(
      days(45).toISOString(),
    );
  });

  it('still forgets Claude Code’s copy when a retired session’s folder was damaged', async () => {
    const s = setup();
    const session = await editSession(s);
    const history = historyOf(
      { ...session, status: 'saved', agentSessionId: CLAUDE_ID },
      T0.toISOString(),
    );
    s.files.clear();
    s.files.set(`u1/s1/${HISTORY_FILE}`, JSON.stringify(history));
    s.files.set(`u1/s1/${SESSION_FILE}`, '{oops');
    await s.store.sweep();
    expect(s.desktop.agent.forget).toHaveBeenCalledWith(CLAUDE_ID);
    expect(s.files.has(`u1/s1/${UNREADABLE_FILE}`)).toBe(true);
  });

  it('does not let an unreadable session block a new one on its course', async () => {
    // It cannot be opened, so offering to open it would be a dead end.
    const s = setup();
    await editSession(s);
    s.files.set(`u1/s1/${SESSION_FILE}`, 'not json');
    const second = await s.store.start({ kind: 'edit', courseId: 'git', goal: 'Again.' }, getDraft);
    expect(second.status).toBe('started');
  });
});
