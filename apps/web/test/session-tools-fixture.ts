import { expect, vi } from 'vitest';
import type { Course } from '@gurukul/schema';
import { runTool } from '../src/studio/session/tools';
import type { SessionState, ToolContext, ToolResult } from '../src/studio/session/tools';
import type { Working } from '../src/studio/types';

/** A small valid course: two chapters, three lessons (one with every kind of block the agent meets) and a Quiz. */
export function toolCourse(): Course {
  return {
    schemaVersion: 4,
    id: 'git',
    title: 'Git, the NonStop Way',
    summary: 'Version control for teams.',
    description: 'Learn Git the way we use it.',
    level: 'foundation',
    cover: { theme: 'forest', glyph: 'G' },
    outcomes: ['Commit with confidence', 'Branch without fear'],
    educatorIds: ['u1'],
    educatorNames: { u1: 'Asha Rao' },
    status: 'draft',
    version: 0,
    publishedAt: null,
    rules: { sequential: true, passMark: 0.7, certificate: true, requireVideoWatch: false },
    certificate: { title: 'Git' },
    estimatedMinutes: 15,
    chapters: [
      {
        id: 'p1',
        title: 'Basics',
        items: [
          {
            type: 'lesson',
            id: 'l1',
            title: 'First commit',
            minutes: 5,
            layout: 'stacked',
            completeWhen: 'manual',
            blocks: [
              { type: 'markdown', id: 'b1', md: 'Commit early. Commit often.' },
              {
                type: 'code',
                id: 'b2',
                lang: 'bash',
                code: 'git commit -m "first"',
                copy: true,
                terminal: true,
              },
              { type: 'image', id: 'b3', url: 'https://example.com/diff.png', alt: 'Diff view' },
              {
                type: 'check',
                id: 'b4',
                prompt: 'What does a commit save?',
                options: ['A snapshot', 'A diff'],
                correct: 0,
                explanation: 'Git stores snapshots.',
              },
            ],
          },
          {
            type: 'lesson',
            id: 'l2',
            title: 'Branches',
            minutes: 5,
            layout: 'stacked',
            completeWhen: 'manual',
            blocks: [{ type: 'markdown', id: 'b5', md: 'A branch is a pointer.' }],
          },
        ],
      },
      {
        id: 'p2',
        title: 'History',
        items: [
          {
            type: 'quiz',
            id: 'q1',
            title: 'History check',
            questionsShown: 2,
            shuffleOptions: true,
            cooldownMinutes: 10,
            revealAnswers: 'each',
            blocksNext: true,
            questions: [
              {
                id: 'k1',
                kind: 'single',
                prompt: 'Which command rewrites history?',
                options: [
                  { id: 'a', text: 'git rebase' },
                  { id: 'b', text: 'git status' },
                ],
                explanation: 'Rebase replays commits.',
              },
              {
                id: 'k2',
                kind: 'multiple',
                prompt: 'Which are safe on a shared branch?',
                options: [
                  { id: 'c', text: 'git merge' },
                  { id: 'd', text: 'git revert' },
                  { id: 'e', text: 'git push --force' },
                ],
                explanation: 'Force pushing rewrites what others have.',
                reviewItemId: 'l2',
              },
            ],
          },
          {
            type: 'lesson',
            id: 'l3',
            title: 'Rebase',
            minutes: 5,
            layout: 'stacked',
            completeWhen: 'manual',
            blocks: [],
          },
        ],
      },
    ],
  };
}

export function toolWork(): Working {
  return { course: toolCourse(), answers: { q1: { k1: ['a'], k2: ['c', 'd'] } } };
}

export function toolState(over: Partial<SessionState> = {}): SessionState {
  return {
    work: toolWork(),
    base: toolWork(),
    title: 'Simplify the history chapter',
    goals: [{ text: 'Simplify chapter 2', done: false }],
    summary: '',
    todos: [],
    ...over,
  };
}

/** A repeatable random sequence, so made ids are the same on every run. */
export function seeded(seed = 7): () => number {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

export function toolCtx(over: Partial<ToolContext> = {}): ToolContext {
  return {
    random: seeded(),
    now: () => new Date('2026-11-19T10:00:00.000Z'),
    lintWriting: vi.fn(() => []),
    sources: null,
    educatorLinks: new Set(),
    ...over,
  };
}

export const call = (
  state: SessionState,
  name: string,
  input: unknown = {},
  ctx: ToolContext = toolCtx(),
): Promise<ToolResult> => runTool(state, name, input, ctx);

/** The accepted result of a call; fails the test with the refusal otherwise. */
export async function ok(
  pending: Promise<ToolResult>,
): Promise<{ state: SessionState; text: string }> {
  const result = await pending;
  if ('error' in result) expect.fail(`refused: ${result.error}`);
  return result;
}

/** The refusal of a call; fails the test when it was accepted. */
export async function refused(pending: Promise<ToolResult>): Promise<string> {
  const result = await pending;
  if (!('error' in result)) expect.fail(`accepted: ${result.text}`);
  return result.error;
}

/** A call's answer as parsed JSON (read tools answer in JSON). */
export async function json<T = Record<string, unknown>>(pending: Promise<ToolResult>): Promise<T> {
  return JSON.parse((await ok(pending)).text) as T;
}

export const lessonOf = (state: SessionState, id: string) =>
  state.work.course.chapters.flatMap((p) => p.items).find((i) => i.id === id);

/** The value, failing the test when it is missing (instead of a non-null assertion). */
export function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value');
  return value;
}
