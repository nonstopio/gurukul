import type { Working } from '../../types';
import type { z } from 'zod';
import type { AgentImage } from '../../../desktop/bridge';
import type { SessionGoal, SessionTodo } from '@gurukul/schema';

/**
 * What the agent's tools read and change: the session's working copy, the base it is compared
 * with, and the session fields the agent keeps (title, goals, summary, to-dos). The session store
 * (`DSK-11`) copies these in and out of `AuthoringSession`; nothing here touches disk or Firestore.
 */
export interface SessionState {
  work: Working;
  /** The stored draft the session started from; null for a new course. */
  base: Working | null;
  title: string;
  goals: SessionGoal[];
  summary: string;
  todos: SessionTodo[];
}

/**
 * One finding of the writing lint (`DSK-07`, `packages/schema/src/writingLint.ts`), as the tools
 * need it. The lint's own `WritingFinding` fits this shape as it is (`context.ts`).
 */
export interface WritingFinding {
  /** Set for a chapter title finding. */
  chapterId?: string | undefined;
  itemId?: string | undefined;
  blockId?: string | undefined;
  questionId?: string | undefined;
  /** The field the text is in: `md`, `prompt`, `description`… */
  field: string;
  /** Which outcome or option, for a finding on one entry of a list. */
  index?: number | undefined;
  /** The rule's stable name, e.g. `worn-phrase`. */
  rule: string;
  /** The words that tripped the rule. */
  excerpt: string;
  /** What to do about it, in plain words. */
  message?: string | undefined;
}

/** A file in the session's Sources folder (`DSK-20`). */
export interface SourceFile {
  name: string;
  bytes: number;
}

/** The session's Sources folder, read through the desktop bridge (`DSK-20`, `../sources.ts`). */
export interface SessionSources {
  /** The files in the folder, or null while the Educator has not chosen one. */
  list(): Promise<readonly SourceFile[] | null>;
  /**
   * The text of the listed file with this plain name, or null when there is no such file. It takes
   * a file name, never a path, and must never resolve a name to anything outside the folder
   * (`read_source` also refuses a name with `/` or `\`, the names `.` and `..`, and any name `list`
   * does not give). A file it will not read (not text, too large) throws `SourceRefusedError`
   * with a sentence for the agent.
   */
  read(name: string): Promise<string | null>;
  /**
   * A listed picture (png, jpg, gif or webp) as base64 with its media type, or null when there is no
   * such file; refuses as `read` does. The model sees it when `read_source` returns it.
   */
  readImage(name: string): Promise<AgentImage | null>;
}

/** A listed file the Sources folder will not read; the message is a sentence for the agent. */
export class SourceRefusedError extends Error {
  override name = 'SourceRefusedError';
}

/** What a tool may use besides the state: injected so the tools stay pure and testable. */
export interface ToolContext {
  /** Randomness for new ids (`newId`); `Math.random` in the app. */
  random: () => number;
  /** The clock, for a to-do's `createdAt`. */
  now: () => Date;
  /** The writing lint over the whole working copy, or one lesson or Quiz. */
  lintWriting(work: Working, scope: { itemId: string | null }): readonly WritingFinding[];
  /** Null outside the desktop app's sessions (tests); a session's folder lists null until chosen. */
  sources: SessionSources | null;
}

/** A tool's answer: the new state and a short text for the model (and any pictures to show it), or a sentence saying why not. */
export type ToolResult =
  { state: SessionState; text: string; images?: AgentImage[] } | { error: string };

/** One tool the agent can call. */
export interface ToolDef<S extends z.ZodType> {
  /** `snake_case`, as the model calls it: `add_block`. */
  name: string;
  /** What it does and when to use it, in plain words for the model. */
  description: string;
  input: S;
  run(state: SessionState, input: z.output<S>, ctx: ToolContext): ToolResult | Promise<ToolResult>;
}

/** A tool with its input type erased: `runTool` parses the input with `input` before `run` sees it. */
export interface Tool {
  name: string;
  description: string;
  input: z.ZodType;
  run(state: SessionState, input: never, ctx: ToolContext): ToolResult | Promise<ToolResult>;
}

/** Declares a tool, keeping its input typed inside `run`. */
export const defineTool = <S extends z.ZodType>(def: ToolDef<S>): Tool => def as unknown as Tool;

/** A refusal: one sentence the model can act on. */
export const refuse = (error: string): ToolResult => ({ error });

/** A change accepted (subject to `runTool`'s checks) with what to tell the model. */
export const done = (state: SessionState, text: string): ToolResult => ({ state, text });

/** A read: the state unchanged and the answer as compact JSON. */
export const answer = (state: SessionState, value: unknown): ToolResult => ({
  state,
  text: JSON.stringify(value),
});
