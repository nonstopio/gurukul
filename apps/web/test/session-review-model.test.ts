import { COURSE_BYTES_LIMIT, COURSE_BYTES_WARN, validateForPublish } from '@gurukul/schema';
import type {
  Chapter,
  Course,
  Item,
  Lesson,
  PublishIssue,
  Quiz,
  SessionTodo,
  Turn,
} from '@gurukul/schema';
import { courseChanges } from '@gurukul/schema/changes';
import { lintCourse } from '@gurukul/schema/writingLint';
import type { WritingFinding } from '@gurukul/schema/writingLint';
import type { ChangeRow } from '@gurukul/schema/changes';
import { describe, expect, it } from 'vitest';
import type { Working } from '../src/studio/types';
import { canRevert, revertRow } from '../src/studio/session/revert';
import {
  WRITING_FIX_MESSAGE,
  answerLine,
  checkPlaces,
  comparedLine,
  countLine,
  fieldName,
  fieldValue,
  fixTargets,
  groupRows,
  issueAt,
  itemOf,
  letter,
  lintScope,
  numbersOf,
  onChangedText,
  questionPlaces,
  reviewChecks,
  rowFor,
  rowName,
  rowTarget,
  runsOf,
  saveBlockers,
  settingLine,
  sizeLine,
  turnFiles,
} from '../src/studio/session/review';
import { lesson, makeCourse } from './fake-data';

const WORDS = { lesson: 'Lesson', quiz: 'Quiz', chapter: 'Chapter' };

const base = (): Working => ({ course: makeCourse(), answers: { q1: { k1: ['a'] } } });

/** The base with `edit` applied to a copy of its course. */
function edited(edit: (course: Course) => void, answers?: Working['answers']): Working {
  const w = base();
  const course = structuredClone(w.course);
  edit(course);
  return { course, answers: answers ?? w.answers };
}

const chapter = (course: Course, id: string) => course.chapters.find((c) => c.id === id) as Chapter;
const rowOf = (b: Working | null, w: Working, key: string) =>
  courseChanges(b, w).rows.find((r) => r.key === key) as ChangeRow;

describe('rows in words', () => {
  it('numbers chapters and items like the outline, the first of a repeated id', () => {
    const course = makeCourse();
    chapter(course, 'p2').items.push(lesson('l1'));
    course.chapters.push({ id: 'p1', title: 'Again', items: [] });
    const numbers = numbersOf(course);
    expect(numbers.chapters.get('p1')).toBe('1');
    expect(numbers.chapters.get('p2')).toBe('2');
    expect(numbers.items.get('lesson:l1')).toBe('1.1');
    expect(numbers.items.get('quiz:q1')).toBe('2.2');
  });

  it('names each row, numbered while it is in the course', () => {
    const work = edited((c) => {
      c.title = 'New';
      c.description = 'Changed';
      chapter(c, 'p1').title = 'Basics, renamed';
      chapter(c, 'p2').items.splice(0, 1);
      (chapter(c, 'p1').items[0] as Lesson).title = '  ';
      c.chapters.push({ id: 'p3', title: '', items: [] });
    });
    const b = base();
    const numbers = numbersOf(work.course);
    const names = courseChanges(b, work).rows.map((r) => [r.key, rowName(r, numbers)]);
    expect(names).toEqual([
      ['course:course', 'Course details'],
      ['landing:landing', 'Landing page'],
      ['chapter:p1', '1 · Basics, renamed'],
      ['lesson:l1', '1.1 · Untitled'],
      ['lesson:l3', 'Lesson l3'],
      ['chapter:p3', '3 · Untitled'],
    ]);
    const gone = rowOf(
      b,
      edited((c) => c.chapters.splice(0, 1)),
      'chapter:p1',
    );
    expect(rowName(gone, numbers)).toBe('Basics');
  });

  it('groups rows under their chapter, in course order, naming chapters that did not change', () => {
    const work = edited((c) => {
      c.summary = 'Changed';
      (chapter(c, 'p1').items[1] as Lesson).title = 'Two';
      chapter(c, 'p2').title = 'Renamed';
      chapter(c, 'p2').items.pop();
    });
    const b = base();
    const numbers = numbersOf(work.course);
    const groups = groupRows(courseChanges(b, work).rows, work.course, b.course, numbers);
    expect(
      groups.map((g) => [g.key, g.title, g.row?.key ?? null, g.rows.map((r) => r.key)]),
    ).toEqual([
      ['top', null, null, ['course:course']],
      ['p1', '1 · Basics', null, ['lesson:l2']],
      ['p2', '2 · Renamed', 'chapter:p2', ['lesson:l4']],
    ]);
    // A chapter that is gone is named from the base; one with no title says so.
    const gone = edited((c) => {
      c.chapters.splice(1, 1);
      chapter(c, 'p1').title = '';
      chapter(c, 'p1').items.pop();
    });
    const groupsGone = groupRows(
      courseChanges(b, gone).rows,
      gone.course,
      b.course,
      numbersOf(gone.course),
    );
    expect(groupsGone.map((g) => [g.title, g.rows.length])).toEqual([
      ['1 · Untitled', 1],
      ['History', 3],
    ]);
    // A new course has no base and no top rows when nothing at the top changed.
    expect(groupRows([], work.course, null, numbers)).toEqual([]);
  });

  it('attaches the part a row stands for, nothing for one removed', () => {
    const b = base();
    const work = edited((c) => {
      c.title = 'T';
      c.description = 'D';
      chapter(c, 'p1').title = 'B';
      chapter(c, 'p2').items.pop();
      (chapter(c, 'p2').items[1] as Quiz).title = 'Q';
    });
    const numbers = numbersOf(work.course);
    const rows = courseChanges(b, work).rows;
    expect(rows.map((r) => rowTarget(r, WORDS, numbers)?.label ?? null)).toEqual([
      'Course details',
      'Landing page',
      'Chapter 1 · B',
      'Quiz 2.2 · Q',
      null,
    ]);
    const goneChapter = rowOf(
      b,
      edited((c) => c.chapters.splice(0, 1)),
      'chapter:p1',
    );
    expect(rowTarget(goneChapter, WORDS, numbers)).toBeNull();
  });

  it('names the checkpoints a turn is compared between', () => {
    const turns = [
      { id: 'a', checkpoint: 'a.json' },
      { id: 'b', checkpoint: 'b.json' },
    ] as Turn[];
    expect(turnFiles(turns, 'a')).toEqual(['start.json', 'a.json']);
    expect(turnFiles(turns, 'b')).toEqual(['a.json', 'b.json']);
    expect(turnFiles(turns, 'z')).toBeNull();
  });

  it('counts rows and the ones viewed', () => {
    const rows = courseChanges(
      base(),
      edited((c) => (c.title = 'T')),
    ).rows;
    expect(countLine(rows, new Set(['course:course']))).toBe('1 change · 1 viewed');
    expect(countLine([], new Set())).toBe('0 changes · 0 viewed');
  });

  it('says what a row is compared with', () => {
    expect(comparedLine(null)).toBe('A new course: everything in it is added.');
    expect(comparedLine({ rev: 4, savedAt: null })).toBe('Compared with Draft v4');
    expect(comparedLine({ rev: 4, savedAt: '2026-11-18T10:00:00.000Z' })).toBe(
      'Compared with Draft v4, 18 Nov',
    );
  });

  it('gives the item a lesson or Quiz row stands for', () => {
    const b = base();
    const removed = rowOf(
      b,
      edited((c) => chapter(c, 'p1').items.pop()),
      'lesson:l2',
    );
    expect(itemOf(removed as Extract<ChangeRow, { kind: 'lesson' }>).id).toBe('l2');
  });
});

describe('fields in words', () => {
  it.each([
    ['rules.passMark', 0.7, '70%'],
    ['passMark', 0.8, '80%'],
    ['questionsShown', 1, '1 question'],
    ['questionsShown', 5, '5 questions'],
    ['minutes', 12, '12 min'],
    ['cooldownMinutes', 30, '30 min'],
    ['durationSec', 90, '90 s'],
    ['width', 640, '640'],
    ['rules.sequential', true, 'Yes'],
    ['zoom', false, 'No'],
    ['level', 'foundation', 'Foundation'],
    ['revealAnswers', 'onPass', 'Once passed'],
    ['url', 'https://example.com', 'https://example.com'],
    ['url', null, null],
  ] as const)('%s %j reads %j', (field, value, words) => {
    expect(fieldValue(field, value)).toBe(words);
  });

  it('names fields, and a setting as one line', () => {
    expect(fieldName('rules.passMark')).toBe('Pass mark');
    expect(fieldName('mystery')).toBe('mystery');
    expect(settingLine({ field: 'rules.passMark', before: 0.7, after: 0.8 })).toBe(
      'Pass mark 70% → 80%',
    );
    expect(settingLine({ field: 'questionsShown', before: 5, after: 6 })).toBe(
      'Shown 5 questions → 6 questions',
    );
    expect(settingLine({ field: 'caption', before: null, after: 'A' })).toBe('Caption not set → A');
  });
});

describe('answers in letters', () => {
  it('names the right answers before and after by their places', () => {
    const was = { options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
    const now = { options: [{ id: 'c' }, { id: 'a' }, { id: 'b' }, { id: 'd' }] };
    expect(answerLine({ before: ['b'], after: ['d'] }, ...questionPlaces(was, now))).toBe(
      'Correct answer changed: B → D',
    );
    expect(answerLine({ before: ['c', 'a'], after: [] }, ...questionPlaces(was, now))).toBe(
      'Correct answer changed: A, C → none',
    );
    expect(letter(0)).toBe('A');
  });

  it('finds a check block’s right option by its words on each side', () => {
    const options = [
      { id: '#0', statuses: [], before: 'Yes', after: 'Yes', fields: [] },
      { id: 'removed#1', statuses: ['removed' as const], before: 'No', after: null, fields: [] },
      { id: '#1', statuses: ['added' as const], before: null, after: 'Maybe', fields: [] },
    ];
    const places = checkPlaces(options, { options: ['Yes', 'No'] }, { options: ['Yes', 'Maybe'] });
    expect(answerLine({ before: ['removed#1'], after: ['#1'] }, ...places)).toBe(
      'Correct answer changed: B → B',
    );
    expect(answerLine({ before: ['#9'], after: ['#0'] }, ...places)).toBe(
      'Correct answer changed: none → A',
    );
  });
});

describe('runs of entries', () => {
  it('folds consecutive unchanged entries into one run', () => {
    const e = (id: string, changed: boolean) => ({ id, statuses: changed ? ['changed'] : [] });
    const runs = runsOf([e('a', false), e('b', false), e('c', true), e('d', false), e('f', true)]);
    expect(
      runs.map((r) => (r.kind === 'changed' ? r.entry.id : r.entries.map((x) => x.id))),
    ).toEqual([['a', 'b'], 'c', ['d'], 'f']);
  });
});

describe('checks', () => {
  const todo = (id: string, done: boolean, itemId?: string): SessionTodo => ({
    id,
    text: `Todo ${id}`,
    done,
    createdAt: '2026-11-19T10:00:00.000Z',
    ...(itemId ? { itemId } : {}),
  });

  it('checks the working copy: valid, size, writing on changed text, publish issues, to-dos', () => {
    const work = edited((c) => {
      (chapter(c, 'p1').items[0] as Lesson).blocks = [
        { type: 'markdown', id: 'm', md: 'In today’s fast-paced world we delve into Git.' },
      ];
      // Unchanged text with a worn phrase is not linted.
      (chapter(c, 'p2').items[0] as Lesson).blocks = [
        { type: 'markdown', id: 'n', md: 'We leverage Git.' },
      ];
    });
    const b = edited((c) => {
      (chapter(c, 'p2').items[0] as Lesson).blocks = [
        { type: 'markdown', id: 'n', md: 'We leverage Git.' },
      ];
    });
    const changes = courseChanges(b, work);
    const checks = reviewChecks(work, changes, [todo('a', false), todo('b', true)]);
    expect(checks.valid).toBe(true);
    expect(checks.size).toBe('pass');
    expect(checks.writing.length).toBeGreaterThan(0);
    expect(checks.writing.every((f) => f.itemId === 'l1')).toBe(true);
    expect(checks.publish).toEqual([]);
    expect(checks.todos.map((t) => t.id)).toEqual(['a']);
    expect(saveBlockers(checks)).toEqual([]);
  });

  it('reports writing notes only on text the session changed, a changed question or block whole', () => {
    const WORN = 'We leverage Git.';
    const k2 = {
      id: 'k2',
      kind: 'single' as const,
      prompt: 'Second?',
      options: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
      explanation: '',
    };
    const b = edited((c) => {
      c.summary = WORN;
      c.outcomes = [WORN, 'Branch'];
      chapter(c, 'p1').title = 'We leverage basics';
      (chapter(c, 'p1').items[0] as Lesson).title = 'We leverage lessons';
      (chapter(c, 'p1').items[0] as Lesson).blocks = [
        { type: 'markdown', id: 'm1', md: WORN },
        { type: 'markdown', id: 'm2', md: 'Plain.' },
        { type: 'markdown', id: 'm3', md: WORN },
      ];
      (chapter(c, 'p2').items[1] as Quiz).questions.push(k2);
    });
    const work = structuredClone(b);
    ((c: Course) => {
      c.description = WORN;
      c.outcomes = [WORN, 'We leverage branches.'];
      chapter(c, 'p2').title = 'We leverage history';
      const l1 = chapter(c, 'p1').items[0] as Lesson;
      l1.blocks = [
        { type: 'markdown', id: 'm3', md: WORN },
        { type: 'markdown', id: 'm1', md: WORN },
        { type: 'markdown', id: 'm2', md: 'We leverage more.' },
      ];
      const k1 = (chapter(c, 'p2').items[1] as Quiz).questions[0] as Quiz['questions'][number];
      k1.prompt = 'Which one do we leverage?';
      (chapter(c, 'p2').items[1] as Quiz).title = 'We leverage quizzes';
      chapter(c, 'p1').items.push(lesson('n', { title: 'We leverage new things' }) as Item);
    })(work.course);
    const changes = courseChanges(b, work);
    const where = (f: WritingFinding) =>
      [f.itemId ?? f.chapterId ?? 'course', f.blockId ?? f.questionId ?? '', f.field, f.index ?? '']
        .join('/')
        .replace(/\/+$/, '');
    const all = lintCourse(work).map(where);
    const shown = reviewChecks(work, changes, []).writing.map(where);
    // The unchanged text has notes too, so leaving them out is the filter's doing.
    for (const kept of [
      'course//description',
      'course//outcome/1',
      'p2//title',
      'l1/m2/md',
      'q1/k1/prompt',
      'n//title',
      'q1//title',
    ]) {
      expect(all).toContain(kept);
      expect(shown).toContain(kept);
    }
    for (const left of [
      'course//summary',
      'course//outcome/0',
      'p1//title',
      'l1/m1/md',
      'l1/m3/md',
      'q1/k2/explanation',
      'l1//title',
    ]) {
      expect(all).toContain(left);
      expect(shown).not.toContain(left);
    }
    expect(
      onChangedText(
        { field: 'title', rule: 'worn-phrase', excerpt: '', message: '' } as WritingFinding,
        [],
      ),
    ).toBe(false);
  });

  it('says when the course is not valid or too big, which stops Save', () => {
    const work = edited((c) => {
      (chapter(c, 'p1').items[0] as Lesson).title = '';
    });
    const checks = reviewChecks(work, courseChanges(base(), work), []);
    expect(checks.valid).toBe(false);
    expect(checks.publish.length).toBeGreaterThan(0);
    const big = edited((c) => {
      c.description = 'x'.repeat(COURSE_BYTES_LIMIT);
    });
    const warn = edited((c) => {
      c.description = 'x'.repeat(COURSE_BYTES_WARN);
    });
    expect(reviewChecks(big, courseChanges(base(), big), []).size).toBe('fail');
    expect(reviewChecks(warn, courseChanges(base(), warn), []).size).toBe('warn');
    expect(saveBlockers({ valid: false, size: 'fail' })).toEqual(['Course is valid', 'Size']);
    expect(sizeLine(212_400)).toBe('212 KB of 900 KB');
  });

  it('lints only rows that are still there', () => {
    const work = edited((c) => chapter(c, 'p1').items.pop());
    expect(lintScope(courseChanges(base(), work).rows)).toEqual([]);
    const renamed = edited((c) => (chapter(c, 'p1').title = 'B'));
    expect(lintScope(courseChanges(base(), renamed).rows)).toEqual(['p1']);
  });

  it('finds the row a finding, issue or to-do points at', () => {
    const work = edited((c) => {
      c.title = 'T';
      c.description = 'D';
      chapter(c, 'p1').title = 'B';
      (chapter(c, 'p1').items[0] as Lesson).title = 'L';
      chapter(c, 'p2').items.pop();
    });
    const rows = courseChanges(base(), work).rows;
    expect(rowFor(rows, { itemId: 'l1' })?.key).toBe('lesson:l1');
    expect(rowFor(rows, { itemId: 'l4' })).toBeNull();
    expect(rowFor(rows, { chapterId: 'p1' })?.key).toBe('chapter:p1');
    expect(rowFor(rows, { field: 'outcome' })?.key).toBe('landing:landing');
    expect(rowFor(rows, { field: 'description' })?.key).toBe('landing:landing');
    expect(rowFor(rows, { field: 'title' })?.key).toBe('course:course');
    expect(rowFor(rows, {})).toBeNull();
  });

  it('points each Ready to publish issue at its own row, or at none', () => {
    const at = (code: string, extra: Partial<PublishIssue> = {}) =>
      issueAt({ code, message: 'm', ...extra });
    expect(at('item.title', { itemId: 'l1' })).toEqual({ itemId: 'l1' });
    expect(at('id.duplicate', { itemId: 'l1' })).toEqual({ itemId: 'l1' });
    expect(at('chapter.title', { chapterId: 'p2' })).toEqual({ chapterId: 'p2' });
    expect(at('id.duplicate', { chapterId: 'p2' })).toEqual({ chapterId: 'p2' });
    for (const code of ['course.description', 'course.outcomes', 'course.outcome.blank'])
      expect(at(code)).toEqual({ field: 'description' });
    for (const code of [
      'course.title',
      'course.summary',
      'course.cover.upload',
      'rules.passMark',
      'certificate.noQuiz',
      'certificate.title',
    ])
      expect(at(code)).toEqual({ field: 'title' });
    expect(at('course.empty')).toEqual({});
    expect(at('chapter.title')).toEqual({});
    // A chapter's blank title links to the chapter, not to Course details changed beside it.
    const work = edited((c) => {
      c.title = 'Git, simply';
      chapter(c, 'p2').title = '';
    });
    const rows = courseChanges(base(), work).rows;
    const issue = validateForPublish(work.course, work.answers, {}).find(
      (i) => i.code === 'chapter.title',
    ) as PublishIssue;
    expect(rowFor(rows, issueAt(issue))?.key).toBe('chapter:p2');
    expect(rowFor(rows, issueAt({ code: 'course.empty', message: 'm' }))).toBeNull();
  });

  it('attaches each row a finding sits in once, at most ten', () => {
    const work = edited((c) => {
      c.title = 'T';
      for (let i = 0; i < 12; i += 1) chapter(c, 'p1').items.push(lesson(`n${i}`) as Item);
    });
    const rows = courseChanges(base(), work).rows;
    const numbers = numbersOf(work.course);
    const targets = fixTargets(
      [rows[0] ?? null, rows[0] ?? null, null, ...rows.slice(1)],
      WORDS,
      numbers,
    );
    expect(targets).toHaveLength(10);
    expect(targets[0]?.label).toBe('Course details');
    expect(new Set(targets.map((t) => t.label)).size).toBe(10);
    expect(WRITING_FIX_MESSAGE).toMatch(/attached parts/);
  });
});

describe('Undo this item', () => {
  const undo = (b: Working | null, w: Working, key: string) => revertRow(b, w, rowOf(b, w, key));
  const ok = (r: ReturnType<typeof revertRow>) => {
    if (!r.ok) throw new Error(r.reason);
    return r.work;
  };

  it('puts the course details back field by field, the cover image removed when the base had none', () => {
    const b = base();
    const work = edited((c) => {
      c.title = 'New';
      c.rules.passMark = 0.9;
      c.cover.image = { url: 'https://example.com/c.png' } as Course['cover']['image'];
      c.description = 'Kept';
    });
    const back = ok(undo(b, work, 'course:course'));
    expect(back.course.title).toBe(b.course.title);
    expect(back.course.rules.passMark).toBe(0.7);
    expect('image' in back.course.cover).toBe(false);
    expect(back.course.description).toBe('Kept');
  });

  it('puts the landing page back, outcomes included', () => {
    const b = base();
    const work = edited((c) => {
      c.description = 'New';
      c.outcomes = ['One'];
      c.title = 'Kept';
    });
    const back = ok(undo(b, work, 'landing:landing'));
    expect(back.course.description).toBe('Learn Git.');
    expect(back.course.outcomes).toEqual(b.course.outcomes);
    expect(back.course.title).toBe('Kept');
  });

  it('removes an added chapter only when it is empty', () => {
    const b = base();
    const empty = edited((c) => c.chapters.push({ id: 'p3', title: 'New', items: [] }));
    expect(ok(undo(b, empty, 'chapter:p3')).course.chapters.map((c) => c.id)).toEqual(['p1', 'p2']);
    const full = edited((c) =>
      c.chapters.push({ id: 'p3', title: 'New', items: [lesson('n') as Item] }),
    );
    expect(undo(b, full, 'chapter:p3')).toEqual({ ok: false, reason: 'not_empty' });
  });

  it('puts a removed chapter back where it was, without items now elsewhere', () => {
    const b = base();
    const work = edited((c) => {
      const [gone] = c.chapters.splice(0, 1);
      chapter(c, 'p2').items.push((gone as Chapter).items[1] as Item);
    });
    const back = ok(undo(b, work, 'chapter:p1')).course;
    expect(back.chapters.map((c) => c.id)).toEqual(['p1', 'p2']);
    expect(chapter(back, 'p1').items.map((i) => i.id)).toEqual(['l1']);
    expect(chapter(back, 'p2').items.map((i) => i.id)).toEqual(['l3', 'q1', 'l4', 'l2']);
  });

  it('puts a renamed and moved chapter back under its old title and place', () => {
    const b = base();
    const work = edited((c) => {
      c.chapters.reverse();
      chapter(c, 'p1').title = 'Renamed';
      chapter(c, 'p1').items.pop();
    });
    const back = ok(undo(b, work, 'chapter:p1')).course;
    expect(back.chapters.map((c) => [c.id, c.title])).toEqual([
      ['p1', 'Basics'],
      ['p2', 'History'],
    ]);
    // Only the chapter's own fields: its lessons stay as the session left them.
    expect(chapter(back, 'p1').items.map((i) => i.id)).toEqual(['l1']);
  });

  it('removes an added lesson, and an added Quiz with its answer keys', () => {
    const b = base();
    const work = edited(
      (c) => {
        chapter(c, 'p1').items.push(lesson('n') as Item);
        chapter(c, 'p1').items.push({ ...(chapter(c, 'p2').items[1] as Quiz), id: 'q2' });
      },
      { ...base().answers, q2: { k1: ['b'] } },
    );
    const noLesson = ok(undo(b, work, 'lesson:n'));
    expect(chapter(noLesson.course, 'p1').items.map((i) => i.id)).toEqual(['l1', 'l2', 'q2']);
    const noQuiz = ok(undo(b, work, 'quiz:q2'));
    expect(noQuiz.answers).toEqual({ q1: { k1: ['a'] } });
    expect(noQuiz.answersChanged).toBeUndefined();
  });

  it('puts a removed lesson back after the nearest one before it that is still there', () => {
    const b = base();
    const work = edited((c) => chapter(c, 'p2').items.splice(0, 2));
    const back = ok(undo(b, work, 'quiz:q1'));
    expect(chapter(back.course, 'p2').items.map((i) => i.id)).toEqual(['q1', 'l4']);
    expect(back.answers).toEqual(b.answers);
    const first = ok(
      undo(
        b,
        edited((c) => chapter(c, 'p1').items.shift()),
        'lesson:l1',
      ),
    );
    expect(chapter(first.course, 'p1').items.map((i) => i.id)).toEqual(['l1', 'l2']);
  });

  it('puts a changed and moved Quiz back whole, keys included, in its old chapter and place', () => {
    const b = base();
    const work = edited(
      (c) => {
        const [quiz] = chapter(c, 'p2').items.splice(1, 1);
        (quiz as Quiz).title = 'Moved';
        chapter(c, 'p1').items.unshift(quiz as Item);
      },
      { q1: { k1: ['b'] } },
    );
    const back = ok(undo(b, { ...work, answersChanged: true }, 'quiz:q1'));
    expect(chapter(back.course, 'p1').items.map((i) => i.id)).toEqual(['l1', 'l2']);
    expect(chapter(back.course, 'p2').items.map((i) => [i.id, i.title])).toEqual([
      ['l3', 'Lesson l3'],
      ['q1', 'Quiz I'],
      ['l4', 'Lesson l4'],
    ]);
    expect(back.answers).toEqual(b.answers);
    // The keys are the stored draft's again, so nothing is marked.
    expect(back.answersChanged).toBeUndefined();
  });

  it('keeps the mark when another Quiz’s keys still differ', () => {
    const b = base();
    const work = edited(
      (c) => {
        chapter(c, 'p1').items.push({ ...(chapter(c, 'p2').items[1] as Quiz), id: 'q2' });
        (chapter(c, 'p2').items[1] as Quiz).title = 'Changed';
      },
      { q1: { k1: ['b'] }, q2: { k1: ['a'] } },
    );
    expect(ok(undo(b, work, 'quiz:q1')).answersChanged).toBe(true);
  });

  it('puts a Quiz with no keys in the base back with none', () => {
    const b = { ...base(), answers: {} };
    const work = edited((c) => ((chapter(c, 'p2').items[1] as Quiz).title = 'X'), {
      q1: { k1: ['a'] },
    });
    expect(ok(undo(b, work, 'quiz:q1')).answers).toEqual({});
  });

  it('keeps a moved item where it is when its old chapter is gone, with its old content', () => {
    const b = base();
    const work = edited((c) => {
      const [gone] = c.chapters.splice(0, 1);
      const moved = (gone as Chapter).items[0] as Lesson;
      chapter(c, 'p2').items.push({ ...moved, title: 'Changed' });
      c.chapters.unshift({ id: 'p9', title: 'Other', items: [] });
    });
    const back = ok(undo(b, work, 'lesson:l1'));
    expect(chapter(back.course, 'p2').items.map((i) => [i.id, i.title])).toEqual([
      ['l3', 'Lesson l3'],
      ['q1', 'Quiz I'],
      ['l4', 'Lesson l4'],
      ['l1', 'Lesson l1'],
    ]);
  });

  it('puts a lesson that only changed back where it is, after a lesson added before it', () => {
    const b = base();
    const work = edited((c) => {
      const p1 = chapter(c, 'p1');
      p1.items.splice(1, 0, lesson('l9') as Item);
      (p1.items[2] as Lesson).title = 'Edited';
    });
    expect(rowOf(b, work, 'lesson:l2').statuses).toEqual(['changed']);
    const back = ok(undo(b, work, 'lesson:l2'));
    expect(chapter(back.course, 'p1').items.map((i) => [i.id, i.title])).toEqual([
      ['l1', 'Lesson l1'],
      ['l9', 'Lesson l9'],
      ['l2', 'Lesson l2'],
    ]);
  });

  it('puts a lesson moved within its chapter back in its old place', () => {
    const b = base();
    const work = edited((c) => chapter(c, 'p2').items.reverse());
    expect(rowOf(b, work, 'lesson:l3').statuses).toContain('moved');
    const back = ok(undo(b, work, 'lesson:l3'));
    expect(chapter(back.course, 'p2').items.map((i) => i.id)).toEqual(['l3', 'l4', 'q1']);
  });

  it('puts a chapter that was only renamed back where it is, after a chapter added before it', () => {
    const b = base();
    const work = edited((c) => {
      c.chapters.splice(1, 0, { id: 'p9', title: 'New', items: [] });
      chapter(c, 'p2').title = 'Renamed';
    });
    expect(rowOf(b, work, 'chapter:p2').statuses).not.toContain('moved');
    const back = ok(undo(b, work, 'chapter:p2')).course;
    expect(back.chapters.map((c) => [c.id, c.title])).toEqual([
      ['p1', 'Basics'],
      ['p9', 'New'],
      ['p2', 'History'],
    ]);
  });

  it('refuses a removed lesson whose id a Quiz took this session, until that Quiz is undone', () => {
    const b = base();
    const work = edited(
      (c) => {
        const p1 = chapter(c, 'p1');
        p1.items[1] = { ...(chapter(c, 'p2').items[1] as Quiz), id: 'l2', title: 'Now a Quiz' };
      },
      { ...base().answers, l2: { k1: ['a'] } },
    );
    expect(courseChanges(b, work).rows.map((r) => `${r.key}:${r.statuses.join('+')}`)).toEqual(
      expect.arrayContaining(['lesson:l2:removed', 'quiz:l2:added']),
    );
    expect(undo(b, work, 'lesson:l2')).toEqual({ ok: false, reason: 'id_taken' });
    const noQuiz = ok(undo(b, work, 'quiz:l2'));
    const back = ok(undo(b, noQuiz, 'lesson:l2'));
    expect(chapter(back.course, 'p1').items.map((i) => `${i.type}:${i.id}`)).toEqual([
      'lesson:l1',
      'lesson:l2',
    ]);
    expect(courseChanges(b, back).count).toBe(0);
  });

  it('refuses a removed item whose chapter is gone, a repeated id, and a new course', () => {
    const b = base();
    const work = edited((c) => c.chapters.splice(0, 1));
    expect(undo(b, work, 'lesson:l1')).toEqual({ ok: false, reason: 'chapter_gone' });
    const repeated = edited((c) => {
      chapter(c, 'p2').items.push(lesson('l1') as Item, lesson('l1', { title: 'x' }) as Item);
    });
    const row = courseChanges(b, repeated).rows.find((r) => r.key.includes('#')) as ChangeRow;
    expect(canRevert(b, row)).toBe(false);
    expect(revertRow(b, repeated, row)).toEqual({ ok: false, reason: 'repeated' });
    expect(revertRow(null, b, rowOf(null, b, 'course:course'))).toEqual({
      ok: false,
      reason: 'no_base',
    });
    expect(canRevert(null, rowOf(null, b, 'course:course'))).toBe(false);
  });
});
