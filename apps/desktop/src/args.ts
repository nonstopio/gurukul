import { z } from 'zod';
import {
  MAX_AGENT_TEXT_LENGTH,
  MAX_PATH_SEGMENTS,
  MAX_SEGMENT_LENGTH,
  MAX_SKILL_FILES,
  MAX_SKILL_PATH_SEGMENTS,
  MAX_SKILLS,
  MAX_TOOL_RESULT_LENGTH,
  MAX_TOOLS,
  isPlainFileName,
  isSafePath,
  isSafeSegment,
} from './bridge';

/**
 * The zod pieces the call handlers check their arguments with. Store names are checked for shape
 * and length only, because `store.ts` decides which are safe; the other calls check the bridge's
 * own name rules (`isSafeSegment`, `isSafePath`, `isPlainFileName`), so a handler never sees a name
 * it would have to refuse.
 */

/** A `uid` or `sessionId`. */
export const id = z.string().min(1).max(MAX_SEGMENT_LENGTH);

/** A store path: shape and length; `store.ts` checks the names. */
export const relativePath = z
  .string()
  .min(1)
  .max((MAX_SEGMENT_LENGTH + 1) * MAX_PATH_SEGMENTS);

export const sessionRef = z.object({ uid: id, sessionId: id }).strict();

/** A Claude session id: what `--session-id` was given, a UUID. Never a path. */
export const agentSessionId = z.guid();

const safeName = z.string().refine(isSafeSegment, 'Not a safe name');

const skillPath = z
  .string()
  .refine(
    (p) => isSafePath(p) && p.split('/').length <= MAX_SKILL_PATH_SEGMENTS,
    'Not a safe path',
  );

const agentText = z.string().max(MAX_AGENT_TEXT_LENGTH);

export const agentStartRequest = z
  .object({
    uid: id,
    sessionId: id,
    systemPrompt: agentText.min(1),
    skills: z
      .array(
        z
          .object({
            name: safeName,
            files: z
              .array(z.object({ path: skillPath, text: agentText }).strict())
              .min(1)
              .max(MAX_SKILL_FILES),
          })
          .strict(),
      )
      .max(MAX_SKILLS),
    tools: z
      .array(
        z
          .object({
            name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
            description: agentText,
            inputSchema: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .max(MAX_TOOLS),
    resumeId: agentSessionId.nullable(),
  })
  .strict();

/** The shell's id for one tool call. */
export const callId = z.string().min(1).max(MAX_SEGMENT_LENGTH);

const resultText = z.string().max(MAX_TOOL_RESULT_LENGTH);

export const toolResult = z.union([
  z.object({ text: resultText }).strict(),
  z.object({ error: resultText }).strict(),
]);

export const sourcesChoice = z
  .object({ uid: id, sessionId: id, suggestedName: safeName.optional() })
  .strict();

export const sourceName = z.string().refine(isPlainFileName, 'Not a file name');
