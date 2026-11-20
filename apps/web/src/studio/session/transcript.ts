import { z } from 'zod';
import { MAX_ATTACHMENTS, attachTargetSchema } from './attachments';

/*
 * A session's chat as it is kept on the laptop: `sessions/{uid}/{sessionId}/transcript.jsonl`, one
 * entry per line (`.plan/22-desktop-studio.md`, Where it is kept). It holds the Educator's words and
 * the agent's, so course text and possibly answer keys: never logged, never uploaded.
 */

/** The chat, inside the session's folder. */
export const TRANSCRIPT_FILE = 'transcript.jsonl';

/**
 * Most characters a transcript file keeps; the oldest entries go first past it. Well under the
 * bridge's 16 MB file limit (`MAX_FILE_BYTES`), even when every character takes 2 bytes of UTF-8.
 */
export const TRANSCRIPT_MAX_CHARS = 6_000_000;

const at = z.iso.datetime({ offset: true });
const turnId = z.string().min(1).max(80);
const text = z.string().max(1_000_000);

export const transcriptEntrySchema = z.discriminatedUnion('kind', [
  /** What the Educator sent, with the parts of the course attached to it (`DSK-20`), if any. */
  z.object({
    kind: z.literal('educator'),
    turnId,
    at,
    text,
    attachments: z.array(attachTargetSchema).max(MAX_ATTACHMENTS).optional(),
  }),
  /** One block of the agent's reply, as Claude Code streamed it. */
  z.object({ kind: z.literal('agent'), turnId, at, text }),
  /** What the agent was doing, in plain words: "Loading the humanize skill", "Adding a block". */
  z.object({ kind: z.literal('activity'), turnId, at, text }),
  /** Something the app says in the chat: a stopped turn, an undone turn, the agent stopping. */
  z.object({ kind: z.literal('notice'), turnId: turnId.nullable(), at, text }),
]);
export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>;

/**
 * The transcript as file text: one JSON entry per line, the newest entries kept when the whole
 * would pass `max` characters.
 */
export function transcriptText(
  entries: readonly TranscriptEntry[],
  max = TRANSCRIPT_MAX_CHARS,
): string {
  const lines: string[] = [];
  let size = 0;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const line = `${JSON.stringify(entries[i])}\n`;
    if (size + line.length > max) break;
    lines.push(line);
    size += line.length;
  }
  return lines.reverse().join('');
}

/** Reads the file text back. A damaged line is dropped; answers the entries and how many were. */
export function parseTranscript(file: string): { entries: TranscriptEntry[]; dropped: number } {
  const entries: TranscriptEntry[] = [];
  let dropped = 0;
  for (const line of file.split('\n')) {
    if (line.trim() === '') continue;
    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch {
      dropped += 1;
      continue;
    }
    const entry = transcriptEntrySchema.safeParse(data);
    if (entry.success) entries.push(entry.data);
    else dropped += 1;
  }
  return { entries, dropped };
}
