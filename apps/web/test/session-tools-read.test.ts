import { describe, expect, it, vi } from 'vitest';
import { SOURCE_CHUNK } from '../src/studio/session/tools/read';
import { call, json, ok, refused, toolCtx, toolState, must } from './session-tools-fixture';

describe('get_course', () => {
  it('gives details, landing, outline without block text, and the session record', async () => {
    const state = toolState({
      todos: [
        {
          id: 't1',
          text: 'Screenshot',
          itemId: 'l1',
          blockId: 'b1',
          done: false,
          createdAt: '2026-11-19T10:00:00Z',
        },
        { id: 't2', text: 'Check a fact', done: true, createdAt: '2026-11-19T10:00:00Z' },
      ],
    });
    const out = await json(call(state, 'get_course'));
    expect(out['details']).toMatchObject({
      id: 'git',
      passMarkPercent: 70,
      cover: { image: false },
    });
    expect(out['landing']).toEqual({
      description: 'Learn Git the way we use it.',
      outcomes: ['Commit with confidence', 'Branch without fear'],
    });
    const text = JSON.stringify(out['chapters']);
    expect(text).toContain('"blocks":[{"id":"b1","type":"markdown"}');
    expect(text).toContain('{"type":"quiz","id":"q1","title":"History check","questions":2}');
    expect(text).not.toContain('Commit early');
    expect(out['session']).toEqual({
      kind: 'edit',
      title: 'Simplify the history chapter',
      goals: [{ text: 'Simplify chapter 2', done: false }],
      summary: '',
      todos: [
        { id: 't1', text: 'Screenshot', done: false, itemId: 'l1', blockId: 'b1' },
        { id: 't2', text: 'Check a fact', done: true },
      ],
    });
  });

  it('calls a session without a base a new course', async () => {
    const out = await json<{ session: { kind: string } }>(
      call(toolState({ base: null }), 'get_course'),
    );
    expect(out.session.kind).toBe('new course');
  });
});

describe('get_item and get_base_item', () => {
  it('gives a lesson with its blocks and place', async () => {
    const out = await json(call(toolState(), 'get_item', { itemId: 'l2' }));
    expect(out).toMatchObject({ id: 'l2', chapterId: 'p1', position: 2, blocks: [{ id: 'b5' }] });
  });

  it('gives a Quiz with each question’s correct option ids', async () => {
    const state = toolState();
    state.work.answers = { q1: { k1: ['a'] } };
    const out = await json<{ questions: { id: string; correct: string[] }[] }>(
      call(state, 'get_item', { itemId: 'q1' }),
    );
    expect(out.questions.map((q) => [q.id, q.correct])).toEqual([
      ['k1', ['a']],
      ['k2', []],
    ]);
    state.work.answers = {};
    const none = await json<{ questions: { correct: string[] }[] }>(
      call(state, 'get_item', { itemId: 'q1' }),
    );
    expect(none.questions[0]?.correct).toEqual([]);
  });

  it('refuses an unknown item', async () => {
    expect(await refused(call(toolState(), 'get_item', { itemId: 'nope' }))).toBe(
      'There is no lesson or Quiz with id "nope". Call get_course to see the ids.',
    );
  });

  it('gives the item as it was when the session started', async () => {
    const state = toolState();
    const renamed = await ok(
      call(state, 'update_item', { itemId: 'l1', title: 'Your first commit' }),
    );
    const base = await json(call(renamed.state, 'get_base_item', { itemId: 'l1' }));
    expect(base['title']).toBe('First commit');
  });

  it('says when there is no base, or the item is new', async () => {
    expect(await refused(call(toolState({ base: null }), 'get_base_item', { itemId: 'l1' }))).toBe(
      'This is a new course: nothing existed before this session.',
    );
    const state = toolState();
    must(must(state.base).course.chapters[0]).items = [];
    expect(await refused(call(state, 'get_base_item', { itemId: 'l1' }))).toBe(
      '"l1" did not exist when this session started; it was added since.',
    );
  });
});

describe('search_course', () => {
  it('finds text in details, landing, chapters, items, blocks and questions, ignoring case', async () => {
    const state = toolState();
    state.work.course.certificate.title = 'Git rebase badge';
    const out = await json<{ matches: number; hits: Record<string, string>[] }>(
      call(state, 'search_course', { query: 'REBASE' }),
    );
    const places = out.hits.map((h) => [h['itemId'] ?? h['chapterId'] ?? 'course', h['field']]);
    expect(places).toEqual([
      ['course', 'certificateTitle'],
      ['q1', 'explanation'],
      ['q1', 'options.0'],
      ['l3', 'title'],
    ]);
    expect(out.matches).toBe(4);
  });

  it('looks in outcomes, check options, chapter titles and code', async () => {
    const out = await json<{ hits: Record<string, string>[] }>(
      call(toolState(), 'search_course', { query: 'snapshot' }),
    );
    expect(out.hits.map((h) => [h['blockId'], h['field']])).toEqual([
      ['b4', 'explanation'],
      ['b4', 'options.0'],
    ]);
    const more = await json<{ hits: Record<string, string>[] }>(
      call(toolState(), 'search_course', { query: 'without fear' }),
    );
    expect(more.hits[0]).toMatchObject({ field: 'outcomes.1' });
    const chapter = await json<{ hits: Record<string, string>[] }>(
      call(toolState(), 'search_course', { query: 'basics' }),
    );
    expect(chapter.hits[0]).toMatchObject({ chapterId: 'p1', field: 'title' });
  });

  it('cuts long text to an excerpt around the match', async () => {
    const state = toolState();
    const block = must(must(state.work.course.chapters[0]).items[1]);
    if (block.type !== 'lesson') throw new Error('fixture');
    block.blocks = [
      { type: 'markdown', id: 'b5', md: `${'a'.repeat(100)} needle ${'b'.repeat(100)}` },
    ];
    const out = await json<{ hits: { excerpt: string }[] }>(
      call(state, 'search_course', { query: 'needle' }),
    );
    expect(out.hits[0]?.excerpt).toBe(`…${'a'.repeat(39)} needle ${'b'.repeat(39)}…`);
  });

  it('lists at most 30 matches and says how many there are', async () => {
    const state = toolState();
    const lesson = must(must(state.work.course.chapters[0]).items[1]);
    if (lesson.type !== 'lesson') throw new Error('fixture');
    lesson.blocks = Array.from({ length: 40 }, (_, i) => ({
      type: 'markdown' as const,
      id: `m${i}`,
      md: 'zebra',
    }));
    const out = await json<{ matches: number; shown: number }>(
      call(state, 'search_course', { query: 'zebra' }),
    );
    expect(out).toMatchObject({ matches: 40, shown: 30 });
  });
});

describe('list_changes', () => {
  it('lists nothing for an untouched session', async () => {
    expect(await json(call(toolState(), 'list_changes'))).toEqual({
      count: 0,
      rows: [],
      answerChanges: [],
    });
  });

  it('summarises every kind of row', async () => {
    let state = toolState();
    const steps: [string, Record<string, unknown>][] = [
      ['set_course_details', { title: 'Git for teams' }],
      ['set_landing', { outcomes: ['Commit with confidence', 'Rebase without fear'] }],
      ['update_chapter', { chapterId: 'p1', title: 'Getting started' }],
      ['move_chapter', { chapterId: 'p2', position: 1 }],
      ['update_block', { lessonId: 'l1', blockId: 'b1', changes: { md: 'Commit often.' } }],
      ['update_question', { quizId: 'q1', questionId: 'k1', correct: [1] }],
      ['remove_item', { itemId: 'l2' }],
      ['move_item', { itemId: 'l3', chapterId: 'p1' }],
    ];
    for (const [name, input] of steps) state = (await ok(call(state, name, input))).state;
    const out = await json<{
      count: number;
      rows: Record<string, unknown>[];
      answerChanges: unknown[];
    }>(call(state, 'list_changes'));
    const byKey = Object.fromEntries(out.rows.map((r) => [r['key'], r]));
    expect(byKey['course:course']).toEqual({
      key: 'course:course',
      statuses: ['changed'],
      fields: ['title'],
    });
    expect(byKey['landing:landing']).toMatchObject({
      outcomes: [{ id: '#1', statuses: ['changed'] }],
    });
    expect(byKey['chapter:p1']).toMatchObject({
      title: 'Getting started',
      statuses: ['renamed', 'moved'],
    });
    expect(byKey['lesson:l1']).toMatchObject({
      title: 'First commit',
      chapterId: 'p1',
      blocks: [{ id: 'b1', type: 'markdown', statuses: ['changed'] }],
    });
    expect(byKey['lesson:l2']).toMatchObject({ title: 'Branches', statuses: ['removed'] });
    expect(byKey['lesson:l3']).toMatchObject({ statuses: ['moved'], move: { toChapterId: 'p1' } });
    expect(byKey['quiz:q1']).toMatchObject({ questions: [{ id: 'k1', statuses: ['changed'] }] });
    expect(out.answerChanges).toEqual([{ kind: 'question', itemId: 'q1', id: 'k1' }]);
  });

  it('shows a moved chapter and a moved Quiz with where they went', async () => {
    let state = toolState();
    state = (await ok(call(state, 'move_chapter', { chapterId: 'p1', position: 2 }))).state;
    state = (await ok(call(state, 'move_item', { itemId: 'q1', position: 2 }))).state;
    const out = await json<{ rows: Record<string, unknown>[] }>(call(state, 'list_changes'));
    const chapters = out.rows.filter((r) => String(r['key']).startsWith('chapter:'));
    expect(chapters.some((r) => r['move'] !== undefined)).toBe(true);
    expect(out.rows.find((r) => r['key'] === 'quiz:q1')).toMatchObject({ move: { toIndex: 1 } });
  });

  it('marks everything added in a new course', async () => {
    const out = await json<{ count: number }>(call(toolState({ base: null }), 'list_changes'));
    expect(out.count).toBeGreaterThan(3);
  });
});

describe('list_sources and read_source', () => {
  const sources = (files: Record<string, string>) => ({
    list: vi.fn(async () => Object.entries(files).map(([name, t]) => ({ name, bytes: t.length }))),
    read: vi.fn(async (name: string) => files[name] ?? null),
  });

  it('refuse when no Sources folder is set', async () => {
    const no =
      'No Sources folder is set for this session. Ask the Educator to choose one if you need their material.';
    expect(await refused(call(toolState(), 'list_sources'))).toBe(no);
    expect(await refused(call(toolState(), 'read_source', { name: 'a.md' }))).toBe(no);
  });

  it('list the files and read one', async () => {
    const ctx = toolCtx({ sources: sources({ 'notes.md': 'Rebase notes' }) });
    expect(await json(call(toolState(), 'list_sources', {}, ctx))).toEqual({
      files: [{ name: 'notes.md', bytes: 12 }],
    });
    expect(await json(call(toolState(), 'read_source', { name: 'notes.md' }, ctx))).toEqual({
      name: 'notes.md',
      from: 0,
      to: 12,
      length: 12,
      text: 'Rebase notes',
    });
  });

  it('reads a long file in chunks, saying where the next one starts', async () => {
    const long = 'x'.repeat(SOURCE_CHUNK + 10);
    const ctx = toolCtx({ sources: sources({ 'big.txt': long }) });
    const first = await json(call(toolState(), 'read_source', { name: 'big.txt' }, ctx));
    expect(first).toMatchObject({ from: 0, to: SOURCE_CHUNK, next: SOURCE_CHUNK });
    const rest = await json(
      call(toolState(), 'read_source', { name: 'big.txt', offset: SOURCE_CHUNK }, ctx),
    );
    expect(rest).toMatchObject({ from: SOURCE_CHUNK, to: SOURCE_CHUNK + 10, text: 'x'.repeat(10) });
    expect(rest['next']).toBeUndefined();
  });

  it('reads only a plain file name the folder lists, never a path', async () => {
    const folder = sources({ 'notes.md': 'Rebase notes' });
    folder.read.mockImplementation(async () => 'secret');
    const ctx = toolCtx({ sources: folder });
    const read = (name: string) => refused(call(toolState(), 'read_source', { name }, ctx));
    const noPath = 'Give a file name exactly as list_sources gives it, without a path.';
    for (const name of ['../../.ssh/id_rsa', 'sub/notes.md', '..\\notes.md', '..', '.'])
      expect(await read(name)).toBe(noPath);
    expect(folder.list).not.toHaveBeenCalled();
    expect(await read('id_rsa')).toBe(
      'There is no file called "id_rsa" in the Sources folder. Call list_sources.',
    );
    expect(folder.read).not.toHaveBeenCalled();
  });

  it('refuses a listed file that is gone by the time it is read', async () => {
    const folder = sources({ 'notes.md': 'Rebase notes' });
    folder.read.mockImplementation(async () => null);
    const ctx = toolCtx({ sources: folder });
    expect(await refused(call(toolState(), 'read_source', { name: 'notes.md' }, ctx))).toBe(
      'There is no file called "notes.md" in the Sources folder. Call list_sources.',
    );
  });

  it('refuses a file that is not there', async () => {
    const ctx = toolCtx({ sources: sources({}) });
    expect(await refused(call(toolState(), 'read_source', { name: 'gone.md' }, ctx))).toBe(
      'There is no file called "gone.md" in the Sources folder. Call list_sources.',
    );
  });
});
