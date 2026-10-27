import { describe, expect, it } from 'vitest';
import { blockSchema, courseSchema, parikshaSchema, slug, timestamp } from '../src';
import { itemAt, makeCourse, ts } from './fixtures';

describe('timestamp', () => {
  it('accepts anything with toMillis and toDate, nothing else', () => {
    expect(timestamp.safeParse(ts(1)).success).toBe(true);
    expect(timestamp.safeParse(null).success).toBe(false);
    expect(timestamp.safeParse(5).success).toBe(false);
    expect(timestamp.safeParse({ toMillis: () => 1 }).success).toBe(false);
  });
});

describe('slug', () => {
  it('accepts kebab-case ids only', () => {
    expect(slug.safeParse('git-basics').success).toBe(true);
    expect(slug.safeParse('Git Basics').success).toBe(false);
    expect(slug.safeParse('').success).toBe(false);
  });
});

describe('courseSchema', () => {
  it('accepts a complete course', () => {
    expect(courseSchema.safeParse(makeCourse()).success).toBe(true);
  });

  it('rejects an unknown level and a missing title', () => {
    expect(courseSchema.safeParse({ ...makeCourse(), level: 'expert' }).success).toBe(false);
    expect(courseSchema.safeParse({ ...makeCourse(), title: '' }).success).toBe(false);
  });

  it('accepts an unpublished course with no publish date', () => {
    expect(courseSchema.safeParse(makeCourse({ status: 'draft', publishedAt: null })).success).toBe(
      true,
    );
  });
});

describe('blockSchema', () => {
  const blocks = [
    { type: 'video', id: 'v', provider: 'youtube', url: 'https://youtu.be/x', captions: true },
    { type: 'markdown', id: 'm', md: 'x' },
    { type: 'code', id: 'c', lang: 'sh', code: 'ls', copy: true, terminal: true },
    { type: 'callout', id: 'k', tone: 'tip', md: 'x' },
    { type: 'image', id: 'i', url: 'https://x.test/a.png', alt: 'a' },
    { type: 'embed', id: 'e', url: 'https://x.test', title: 't' },
    { type: 'file', id: 'f', url: 'https://x.test/a.pdf', label: 'a' },
    { type: 'check', id: 'h', prompt: 'p', options: ['a', 'b'], explanation: 'e' },
  ];
  it.each(blocks)('accepts a $type block', (b) => {
    expect(blockSchema.safeParse(b).success).toBe(true);
  });

  it('rejects an unknown block type and a bad url', () => {
    expect(blockSchema.safeParse({ type: 'poll', id: 'x' }).success).toBe(false);
    expect(blockSchema.safeParse({ ...blocks[0], url: 'not a url' }).success).toBe(false);
  });
});

describe('parikshaSchema', () => {
  const pariksha = itemAt(makeCourse(), 1);
  it('rejects showing more questions than exist', () => {
    expect(parikshaSchema.safeParse({ ...pariksha, questionsShown: 2 }).success).toBe(false);
    expect(parikshaSchema.safeParse(pariksha).success).toBe(true);
  });
});
