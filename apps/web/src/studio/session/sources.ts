import type {
  GurukulDesktop,
  SessionRef,
  SourceRefusals,
  SourcesFolder,
} from '../../desktop/bridge';
import { SourceRefusedError } from './tools/types';
import type { SessionSources } from './tools/types';

/*
 * A session's Sources folder (`DSK-20`) as the agent's tools see it (`ctx.sources`), backed by the
 * desktop bridge's `sources.list` and `sources.read` for that one session. The shell keeps which
 * folder it made and reads only plain text files the folder lists; this side never sees a path.
 * Loaded only by the desktop session chunk.
 */

/**
 * The shell's sentences for a file `sources.read` will not read; the type makes them equal to the
 * shell's own (`SOURCE_REFUSALS` in `@gurukul/desktop/bridge`).
 */
export const SOURCE_REFUSALS: SourceRefusals = {
  notText:
    'This file is not plain text, so it cannot be read. Ask the Educator to save it in the Sources folder as text or Markdown (.txt or .md).',
  tooLarge:
    'This file is larger than 1 MB, so it cannot be read. Ask the Educator to split it or save a shorter copy in the Sources folder.',
};

/**
 * The sentence of a rejected `sources.read` that refused the file, or null for any other failure.
 * Electron puts its own words first, so the end of the message decides.
 */
export function sourceRefusal(error: unknown): string | null {
  const message = error instanceof Error ? error.message : '';
  return Object.values(SOURCE_REFUSALS).find((sentence) => message.endsWith(sentence)) ?? null;
}

/** The session's Sources folder through the bridge: what `defaultToolContext` takes. */
export function bridgeSources(
  sources: Pick<GurukulDesktop['sources'], 'list' | 'read'>,
  ref: SessionRef,
): SessionSources {
  return {
    list: async () => (await sources.list(ref))?.files ?? null,
    read: async (name) => {
      try {
        return await sources.read(ref, name);
      } catch (error) {
        const sentence = sourceRefusal(error);
        if (sentence === null) throw error;
        throw new SourceRefusedError(sentence);
      }
    },
  };
}

/** "3 files", "1 file", "No files yet": what the Sources tab says about its folder. */
export function filesLabel(folder: SourcesFolder): string {
  const count = folder.files.length;
  if (count === 0) return 'No files yet';
  return count === 1 ? '1 file' : `${count} files`;
}

/** Largest file the chat adds, in bytes: the shell's `MAX_SOURCE_ADD_BYTES`, 25 MB. */
export const MAX_ADD_BYTES = 26_214_400;
