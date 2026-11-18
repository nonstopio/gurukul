import { describe, expect, it } from 'vitest';
import { courseChanges, lineDiff, wordDiff } from '../src/changes';
import type { BlockChange, ChangeRow, CourseChanges, CourseCopy, DiffPart } from '../src/changes';
import type { AnswerKeys, Block, Course, Item, Lesson, Question, Quiz } from '../src';
import { chapterAt, itemAt, makeCourse } from './fixtures';

// makeCourse(): chapter p1 holds l1 (one markdown block b1), q1 (question k1, options a and b),
// l2 and l3. The answer key marks a.

const KEYS = (): AnswerKeys => ({ q1: { k1: ['a'] } });
const copy = (course: Course, answers: AnswerKeys = KEYS()): CourseCopy => ({ course, answers });

/** Changes from a fresh makeCourse() to one edited by `fn`; `setup` shapes both sides first. */
function changes(
  fn: (work: Course, keys: AnswerKeys) => void,
  setup: (c: Course, keys: AnswerKeys) => void = () => undefined,
): CourseChanges {
  const base = copy(makeCourse());
  setup(base.course, base.answers);
  const work = copy(makeCourse());
  setup(work.course, work.answers);
  fn(work.course, work.answers);
  return courseChanges(base, work);
}

const summary = (c: CourseChanges) =>
  c.rows.map((r) => `${r.kind}:${r.id}:${r.statuses.join('+')}`);
const fieldsOf = (r: { fields: { field: string }[] }) => r.fields.map((f) => f.field);
const join = (parts: DiffPart[], skip: DiffPart['op']) =>
  parts
    .filter((p) => p.op !== skip)
    .map((p) => p.text)
    .join('');

function row<K extends ChangeRow['kind']>(c: CourseChanges, kind: K, id: string) {
  const found = c.rows.find((r) => r.kind === kind && r.id === id);
  if (!found) throw new Error(`no ${kind} row ${id}`);
  return found as Extract<ChangeRow, { kind: K }>;
}

const lesson = (c: Course, index: number): Lesson => {
  const item = itemAt(c, index);
  if (item.type !== 'lesson') throw new Error('not a lesson');
  return item;
};
const quiz = (c: Course): Quiz => {
  const item = itemAt(c, 1);
  if (item.type !== 'quiz') throw new Error('not a quiz');
  return item;
};
const question = (c: Course, index = 0): Question => {
  const q = quiz(c).questions[index];
  if (!q) throw new Error('no question');
  return q;
};
const block = (c: CourseChanges, id: string, lessonId = 'l1'): BlockChange => {
  const found = row(c, 'lesson', lessonId).blocks.find((b) => b.id === id);
  if (!found) throw new Error(`no block ${id}`);
  return found;
};
const newLesson = (id: string, over: Partial<Lesson> = {}): Lesson => ({
  type: 'lesson',
  id,
  title: id,
  minutes: 1,
  layout: 'stacked',
  completeWhen: 'manual',
  blocks: [],
  ...over,
});
const k2: Question = {
  id: 'k2',
  kind: 'single',
  prompt: 'Second?',
  options: [
    { id: 'c', text: 'C' },
    { id: 'd', text: 'D' },
  ],
  explanation: 'So',
};
const upload = (path: string, blurHash?: string) => ({
  path,
  bytes: 10,
  name: 'x.png',
  contentType: 'image/png' as const,
  ...(blurHash ? { blurHash } : {}),
});

describe('wordDiff and lineDiff', () => {
  it.each([
    ['', ''],
    ['', 'All new words'],
    ['Rebase replays your commits.', ''],
    ['Rebase replays  commits\non main.', 'Rebase replays your commits\n\non top of main!'],
  ])('joining the parts gives back %j and %j', (before, after) => {
    for (const diff of [wordDiff, lineDiff]) {
      const parts = diff(before, after);
      expect(join(parts, 'added')).toBe(before);
      expect(join(parts, 'removed')).toBe(after);
    }
  });

  it('marks changed words, keeping the rest', () => {
    expect(wordDiff('a b c', 'a x c')).toEqual([
      { op: 'same', text: 'a ' },
      { op: 'removed', text: 'b' },
      { op: 'added', text: 'x' },
      { op: 'same', text: ' c' },
    ]);
  });

  it('marks changed lines as whole lines', () => {
    expect(lineDiff('git add\ngit commit\n', 'git add\ngit commit -m "x"\n')).toEqual([
      { op: 'same', text: 'git add\n' },
      { op: 'removed', text: 'git commit\n' },
      { op: 'added', text: 'git commit -m "x"\n' },
    ]);
  });
});

describe('courseChanges: nothing and everything', () => {
  it('finds nothing between two identical copies', () => {
    expect(changes(() => undefined)).toEqual({ rows: [], count: 0, answerChanges: [] });
  });

  it('ignores what a session never edits: Educators, status, version, dates, minutes', () => {
    const c = changes((w) => {
      w.educatorIds = ['u1'];
      w.educatorNames = { u1: 'Asha' };
      w.status = 'draft';
      w.version = 9;
      w.publishedAt = null;
      w.estimatedMinutes = 99;
      w.schemaVersion = 4;
    });
    expect(c.count).toBe(0);
  });

  it('ignores the answersChanged flag and order-only answer key changes', () => {
    const base = copy(makeCourse(), { q1: { k1: ['a', 'b'] } });
    const work: CourseCopy = {
      ...copy(makeCourse(), { q1: { k1: ['b', 'a'] } }),
      answersChanged: true,
    };
    expect(courseChanges(base, work).count).toBe(0);
  });

  it('marks every row of a new course as added', () => {
    const c = courseChanges(null, copy(makeCourse()));
    expect(summary(c)).toEqual([
      'course:course:added',
      'landing:landing:added',
      'chapter:p1:added',
      'lesson:l1:added',
      'quiz:q1:added',
      'lesson:l2:added',
      'lesson:l3:added',
    ]);
    expect(c.count).toBe(7);
    expect(c.answerChanges).toEqual([]);
    const course = row(c, 'course', 'course');
    expect(fieldsOf(course)).toEqual([
      'title',
      'summary',
      'level',
      'cover.theme',
      'cover.glyph',
      'rules.sequential',
      'rules.passMark',
      'rules.certificate',
      'rules.requireVideoWatch',
      'certificate.title',
    ]);
    expect(course.fields.every((f) => f.before === null)).toBe(true);
    expect(course.fields[0]).toEqual({ field: 'title', before: null, after: 'Git' });
    const landing = row(c, 'landing', 'landing');
    expect(landing.outcomes.map((o) => [o.id, o.statuses])).toEqual([
      ['#0', ['added']],
      ['#1', ['added']],
    ]);
    expect(row(c, 'chapter', 'p1').fields[0]).toMatchObject({ before: null, after: 'Basics' });
    expect(block(c, 'b1').statuses).toEqual(['added']);
    expect(row(c, 'quiz', 'q1').questions[0]).toMatchObject({
      statuses: ['added'],
      answer: { before: [], after: ['a'] },
    });
  });

  it('marks a new course with an empty landing page as added all the same', () => {
    const work = makeCourse({ description: '', outcomes: [], chapters: [] });
    const c = courseChanges(null, copy(work, {}));
    expect(summary(c)).toEqual(['course:course:added', 'landing:landing:added']);
    expect(row(c, 'landing', 'landing').fields).toEqual([
      { field: 'description', before: null, after: '' },
    ]);
  });
});

describe('courseChanges: Course details', () => {
  const image = {
    url: 'https://example.com/cover.png',
    width: 800,
    height: 400,
    upload: upload('courses/git/media/cover.png', 'LEHV6nWB2yk8'),
  };
  it.each<[string, (c: Course) => void, unknown, unknown]>([
    ['title', (c) => (c.title = 'Git, simply'), 'Git', 'Git, simply'],
    [
      'summary',
      (c) => (c.summary = 'Version control, simply.'),
      'Version control.',
      'Version control, simply.',
    ],
    ['level', (c) => (c.level = 'advanced'), 'foundation', 'advanced'],
    ['cover.theme', (c) => (c.cover.theme = 'sky'), 'forest', 'sky'],
    ['cover.glyph', (c) => (c.cover.glyph = 'Ǥ'), 'G', 'Ǥ'],
    ['cover.image', (c) => (c.cover.image = image), null, image.url],
    ['rules.sequential', (c) => (c.rules.sequential = false), true, false],
    ['rules.passMark', (c) => (c.rules.passMark = 0.8), 0.7, 0.8],
    ['rules.certificate', (c) => (c.rules.certificate = false), true, false],
    ['rules.requireVideoWatch', (c) => (c.rules.requireVideoWatch = true), false, true],
    ['certificate.title', (c) => (c.certificate.title = 'Git Pro'), 'Git', 'Git Pro'],
  ])('reports %s as before → after', (field, edit, before, after) => {
    const c = changes(edit);
    expect(summary(c)).toEqual(['course:course:changed']);
    expect(row(c, 'course', 'course').fields).toMatchObject([{ field, before, after }]);
  });

  it('gives prose fields a word difference and plain ones none', () => {
    const c = changes((w) => {
      w.title = 'Git, simply';
      w.level = 'advanced';
    });
    const [title, level] = row(c, 'course', 'course').fields;
    expect(title?.words).toEqual([
      { op: 'same', text: 'Git' },
      { op: 'added', text: ', simply' },
    ]);
    expect(level).toEqual({ field: 'level', before: 'foundation', after: 'advanced' });
  });

  it('reports a new cover image file under the same address as changed', () => {
    const c = changes(
      (w) => (w.cover.image = { ...image, upload: upload(image.upload.path, 'L00000fQfQfQ') }),
      (s) => (s.cover.image = { ...image }),
    );
    expect(row(c, 'course', 'course').fields).toEqual([
      { field: 'cover.image', before: image.url, after: image.url },
    ]);
  });
});

describe('courseChanges: Landing page', () => {
  it('compares the description word by word', () => {
    const c = changes((w) => (w.description = '# Git, for teams'));
    const landing = row(c, 'landing', 'landing');
    expect(summary(c)).toEqual(['landing:landing:changed']);
    expect(landing.fields[0]?.words).toEqual([
      { op: 'same', text: '# Git' },
      { op: 'added', text: ', for teams' },
    ]);
    expect(landing.outcomes.every((o) => o.statuses.length === 0)).toBe(true);
  });

  it.each<[string, string[], [string, string[]][]]>([
    [
      'added',
      ['Commit', 'Branch', 'Merge'],
      [
        ['#0', []],
        ['#1', []],
        ['#2', ['added']],
      ],
    ],
    [
      'removed',
      ['Commit'],
      [
        ['#0', []],
        ['removed#1', ['removed']],
      ],
    ],
    [
      'removed first',
      ['Branch'],
      [
        ['removed#0', ['removed']],
        ['#0', []],
      ],
    ],
    [
      'reworded',
      ['Commit', 'Branch out'],
      [
        ['#0', []],
        ['#1', ['changed']],
      ],
    ],
    [
      'reworded and added',
      ['Commit', 'Rebase', 'Merge'],
      [
        ['#0', []],
        ['#1', ['changed']],
        ['#2', ['added']],
      ],
    ],
    [
      'added first',
      ['Clone', 'Commit', 'Branch'],
      [
        ['#0', ['added']],
        ['#1', []],
        ['#2', []],
      ],
    ],
  ])('lists outcomes %s', (_name, outcomes, expected) => {
    const c = changes((w) => (w.outcomes = outcomes));
    const landing = row(c, 'landing', 'landing');
    expect(landing.statuses).toEqual(['changed']);
    expect(landing.outcomes.map((o) => [o.id, o.statuses])).toEqual(expected);
  });

  it('gives a reworded outcome its word difference', () => {
    const c = changes((w) => (w.outcomes = ['Commit', 'Branch out']));
    expect(row(c, 'landing', 'landing').outcomes[1]).toEqual({
      id: '#1',
      statuses: ['changed'],
      before: 'Branch',
      after: 'Branch out',
      fields: [
        {
          field: 'text',
          before: 'Branch',
          after: 'Branch out',
          words: [
            { op: 'same', text: 'Branch' },
            { op: 'added', text: ' out' },
          ],
        },
      ],
    });
  });
});

// One sample of every block type, and an edit of every field the Review shows for it.
const BLOCKS: { block: Block; edit: Block; fields: string[] }[] = [
  {
    block: { type: 'markdown', id: 'x', md: 'Rebase replays commits.' },
    edit: { type: 'markdown', id: 'x', md: 'Rebase replays your commits.' },
    fields: ['md'],
  },
  {
    block: { type: 'callout', id: 'x', tone: 'note', md: 'Careful.' },
    edit: { type: 'callout', id: 'x', tone: 'warning', title: 'Stop', md: 'Be careful.' },
    fields: ['tone', 'title', 'md'],
  },
  {
    block: {
      type: 'code',
      id: 'x',
      lang: 'bash',
      code: 'git rebase\n',
      copy: true,
      terminal: true,
    },
    edit: {
      type: 'code',
      id: 'x',
      lang: 'sh',
      file: 'run.sh',
      code: 'git rebase main\n',
      copy: false,
      terminal: false,
      highlight: '1',
    },
    fields: ['lang', 'file', 'code', 'copy', 'terminal', 'highlight'],
  },
  {
    block: {
      type: 'video',
      id: 'x',
      provider: 'youtube',
      url: 'https://youtu.be/a',
      captions: false,
    },
    edit: {
      type: 'video',
      id: 'x',
      provider: 'loom',
      url: 'https://loom.com/share/b',
      captions: true,
      title: 'Rebase',
      caption: 'Watch it',
      durationSec: 60,
    },
    fields: ['provider', 'url', 'captions', 'title', 'caption', 'durationSec'],
  },
  {
    block: { type: 'image', id: 'x', url: 'https://example.com/a.png', alt: 'A graph' },
    edit: {
      type: 'image',
      id: 'x',
      url: 'https://example.com/b.png',
      alt: 'A commit graph',
      caption: 'After',
      layout: 'small',
      zoom: true,
      border: false,
      width: 800,
      height: 600,
      upload: upload('courses/git/media/b.png'),
    },
    fields: ['url', 'alt', 'caption', 'layout', 'zoom', 'border', 'width', 'height', 'upload'],
  },
  {
    block: { type: 'embed', id: 'x', url: 'https://codesandbox.io/a', title: 'Sandbox' },
    edit: { type: 'embed', id: 'x', url: 'https://codesandbox.io/b', title: 'Your sandbox' },
    fields: ['url', 'title'],
  },
  {
    block: { type: 'file', id: 'x', url: 'https://example.com/a.pdf', label: 'Cheatsheet' },
    edit: {
      type: 'file',
      id: 'x',
      url: 'https://example.com/b.pdf',
      label: 'Git cheatsheet',
      upload: { ...upload('courses/git/media/b.pdf'), contentType: 'application/pdf' },
    },
    fields: ['url', 'label', 'upload'],
  },
  {
    block: {
      type: 'check',
      id: 'x',
      prompt: 'Which?',
      options: ['A', 'B'],
      correct: 0,
      explanation: 'A',
    },
    edit: {
      type: 'check',
      id: 'x',
      prompt: 'Which one?',
      options: ['A', 'B'],
      correct: 0,
      explanation: 'A, of course',
    },
    fields: ['prompt', 'explanation'],
  },
];

describe('courseChanges: blocks', () => {
  const withBlocks =
    (...blocks: Block[]) =>
    (c: Course) =>
      (lesson(c, 0).blocks = blocks);
  const b1: Block = { type: 'markdown', id: 'b1', md: 'hi' };

  it.each(BLOCKS)('$block.type block added', ({ block: b }) => {
    const c = changes(withBlocks(b1, b));
    expect(summary(c)).toEqual(['lesson:l1:changed']);
    const entry = block(c, 'x');
    expect(entry).toMatchObject({ type: b.type, statuses: ['added'], before: null, after: b });
    expect(entry.fields.length).toBeGreaterThan(0);
    expect(entry.fields.every((f) => f.before === null)).toBe(true);
    expect(block(c, 'b1').statuses).toEqual([]);
  });

  it.each(BLOCKS)('$block.type block removed', ({ block: b }) => {
    const c = changes(withBlocks(b1), withBlocks(b1, b));
    expect(summary(c)).toEqual(['lesson:l1:changed']);
    expect(block(c, 'x')).toMatchObject({ type: b.type, statuses: ['removed'], after: null });
  });

  it.each(BLOCKS)('$block.type block changed', ({ block: b, edit, fields }) => {
    const c = changes(withBlocks(b1, edit), withBlocks(b1, b));
    expect(summary(c)).toEqual(['lesson:l1:changed']);
    const entry = block(c, 'x');
    expect(entry.statuses).toEqual(['changed']);
    expect(fieldsOf(entry)).toEqual(fields);
    expect(entry.answer).toBeUndefined();
  });

  it.each(BLOCKS)('$block.type block moved', ({ block: b }) => {
    const c = changes(withBlocks(b1, b), withBlocks(b, b1));
    expect(summary(c)).toEqual(['lesson:l1:changed']);
    expect(row(c, 'lesson', 'l1').blocks.map((e) => [e.id, e.statuses])).toEqual([
      ['b1', []],
      ['x', ['moved']],
    ]);
  });

  it('marks a block both moved and changed', () => {
    const [{ block: b, edit }] = BLOCKS as [(typeof BLOCKS)[number]];
    const c = changes(withBlocks(b1, edit), withBlocks(b, b1));
    expect(block(c, 'x').statuses).toEqual(['changed', 'moved']);
  });

  it('gives markdown a word difference and code a line difference', () => {
    const md = changes(withBlocks({ ...b1, md: 'hi there' }));
    expect(block(md, 'b1').fields[0]?.words).toEqual([
      { op: 'same', text: 'hi' },
      { op: 'added', text: ' there' },
    ]);
    const [, , code] = BLOCKS as [Block, Block, (typeof BLOCKS)[number]];
    const c = changes(withBlocks(code.edit), withBlocks(code.block));
    const field = block(c, 'x').fields.find((f) => f.field === 'code');
    expect(field).toEqual({
      field: 'code',
      before: 'git rebase\n',
      after: 'git rebase main\n',
      lines: [
        { op: 'removed', text: 'git rebase\n' },
        { op: 'added', text: 'git rebase main\n' },
      ],
    });
  });

  it('shows an upload by its path', () => {
    const img: Block = { type: 'image', id: 'x', url: 'https://example.com/a.png', alt: 'A' };
    const c = changes(
      withBlocks({ ...img, upload: upload('courses/git/media/b.png') }),
      withBlocks({ ...img, upload: upload('courses/git/media/a.png') }),
    );
    expect(block(c, 'x').fields).toEqual([
      {
        field: 'upload',
        before: 'courses/git/media/a.png',
        after: 'courses/git/media/b.png',
      },
    ]);
  });

  it('shows an unrecognised object as its JSON rather than failing', () => {
    const img = { type: 'image', id: 'x', url: 'https://example.com/a.png', alt: 'A' } as Block;
    const odd = { ...img, upload: { name: 'x' } } as unknown as Block;
    const c = changes(withBlocks(odd), withBlocks(img));
    expect(block(c, 'x').fields).toEqual([
      { field: 'upload', before: null, after: '{"name":"x"}' },
    ]);
  });

  it('compares nothing inside a block type it does not know, and does not fail', () => {
    const odd = { type: 'poll', id: 'x', q: 'a' } as unknown as Block;
    const c = changes(withBlocks(b1, { ...odd, q: 'b' } as unknown as Block), withBlocks(b1, odd));
    expect(c.count).toBe(0);
  });

  it('reports a type change under the same id with the fields of both types', () => {
    const c = changes(
      withBlocks({ type: 'callout', id: 'b1', tone: 'note', md: 'hi' }),
      withBlocks(b1),
    );
    expect(block(c, 'b1')).toMatchObject({ type: 'callout', statuses: ['changed'] });
    expect(block(c, 'b1').fields).toEqual([
      { field: 'type', before: 'markdown', after: 'callout' },
      { field: 'tone', before: null, after: 'note' },
    ]);
  });

  it('drops a check block’s options and answer when it becomes another type', () => {
    const check: Block = {
      type: 'check',
      id: 'b1',
      prompt: 'Which?',
      options: ['A', 'B'],
      correct: 1,
      explanation: 'B',
    };
    const c = changes(withBlocks(b1), withBlocks(check));
    const entry = block(c, 'b1');
    expect(fieldsOf(entry)).toEqual(['type', 'prompt', 'explanation', 'md']);
    // Cleared on one side: before → after, no word difference.
    expect(entry.fields[2]).toEqual({ field: 'explanation', before: 'B', after: null });
    expect(entry.options?.map((o) => [o.id, o.statuses])).toEqual([
      ['removed#0', ['removed']],
      ['removed#1', ['removed']],
    ]);
    expect(entry.answer).toEqual({ before: ['removed#1'], after: [] });
  });

  it('leaves an unchanged lesson’s unchanged blocks in place, with no statuses', () => {
    const c = changes((w) => (lesson(w, 0).title = 'Init a repo'));
    expect(row(c, 'lesson', 'l1').blocks).toEqual([
      { id: 'b1', type: 'markdown', statuses: [], before: b1, after: b1, fields: [] },
    ]);
  });
});

type CheckBlock = Extract<Block, { type: 'check' }>;

describe('courseChanges: check blocks', () => {
  const check = (over: Partial<CheckBlock> = {}): CheckBlock => ({
    type: 'check',
    id: 'x',
    prompt: 'Which?',
    options: ['A', 'B', 'C'],
    correct: 0,
    explanation: 'A',
    ...over,
  });
  const run = (before: Block, after: Block) =>
    block(
      changes(
        (w) => (lesson(w, 0).blocks = [after]),
        (s) => (lesson(s, 0).blocks = [before]),
      ),
      'x',
    );

  it.each<[string, Partial<Extract<Block, { type: 'check' }>>, [string, string[]][]]>([
    [
      'added',
      { options: ['A', 'B', 'C', 'D'] },
      [
        ['#0', []],
        ['#1', []],
        ['#2', []],
        ['#3', ['added']],
      ],
    ],
    [
      'removed',
      { options: ['A', 'C'] },
      [
        ['#0', []],
        ['removed#1', ['removed']],
        ['#1', []],
      ],
    ],
    [
      'reworded',
      { options: ['A', 'Bee', 'C'] },
      [
        ['#0', []],
        ['#1', ['changed']],
        ['#2', []],
      ],
    ],
  ])('lists an option %s', (_name, over, expected) => {
    const entry = run(check(), check(over));
    expect(entry.statuses).toEqual(['changed']);
    expect(entry.options?.map((o) => [o.id, o.statuses])).toEqual(expected);
    expect(entry.answer).toBeUndefined();
  });

  it('calls out a changed correct answer on its own and lists it', () => {
    const c = changes(
      (w) => (lesson(w, 0).blocks = [check({ correct: 2 })]),
      (s) => (lesson(s, 0).blocks = [check()]),
    );
    const entry = block(c, 'x');
    expect(entry).toMatchObject({ statuses: ['changed'], fields: [] });
    expect(entry.answer).toEqual({ before: ['#0'], after: ['#2'] });
    expect(c.answerChanges).toEqual([{ kind: 'check', itemId: 'l1', id: 'x' }]);
  });

  it.each<[string, Block[], Block[]]>([
    ['added', [], [check()]],
    ['removed', [check()], []],
    ['turned into a check', [{ type: 'markdown', id: 'x', md: 'A' }], [check()]],
    ['turned into text', [check()], [{ type: 'markdown', id: 'x', md: 'A' }]],
  ])('does not list the answer of a check block %s', (_name, before, after) => {
    const c = changes(
      (w) => (lesson(w, 0).blocks = after),
      (s) => (lesson(s, 0).blocks = before),
    );
    expect(block(c, 'x').answer).toBeDefined();
    expect(c.answerChanges).toEqual([]);
  });

  it('calls out a correct answer set for the first time', () => {
    const unset = check();
    delete unset.correct;
    expect(run(unset, check()).answer).toEqual({ before: [], after: ['#0'] });
  });

  it.each<[string, Partial<CheckBlock>, Partial<CheckBlock>]>([
    ['moved down', { correct: 0 }, { options: ['B', 'A', 'C'], correct: 1 }],
    ['moved to the top', { correct: 2 }, { options: ['C', 'A', 'B'], correct: 0 }],
    ['moved, another option reworded', { correct: 0 }, { options: ['Bee', 'A', 'C'], correct: 1 }],
  ])('does not call a right option %s an answer change', (_name, before, after) => {
    expect(run(check(before), check(after)).answer).toBeUndefined();
  });

  it('finds nothing when only the mark moves between equal texts, or both marks are stale', () => {
    const same = (before: Partial<CheckBlock>, after: Partial<CheckBlock>) =>
      changes(
        (w) => (lesson(w, 0).blocks = [check(after)]),
        (s) => (lesson(s, 0).blocks = [check(before)]),
      ).count;
    expect(same({ options: ['A', 'A'], correct: 0 }, { options: ['A', 'A'], correct: 1 })).toBe(0);
    expect(same({ correct: 5 }, { correct: 4 })).toBe(0);
  });

  it('calls a reworded right option an answer change', () => {
    const entry = run(check(), check({ options: ['Ay', 'B', 'C'] }));
    expect(entry.answer).toEqual({ before: ['#0'], after: ['#0'] });
    expect(entry.options?.[0]).toMatchObject({ before: 'A', after: 'Ay', statuses: ['changed'] });
  });

  it('calls a cleared right answer an answer change', () => {
    const unset = check() as CheckBlock;
    delete unset.correct;
    expect(run(check(), unset).answer).toEqual({ before: ['#0'], after: [] });
  });

  it('keeps the option list aligned when the right option moves', () => {
    const reordered = run(check({ correct: 1 }), check({ options: ['B', 'A', 'C'], correct: 0 }));
    expect(reordered.answer).toBeUndefined();
    expect(reordered.options?.map((o) => [o.id, o.statuses])).toEqual([
      ['removed#0', ['removed']],
      ['#0', []],
      ['#1', ['added']],
      ['#2', []],
    ]);
  });

  it('gives an added check block its answer, with nothing before', () => {
    const c = changes((w) => lesson(w, 0).blocks.push(check()));
    expect(block(c, 'x')).toMatchObject({
      statuses: ['added'],
      answer: { before: [], after: ['#0'] },
    });
  });
});

describe('courseChanges: Quiz questions and answer keys', () => {
  it('lists an added question, with its key but no answer change', () => {
    const c = changes((w, keys) => {
      quiz(w).questions.push(k2);
      keys.q1 = { k1: ['a'], k2: ['c'] };
    });
    expect(summary(c)).toEqual(['quiz:q1:changed']);
    const q = row(c, 'quiz', 'q1').questions;
    expect(q.map((e) => [e.id, e.statuses])).toEqual([
      ['k1', []],
      ['k2', ['added']],
    ]);
    expect(q[1]?.answer).toEqual({ before: [], after: ['c'] });
    expect(q[1]?.options.map((o) => o.statuses)).toEqual([['added'], ['added']]);
    expect(c.answerChanges).toEqual([]);
  });

  it('lists a removed question, with no answer change', () => {
    const c = changes(
      (w) => quiz(w).questions.pop(),
      (s, keys) => {
        quiz(s).questions.push(k2);
        keys.q1 = { k1: ['a'], k2: ['d'] };
      },
    );
    const q = row(c, 'quiz', 'q1').questions[1];
    expect(q).toMatchObject({
      id: 'k2',
      statuses: ['removed'],
      answer: { before: ['d'], after: [] },
    });
    expect(c.answerChanges).toEqual([]);
  });

  it('lists a removed question with no key and no answer', () => {
    const c = changes(
      (w) => quiz(w).questions.pop(),
      (s) => quiz(s).questions.push(k2),
    );
    expect(row(c, 'quiz', 'q1').questions[1]).not.toHaveProperty('answer');
  });

  it.each<[string, (q: Question) => void, string[]]>([
    ['kind', (q) => (q.kind = 'multiple'), ['kind']],
    ['prompt', (q) => (q.prompt = 'Which one?'), ['prompt']],
    ['code', (q) => (q.code = 'git log\n'), ['code']],
    ['explanation', (q) => (q.explanation = 'Because of A'), ['explanation']],
    ['reviewItemId', (q) => (q.reviewItemId = 'l1'), ['reviewItemId']],
  ])('reports a changed %s', (_name, edit, fields) => {
    const c = changes((w) => edit(question(w)));
    const q = row(c, 'quiz', 'q1').questions[0];
    expect(q?.statuses).toEqual(['changed']);
    expect(q && fieldsOf(q)).toEqual(fields);
    expect(c.answerChanges).toEqual([]);
  });

  it('gives question code a line difference and the prompt a word difference', () => {
    const c = changes(
      (w) => {
        question(w).code = 'git log\n';
        question(w).prompt = 'Which one?';
      },
      (s) => (question(s).code = 'git status\n'),
    );
    const [prompt, code] = row(c, 'quiz', 'q1').questions[0]?.fields ?? [];
    expect(prompt?.words).toEqual([
      { op: 'same', text: 'Which' },
      { op: 'added', text: ' one' },
      { op: 'same', text: '?' },
    ]);
    expect(code?.lines).toEqual([
      { op: 'removed', text: 'git status\n' },
      { op: 'added', text: 'git log\n' },
    ]);
    const added = changes((w) => (question(w).code = 'git log\n'));
    expect(row(added, 'quiz', 'q1').questions[0]?.fields).toEqual([
      { field: 'code', before: null, after: 'git log\n' },
    ]);
  });

  it('marks swapped questions: one moved, not both', () => {
    const c = changes(
      (w) => quiz(w).questions.reverse(),
      (s) => quiz(s).questions.push(k2),
    );
    expect(row(c, 'quiz', 'q1').questions.map((q) => [q.id, q.statuses])).toEqual([
      ['k2', []],
      ['k1', ['moved']],
    ]);
  });

  it.each<[string, (q: Question) => void, [string, string[]][]]>([
    [
      'added',
      (q) => q.options.push({ id: 'c', text: 'C' }),
      [
        ['a', []],
        ['b', []],
        ['c', ['added']],
      ],
    ],
    [
      'removed',
      (q) => q.options.shift(),
      [
        ['a', ['removed']],
        ['b', []],
      ],
    ],
    [
      'reworded',
      (q) => (q.options[1] = { id: 'b', text: 'Bee' }),
      [
        ['a', []],
        ['b', ['changed']],
      ],
    ],
    [
      'moved',
      (q) => q.options.reverse(),
      [
        ['b', []],
        ['a', ['moved']],
      ],
    ],
  ])('lists an option %s', (_name, edit, expected) => {
    const c = changes((w) => edit(question(w)));
    const q = row(c, 'quiz', 'q1').questions[0];
    expect(q?.statuses).toEqual(['changed']);
    expect(q?.options.map((o) => [o.id, o.statuses])).toEqual(expected);
  });

  it('gives a reworded option its word difference', () => {
    const c = changes((w) => (question(w).options[1] = { id: 'b', text: 'B, then C' }));
    expect(row(c, 'quiz', 'q1').questions[0]?.options[1]?.fields).toEqual([
      {
        field: 'text',
        before: 'B',
        after: 'B, then C',
        words: [
          { op: 'same', text: 'B' },
          { op: 'added', text: ', then C' },
        ],
      },
    ]);
  });

  it('calls out a changed answer key on its own and lists it', () => {
    const c = changes((_w, keys) => (keys.q1 = { k1: ['b'] }));
    expect(summary(c)).toEqual(['quiz:q1:changed']);
    const q = row(c, 'quiz', 'q1').questions[0];
    expect(q).toMatchObject({
      statuses: ['changed'],
      fields: [],
      answer: { before: ['a'], after: ['b'] },
    });
    expect(c.answerChanges).toEqual([{ kind: 'question', itemId: 'q1', id: 'k1' }]);
  });

  it('treats a missing key as no answer', () => {
    const c = changes(
      (_w, keys) => (keys.q1 = { k1: ['a'] }),
      (_c, keys) => delete keys.q1,
    );
    expect(row(c, 'quiz', 'q1').questions[0]?.answer).toEqual({ before: [], after: ['a'] });
    expect(c.answerChanges).toEqual([{ kind: 'question', itemId: 'q1', id: 'k1' }]);
    const gone = changes((_w, keys) => (keys.q1 = {}));
    expect(row(gone, 'quiz', 'q1').questions[0]?.answer).toEqual({ before: ['a'], after: [] });
  });

  it('does not count a key reordered for a multiple-answer question', () => {
    const c = changes(
      (_w, keys) => (keys.q1 = { k1: ['b', 'a'] }),
      (_c, keys) => (keys.q1 = { k1: ['a', 'b'] }),
    );
    expect(c.count).toBe(0);
  });

  it('compares the keys of a moved Quiz by its id', () => {
    const c = changes((w, keys) => {
      const items = chapterAt(w, 0).items;
      items.push(items.splice(1, 1)[0] as Item);
      keys.q1 = { k1: ['b'] };
    });
    expect(summary(c)).toEqual(['quiz:q1:changed+moved']);
    expect(c.answerChanges).toEqual([{ kind: 'question', itemId: 'q1', id: 'k1' }]);
  });

  it('does not list the keys of a removed Quiz as answer changes', () => {
    const c = changes((w) => chapterAt(w, 0).items.splice(1, 1));
    expect(summary(c)).toEqual(['quiz:q1:removed']);
    expect(row(c, 'quiz', 'q1').questions[0]).toMatchObject({
      statuses: ['removed'],
      answer: { before: ['a'], after: [] },
    });
    expect(c.answerChanges).toEqual([]);
  });
});

describe('courseChanges: lesson and Quiz settings', () => {
  it.each<[string, (l: Lesson) => void, unknown, unknown]>([
    ['title', (l) => (l.title = 'Init a repo'), 'Init', 'Init a repo'],
    ['minutes', (l) => (l.minutes = 8), 5, 8],
    ['layout', (l) => (l.layout = 'article'), 'stacked', 'article'],
    ['completeWhen', (l) => (l.completeWhen = 'scrolled'), 'manual', 'scrolled'],
    ['kindLabel', (l) => (l.kindLabel = 'Lab'), null, 'Lab'],
  ])('reports a lesson’s %s', (field, edit, before, after) => {
    const c = changes((w) => edit(lesson(w, 0)));
    expect(summary(c)).toEqual(['lesson:l1:changed']);
    const r = row(c, 'lesson', 'l1');
    expect(r).toMatchObject({ chapterId: 'p1', fields: [{ field, before, after }] });
    expect(r).not.toHaveProperty('move');
  });

  it.each<[string, (q: Quiz) => void, unknown, unknown]>([
    ['title', (q) => (q.title = 'Rebase check'), 'Check', 'Rebase check'],
    ['passMark', (q) => (q.passMark = 0.8), null, 0.8],
    ['questionsShown', (q) => (q.questionsShown = 2), 1, 2],
    ['shuffleOptions', (q) => (q.shuffleOptions = false), true, false],
    ['cooldownMinutes', (q) => (q.cooldownMinutes = 30), 0, 30],
    ['revealAnswers', (q) => (q.revealAnswers = 'never'), 'each', 'never'],
    ['blocksNext', (q) => (q.blocksNext = false), true, false],
  ])('reports a Quiz’s %s', (field, edit, before, after) => {
    const c = changes((w) => edit(quiz(w)));
    expect(summary(c)).toEqual(['quiz:q1:changed']);
    expect(row(c, 'quiz', 'q1').fields).toMatchObject([{ field, before, after }]);
  });

  it('reports a lesson turned into a Quiz under the same id as one removed and one added', () => {
    const c = changes((w) => {
      const q: Quiz = { ...quiz(w), id: 'l2', questions: [k2] };
      chapterAt(w, 0).items[2] = q;
    });
    expect(summary(c)).toEqual(['lesson:l2:removed', 'quiz:l2:added']);
  });
});

describe('courseChanges: moving lessons and Quizzes', () => {
  const p2 = () => ({ id: 'p2', title: 'Branches', items: [newLesson('m1')] });

  it('marks only the item that moved within its chapter', () => {
    const c = changes((w) => {
      const items = chapterAt(w, 0).items;
      items.splice(1, 0, items.shift() as Item);
    });
    expect(summary(c)).toEqual(['lesson:l1:moved']);
    expect(row(c, 'lesson', 'l1').move).toEqual({
      fromChapterId: 'p1',
      fromIndex: 0,
      toChapterId: 'p1',
      toIndex: 1,
    });
  });

  it('marks an item moved to another chapter, listed under its new chapter', () => {
    const c = changes(
      (w) => chapterAt(w, 1).items.unshift(chapterAt(w, 0).items.splice(2, 1)[0] as Item),
      (s) => s.chapters.push(p2()),
    );
    expect(summary(c)).toEqual(['lesson:l2:moved']);
    const r = row(c, 'lesson', 'l2');
    expect(r).toMatchObject({
      chapterId: 'p2',
      move: { fromChapterId: 'p1', fromIndex: 2, toChapterId: 'p2', toIndex: 0 },
    });
    expect(r.before?.id).toBe('l2');
  });

  it('marks an item moved and edited with both', () => {
    const c = changes(
      (w) => {
        const moved = chapterAt(w, 0).items.splice(2, 1)[0] as Lesson;
        moved.title = 'Commit often';
        chapterAt(w, 1).items.push(moved);
      },
      (s) => s.chapters.push(p2()),
    );
    expect(summary(c)).toEqual(['lesson:l2:changed+moved']);
  });

  it('does not mark the items after an insertion or a deletion as moved', () => {
    const inserted = changes((w) => chapterAt(w, 0).items.unshift(newLesson('l0')));
    expect(summary(inserted)).toEqual(['lesson:l0:added']);
    const deleted = changes((w) => chapterAt(w, 0).items.splice(1, 1));
    expect(summary(deleted)).toEqual(['quiz:q1:removed']);
  });
});

describe('courseChanges: chapters', () => {
  const p2 = () => ({ id: 'p2', title: 'Branches', items: [newLesson('m1'), newLesson('m2')] });

  it('lists an added chapter followed by its items', () => {
    const c = changes((w) => w.chapters.push(p2()));
    expect(summary(c)).toEqual(['chapter:p2:added', 'lesson:m1:added', 'lesson:m2:added']);
    expect(row(c, 'lesson', 'm1').chapterId).toBe('p2');
  });

  it('lists a removed chapter followed by its removed items, not the ones that moved out', () => {
    const c = changes(
      (w) => {
        const [gone] = w.chapters.splice(1, 1);
        chapterAt(w, 0).items.push(gone?.items[0] as Item);
      },
      (s) => s.chapters.push(p2()),
    );
    expect(summary(c)).toEqual(['lesson:m1:moved', 'chapter:p2:removed', 'lesson:m2:removed']);
    expect(row(c, 'lesson', 'm2').chapterId).toBe('p2');
    expect(row(c, 'chapter', 'p2').after).toBeNull();
  });

  it('reports a renamed chapter with a word difference', () => {
    const c = changes((w) => (chapterAt(w, 0).title = 'The basics'));
    expect(summary(c)).toEqual(['chapter:p1:renamed']);
    expect(row(c, 'chapter', 'p1').fields[0]?.words).toEqual([
      { op: 'removed', text: 'Basics' },
      { op: 'added', text: 'The basics' },
    ]);
  });

  it('marks one of two swapped chapters as moved, with its positions', () => {
    const c = changes(
      (w) => w.chapters.reverse(),
      (s) => s.chapters.push(p2()),
    );
    expect(summary(c)).toEqual(['chapter:p1:moved']);
    expect(row(c, 'chapter', 'p1').move).toEqual({ fromIndex: 0, toIndex: 1 });
  });

  it('marks a chapter both renamed and moved', () => {
    const c = changes(
      (w) => {
        w.chapters.reverse();
        chapterAt(w, 1).title = 'Basics, again';
      },
      (s) => s.chapters.push(p2()),
    );
    expect(summary(c)).toEqual(['chapter:p1:renamed+moved']);
  });
});

describe('courseChanges: display order', () => {
  // Base: p1 [l1, q1, l2, l3], p2 [m1, m2], p3 [n1].
  // Work: p1 [l0 (new), l1, l3 (edited)], p3 [n1, m1]; p2, q1, l2 and m2 are gone.
  const setup = (c: Course) =>
    c.chapters.push(
      { id: 'p2', title: 'Branches', items: [newLesson('m1'), newLesson('m2')] },
      { id: 'p3', title: 'Merging', items: [newLesson('n1')] },
    );

  it('lists removed items and chapters where they used to be', () => {
    const c = changes((w) => {
      const p1 = chapterAt(w, 0);
      const [, , , l3] = p1.items;
      p1.items = [newLesson('l0'), itemAt(w, 0), { ...(l3 as Lesson), title: 'Branch out' }];
      const m1 = chapterAt(w, 1).items[0] as Item;
      w.chapters.splice(1, 1);
      chapterAt(w, 1).items.push(m1);
    }, setup);
    expect(summary(c)).toEqual([
      'lesson:l0:added',
      'quiz:q1:removed',
      'lesson:l2:removed',
      'lesson:l3:changed',
      'chapter:p2:removed',
      'lesson:m2:removed',
      'lesson:m1:moved',
    ]);
    expect(c.rows.map((r) => ('chapterId' in r ? r.chapterId : r.id))).toEqual([
      'p1',
      'p1',
      'p1',
      'p1',
      'p2',
      'p2',
      'p3',
    ]);
    expect(c.count).toBe(7);
  });

  it('lists a removed first item before anything added in its place', () => {
    const c = changes((w) => (chapterAt(w, 0).items[0] = newLesson('l0')));
    expect(summary(c)).toEqual(['lesson:l1:removed', 'lesson:l0:added']);
  });

  it('puts Course details and the Landing page first', () => {
    const c = changes((w) => {
      chapterAt(w, 0).title = 'The basics';
      w.outcomes = ['Commit'];
      w.title = 'Git, simply';
    });
    expect(summary(c)).toEqual([
      'course:course:changed',
      'landing:landing:changed',
      'chapter:p1:renamed',
    ]);
  });
});

describe('courseChanges: repeated ids (allowed by the schema, refused only on publish)', () => {
  const twin = (id: string, title = id) => newLesson(id, { title });
  const blocksX: Block[] = [
    { type: 'markdown', id: 'x', md: 'one' },
    { type: 'markdown', id: 'x', md: 'two' },
  ];

  it.each<[string, (c: Course) => void]>([
    [
      'two lessons in different chapters',
      (c) => c.chapters.push({ id: 'p2', title: 'More', items: [twin('l2', 'Other')] }),
    ],
    ['two lessons in one chapter', (c) => chapterAt(c, 0).items.push(twin('l2', 'Again'))],
    ['two blocks in one lesson', (c) => (lesson(c, 0).blocks = blocksX)],
    ['two questions in one Quiz', (c) => quiz(c).questions.push({ ...k2, id: 'k1' })],
    ['two options in one question', (c) => question(c).options.push({ id: 'a', text: 'A again' })],
    ['two chapters', (c) => c.chapters.push({ id: 'p1', title: 'Basics, again', items: [] })],
  ])('finds nothing between identical copies with %s', (_name, setup) => {
    expect(changes(() => undefined, setup)).toEqual({ rows: [], count: 0, answerChanges: [] });
  });

  it('pairs repeats in order, so an edit lands on the right one', () => {
    const c = changes(
      (w) => {
        const second = chapterAt(w, 1).items[0] as Lesson;
        second.title = 'Other, edited';
      },
      (s) => s.chapters.push({ id: 'p2', title: 'More', items: [twin('l2', 'Other')] }),
    );
    expect(summary(c)).toEqual(['lesson:l2:changed']);
    expect(row(c, 'lesson', 'l2')).toMatchObject({ key: 'lesson:l2', chapterId: 'p2' });
  });

  it('gives the later of two rows with the same kind and id a numbered key', () => {
    const c = changes(
      (w) => {
        lesson(w, 2).title = 'Commit, edited';
        (chapterAt(w, 1).items[0] as Lesson).title = 'Other, edited';
      },
      (s) => s.chapters.push({ id: 'p2', title: 'More', items: [twin('l2', 'Other')] }),
    );
    expect(c.rows.map((r) => [r.key, 'chapterId' in r ? r.chapterId : null])).toEqual([
      ['lesson:l2', 'p1'],
      ['lesson:l2#2', 'p2'],
    ]);
  });

  it('matches a repeated block by order of occurrence', () => {
    const c = changes(
      (w) =>
        (lesson(w, 0).blocks = [blocksX[0] as Block, { type: 'markdown', id: 'x', md: 'too' }]),
      (s) => (lesson(s, 0).blocks = blocksX),
    );
    expect(row(c, 'lesson', 'l1').blocks.map((b) => [b.id, b.statuses])).toEqual([
      ['x', []],
      ['x', ['changed']],
    ]);
  });
});

describe('courseChanges: row keys', () => {
  it('keys every row by kind and id, so equal ids of different kinds stay apart', () => {
    const c = changes((w) => {
      w.title = 'Git, simply';
      w.outcomes = ['Commit'];
      w.chapters.push({ id: 'course', title: 'Course', items: [] });
      chapterAt(w, 0).items[2] = { ...quiz(w), id: 'l2' };
    });
    expect(c.rows.map((r) => r.key)).toEqual([
      'course:course',
      'landing:landing',
      'lesson:l2',
      'quiz:l2',
      'chapter:course',
    ]);
    expect(new Set(c.rows.map((r) => r.key)).size).toBe(c.count);
  });
});

describe('courseChanges: answer keys as sets', () => {
  it('ignores a repeated id in a key', () => {
    const c = changes(
      (_w, keys) => (keys.q1 = { k1: ['a', 'a', 'b'] }),
      (_c, keys) => (keys.q1 = { k1: ['a', 'b'] }),
    );
    expect(c.count).toBe(0);
  });
});

describe('wordDiff and lineDiff: texts too different to compare', () => {
  const unrelated = (prefix: string, sep: string) =>
    Array.from({ length: 1500 }, (_, i) => `${prefix}${i}`).join(sep);

  it.each([
    ['words', wordDiff, ' '],
    ['lines', lineDiff, '\n'],
  ] as const)(
    'gives up on %s past the edit bound: all removed, then all added',
    (_n, diff, sep) => {
      const a = unrelated('a', sep);
      const b = unrelated('b', sep);
      expect(diff(a, b)).toEqual([
        { op: 'removed', text: a },
        { op: 'added', text: b },
      ]);
      expect(diff('', b)).toEqual([{ op: 'added', text: b }]);
      expect(diff(a, '')).toEqual([{ op: 'removed', text: a }]);
    },
  );

  it('still compares similar long texts word by word', () => {
    const a = unrelated('a', ' ');
    const parts = wordDiff(a, `${a} end`);
    expect(parts).toEqual([
      { op: 'same', text: a },
      { op: 'added', text: ' end' },
    ]);
  });
});
