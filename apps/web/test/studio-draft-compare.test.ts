import { describe, expect, it } from 'vitest';
import { hasUnpublishedChanges, markAnswerEdits, sameWork } from '../src/studio/studioModel';
import type { Working } from '../src/studio/types';
import { makeCourse } from './fake-data';

const work = (): Working => ({ course: makeCourse(), answers: { q1: { k1: ['a'] } } });

describe('sameWork', () => {
  it('is true for the same object, and for an edit that was undone', () => {
    const w = work();
    expect(sameWork(w, w)).toBe(true);
    const typed = { ...w, course: { ...w.course, title: `${w.course.title} ` } };
    const undone = { ...typed, course: { ...typed.course, title: w.course.title } };
    expect(sameWork(w, typed)).toBe(false);
    expect(sameWork(w, undone)).toBe(true);
  });

  it('ignores key order and undefined fields, but not array order or answer keys', () => {
    const w = work();
    const { title, ...rest } = w.course;
    const reordered = { ...w, course: { ...rest, summary: w.course.summary, title } };
    expect(sameWork(w, reordered as Working)).toBe(true);
    const withUndefined = { ...w, course: { ...w.course, image: undefined } };
    expect(sameWork(w, withUndefined as Working)).toBe(true);
    const flipped = {
      ...w,
      course: { ...w.course, chapters: [...w.course.chapters].reverse() },
    };
    expect(w.course.chapters.length).toBeGreaterThan(1);
    expect(sameWork(w, flipped)).toBe(false);
    expect(sameWork(w, { ...w, answers: { q1: { k1: ['b'] } } })).toBe(false);
  });
});

describe('hasUnpublishedChanges', () => {
  it('is always true before the first publication', () => {
    expect(hasUnpublishedChanges(null, { course: makeCourse(), answers: {} })).toBe(true);
  });

  it('compares content only: version, status and publish date do not count', () => {
    const live = makeCourse({ version: 3, status: 'published' });
    const draft = makeCourse({ version: 0, status: 'draft', publishedAt: null });
    expect(hasUnpublishedChanges(live, { course: draft, answers: {} })).toBe(false);
    expect(
      hasUnpublishedChanges(live, { course: { ...draft, summary: 'Changed' }, answers: {} }),
    ).toBe(true);
  });

  it('is true when only an answer key was edited', () => {
    const live = makeCourse({ version: 3, status: 'published' });
    expect(hasUnpublishedChanges(live, { course: live, answers: {}, answersChanged: true })).toBe(
      true,
    );
  });
});

describe('markAnswerEdits', () => {
  it('marks a working copy whose answer keys differ from the stored ones', () => {
    const stored = work();
    const edited = { ...stored, answers: { q1: { k1: ['b'] } } };
    expect(markAnswerEdits(edited, stored)).toEqual({ ...edited, answersChanged: true });
  });

  it('leaves an edit that does not touch the keys, or puts them back before a save, unmarked', () => {
    const stored = work();
    const titled = { ...stored, course: { ...stored.course, title: 'New' } };
    expect(markAnswerEdits(titled, stored)).toBe(titled);
    const undone = { ...stored, answers: { q1: { k1: ['a'] } }, answersChanged: true as const };
    expect(markAnswerEdits(undone, stored)).toEqual({ ...stored });
    expect(markAnswerEdits(undone, stored)).not.toHaveProperty('answersChanged');
  });

  it('keeps the mark the stored draft already has, even when the keys match it', () => {
    const stored = { ...work(), answersChanged: true as const };
    const same = { ...stored };
    expect(markAnswerEdits(same, stored)).toBe(same);
    const dropped = { course: stored.course, answers: stored.answers };
    expect(markAnswerEdits(dropped, stored)).toEqual(stored);
  });
});
