import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { courseSchema } from '../src';
import {
  OUTDATED_MESSAGE,
  fieldName,
  isInternal,
  problemWords,
  schemaIssues,
} from '../src/publishWords';
import { makeCourse } from './fixtures';

type Issue = z.core.$ZodIssue;
const issue = (over: Record<string, unknown>): Issue =>
  ({ code: 'custom', path: [], message: 'x', input: undefined, ...over }) as unknown as Issue;

describe('fieldName', () => {
  const course = makeCourse();
  it.each([
    [['title'], 'The course title'],
    [['summary'], 'The summary'],
    [['description'], 'The landing page description'],
    [['level'], 'The level'],
    [['rules', 'passMark'], 'The learning rules'],
    [['certificate', 'title'], 'The certificate title'],
    [['outcomes'], 'The learning outcomes'],
    [['outcomes', 2], 'Outcome 3'],
    [['cover', 'theme'], 'The cover theme'],
    [['cover', 'image', 'url'], 'The cover image'],
    [['chapters'], 'The chapter list'],
    [[], 'The course'],
    [['mascot'], 'The course'],
    [['chapters', 0], 'Chapter 1'],
    [['chapters', 0, 'title'], 'The title of chapter 1'],
    [['chapters', 0, 'items'], 'Chapter 1'],
    [['chapters', 0, 'items', 0], 'Lesson 1 in chapter 1'],
    [['chapters', 0, 'items', 0, 'title'], 'The title of lesson 1 in chapter 1'],
    [['chapters', 0, 'items', 0, 'minutes'], 'The length in minutes of lesson 1 in chapter 1'],
    [['chapters', 0, 'items', 0, 'blocks', 1, 'md'], 'Block 2 of lesson 1 in chapter 1'],
    [['chapters', 0, 'items', 0, 'blocks'], 'Lesson 1 in chapter 1'],
    [['chapters', 0, 'items', 0, 'layout'], 'Lesson 1 in chapter 1'],
    [['chapters', 0, 'items', 1, 'questions', 0, 'prompt'], 'Question 1 of Quiz 2 in chapter 1'],
    [['chapters', 0, 'items', 1, 'questions'], 'Quiz 2 in chapter 1'],
    [['chapters', 'x', 'items', 'y'], 'Lesson ? in chapter ?'],
    [['chapters', 5, 'items', 0], 'Lesson 1 in chapter 6'],
  ])('%j is "%s"', (path, name) => {
    expect(fieldName(path, course)).toBe(name);
  });
  it('reads a course that is not an object as a lesson', () => {
    expect(fieldName(['chapters', 0, 'items', 0], null)).toBe('Lesson 1 in chapter 1');
  });
});

describe('isInternal', () => {
  it.each([
    [['schemaVersion'], true],
    [['version'], true],
    [['rev'], true],
    [['educatorNames', 'u1'], true],
    [['chapters', 0, 'items', 0, 'id'], true],
    [['title'], false],
    [['chapters', 0, 'title'], false],
  ])('%j is %s', (path, internal) => {
    expect(isInternal(path)).toBe(internal);
  });
});

describe('problemWords', () => {
  it.each([
    [{ code: 'too_small', origin: 'string', minimum: 1 }, 'is empty'],
    [{ code: 'too_small', origin: 'string', minimum: 3 }, 'is too short (at least 3 characters)'],
    [{ code: 'too_big', origin: 'string', maximum: 160 }, 'is too long (at most 160 characters)'],
    [{ code: 'too_small', origin: 'array', minimum: 2 }, 'has too few entries (at least 2)'],
    [{ code: 'too_big', origin: 'array', maximum: 12 }, 'has too many entries (at most 12)'],
    [{ code: 'too_small', origin: 'number', minimum: 0 }, 'is too small (at least 0)'],
    [{ code: 'too_big', origin: 'number', maximum: 1 }, 'is too large (at most 1)'],
    [{ code: 'too_big', origin: 'date', maximum: 1 }, 'has a value Gurukul does not accept'],
    [{ code: 'invalid_format', format: 'url' }, 'is not a web address'],
    [{ code: 'invalid_format', format: 'email' }, 'has a value Gurukul does not accept'],
    [{ code: 'invalid_type' }, 'has a value Gurukul does not accept'],
  ])('%j reads "%s"', (over, words) => {
    expect(problemWords(issue(over))).toBe(words);
  });
});

describe('schemaIssues', () => {
  it('words each issue as a sentence and folds every internal one into a single reload notice', () => {
    const issues = [
      issue({ path: ['schemaVersion'], code: 'invalid_value' }),
      issue({ path: ['title'], code: 'too_big', origin: 'string', maximum: 160 }),
      issue({ path: ['chapters', 0, 'items', 0, 'id'], code: 'too_small', origin: 'string' }),
    ];
    expect(schemaIssues(issues, makeCourse())).toEqual([
      { code: 'schema.outdated', message: OUTDATED_MESSAGE },
      { code: 'schema', message: 'The course title is too long (at most 160 characters).' },
    ]);
  });
  it('words real schema output without any zod text', () => {
    const c = { ...makeCourse(), title: 'x'.repeat(161) };
    const parsed = courseSchema.safeParse(c);
    expect(parsed.success).toBe(false);
    expect(schemaIssues(parsed.error?.issues ?? [], c)).toEqual([
      { code: 'schema', message: 'The course title is too long (at most 160 characters).' },
    ]);
  });
  it('is empty for no issues', () => {
    expect(schemaIssues([], makeCourse())).toEqual([]);
  });
});
