import { z } from 'zod';
import {
  AGENT_EFFORTS,
  AGENT_MODELS,
  MAX_AGENT_TEXT_LENGTH,
  MAX_ASK_PROMPT_LENGTH,
  MAX_PATH_SEGMENTS,
  MAX_SEGMENT_LENGTH,
  MAX_SKILL_FILES,
  MAX_SKILL_PATH_SEGMENTS,
  MAX_SKILLS,
  MAX_TOOL_RESULT_LENGTH,
  MAX_TOOLS,
  MAX_SOURCE_ADD_BYTES,
  MAX_SOURCE_ADD_FILES,
  MAX_SOURCE_IMAGE_BYTES,
  MAX_TOOL_RESULT_IMAGES,
  SOURCE_IMAGE_MIME_TYPES,
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
    /** A name from the lists, never a flag: `launch.ts` builds `--model` and `--effort`. */
    model: z.enum(AGENT_MODELS).optional(),
    effort: z.enum(AGENT_EFFORTS).optional(),
  })
  .strict();

/** The shell's id for one tool call. */
export const callId = z.string().min(1).max(MAX_SEGMENT_LENGTH);

const resultText = z.string().max(MAX_TOOL_RESULT_LENGTH);

/** A picture in a tool result: base64 of at most `MAX_SOURCE_IMAGE_BYTES`, a known media type. */
const toolImage = z
  .object({
    data: z.string().max(Math.ceil((MAX_SOURCE_IMAGE_BYTES * 4) / 3) + 4),
    mimeType: z.enum(SOURCE_IMAGE_MIME_TYPES),
  })
  .strict();

export const toolResult = z.union([
  z
    .object({ text: resultText, images: z.array(toolImage).max(MAX_TOOL_RESULT_IMAGES).optional() })
    .strict(),
  z.object({ error: resultText }).strict(),
]);

/** The window's id for one `agent.ask`. */
export const askId = z.string().min(1).max(MAX_SEGMENT_LENGTH);

export const askRequest = z
  .object({ askId, prompt: z.string().min(1).max(MAX_ASK_PROMPT_LENGTH) })
  .strict();

export const sourcesChoice = z
  .object({ uid: id, sessionId: id, suggestedName: safeName.optional() })
  .strict();

export const sourceName = z.string().refine(isPlainFileName, 'Not a file name');

/** A file to add: a plain name that shows in the listing (no leading dot) and at most 25 MB. */
export const sourceUpload = z
  .object({
    name: sourceName.refine((name) => !name.startsWith('.'), 'Not a file name'),
    bytes: z
      .instanceof(Uint8Array)
      .refine((bytes) => bytes.byteLength <= MAX_SOURCE_ADD_BYTES, 'File too large'),
  })
  .strict();
export const sourceUploads = z.array(sourceUpload).min(1).max(MAX_SOURCE_ADD_FILES);
