import type { Working } from '../../types';
import type { z } from 'zod';
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
 * need it. The integrator adapts the lint's own finding to this shape if the two differ.
 */
export interface WritingFinding {
  itemId?: string | undefined;
  blockId?: string | undefined;
  questionId?: string | undefined;
  /** The field the text is in: `md`, `prompt`, `description`… */
  field: string;
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

/** The session's Sources folder, read through the desktop bridge (`DSK-20`). */
export interface SessionSources {
  list(): Promise<readonly SourceFile[]>;
  /** The file's text, or null when there is no such file. */
  read(name: string): Promise<string | null>;
}

/** What a tool may use besides the state: injected so the tools stay pure and testable. */
export interface ToolContext {
  /** Randomness for new ids (`newId`); `Math.random` in the app. */
  random: () => number;
  /** The clock, for a to-do's `createdAt`. */
  now: () => Date;
  /** The writing lint over the whole working copy, or one lesson or Quiz. */
  lintWriting(work: Working, scope: { itemId: string | null }): readonly WritingFinding[];
  /** Null when the Educator has not chosen a Sources folder. */
  sources: SessionSources | null;
}

/** A tool's answer: the new state and a short text for the model, or a sentence saying why not. */
export type ToolResult = { state: SessionState; text: string } | { error: string };

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
