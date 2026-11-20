import { courseChanges } from '@gurukul/schema/changes';
import type { Chapter, Course, Item, Lesson, Question, Turn } from '@gurukul/schema';
import { describe, expect, it } from 'vitest';
import type { TranscriptEntry } from '../src/studio/session/transcript';
import type { OutlineChapter } from '../src/studio/session/workspace';
import {
  chatLines,
  headerChecks,
  headerStatus,
  lessonBlocks,
  outlineOf,
  previewEntries,
  questionMarks,
  rowsByKey,
  turnBy,
  turnLabel,
} from '../src/studio/session/workspace';
import type { Working } from '../src/studio/types';
import { lesson, makeCourse } from './fake-data';

const work = (course: Course, answers = {}): Working => ({ course, answers }) as Working;
const BASE = makeCourse();
const ch = (course: Course, i: number) => course.chapters[i] as Chapter;

/** The base with its chapters changed by `edit`. */
function changed(edit: (course: Course) => void): Course {
  const copy = structuredClone(BASE);
  edit(copy);
  return copy;
}

const changesOf = (after: Course, before: Course | null = BASE) =>
  courseChanges(before ? work(before) : null, work(after));

describe('previewEntries', () => {
  it('numbers every item like the outline, with what happened to it', () => {
    const after = changed((c) => {
      ch(c, 0).items[1] = lesson('l2', { title: 'Branches, again' });
    });
    const entries = previewEntries(after, rowsByKey(changesOf(after)));
    expect(entries.map((e) => [e.number, e.key, e.statuses])).toEqual([
      ['1.1', 'lesson:l1', []],
      ['1.2', 'lesson:l2', ['changed']],
      ['2.1', 'lesson:l3', []],
      ['2.2', 'quiz:q1', []],
      ['2.3', 'lesson:l4', []],
    ]);
    expect(rowsByKey(null).size).toBe(0);
  });
});

describe('lessonBlocks', () => {
  it('draws every block unmarked when the lesson did not change', () => {
    const blocks = (ch(BASE, 0).items[0] as Lesson).blocks;
    expect(lessonBlocks(blocks, undefined)).toEqual([
      { kind: 'block', block: blocks[0], statuses: [] },
    ]);
  });

  it('marks added, changed and moved blocks and keeps a mark where one was removed', () => {
    const after = changed((c) => {
      ch(c, 0).items[0] = lesson('l1', {
        blocks: [
          { type: 'code', id: 'new', lang: 'bash', code: 'git fetch' },
          { type: 'markdown', id: 'two', md: 'Second' },
          { type: 'markdown', id: 'l1-b', md: 'Body of l1, rewritten' },
        ],
      });
    });
    const before = changed((c) => {
      ch(c, 0).items[0] = lesson('l1', {
        blocks: [
          { type: 'markdown', id: 'l1-b', md: 'Body of l1' },
          { type: 'image', id: 'pic', url: 'https://example.com/a.png', alt: 'A' },
          { type: 'markdown', id: 'two', md: 'Second' },
        ],
      });
    });
    const row = rowsByKey(changesOf(after, before)).get('lesson:l1');
    const marks = lessonBlocks((ch(after, 0).items[0] as Lesson).blocks, row).map((m) =>
      m.kind === 'removed' ? ['removed', m.id, m.type] : [m.block.id, m.statuses],
    );
    // The image was after a block that moved, so it shows first, as Review lists it.
    expect(marks).toEqual([
      ['removed', 'pic', 'image'],
      ['new', ['added']],
      ['two', []],
      ['l1-b', ['changed', 'moved']],
    ]);
  });
});

describe('questionMarks', () => {
  it('lists the questions that changed, never removed ones, and nothing for a lesson', () => {
    const after = changed((c) => {
      const quiz = ch(c, 1).items[1] as Extract<
        Course['chapters'][0]['items'][0],
        { type: 'quiz' }
      >;
      quiz.questions = [
        { ...(quiz.questions[0] as Question), prompt: 'Which one?' },
        {
          id: 'k2',
          kind: 'single',
          prompt: 'New?',
          options: [
            { id: 'a', text: 'A' },
            { id: 'b', text: 'B' },
          ],
          explanation: 'So',
        },
      ];
    });
    const rows = rowsByKey(changesOf(after));
    expect([...questionMarks(rows.get('quiz:q1'))]).toEqual([
      ['k1', ['changed']],
      ['k2', ['added']],
    ]);
    expect(questionMarks(undefined).size).toBe(0);
    const gone = changed((c) => {
      const quiz = ch(c, 1).items[1] as Extract<
        Course['chapters'][0]['items'][0],
        { type: 'quiz' }
      >;
      quiz.questions = [
        {
          id: 'k9',
          kind: 'single',
          prompt: 'Other',
          options: (quiz.questions[0] as Question).options,
          explanation: 'So',
        },
      ];
    });
    expect([...questionMarks(rowsByKey(changesOf(gone)).get('quiz:q1'))]).toEqual([
      ['k9', ['added']],
    ]);
  });
});

describe('outlineOf', () => {
  it('marks a whole new course as added', () => {
    const outline = outlineOf(null, BASE, changesOf(BASE, null));
    expect(outline.details).toEqual(['added']);
    expect(outline.landing).toEqual(['added']);
    expect(outline.chapters.map((c) => [c.number, c.title, c.statuses])).toEqual([
      ['1', 'Basics', ['added']],
      ['2', 'History', ['added']],
    ]);
    expect(
      (outline.chapters[0] as OutlineChapter).items.map((i) => [i.number, i.statuses]),
    ).toEqual([
      ['1.1', ['added']],
      ['1.2', ['added']],
    ]);
  });

  it('shows nothing changed without changes', () => {
    const outline = outlineOf(BASE, BASE, null);
    expect(outline.details).toEqual([]);
    expect(
      outline.chapters.flatMap((c) => [c.statuses, ...c.items.map((i) => i.statuses)]),
    ).toEqual([[], [], [], [], [], [], []]);
  });

  it('puts removed chapters and items where they used to be', () => {
    const before = changed((c) => {
      c.chapters.push({ id: 'p3', title: 'Old', items: [lesson('l9')] });
      c.chapters.unshift({ id: 'p0', title: 'Intro', items: [lesson('l0')] });
    });
    const after = changed((c) => {
      c.title = 'Git, again';
      c.description = 'Learn Git well.';
      ch(c, 0).title = 'Basics, renamed';
      // l1 removed (first in its chapter), l3 removed after nothing kept, l4 moved to chapter 1.
      ch(c, 0).items = [lesson('l2'), lesson('l4')];
      ch(c, 1).items = [ch(c, 1).items[1] as Item];
    });
    const outline = outlineOf(before, after, changesOf(after, before));
    expect(outline.details).toEqual(['changed']);
    expect(outline.landing).toEqual(['changed']);
    expect(
      outline.chapters.map((c) => [
        c.number,
        c.title,
        c.statuses,
        c.items.map((i) => [i.number, i.title, i.statuses]),
      ]),
    ).toEqual([
      // Intro had nothing before it, so it comes first.
      [null, 'Intro', ['removed'], [[null, 'Lesson l0', ['removed']]]],
      [
        '1',
        'Basics, renamed',
        ['renamed'],
        [
          [null, 'Lesson l1', ['removed']],
          ['1.1', 'Lesson l2', []],
          ['1.2', 'Lesson l4', ['moved']],
        ],
      ],
      [
        '2',
        'History',
        [],
        [
          [null, 'Lesson l3', ['removed']],
          ['2.1', 'Quiz I', []],
        ],
      ],
      [null, 'Old', ['removed'], [[null, 'Lesson l9', ['removed']]]],
    ]);
  });
});

describe('the header', () => {
  it('says how many changes and whether the checks that stop a save pass', () => {
    expect(headerChecks(work(BASE))).toEqual({ valid: true, overLimit: false });
    expect(headerChecks(work({ ...BASE, title: '' }))).toEqual({ valid: false, overLimit: false });
    const big = changed((c) => {
      ch(c, 0).items[0] = lesson('l1', {
        blocks: Array.from({ length: 60 }, (_, i) => ({
          type: 'markdown',
          id: `b${i}`,
          md: 'x'.repeat(20_000),
        })),
      });
    });
    expect(headerChecks(work(big)).overLimit).toBe(true);
    expect(headerStatus(0, { valid: true, overLimit: false })).toBe('0 changes · checks pass');
    expect(headerStatus(1, { valid: false, overLimit: false })).toBe('1 change · 1 check fails');
    expect(headerStatus(4, { valid: false, overLimit: true })).toBe('4 changes · 2 checks fail');
  });
});

const AT = '2026-11-19T10:00:00.000Z';
const turn = (id: string, changes = 1): Turn => ({
  id,
  at: AT,
  by: 'agent',
  summary: id,
  checkpoint: `${id}.json`,
  changes,
});

describe('chatLines', () => {
  it('leaves out activity, and puts each turn’s line after its last entry', () => {
    const transcript: TranscriptEntry[] = [
      { kind: 'educator', turnId: 't1', at: AT, text: 'Go' },
      { kind: 'activity', turnId: 't1', at: AT, text: 'Reading the course' },
      { kind: 'agent', turnId: 't1', at: AT, text: 'Done' },
      { kind: 'notice', turnId: null, at: AT, text: 'Plan limit' },
      { kind: 'educator', turnId: 'gone', at: AT, text: 'Undone one' },
      { kind: 'educator', turnId: 't3', at: AT, text: 'Again' },
    ];
    const lines = chatLines(transcript, [turn('t1'), turn('t2')], turn('t3', 2));
    expect(
      lines.map((l) =>
        l.kind === 'entry' ? l.entry.text : [l.turn.id, l.number, l.newest, l.saved],
      ),
    ).toEqual([
      'Go',
      'Done',
      ['t1', 1, false, true],
      'Plan limit',
      'Undone one',
      'Again',
      ['t3', 3, true, false],
      // A turn whose chat was cut away still has its line.
      ['t2', 2, false, true],
    ]);
    expect(chatLines([], [turn('t1')]).map((l) => l.kind)).toEqual(['turn']);
  });

  it('names a turn by number and count', () => {
    expect(turnLabel(4, 4)).toBe('Turn 4 · 4 changes');
    expect(turnLabel(1, 1)).toBe('Turn 1 · 1 change');
    expect(turnLabel(2, 0)).toBe('Turn 2 · no changes');
    expect(turnLabel(5, 2, false)).toBe('Turn 5 · 2 changes · not saved');
    expect(turnLabel(6, 1, true, 'educator')).toBe('Turn 6 · by hand · 1 change');
    expect(turnLabel(7, 2, true, 'draft')).toBe('Turn 7 · draft brought in · 2 changes');
    // Bring in their changes is the turn that moves the base; nothing else keeps one.
    const turn = { by: 'educator' as const };
    expect(turnBy(turn)).toBe('educator');
    expect(turnBy({ ...turn, baseBefore: 't7.base.json' })).toBe('draft');
    expect(turnBy({ by: 'agent' })).toBe('agent');
  });
});
