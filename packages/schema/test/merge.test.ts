import { describe, expect, it } from 'vitest';
import { mergeWorking, resolveConflicts } from '../src/merge';
import type { ConflictChoices, MergeResult } from '../src/merge';
import type { CourseCopy } from '../src/changes';
import { workingSchema } from '../src/session';
import type { AnswerKeys, Chapter, Course, Item, Lesson, Quiz } from '../src';
import { makeCourse } from './fixtures';

// The base: p1 "Basics" [l1, q1, l2, l3] from makeCourse(), p2 "Advanced" [l4, l5], p3 "Extra" [l6].
// q1 has question k1 (options a, b), keyed a. "mine" is the session, "theirs" the stored draft.

type Edit = (c: Course, keys: AnswerKeys) => void;
const none: Edit = () => undefined;

const lessonNamed = (id: string, over: Partial<Lesson> = {}): Lesson => ({
  type: 'lesson',
  id,
  title: id,
  minutes: 1,
  layout: 'stacked',
  completeWhen: 'manual',
  blocks: [],
  ...over,
});

const quizNamed = (id: string, prompt = 'Why?'): Quiz => ({
  type: 'quiz',
  id,
  title: id,
  questionsShown: 1,
  shuffleOptions: false,
  cooldownMinutes: 0,
  revealAnswers: 'each',
  blocksNext: false,
  questions: [
    {
      id: 'z1',
      kind: 'single',
      prompt,
      options: [
        { id: 'x', text: 'X' },
        { id: 'y', text: 'Y' },
      ],
      explanation: 'So',
    },
  ],
});

function copyOf(edit: Edit): CourseCopy {
  const course = makeCourse();
  course.chapters.push(
    { id: 'p2', title: 'Advanced', items: [lessonNamed('l4'), lessonNamed('l5')] },
    { id: 'p3', title: 'Extra', items: [lessonNamed('l6')] },
  );
  const answers: AnswerKeys = { q1: { k1: ['a'] } };
  edit(course, answers);
  return { course, answers };
}

const three = (mine: Edit, theirs: Edit): MergeResult =>
  mergeWorking(copyOf(none), copyOf(mine), copyOf(theirs));

function chapter(c: Course, id: string): Chapter {
  const found = c.chapters.find((p) => p.id === id);
  if (!found) throw new Error(`no chapter ${id}`);
  return found;
}

function item(c: Course, id: string): Item {
  const found = c.chapters.flatMap((p) => p.items).find((i) => i.id === id);
  if (!found) throw new Error(`no item ${id}`);
  return found;
}

function quiz(c: Course, id = 'q1'): Quiz {
  const found = item(c, id);
  if (found.type !== 'quiz') throw new Error('not a quiz');
  return found;
}

/** Takes the item out of wherever it is; returns it. */
function take(c: Course, id: string): Item {
  const found = item(c, id);
  for (const p of c.chapters) p.items = p.items.filter((i) => i !== found);
  return found;
}

const remove =
  (id: string): Edit =>
  (c) =>
    void take(c, id);
const retitle =
  (id: string, title: string): Edit =>
  (c) => {
    item(c, id).title = title;
  };
const move =
  (id: string, to: string, index: number): Edit =>
  (c) => {
    const found = take(c, id);
    chapter(c, to).items.splice(index, 0, found);
  };
const add =
  (to: string, index: number, it: Item): Edit =>
  (c) => {
    chapter(c, to).items.splice(index, 0, it);
  };
const removeChapter =
  (id: string): Edit =>
  (c) => {
    c.chapters = c.chapters.filter((p) => p.id !== id);
  };
const all =
  (...edits: Edit[]): Edit =>
  (c, keys) => {
    for (const e of edits) e(c, keys);
  };

const outline = (c: Course) =>
  c.chapters.map((p) => `${p.id}[${p.items.map((i) => i.id).join(',')}]`).join(' ');

function merged(r: MergeResult) {
  if (!r.working) throw new Error(`conflicts: ${r.conflicts.map((c) => c.key).join(', ')}`);
  return r.working;
}

const conflicts = (r: MergeResult) => r.conflicts.map((c) => `${c.key} ${c.reason}`);

const BASE = 'p1[l1,q1,l2,l3] p2[l4,l5] p3[l6]';

describe('mergeWorking: one side, the other, neither', () => {
  it('changes nothing when neither side changed anything', () => {
    const r = three(none, none);
    expect(r.conflicts).toEqual([]);
    expect(r.orderKept).toEqual([]);
    expect(outline(merged(r).course)).toBe(BASE);
    expect(merged(r).answers).toEqual({ q1: { k1: ['a'] } });
    expect(merged(r).answersChanged).toBeUndefined();
    expect(workingSchema.safeParse(merged(r)).success).toBe(true);
  });

  it.each<[string, Edit, Edit, string, Record<string, string>]>([
    ['one side edits a lesson', retitle('l1', 'Mine'), none, BASE, { l1: 'Mine' }],
    ['the other side edits a lesson', none, retitle('l2', 'Theirs'), BASE, { l2: 'Theirs' }],
    [
      'each side edits a different lesson',
      retitle('l1', 'Mine'),
      retitle('l2', 'Theirs'),
      BASE,
      { l1: 'Mine', l2: 'Theirs' },
    ],
    ['both make the same edit', retitle('l3', 'Same'), retitle('l3', 'Same'), BASE, { l3: 'Same' }],
    ['one side removes a lesson', remove('l2'), none, 'p1[l1,q1,l3] p2[l4,l5] p3[l6]', {}],
    ['the other side removes a lesson', none, remove('l5'), 'p1[l1,q1,l2,l3] p2[l4] p3[l6]', {}],
    [
      'both remove the same lesson',
      remove('l2'),
      remove('l2'),
      'p1[l1,q1,l3] p2[l4,l5] p3[l6]',
      {},
    ],
    [
      'one side removes a lesson the other only moved',
      remove('l3'),
      move('l3', 'p1', 0),
      'p1[l1,q1,l2] p2[l4,l5] p3[l6]',
      {},
    ],
    [
      'each side adds a lesson, in its own place',
      add('p1', 1, lessonNamed('m1')),
      add('p1', 0, lessonNamed('t1')),
      'p1[t1,l1,m1,q1,l2,l3] p2[l4,l5] p3[l6]',
      { m1: 'm1', t1: 't1' },
    ],
    [
      'both add the same new lesson',
      add('p2', 2, lessonNamed('n1')),
      add('p2', 2, lessonNamed('n1')),
      'p1[l1,q1,l2,l3] p2[l4,l5,n1] p3[l6]',
      { n1: 'n1' },
    ],
    [
      'one side adds a chapter',
      (c) => c.chapters.splice(1, 0, { id: 'p9', title: 'New', items: [lessonNamed('n9')] }),
      none,
      'p1[l1,q1,l2,l3] p9[n9] p2[l4,l5] p3[l6]',
      {},
    ],
    [
      'the other side adds a chapter at the top',
      none,
      (c) => c.chapters.unshift({ id: 'p0', title: 'Zero', items: [] }),
      'p0[] p1[l1,q1,l2,l3] p2[l4,l5] p3[l6]',
      {},
    ],
    [
      'both add the same chapter',
      (c) => c.chapters.push({ id: 'p9', title: 'New', items: [] }),
      (c) => c.chapters.push({ id: 'p9', title: 'New', items: [] }),
      `${BASE} p9[]`,
      {},
    ],
  ])('%s', (_name, mine, theirs, shape, titles) => {
    const r = three(mine, theirs);
    expect(r.conflicts).toEqual([]);
    const w = merged(r);
    expect(outline(w.course)).toBe(shape);
    for (const [id, title] of Object.entries(titles)) expect(item(w.course, id).title).toBe(title);
    expect(workingSchema.safeParse(w).success).toBe(true);
  });

  it('takes the item objects of the side it chose, without changing any input', () => {
    const base = copyOf(none);
    const mine = copyOf(retitle('l1', 'Mine'));
    const theirs = copyOf(retitle('l2', 'Theirs'));
    const before = JSON.stringify([base, mine, theirs]);
    const w = merged(mergeWorking(base, mine, theirs));
    expect(item(w.course, 'l1')).toBe(item(mine.course, 'l1'));
    expect(item(w.course, 'l2')).toBe(item(theirs.course, 'l2'));
    expect(JSON.stringify([base, mine, theirs])).toBe(before);
  });

  it('is deterministic', () => {
    const edit = all(retitle('l1', 'Mine'), move('l3', 'p2', 0));
    const a = three(edit, all(retitle('l1', 'Theirs'), remove('l4')));
    const b = three(edit, all(retitle('l1', 'Theirs'), remove('l4')));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('mergeWorking: course details and landing page, field by field', () => {
  it('takes each field from the side that changed it', () => {
    const r = three(
      (c) => {
        c.title = 'Git, mine';
        c.rules.passMark = 0.8;
        c.outcomes = ['Commit', 'Branch', 'Rebase'];
      },
      (c) => {
        c.summary = 'Theirs.';
        c.cover.theme = 'sky';
        c.description = '# Their Git';
        c.version = 7;
        c.status = 'draft';
      },
    );
    expect(r.conflicts).toEqual([]);
    const c = merged(r).course;
    expect([c.title, c.summary, c.rules.passMark, c.cover.theme, c.description]).toEqual([
      'Git, mine',
      'Theirs.',
      0.8,
      'sky',
      '# Their Git',
    ]);
    expect(c.outcomes).toEqual(['Commit', 'Branch', 'Rebase']);
    expect([c.version, c.status]).toEqual([7, 'draft']);
  });

  it('keeps Studio and publishing fields from the stored draft, whatever the session holds', () => {
    const r = three(
      (c) => {
        c.version = 99;
        c.educatorIds = ['u-mine'];
      },
      (c) => {
        c.version = 3;
      },
    );
    expect(r.conflicts).toEqual([]);
    expect(merged(r).course.version).toBe(3);
    expect(merged(r).course.educatorIds).toEqual([]);
  });

  it.each<[string, Edit, Edit, string, 'course' | 'landing']>([
    ['the title', (c) => (c.title = 'Mine'), (c) => (c.title = 'Theirs'), 'field:title', 'course'],
    [
      'the pass mark',
      (c) => (c.rules.passMark = 0.5),
      (c) => (c.rules.passMark = 0.9),
      'field:rules.passMark',
      'course',
    ],
    [
      'the description',
      (c) => (c.description = 'Mine'),
      (c) => (c.description = 'Theirs'),
      'field:description',
      'landing',
    ],
    [
      'the outcomes',
      (c) => (c.outcomes = ['Mine']),
      (c) => (c.outcomes = ['Theirs']),
      'field:outcomes',
      'landing',
    ],
  ])('%s changed on both sides is a conflict', (_name, mine, theirs, key, row) => {
    const r = three(mine, theirs);
    expect(r.working).toBeNull();
    expect(r.conflicts).toHaveLength(1);
    const conflict = r.conflicts[0];
    expect(conflict).toMatchObject({ key, kind: 'field', row, reason: 'both' });
    const field = key.slice('field:'.length);
    const valueOf = (w: { course: Course }) =>
      field.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], w.course);
    expect(valueOf(resolveConflicts(r, { [key]: 'mine' }))).toEqual(valueOf(r.mine));
    expect(valueOf(resolveConflicts(r, { [key]: 'theirs' }))).toEqual(valueOf(r.theirs));
  });

  it('takes a field both sides set to the same value', () => {
    const r = three(
      (c) => (c.title = 'Same'),
      (c) => (c.title = 'Same'),
    );
    expect(merged(r).course.title).toBe('Same');
  });
});

describe('mergeWorking: a cover image set on one side and cleared on the other', () => {
  const image = {
    url: 'https://example.com/c.png',
    width: 10,
    height: 10,
    upload: { path: 'courses/git/media/c.png', contentType: 'image/png', bytes: 10 },
  } as unknown as NonNullable<Course['cover']['image']>;
  const withImage: Edit = (c) => {
    c.cover.image = image;
  };
  const without: Edit = (c) => {
    delete c.cover.image;
  };

  it('adds the image one side added', () => {
    const c = merged(three(withImage, none)).course;
    expect(c.cover.image).toEqual(image);
  });

  it('removes the image one side removed, leaving no empty key', () => {
    const c = merged(mergeWorking(copyOf(withImage), copyOf(without), copyOf(withImage))).course;
    expect('image' in c.cover).toBe(false);
    expect(c.cover.theme).toBe('forest');
  });
});

describe('mergeWorking: lessons and Quizzes changed on both sides', () => {
  it('reports an item both sides changed differently, and settles it either way', () => {
    const r = three(retitle('l2', 'Mine'), all(retitle('l2', 'Theirs'), retitle('l1', 'T1')));
    expect(r.working).toBeNull();
    expect(conflicts(r)).toEqual(['lesson:l2 both']);
    expect(r.conflicts[0]).toMatchObject({
      kind: 'lesson',
      id: 'l2',
      chapterId: 'p1',
      base: { title: 'Commit' },
      mine: { title: 'Mine' },
      theirs: { title: 'Theirs' },
    });
    const mine = resolveConflicts(r, { 'lesson:l2': 'mine' });
    expect([item(mine.course, 'l2').title, item(mine.course, 'l1').title]).toEqual(['Mine', 'T1']);
    const theirs = resolveConflicts(r, { 'lesson:l2': 'theirs' });
    expect(item(theirs.course, 'l2').title).toBe('Theirs');
    expect(workingSchema.safeParse(mine).success).toBe(true);
  });

  it.each<[string, Edit, Edit, string, string, string]>([
    [
      'removed by the session, changed in the draft',
      remove('l2'),
      retitle('l2', 'Theirs'),
      'lesson:l2 removedInMine',
      'p1[l1,q1,l3] p2[l4,l5] p3[l6]',
      BASE,
    ],
    [
      'changed by the session, removed in the draft',
      retitle('l4', 'Mine'),
      remove('l4'),
      'lesson:l4 removedInTheirs',
      BASE,
      'p1[l1,q1,l2,l3] p2[l5] p3[l6]',
    ],
  ])('an item %s is a conflict', (_name, mine, theirs, conflict, keepMine, keepTheirs) => {
    const r = three(mine, theirs);
    expect(conflicts(r)).toEqual([conflict]);
    const key = conflict.split(' ')[0] as string;
    expect(outline(resolveConflicts(r, { [key]: 'mine' }).course)).toBe(keepMine);
    expect(outline(resolveConflicts(r, { [key]: 'theirs' }).course)).toBe(keepTheirs);
  });

  it('reports a new item both sides added differently', () => {
    const r = three(
      add('p3', 1, lessonNamed('n1', { title: 'Mine' })),
      add('p3', 0, lessonNamed('n1', { title: 'Theirs' })),
    );
    expect(conflicts(r)).toEqual(['lesson:n1 both']);
    expect(r.conflicts[0]).toMatchObject({ base: null, chapterId: 'p3' });
    const w = resolveConflicts(r, { 'lesson:n1': 'theirs' });
    expect(item(w.course, 'n1').title).toBe('Theirs');
    expect(outline(w.course)).toBe('p1[l1,q1,l2,l3] p2[l4,l5] p3[l6,n1]');
  });

  it('names a repeated id by its occurrence, as the Review does', () => {
    const twice: Edit = (c) => {
      chapter(c, 'p3').items.push(lessonNamed('l6', { title: 'Second' }));
    };
    const second =
      (title: string): Edit =>
      (c) => {
        const last = chapter(c, 'p3').items[1] as Item;
        last.title = title;
      };
    const r = mergeWorking(
      copyOf(twice),
      copyOf(all(twice, second('Mine'))),
      copyOf(all(twice, second('Theirs'))),
    );
    expect(conflicts(r)).toEqual(['lesson:l6#2 both']);
    const w = resolveConflicts(r, { 'lesson:l6#2': 'mine' });
    expect(chapter(w.course, 'p3').items.map((i) => i.title)).toEqual(['l6', 'Mine']);
  });

  it('refuses to resolve while a conflict has no choice, and ignores unknown keys', () => {
    const r = three(
      retitle('l1', 'A'),
      all(retitle('l1', 'B'), (c) => (c.title = 'X')),
    );
    const choices: ConflictChoices = { nothing: 'mine' };
    expect(() => resolveConflicts(r, choices)).toThrow(
      'No choice was made for the conflict "lesson:l1".',
    );
    expect(resolveConflicts(r, { ...choices, 'lesson:l1': 'theirs' }).course.title).toBe('X');
  });

  it('lists conflicts in course order: fields, then chapters, then items', () => {
    const r = three(
      all(
        (c) => (c.summary = 'Mine'),
        (c) => (chapter(c, 'p2').title = 'Mine'),
        retitle('l1', 'Mine'),
        retitle('l5', 'Mine'),
      ),
      all(
        (c) => (c.summary = 'Theirs'),
        (c) => (chapter(c, 'p2').title = 'Theirs'),
        retitle('l1', 'Theirs'),
        retitle('l5', 'Theirs'),
      ),
    );
    expect(r.conflicts.map((c) => c.key)).toEqual([
      'field:summary',
      'chapter:p2',
      'lesson:l1',
      'lesson:l5',
    ]);
  });
});

describe('mergeWorking: order and moves', () => {
  it.each<[string, Edit, Edit, string, string[]]>([
    [
      'the session reordered a chapter, the draft edited in it',
      move('l3', 'p1', 0),
      retitle('l2', 'Theirs'),
      'p1[l3,l1,q1,l2] p2[l4,l5] p3[l6]',
      [],
    ],
    [
      'the draft reordered a chapter, the session added to it',
      add('p1', 4, lessonNamed('m1')),
      move('l1', 'p1', 3),
      'p1[q1,l2,l3,m1,l1] p2[l4,l5] p3[l6]',
      [],
    ],
    [
      'both reordered a chapter the same way',
      move('l3', 'p1', 0),
      move('l3', 'p1', 0),
      'p1[l3,l1,q1,l2] p2[l4,l5] p3[l6]',
      [],
    ],
    [
      'both reordered a chapter differently: the session wins',
      move('l3', 'p1', 0),
      move('l1', 'p1', 3),
      'p1[l3,l1,q1,l2] p2[l4,l5] p3[l6]',
      ['items:p1'],
    ],
    [
      'the session moved a lesson to another chapter, the draft edited it',
      move('l3', 'p2', 1),
      retitle('l3', 'Theirs'),
      'p1[l1,q1,l2] p2[l4,l3,l5] p3[l6]',
      [],
    ],
    [
      'the draft moved a lesson to another chapter',
      none,
      move('l4', 'p3', 1),
      'p1[l1,q1,l2,l3] p2[l5] p3[l6,l4]',
      [],
    ],
    [
      'both moved a lesson to different chapters: the session wins',
      move('l2', 'p2', 0),
      move('l2', 'p3', 0),
      'p1[l1,q1,l3] p2[l2,l4,l5] p3[l6]',
      ['items:p2'],
    ],
    [
      'both moved a lesson into one chapter, at different places',
      move('l2', 'p2', 0),
      move('l2', 'p2', 2),
      'p1[l1,q1,l3] p2[l2,l4,l5] p3[l6]',
      ['items:p2'],
    ],
    [
      'both moved and reordered: one note per chapter',
      all(move('l5', 'p2', 0), move('l2', 'p2', 0)),
      all(move('l2', 'p3', 0), move('l1', 'p2', 0)),
      'p1[q1,l3] p2[l1,l2,l5,l4] p3[l6]',
      ['items:p2'],
    ],
    [
      'both reordered chapters differently: the session wins',
      (c) => c.chapters.reverse(),
      (c) => c.chapters.push(c.chapters.shift() as Chapter),
      'p3[l6] p2[l4,l5] p1[l1,q1,l2,l3]',
      ['chapters'],
    ],
    [
      'the draft reordered chapters, the session added one',
      (c) => c.chapters.splice(1, 0, { id: 'p9', title: 'New', items: [] }),
      (c) => c.chapters.reverse(),
      'p3[l6] p2[l4,l5] p1[l1,q1,l2,l3] p9[]',
      [],
    ],
  ])('%s', (_name, mine, theirs, shape, notes) => {
    const r = three(mine, theirs);
    expect(r.conflicts).toEqual([]);
    expect(outline(merged(r).course)).toBe(shape);
    expect(
      r.orderKept.map((o) => (o.list === 'chapters' ? 'chapters' : `items:${o.chapterId}`)),
    ).toEqual(notes);
  });

  it('keeps the content of the side that changed it while the other moved it', () => {
    const w = merged(three(move('l3', 'p2', 1), retitle('l3', 'Theirs')));
    expect(item(w.course, 'l3').title).toBe('Theirs');
  });
});

describe('mergeWorking: chapters', () => {
  it.each<[string, Edit, Edit, string, Record<string, string>]>([
    [
      'renamed by the session',
      (c) => (chapter(c, 'p2').title = 'Mine'),
      none,
      BASE,
      { p2: 'Mine' },
    ],
    [
      'renamed in the draft',
      none,
      (c) => (chapter(c, 'p3').title = 'Theirs'),
      BASE,
      { p3: 'Theirs' },
    ],
    [
      'removed in the draft, untouched by the session, with its lessons',
      none,
      removeChapter('p2'),
      'p1[l1,q1,l2,l3] p3[l6]',
      {},
    ],
    [
      'removed by the session, the draft only reordered it',
      removeChapter('p2'),
      (c) => c.chapters.reverse(),
      'p3[l6] p1[l1,q1,l2,l3]',
      {},
    ],
    [
      'removed on both sides',
      removeChapter('p3'),
      all(removeChapter('p3'), retitle('l1', 'Theirs')),
      'p1[l1,q1,l2,l3] p2[l4,l5]',
      {},
    ],
    [
      'removed in the draft after moving a lesson out of it',
      none,
      all(move('l4', 'p1', 0), removeChapter('p2')),
      'p1[l4,l1,q1,l2,l3] p3[l6]',
      {},
    ],
  ])('a chapter %s', (_name, mine, theirs, shape, titles) => {
    const r = three(mine, theirs);
    expect(r.conflicts).toEqual([]);
    const w = merged(r);
    expect(outline(w.course)).toBe(shape);
    for (const [id, title] of Object.entries(titles))
      expect(chapter(w.course, id).title).toBe(title);
  });

  it('reports a chapter renamed differently on both sides', () => {
    const r = three(
      (c) => (chapter(c, 'p2').title = 'Mine'),
      (c) => (chapter(c, 'p2').title = 'Theirs'),
    );
    expect(conflicts(r)).toEqual(['chapter:p2 both']);
    expect(chapter(resolveConflicts(r, { 'chapter:p2': 'mine' }).course, 'p2').title).toBe('Mine');
    expect(chapter(resolveConflicts(r, { 'chapter:p2': 'theirs' }).course, 'p2').title).toBe(
      'Theirs',
    );
  });

  it('reports a new chapter both sides added under one id with different titles', () => {
    const r = three(
      (c) => c.chapters.push({ id: 'p9', title: 'Mine', items: [] }),
      (c) => c.chapters.push({ id: 'p9', title: 'Theirs', items: [] }),
    );
    expect(conflicts(r)).toEqual(['chapter:p9 both']);
    expect(r.conflicts[0]).toMatchObject({ kind: 'chapter', id: 'p9', base: null });
  });

  it.each<[string, Edit, Edit, string, string, string]>([
    [
      'renamed by the session, removed in the draft',
      (c) => (chapter(c, 'p2').title = 'Mine'),
      removeChapter('p2'),
      'chapter:p2 removedInTheirs',
      BASE,
      'p1[l1,q1,l2,l3] p3[l6]',
    ],
    [
      'with a lesson the session changed, removed in the draft',
      retitle('l5', 'Mine'),
      removeChapter('p2'),
      'chapter:p2 removedInTheirs',
      BASE,
      'p1[l1,q1,l2,l3] p3[l6]',
    ],
    [
      'with a lesson the session added, removed in the draft',
      add('p2', 0, lessonNamed('n1')),
      removeChapter('p2'),
      'chapter:p2 removedInTheirs',
      'p1[l1,q1,l2,l3] p2[n1,l4,l5] p3[l6]',
      'p1[l1,q1,l2,l3] p3[l6]',
    ],
    [
      'removed by the session, with a lesson the draft moved into it',
      removeChapter('p3'),
      move('l1', 'p3', 0),
      'chapter:p3 removedInMine',
      'p1[l1,q1,l2,l3] p2[l4,l5]',
      'p1[q1,l2,l3] p2[l4,l5] p3[l1,l6]',
    ],
  ])('a chapter %s is one conflict', (_name, mine, theirs, conflict, keepMine, keepTheirs) => {
    const r = three(mine, theirs);
    expect(conflicts(r)).toEqual([conflict]);
    const key = conflict.split(' ')[0] as string;
    expect(outline(resolveConflicts(r, { [key]: 'mine' }).course)).toBe(keepMine);
    expect(outline(resolveConflicts(r, { [key]: 'theirs' }).course)).toBe(keepTheirs);
  });

  it('keeps the changed lesson of a chapter kept by choice, with the session content', () => {
    const r = three(retitle('l5', 'Mine'), removeChapter('p2'));
    const w = resolveConflicts(r, { 'chapter:p2': 'mine' });
    expect(item(w.course, 'l5').title).toBe('Mine');
  });

  it('sends a lesson moved into a chapter that goes back to where the other side has it', () => {
    const r = three(move('l1', 'p2', 0), removeChapter('p2'));
    expect(conflicts(r)).toEqual(['chapter:p2 removedInTheirs']);
    expect(outline(resolveConflicts(r, { 'chapter:p2': 'theirs' }).course)).toBe(
      'p1[l1,q1,l2,l3] p3[l6]',
    );
  });

  it('drops a lesson when the chapters both sides put it in are removed by choice', () => {
    const r = three(
      all(move('l1', 'p2', 0), removeChapter('p3')),
      all(move('l1', 'p3', 0), removeChapter('p2')),
    );
    expect(conflicts(r)).toEqual(['chapter:p2 removedInTheirs', 'chapter:p3 removedInMine']);
    const w = resolveConflicts(r, { 'chapter:p2': 'theirs', 'chapter:p3': 'mine' });
    expect(outline(w.course)).toBe('p1[q1,l2,l3]');
  });
});

describe('mergeWorking: answer keys travel with their question', () => {
  const key =
    (keys: string[]): Edit =>
    (_c, answers) => {
      answers.q1 = { k1: keys };
    };
  const prompt =
    (text: string): Edit =>
    (c) => {
      (quiz(c).questions[0] as Quiz['questions'][number]).prompt = text;
    };

  it.each<[string, Edit, Edit, string[], boolean]>([
    ['a key changed by the session', key(['b']), retitle('l1', 'T'), ['b'], true],
    [
      'a key and its question changed in the draft',
      none,
      all(prompt('New?'), key(['b'])),
      ['b'],
      false,
    ],
    [
      'the same key set in another order on both sides',
      key(['b', 'a']),
      key(['a', 'b']),
      ['b', 'a'],
      true,
    ],
    ['nothing changed', none, none, ['a'], false],
  ])('%s', (_name, mine, theirs, expected, flagged) => {
    const r = three(mine, theirs);
    expect(r.conflicts).toEqual([]);
    const w = merged(r);
    expect(w.answers.q1?.k1).toEqual(expected);
    expect(w.answersChanged === true).toBe(flagged);
  });

  it('reports a key changed differently on both sides, and brings the chosen key', () => {
    const r = three(key(['b']), key(['a', 'b']));
    expect(conflicts(r)).toEqual(['quiz:q1 both']);
    expect(resolveConflicts(r, { 'quiz:q1': 'mine' }).answers.q1).toEqual({ k1: ['b'] });
    expect(resolveConflicts(r, { 'quiz:q1': 'theirs' }).answers.q1).toEqual({ k1: ['a', 'b'] });
  });

  it('takes the question and its key from the same side', () => {
    const r = three(all(prompt('Mine?'), key(['b'])), all(prompt('Theirs?'), key(['a'])));
    expect(conflicts(r)).toEqual(['quiz:q1 both']);
    const w = resolveConflicts(r, { 'quiz:q1': 'mine' });
    expect([quiz(w.course).questions[0]?.prompt, w.answers.q1?.k1]).toEqual(['Mine?', ['b']]);
  });

  it('drops the keys of a removed Quiz and keeps those of a new one', () => {
    const w = merged(
      three(
        all(remove('q1'), add('p2', 0, quizNamed('q2')), (_c, a) => {
          a.q2 = { z1: ['x'] };
        }),
        none,
      ),
    );
    expect(w.answers).toEqual({ q2: { z1: ['x'] } });
    expect(w.answersChanged).toBe(true);
  });

  it('takes a new Quiz added on both sides once, even without keys', () => {
    const w = merged(three(add('p3', 0, quizNamed('q2')), add('p3', 0, quizNamed('q2'))));
    expect(outline(w.course)).toBe('p1[l1,q1,l2,l3] p2[l4,l5] p3[q2,l6]');
    expect(w.answers).toEqual({ q1: { k1: ['a'] } });
  });

  it('keeps the stored draft mark that keys changed since the last publish', () => {
    const theirs = { ...copyOf(none), answersChanged: true as const };
    const w = merged(mergeWorking(copyOf(none), copyOf(retitle('l1', 'M')), theirs));
    expect(w.answersChanged).toBe(true);
  });

  it('returns working copies that pass the course schema, keys included', () => {
    const r = three(
      all(key(['b']), move('l3', 'p2', 0), add('p3', 1, quizNamed('q2')), (_c, a) => {
        a.q2 = { z1: ['y'] };
      }),
      all(retitle('l1', 'T'), removeChapter('p3'), (c) => {
        c.summary = 'Theirs.';
      }),
    );
    expect(conflicts(r)).toEqual(['chapter:p3 removedInTheirs']);
    for (const side of ['mine', 'theirs'] as const)
      expect(workingSchema.safeParse(resolveConflicts(r, { 'chapter:p3': side })).success).toBe(
        true,
      );
    expect(resolveConflicts(r, { 'chapter:p3': 'mine' }).answers.q2).toEqual({ z1: ['y'] });
    expect(resolveConflicts(r, { 'chapter:p3': 'theirs' }).answers.q2).toBeUndefined();
  });
});

describe('mergeWorking: a lesson on one side and a Quiz on the other under one id', () => {
  /** Turns the lesson into a Quiz under the same id, keyed `x`. */
  const toQuiz =
    (id: string): Edit =>
    (c, answers) => {
      for (const p of c.chapters) p.items = p.items.map((i) => (i.id === id ? quizNamed(id) : i));
      answers[id] = { z1: ['x'] };
    };
  const keyed =
    (id: string): Edit =>
    (_c, answers) => {
      answers[id] = { z1: ['x'] };
    };
  const ids = (c: Course) => c.chapters.flatMap((p) => p.items.map((i) => i.id));
  const shape = (c: Course, id: string) => {
    const found = item(c, id);
    return found.type === 'quiz' ? 'quiz' : `lesson ${found.title}`;
  };

  it.each<[string, Edit, Edit, string, string | null, string, string]>([
    [
      'the session turned a lesson into a Quiz, the draft edited the lesson',
      toQuiz('l2'),
      retitle('l2', 'Theirs'),
      'quiz:l2 both',
      'lesson',
      'quiz',
      'lesson Theirs',
    ],
    [
      'the session edited a lesson, the draft turned it into a Quiz',
      retitle('l2', 'Mine'),
      toQuiz('l2'),
      'lesson:l2 both',
      'lesson',
      'lesson Mine',
      'quiz',
    ],
    [
      'the session added a lesson and the draft a Quiz under one new id',
      add('p3', 1, lessonNamed('n1', { title: 'Mine' })),
      all(add('p3', 0, quizNamed('n1')), keyed('n1')),
      'lesson:n1 both',
      null,
      'lesson Mine',
      'quiz',
    ],
  ])(
    '%s is one conflict, never both',
    (_name, mine, theirs, conflict, base, keepMine, keepTheirs) => {
      const r = three(mine, theirs);
      expect(conflicts(r)).toEqual([conflict]);
      const [key, id] = [conflict.split(' ')[0] as string, conflict.split(/[: ]/)[1] as string];
      expect((r.conflicts[0]?.base as Item | null)?.type ?? null).toBe(base);
      for (const [side, expected] of [
        ['mine', keepMine],
        ['theirs', keepTheirs],
      ] as const) {
        const w = resolveConflicts(r, { [key]: side });
        expect(new Set(ids(w.course)).size).toBe(ids(w.course).length);
        expect(shape(w.course, id)).toBe(expected);
        expect(w.answers[id]).toEqual(expected === 'quiz' ? { z1: ['x'] } : undefined);
        expect(workingSchema.safeParse(w).success).toBe(true);
      }
    },
  );

  it.each<[string, Edit, Edit]>([
    ['by the session', toQuiz('l2'), none],
    ['in the draft', none, toQuiz('l2')],
  ])(
    'takes a lesson turned into a Quiz %s when the other side left it alone',
    (_n, mine, theirs) => {
      const r = three(mine, theirs);
      expect(r.conflicts).toEqual([]);
      expect(shape(merged(r).course, 'l2')).toBe('quiz');
      expect(ids(merged(r).course)).toEqual(['l1', 'q1', 'l2', 'l3', 'l4', 'l5', 'l6']);
    },
  );
});
