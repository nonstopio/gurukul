import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { COURSE_BYTES_LIMIT, workingSchema } from '@gurukul/schema';
import { TOOLS, runToolIn, toolList } from '../src/studio/session/tools';
import { idMaker, indexFor, named } from '../src/studio/session/tools/find';
import { describeIssue, sessionProblem, workProblem } from '../src/studio/session/tools/issues';
import { defineTool, done } from '../src/studio/session/tools/types';
import { log } from '../src/log';
import { call, ok, refused, toolCtx, toolState, toolWork, must } from './session-tools-fixture';

afterEach(() => vi.restoreAllMocks());

/** The plan's table, "The agent's tools" in `.plan/22-desktop-studio.md`. */
const PLANNED = [
  'get_course',
  'get_item',
  'get_base_item',
  'search_course',
  'list_changes',
  'list_sources',
  'read_source',
  'set_course_details',
  'set_landing',
  'add_chapter',
  'update_chapter',
  'move_chapter',
  'remove_chapter',
  'add_lesson',
  'add_quiz',
  'update_item',
  'move_item',
  'remove_item',
  'add_block',
  'update_block',
  'move_block',
  'remove_block',
  'set_blocks',
  'update_quiz_settings',
  'add_question',
  'update_question',
  'move_question',
  'remove_question',
  'check_course',
  'lint_writing',
  'set_summary',
  'add_todo',
  'resolve_todo',
];

describe('the tool list', () => {
  it('is exactly the tools the plan names, once each', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(PLANNED);
  });

  it('offers nothing that reaches learners, publishing, access or another course', () => {
    const forbidden = /publish|access|role|assign|learner|progress|attempt|team|bank|delete_course/;
    for (const t of TOOLS) expect(t.name).not.toMatch(forbidden);
  });

  it('describes every tool and gives its input as a JSON Schema object without the dialect line', () => {
    const list = toolList();
    expect(list).toHaveLength(PLANNED.length);
    for (const entry of list) {
      expect(entry.description.length).toBeGreaterThan(20);
      expect(entry.inputSchema['type']).toBe('object');
      expect(entry.inputSchema['$schema']).toBeUndefined();
      expect(entry.inputSchema['additionalProperties']).toBe(false);
    }
    const addBlock = list.find((t) => t.name === 'add_block');
    expect(JSON.stringify(addBlock?.inputSchema)).not.toContain('"url"');
  });
});

describe('runTool', () => {
  it('refuses a tool it does not know', async () => {
    expect(await refused(call(toolState(), 'publish_course'))).toBe(
      'There is no tool called "publish_course".',
    );
  });

  it('treats missing input as an empty object', async () => {
    await ok(call(toolState(), 'get_course', null));
  });

  it('refuses input that does not match the schema, naming the field', async () => {
    const error = await refused(
      call(toolState(), 'update_chapter', { chapterId: 'p1', title: '' }),
    );
    expect(error).toBe('The input for update_chapter is not valid. Title cannot be empty.');
    const extra = await refused(call(toolState(), 'get_course', { url: 'https://x' }));
    expect(extra).toMatch(/^The input for get_course is not valid\. Unrecognized key/);
  });

  it('refuses a change that adds a schema problem, and keeps the working copy', async () => {
    const state = toolState();
    const breaks = defineTool({
      name: 'breaks',
      description: 'test',
      input: z.object({}),
      run: (s) =>
        done({ ...s, work: { ...s.work, course: { ...s.work.course, title: '' } } }, 'broke it'),
    });
    const error = await refused(runToolIn([breaks], state, 'breaks', {}, toolCtx()));
    expect(error).toBe('Nothing was changed. Title cannot be empty.');
  });

  it('never lets a tool change the base', async () => {
    const state = toolState();
    const sneaky = defineTool({
      name: 'sneaky',
      description: 'test',
      input: z.object({}),
      run: (s) => done({ ...s, base: null }, 'done'),
    });
    const result = await ok(runToolIn([sneaky], state, 'sneaky', {}, toolCtx()));
    expect(result.state.base).toBe(state.base);
  });

  it('refuses a change to the session fields that breaks their schema', async () => {
    const tooMany = defineTool({
      name: 'goals',
      description: 'test',
      input: z.object({}),
      run: (s) =>
        done({ ...s, goals: Array.from({ length: 21 }, () => ({ text: 'x', done: false })) }, ''),
    });
    expect(await refused(runToolIn([tooMany], toolState(), 'goals', {}, toolCtx()))).toBe(
      'Nothing was changed. A session has at most 20 goals.',
    );
  });

  it('logs a tool that throws and tells the model nothing changed', async () => {
    const spy = vi.spyOn(log, 'error').mockImplementation(() => undefined);
    const throws = defineTool({
      name: 'throws',
      description: 'test',
      input: z.object({}),
      run: () => {
        throw new Error('boom');
      },
    });
    const error = await refused(runToolIn([throws], toolState(), 'throws', {}, toolCtx()));
    expect(error).toMatch(/^The tool failed unexpectedly and nothing was changed/);
    expect(spy).toHaveBeenCalledWith('Session tool failed', expect.any(Error), { tool: 'throws' });
  });
});

describe('workProblem', () => {
  it('accepts the same working copy without checking it', () => {
    const w = toolWork();
    expect(workProblem(w, w)).toBeNull();
  });

  it('refuses a change to the course id, Educators, status or version', () => {
    const before = toolWork();
    for (const change of [
      { id: 'other' },
      { educatorIds: [] },
      { educatorNames: {} },
      { status: 'published' as const },
      { version: 3 },
      { publishedAt: null, schemaVersion: 4 as const, version: 1 },
    ]) {
      const after = { ...before, course: { ...before.course, ...change } };
      expect(workProblem(before, after)).toBe(
        "No tool may change the course's id, Educators, status or version.",
      );
    }
  });

  it('lets an already invalid draft be edited, refusing only problems the edit adds', () => {
    const before = toolWork();
    before.course = {
      ...before.course,
      chapters: [
        { ...must(before.course.chapters[0]), title: '' },
        must(before.course.chapters[1]),
      ],
    };
    expect(workingSchema.safeParse(before).success).toBe(false);
    // Moving the broken chapter keeps its problem under the same id: not a new one.
    const moved = {
      ...before,
      course: { ...before.course, chapters: [...before.course.chapters].reverse() },
    };
    expect(workProblem(before, moved)).toBeNull();
    const worse = { ...before, course: { ...before.course, summary: 'x'.repeat(241) } };
    expect(workProblem(before, worse)).toBe(
      'Nothing was changed. Summary is too long: at most 240 characters.',
    );
  });

  it('refuses growth past the size limit, but not shrinking a course already over it', () => {
    const before = toolWork();
    const big = (n: number) => ({
      ...before,
      answers: { ...before.answers, filler: { x: ['y'.repeat(n)] } },
    });
    const over = big(COURSE_BYTES_LIMIT);
    expect(workProblem(before, over)).toMatch(
      /^Nothing was changed: the course would be 881 KB, over the limit of 879 KB\. /,
    );
    expect(workProblem(over, big(COURSE_BYTES_LIMIT - 10))).toBeNull();
  });
});

describe('describeIssue', () => {
  const course = toolWork().course;

  it('names the place in words and says what is wrong', () => {
    expect(
      describeIssue(course, {
        code: 'too_small',
        origin: 'string',
        minimum: 1,
        path: ['chapters', 0, 'items', 1, 'title'],
        message: 'x',
      }),
    ).toBe('In chapter "Basics" (p1) › lesson "Branches" (l2), title cannot be empty.');
    expect(
      describeIssue(course, {
        code: 'invalid_type',
        path: ['chapters', 1, 'items', 0, 'questions', 1, 'options', 0, 'text'],
        message: 'Invalid input',
      }),
    ).toBe(
      'In chapter "History" (p2) › Quiz "History check" (q1) › question 2 › answer 1, text: Invalid input.',
    );
    expect(
      describeIssue(course, {
        code: 'invalid_type',
        path: ['chapters', 0, 'items', 0, 'blocks', 1, 'lang'],
        message: 'Invalid input',
      }),
    ).toBe(
      'In chapter "Basics" (p1) › lesson "First commit" (l1) › block 2 (code), lang: Invalid input.',
    );
    expect(describeIssue(course, { code: 'custom', path: ['outcomes', 0], message: 'Bad' })).toBe(
      'In outcomes 1, Bad.',
    );
  });

  it('names an untitled entry by its id', () => {
    const untitled = { chapters: [{ id: 'p9', title: '', items: [] }] };
    expect(describeIssue(untitled, { code: 'custom', path: ['chapters', 0], message: 'Bad' })).toBe(
      'In chapter "p9", Bad.',
    );
  });

  it('turns a full list into a sentence about its limit', () => {
    expect(
      describeIssue(course, {
        code: 'too_big',
        origin: 'array',
        maximum: 60,
        path: ['chapters', 0, 'items', 0, 'blocks'],
        message: 'x',
      }),
    ).toBe('A lesson holds at most 60 blocks. Split it into two lessons, or remove a block first.');
    expect(
      describeIssue(course, {
        code: 'too_big',
        origin: 'array',
        maximum: 6,
        path: ['chapters', 0, 'items', 0, 'blocks', 3, 'options'],
        message: 'Too big',
      }),
    ).toBe(
      'In chapter "Basics" (p1) › lesson "First commit" (l1) › block 4 (check), options: Too big.',
    );
  });

  it('says what a too short value is when it may not be empty but has a higher minimum', () => {
    expect(
      describeIssue(
        {},
        { code: 'too_small', origin: 'string', minimum: 2, path: ['query'], message: 'Too small' },
      ),
    ).toBe('Query: Too small.');
  });
});

describe('describeIssue on a union', () => {
  const course = toolWork().course;
  const at = ['chapters', 0, 'items', 1];
  const blank = { code: 'too_small', origin: 'string', minimum: 1, path: ['title'], message: 'x' };
  const wrongType = { code: 'invalid_value', path: ['type'], message: 'Invalid input' };

  it('describes the option the value is closest to', () => {
    const issue = { code: 'invalid_union', path: at, message: 'Invalid input' };
    expect(describeIssue(course, { ...issue, errors: [[blank], [wrongType, blank]] })).toBe(
      'In chapter "Basics" (p1) › lesson "Branches" (l2), title cannot be empty.',
    );
    expect(describeIssue(course, { ...issue, errors: [[wrongType, blank], [blank]] })).toBe(
      'In chapter "Basics" (p1) › lesson "Branches" (l2), title cannot be empty.',
    );
  });

  it('passes over an option that does not know the value’s keys, and names a missing field', () => {
    const issue = { code: 'invalid_union', path: at, message: 'Invalid input' };
    const missing = {
      code: 'invalid_type',
      path: ['title'],
      message: 'Invalid input: expected string, received undefined',
    };
    const strange = { code: 'unrecognized_keys', path: [], message: 'Unrecognized keys' };
    const said = 'In chapter "Basics" (p1) › lesson "Branches" (l2), title is missing.';
    expect(describeIssue(course, { ...issue, errors: [[strange], [missing, blank]] })).toBe(said);
    expect(describeIssue(course, { ...issue, errors: [[missing, blank], [strange]] })).toBe(said);
    const nested = { ...strange, path: ['cover'] };
    expect(describeIssue(course, { ...issue, errors: [[nested], [missing, blank]] })).toBe(
      'In chapter "Basics" (p1) › lesson "Branches" (l2), cover: Unrecognized keys.',
    );
  });

  it('falls back to the union’s own message when no option says more', () => {
    const issue = { code: 'invalid_union', path: at, message: 'No matching discriminator' };
    const said = 'In chapter "Basics" (p1) › lesson "Branches" (l2), No matching discriminator.';
    expect(describeIssue(course, { ...issue, errors: [] })).toBe(said);
    expect(describeIssue(course, { ...issue, errors: [[]] })).toBe(said);
    expect(describeIssue(course, issue)).toBe(said);
  });
});

describe('sessionProblem', () => {
  it('accepts valid session fields and counts the rest after three', () => {
    expect(sessionProblem(toolState())).toBeNull();
    const state = toolState({
      title: '',
      summary: 'x'.repeat(4001),
      goals: [{ text: '', done: false }],
      todos: [{ id: '', text: '', done: false, createdAt: 'never' }],
    });
    expect(sessionProblem(state)).toMatch(/^Nothing was changed\. .* And \d+ more\.$/);
  });
});

describe('helpers', () => {
  it('makes ids that are not already used in the course, the to-dos or this call', () => {
    const state = toolState({
      todos: [{ id: 'todo-00000000', text: 'x', done: false, createdAt: '2026-11-19T10:00:00Z' }],
    });
    const values = [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const make = idMaker({ ...toolCtx(), random: () => values.shift() ?? 0.99 }, state.work, state);
    expect(make('todo')).toBe('todo-88888888');
    expect(make('b')).toBe('b-ffffffff');
  });

  it('keeps a position within the list', () => {
    expect(indexFor(undefined, 0)).toBe(0);
    expect(indexFor(undefined, 3)).toBe(2);
    expect(indexFor(undefined, 3, 1)).toBe(3);
    expect(indexFor(1, 3)).toBe(0);
    expect(indexFor(9, 3)).toBe(2);
    expect(indexFor(2, 0)).toBe(0);
  });

  it('names an item by title, or by id when it has none', () => {
    expect(named({ id: 'l1', title: 'Intro' })).toBe('"Intro" (l1)');
    expect(named({ id: 'l1', title: ' ' })).toBe('"l1"');
  });
});
