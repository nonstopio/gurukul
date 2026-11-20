import { lintCourse } from '@gurukul/schema/writingLint';
import type { Working } from '../../types';
import type { SessionSources, ToolContext, WritingFinding } from './types';

/**
 * The writing lint (`DSK-07`) as `lint_writing` calls it: the whole working copy, or the one lesson
 * or Quiz named. Its findings already carry everything the tools' `WritingFinding` asks for.
 */
export const lintWorkingCopy = (
  work: Working,
  { itemId }: { itemId: string | null },
): readonly WritingFinding[] => lintCourse(work, itemId === null ? undefined : [itemId]);

/**
 * The context the app runs the tools with: real randomness and clock, the writing lint, and the
 * session's Sources folder when the Educator chose one.
 */
export const defaultToolContext = (sources: SessionSources | null = null): ToolContext => ({
  random: Math.random,
  now: () => new Date(),
  lintWriting: lintWorkingCopy,
  sources,
});
