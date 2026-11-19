import { z } from 'zod';
import { log } from '../../../log';
import { BLOCK_TOOLS } from './blocks';
import { CHECK_TOOLS } from './checks';
import { COURSE_TOOLS } from './course';
import { describeIssues, sessionProblem, workProblem } from './issues';
import { QUIZ_TOOLS } from './quiz';
import { READ_TOOLS } from './read';
import { SESSION_TOOLS } from './session';
import { STRUCTURE_TOOLS } from './structure';
import { refuse } from './types';
import type { SessionState, Tool, ToolContext, ToolResult } from './types';

/*
 * The course tools the Desktop Studio agent calls (`.plan/22-desktop-studio.md`, "The agent's
 * tools"). Each runs in the window against the session's working copy, through Studio's own edit
 * helpers, and its result is checked here before it becomes the working copy. There is no tool for
 * publishing, access, roles, assignments, learners, progress, attempts, teams, the question bank or
 * any other course. Loaded only by the desktop session chunk, never by an eager route.
 */

export type {
  SessionSources,
  SessionState,
  SourceFile,
  Tool,
  ToolContext,
  ToolResult,
  WritingFinding,
} from './types';

/** Every tool, in the order the plan lists them. */
export const TOOLS: readonly Tool[] = [
  ...READ_TOOLS,
  ...COURSE_TOOLS,
  ...STRUCTURE_TOOLS,
  ...BLOCK_TOOLS,
  ...QUIZ_TOOLS,
  ...CHECK_TOOLS,
  ...SESSION_TOOLS,
];

/** One entry of the MCP server's tool list. */
export interface ToolListing {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** The tools as the MCP server lists them: name, description and input as JSON Schema. */
export function toolList(tools: readonly Tool[] = TOOLS): ToolListing[] {
  return tools.map((t) => {
    // The dialect line is left out: MCP clients assume JSON Schema and some reject the key.
    const inputSchema = Object.fromEntries(
      Object.entries(z.toJSONSchema(t.input, { io: 'input' })).filter(([k]) => k !== '$schema'),
    );
    return { name: t.name, description: t.description, inputSchema };
  });
}

const FAILED =
  'The tool failed unexpectedly and nothing was changed. Try once more; if it fails again, tell the Educator.';

/**
 * Runs one tool call from the agent against `state`, using the tools given. The input is parsed
 * with the tool's schema; a change is checked (course schema, size limit, the course's fixed
 * fields, the session's own fields) and refused as a whole when it fails, so the working copy is
 * never left half-changed or invalid. The base never changes.
 */
export async function runToolIn(
  tools: readonly Tool[],
  state: SessionState,
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return refuse(`There is no tool called "${name}".`);
  const input = rawInput ?? {};
  const parsed = tool.input.safeParse(input);
  if (!parsed.success)
    return refuse(
      `The input for ${name} is not valid. ${describeIssues(input, parsed.error.issues)}`,
    );
  let result: ToolResult;
  try {
    result = await tool.run(state, parsed.data as never, ctx);
  } catch (error) {
    log.error('Session tool failed', error, { tool: name });
    return refuse(FAILED);
  }
  if ('error' in result) return result;
  const next: SessionState = { ...result.state, base: state.base };
  const problem = workProblem(state.work, next.work) ?? sessionProblem(next);
  return problem === null ? { state: next, text: result.text } : refuse(problem);
}

/** Runs one tool call from the agent against the session's state; see `runToolIn`. */
export const runTool = (
  state: SessionState,
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolResult> => runToolIn(TOOLS, state, name, rawInput, ctx);
