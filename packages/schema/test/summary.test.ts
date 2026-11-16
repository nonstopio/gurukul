import { describe, expect, it } from 'vitest';
import { COURSE_SUMMARY_VERSION, courseImage, courseSummarySchema, summariseCourse } from '../src';
import { makeCourse, ts } from './fixtures';

const image = (url: string) => ({ type: 'image' as const, id: url, url, alt: '' });

describe('course summary', () => {
  it('holds what a tile and a list need, and nothing of the lessons', () => {
    const course = makeCourse({ educatorIds: ['u1'], estimatedMinutes: 12 });
    const summary = summariseCourse(course);
    expect(summary).toEqual({
      summaryVersion: COURSE_SUMMARY_VERSION,
      id: 'git',
      title: 'Git',
      summary: 'Version control.',
      level: 'foundation',
      cover: { theme: 'forest', glyph: 'G' },
      educatorIds: ['u1'],
      educatorNames: {},
      status: 'published',
      version: 1,
      publishedAt: course.publishedAt,
      estimatedMinutes: 12,
      chapters: course.chapters.length,
      lessons: 3,
      quizzes: 1,
      certificate: true,
      visibility: 'public',
      visibleTeamIds: [],
    });
    expect(courseSummarySchema.parse({ ...summary, courseUpdatedAt: ts(5) })).toMatchObject({
      id: 'git',
    });
    expect(JSON.stringify(summary)).not.toContain('Which?');
  });

  it('copies the access beside the course, which the rules read', () => {
    const stored = { ...makeCourse(), visibility: 'teams', visibleTeamIds: ['platform'] };
    expect(summariseCourse(stored)).toMatchObject({
      visibility: 'teams',
      visibleTeamIds: ['platform'],
    });
  });

  it('keeps a course whose access it cannot read to staff, never wider than the rules do', () => {
    expect(summariseCourse({ ...makeCourse(), visibility: 'public' })).toMatchObject({
      visibility: 'public',
      visibleTeamIds: [],
    });
    expect(summariseCourse({ ...makeCourse(), visibility: 'staff' })).toMatchObject({
      visibility: 'staff',
      visibleTeamIds: [],
    });
    expect(
      summariseCourse({ ...makeCourse(), visibility: 'teams', visibleTeamIds: [] }),
    ).toMatchObject({ visibility: 'staff' });
  });

  it('summarises a course never published', () => {
    const shell = makeCourse({ status: 'draft', version: 0, publishedAt: null, chapters: [] });
    expect(summariseCourse(shell)).toMatchObject({
      status: 'draft',
      publishedAt: null,
      chapters: 0,
      lessons: 0,
      quizzes: 0,
    });
  });

  it('gives nothing for a document that is not a readable course', () => {
    expect(summariseCourse({ title: 'no version' })).toBeNull();
    expect(summariseCourse(undefined)).toBeNull();
  });

  it('pictures the cover image, else the first lesson image, else nothing', () => {
    const course = makeCourse();
    expect(courseImage(course)).toBeUndefined();
    expect(summariseCourse(course)).not.toHaveProperty('image');

    const lesson = {
      type: 'lesson' as const,
      id: 'pictured',
      title: 'Pictured',
      minutes: 1,
      layout: 'stacked' as const,
      completeWhen: 'manual' as const,
    };
    const pictured = makeCourse({
      chapters: [
        {
          id: 'p1',
          title: 'Basics',
          items: [
            ...course.chapters.flatMap((c) => c.items).filter((i) => i.type === 'quiz'),
            { ...lesson, id: 'plain', blocks: [] },
            {
              ...lesson,
              blocks: [image('https://example.com/1.png'), image('https://example.com/2.png')],
            },
          ],
        },
      ],
    });
    expect(summariseCourse(pictured)?.image).toBe('https://example.com/1.png');

    const cover = {
      ...course.cover,
      image: {
        url: 'https://example.com/cover.png',
        width: 10,
        height: 10,
        upload: {
          path: 'courses/git/media/c.png',
          bytes: 1,
          contentType: 'image/png' as const,
          name: 'c.png',
        },
      },
    };
    expect(courseImage({ ...pictured, cover })).toBe('https://example.com/cover.png');
  });
});
