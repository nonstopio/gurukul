import { describe, expect, it } from 'vitest';
import {
  addLesson,
  addOutcome,
  addParva,
  addPariksha,
  deleteItem,
  deleteParva,
  moveItemToParva,
  moveItemWithin,
  moveParva,
  patchCourse,
  removeOutcome,
  renameParva,
  setCertificate,
  setCoverTheme,
  setOutcome,
  setPassMark,
  setRule,
} from '../src/studio/courseEdit';
import {
  acharyaSummary,
  canEdit,
  changeSummary,
  collectMedia,
  inTab,
  issuesFromDetails,
  itemEditorPath,
  itemKind,
  itemMeta,
  nameOf,
  relativeTime,
  tabCounts,
  unpublishedEdits,
} from '../src/studio/studioModel';
import type { Working } from '../src/studio/types';
import { draftDoc } from './fake-studio';
import { lesson, makeCourse } from './fake-data';

const work = (): Working => ({
  course: makeCourse(),
  answers: { q1: { k1: ['a'] } },
});
const ids = (w: Working, parva = 0) => w.course.parvas[parva]?.items.map((i) => i.id);

describe('courseEdit', () => {
  it('patches the course without touching the original', () => {
    const w = work();
    const next = patchCourse(w, { title: 'New' });
    expect(next.course.title).toBe('New');
    expect(w.course.title).toBe('Git, the NonStop Way');
    expect(next.answers).toBe(w.answers);
  });

  it('sets rules, pass mark (clamped, NaN ignored), certificate, cover and outcomes', () => {
    const w = work();
    expect(setRule(w, 'sequential', false).course.rules.sequential).toBe(false);
    expect(setPassMark(w, 85).course.rules.passMark).toBe(0.85);
    expect(setPassMark(w, 250).course.rules.passMark).toBe(1);
    expect(setPassMark(w, -4).course.rules.passMark).toBe(0);
    expect(setPassMark(w, Number.NaN)).toBe(w);
    expect(setCertificate(w, { signatoryName: 'Asha' }).course.certificate).toMatchObject({
      title: 'Git',
      signatoryName: 'Asha',
    });
    expect(setCoverTheme(w, 'sky').course.cover).toEqual({ theme: 'sky', glyph: 'G' });
    const added = addOutcome(w);
    expect(added.course.outcomes).toEqual(['Commit with confidence', '']);
    expect(setOutcome(added, 1, 'Branch').course.outcomes).toEqual([
      'Commit with confidence',
      'Branch',
    ]);
    expect(removeOutcome(added, 0).course.outcomes).toEqual(['']);
  });

  it('adds, renames and moves parvas', () => {
    const added = addParva(work(), 'parva-1');
    expect(added.course.parvas.map((p) => p.id)).toEqual(['p1', 'p2', 'parva-1']);
    expect(added.course.parvas[2]).toEqual({ id: 'parva-1', title: 'New parva', items: [] });
    expect(renameParva(added, 'p2', 'Past').course.parvas[1]?.title).toBe('Past');
    expect(renameParva(added, 'p1', 'Start').course.parvas[1]?.title).toBe('History');
    expect(moveParva(added, 2, 0).course.parvas.map((p) => p.id)).toEqual(['parva-1', 'p1', 'p2']);
  });

  it('deletes a parva with its Pariksha answer keys, and ignores an unknown one', () => {
    const w = work();
    const next = deleteParva(w, 'p2');
    expect(next.course.parvas.map((p) => p.id)).toEqual(['p1']);
    expect(next.answers).toEqual({});
    const same = deleteParva(w, 'nope');
    expect(same.course.parvas).toHaveLength(2);
    expect(same.answers).toEqual(w.answers);
  });

  it('adds a lesson and a Pariksha with the defaults', () => {
    const withLesson = addLesson(work(), 'p1', 'lesson-9');
    expect(withLesson.course.parvas[0]?.items.at(-1)).toEqual({
      type: 'lesson',
      id: 'lesson-9',
      title: 'Untitled lesson',
      minutes: 5,
      layout: 'stacked',
      completeWhen: 'manual',
      blocks: [],
    });
    const withExam = addPariksha(work(), 'p2', 'exam-9');
    expect(withExam.course.parvas[1]?.items.at(-1)).toMatchObject({
      type: 'pariksha',
      id: 'exam-9',
      questionsShown: 1,
      shuffleOptions: true,
      cooldownMinutes: 10,
      revealAnswers: 'each',
      blocksNext: true,
      questions: [],
    });
    expect(ids(addLesson(work(), 'unknown', 'x'), 0)).toEqual(['l1', 'l2']);
  });

  it('deletes an item and its answer keys', () => {
    const w = work();
    expect(ids(deleteItem(w, 'l1'))).toEqual(['l2']);
    expect(deleteItem(w, 'l1').answers).toEqual(w.answers);
    const gone = deleteItem(w, 'q1');
    expect(ids(gone, 1)).toEqual(['l3', 'l4']);
    expect(gone.answers).toEqual({});
  });

  it('reorders items inside a parva, clamped', () => {
    expect(ids(moveItemWithin(work(), 'p2', 0, 2), 1)).toEqual(['q1', 'l4', 'l3']);
    expect(ids(moveItemWithin(work(), 'p2', 2, 9), 1)).toEqual(['l3', 'q1', 'l4']);
    expect(ids(moveItemWithin(work(), 'p1', 1, 0), 0)).toEqual(['l2', 'l1']);
  });

  it('moves an item to the end of another parva, and ignores impossible moves', () => {
    const moved = moveItemToParva(work(), 'l1', 'p2');
    expect(ids(moved, 0)).toEqual(['l2']);
    expect(ids(moved, 1)).toEqual(['l3', 'q1', 'l4', 'l1']);
    const three = addParva(work(), 'p3');
    expect(ids(moveItemToParva(three, 'l1', 'p2'), 1)).toContain('l1');
    expect(three.course.parvas[2]?.items).toEqual([]);
    const w = work();
    expect(moveItemToParva(w, 'l1', 'p1')).toBe(w);
    expect(moveItemToParva(w, 'nope', 'p2')).toBe(w);
    expect(moveItemToParva(w, 'l1', 'nope')).toBe(w);
  });
});

describe('studioModel', () => {
  const now = new Date('2026-03-10T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('says who may edit', () => {
    expect(canEdit({ acharyaIds: ['u1'] }, 'u1', false)).toBe(true);
    expect(canEdit({ acharyaIds: ['u2'] }, 'u1', false)).toBe(false);
    expect(canEdit({ acharyaIds: [] }, 'u1', true)).toBe(true);
  });

  it('names the Acharyas, counting the ones whose name was never stored', () => {
    const names = { u1: 'Asha Rao', u2: 'Rohan Das' };
    expect(acharyaSummary({ acharyaIds: ['u1'], acharyaNames: names })).toEqual({
      label: 'Acharya',
      names: 'Asha Rao',
    });
    expect(acharyaSummary({ acharyaIds: ['u1', 'u2', 'x'], acharyaNames: names })).toEqual({
      label: 'Acharyas',
      names: 'Asha Rao, Rohan Das, 1 other',
    });
    expect(acharyaSummary({ acharyaIds: ['u1', 'x', 'y'], acharyaNames: names })?.names).toBe(
      'Asha Rao, 2 others',
    );
    expect(acharyaSummary({ acharyaIds: ['x'], acharyaNames: names })).toBeNull();
    expect(acharyaSummary({ acharyaIds: [], acharyaNames: {} })).toBeNull();
  });

  it('words relative time', () => {
    expect(relativeTime(ago(20_000), now)).toBe('just now');
    expect(relativeTime(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(relativeTime(ago(2 * 3_600_000), now)).toBe('2 h ago');
    expect(relativeTime(ago(3 * 86_400_000), now)).toBe('3 d ago');
    expect(relativeTime(ago(60 * 86_400_000), now)).toBe('2026-01-09');
  });

  it('names things', () => {
    expect(nameOf('  ', 'Untitled')).toBe('Untitled');
    expect(nameOf('Git', 'Untitled')).toBe('Git');
    expect(itemEditorPath('git', { id: 'l1', type: 'lesson' })).toBe(
      '/studio/courses/git/lessons/l1',
    );
    expect(itemEditorPath('git', { id: 'q1', type: 'pariksha' })).toBe(
      '/studio/courses/git/pariksha/q1',
    );
  });

  it('classifies items for the type tile and the meta line', () => {
    const course = makeCourse();
    const exam = course.parvas[1]?.items[1];
    if (!exam) throw new Error('fixture');
    expect(itemKind(exam)).toBe('pariksha');
    expect(itemMeta(exam)).toBe('1 question');
    expect(itemMeta({ ...(exam as object), questions: [] } as never)).toBe('0 questions');
    expect(itemKind(lesson('a') as never)).toBe('reading');
    const video = {
      type: 'video',
      id: 'v',
      provider: 'youtube',
      url: 'https://youtu.be/x',
      captions: false,
    };
    const code = { type: 'code', id: 'c', lang: 'sh', code: 'ls', copy: true, terminal: true };
    expect(itemKind(lesson('a', { blocks: [code, video] }) as never)).toBe('video');
    expect(itemKind(lesson('a', { blocks: [code] }) as never)).toBe('code');
    expect(itemMeta(lesson('a') as never)).toBe('5 min');
  });

  it('counts and filters course tabs', () => {
    const rows = [
      { live: makeCourse({ id: 'a', status: 'published' }), draft: null },
      { live: makeCourse({ id: 'b', status: 'draft' }), draft: null },
      { live: makeCourse({ id: 'c', status: 'archived' }), draft: null },
    ];
    expect(tabCounts(rows)).toEqual({ all: 3, published: 1, drafts: 1 });
    expect(rows.filter((r) => inTab(r, 'all'))).toHaveLength(3);
    expect(rows.filter((r) => inTab(r, 'published')).map((r) => r.live.id)).toEqual(['a']);
    expect(rows.filter((r) => inTab(r, 'drafts')).map((r) => r.live.id)).toEqual(['b']);
  });

  it('counts unpublished edits only for a published course with a draft', () => {
    const live = makeCourse();
    expect(unpublishedEdits({ live, draft: null })).toBeNull();
    expect(
      unpublishedEdits({ live: makeCourse({ version: 0 }), draft: draftDoc(live) }),
    ).toBeNull();
    expect(unpublishedEdits({ live, draft: draftDoc(live) })).toBe(0);
    const edited = makeCourse({ title: 'Renamed' });
    expect(unpublishedEdits({ live, draft: draftDoc(edited) })).toBe(1);
  });

  it('summarises changes with titles', () => {
    const live = makeCourse();
    const draft = makeCourse({
      parvas: [
        {
          id: 'p1',
          title: 'Basics',
          items: [lesson('l1', { title: 'Renamed' }), lesson('l9', { title: 'Fresh' })],
        },
      ],
    });
    expect(changeSummary(live, draft)).toEqual({
      added: ['Fresh'],
      edited: ['Renamed'],
      removed: ['Lesson l2', 'Lesson l3', 'Pariksha I', 'Lesson l4'],
      courseChanged: true,
    });
    expect(changeSummary(null, draft).added).toEqual(['Renamed', 'Fresh']);
  });

  it('reads publish issues from error details, ignoring junk', () => {
    expect(issuesFromDetails({})).toEqual([]);
    expect(issuesFromDetails({ issues: 'no' })).toEqual([]);
    const ok = { code: 'a', message: 'Fix', itemId: 'l1' };
    expect(
      issuesFromDetails({ issues: [ok, null, 3, { code: 1, message: 'x' }, { code: 'b' }] }),
    ).toEqual([ok]);
  });

  it('collects media once per address, preferring the draft', () => {
    const blocks = [
      { type: 'video', id: 'v', provider: 'youtube', url: 'https://youtu.be/a', captions: false },
      { type: 'image', id: 'i', url: 'https://x.test/a.png', alt: '' },
      { type: 'image', id: 'i2', url: 'https://x.test/b.png', alt: 'Diagram' },
      { type: 'embed', id: 'e', url: 'https://www.youtube.com/embed/a', title: 'Demo' },
      { type: 'embed', id: 'e2', url: 'https://www.youtube.com/embed/b', title: '' },
      { type: 'file', id: 'f', url: 'https://x.test/a.pdf', label: 'Slides' },
      { type: 'file', id: 'f2', url: 'https://x.test/b.pdf', label: '' },
      { type: 'markdown', id: 'm', md: 'hi' },
    ];
    const live = makeCourse({
      id: 'one',
      title: 'One',
      parvas: [{ id: 'p', title: 'P', items: [lesson('a', { blocks: [] })] }],
    });
    const draft = makeCourse({
      id: 'one',
      title: 'One',
      parvas: [
        {
          id: 'p',
          title: 'P',
          items: [
            lesson('a', { title: 'A', blocks: [...blocks, blocks[0]] }),
            lesson('b', { title: 'B', blocks: [blocks[0]] }),
            makeCourse().parvas[1]?.items[1] as never,
          ],
        },
      ],
    });
    const other = makeCourse({
      id: 'two',
      title: 'Two',
      parvas: [{ id: 'p', title: 'P', items: [lesson('c', { title: 'C', blocks: [blocks[5]] })] }],
    });
    const found = collectMedia([
      { live, draft: draftDoc(draft) },
      { live: other, draft: null },
    ]);
    expect(found.map((e) => `${e.kind}:${e.label}`)).toEqual([
      'video:https://youtu.be/a',
      'image:https://x.test/a.png',
      'image:Diagram',
      'embed:Demo',
      'embed:https://www.youtube.com/embed/b',
      'file:Slides',
      'file:https://x.test/b.pdf',
    ]);
    expect(found[0]?.usedIn.map((u) => u.itemTitle)).toEqual(['A', 'B']);
    expect(found.find((e) => e.label === 'Slides')?.usedIn.map((u) => u.courseTitle)).toEqual([
      'One',
      'Two',
    ]);
  });
});
