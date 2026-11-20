import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  MAX_SOURCE_BYTES,
  MAX_SOURCE_FILES,
  SOURCE_REFUSALS,
  isPlainFileName,
  type SessionRef,
  type SourceFile,
  type SourceRefusals,
  type SourcesChoice,
  type SourcesFolder,
} from './bridge';
import type { Logger } from './log';
import { sessionFolder } from './store';

/**
 * `sources.*` in the main process (`DSK-20`): the Sources folder an Educator picks for a session,
 * the files in it and the text of one of them. The window names a session, never a path: the
 * chosen folder is remembered here, in `{userData}/sources/{uid}/{sessionId}.json`, outside the
 * session files the window can write, so a page cannot point the agent at another folder. Only
 * the Educator picks one, in the system's folder dialog.
 *
 * What the agent may read is narrow on purpose: plain files directly in the folder (no folders,
 * no names starting with a dot, no symbolic link that leads out of it), of a text type
 * (`SOURCE_TEXT_EXTENSIONS`), valid UTF-8, at most `MAX_SOURCE_BYTES`. A name is read only when the
 * folder's own listing gives it. Nothing here logs a path, a file name or a byte of content.
 */

/**
 * The file types `sources.read` reads, lower case: plain text, Markdown and other markup, data,
 * subtitles and source code. Anything else (PDF, Word, pictures) is refused with
 * `SOURCE_REFUSALS.notText`, which asks for a text copy.
 */
export const SOURCE_TEXT_EXTENSIONS: readonly string[] = [
  // Text and markup
  '.txt',
  '.text',
  '.md',
  '.markdown',
  '.mdx',
  '.rst',
  '.adoc',
  '.html',
  '.htm',
  '.xml',
  // Data and configuration
  '.csv',
  '.tsv',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  // Subtitles and transcripts
  '.srt',
  '.vtt',
  // Source code
  '.c',
  '.cpp',
  '.cs',
  '.css',
  '.dart',
  '.go',
  '.h',
  '.java',
  '.js',
  '.jsx',
  '.kt',
  '.php',
  '.py',
  '.rb',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.swift',
  '.ts',
  '.tsx',
];

/** The folder the dialog starts in when no name is suggested: `Documents/Gurukul Studio`. */
export const STUDIO_FOLDER_NAME = 'Gurukul Studio';

/** The parts of Node's `fs/promises` the Sources folder uses; the real one in the app. */
export type SourcesFs = Pick<
  typeof fsPromises,
  'mkdir' | 'readdir' | 'realpath' | 'stat' | 'open' | 'readFile' | 'writeFile' | 'rename' | 'rm'
>;

/** Electron's `dialog.showOpenDialog`, as far as choosing a folder needs it. */
export interface FolderDialogLike {
  showOpenDialog(options: {
    title: string;
    buttonLabel: string;
    defaultPath: string;
    properties: ('openDirectory' | 'createDirectory')[];
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

/** Electron's `shell.openPath`: opens a folder in Finder or Explorer; answers an error or `''`. */
export interface FolderOpenerLike {
  openPath(path: string): Promise<string>;
}

export interface SourcesOptions {
  /** `{userData}`: the choices go under `sources/`, and no folder inside it may be chosen. */
  dataDir: string;
  /** `{userData}/sessions`: a choice whose session folder is gone is pruned at start. */
  sessionsRoot: string;
  /** The Documents folder, where the dialog starts. */
  documentsDir: string;
  /** Shown as `~` in the display path. */
  homeDir: string;
  dialog: FolderDialogLike;
  opener: FolderOpenerLike;
  fs?: SourcesFs;
  log: Logger;
}

export interface SourcesManager {
  choose(choice: SourcesChoice): Promise<SourcesFolder | null>;
  list(ref: SessionRef): Promise<SourcesFolder | null>;
  reveal(ref: SessionRef): Promise<void>;
  read(ref: SessionRef, name: string): Promise<string | null>;
  /** The chosen folder's real path, for `claude`'s working directory; null when none. */
  folderOf(ref: SessionRef): Promise<string | null>;
  /** Forgets the session's choice: its whole session was removed. The folder itself stays. */
  forget(ref: SessionRef): Promise<void>;
  /**
   * Forgets every choice whose session folder is gone (a start dialog closed after choosing).
   * Never throws; answers how many were forgotten.
   */
  prune(): Promise<number>;
}

/** A refusal whose message is safe to send to the window: one of `SOURCE_REFUSALS`, or a rule. */
export class SourcesError extends Error {
  override name = 'SourcesError';
  constructor(
    readonly reason: keyof SourceRefusals | 'app_data' | 'not_shown',
    message: string,
  ) {
    super(message);
  }
}

/** A refusal `sources.read` makes: the sentence for the agent is `SOURCE_REFUSALS[reason]`. */
const refused = (reason: keyof SourceRefusals) => new SourcesError(reason, SOURCE_REFUSALS[reason]);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** True for a name `sources.read` would read the text of: its extension is a text type. */
export function isTextSourceName(name: string): boolean {
  return SOURCE_TEXT_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

/** `folder` with the home folder written `~`, for display only. */
export function displayPath(folder: string, homeDir: string): string {
  if (folder === homeDir) return '~';
  return folder.startsWith(homeDir + path.sep) ? `~${folder.slice(homeDir.length)}` : folder;
}

/**
 * True when `inner` is `outer` or inside it. Only a first step of exactly `..` leaves `outer`: a
 * folder named `..x` inside it is still inside.
 */
export function isInside(outer: string, inner: string): boolean {
  const rel = path.relative(outer, inner);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/** The text of a file's bytes, or null when they are not valid UTF-8 text. A BOM is dropped. */
export function decodeText(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.includes('\0') ? null : text;
  } catch {
    return null;
  }
}

const choiceSchema = z.object({ folder: z.string().min(1) });

/** A listed file with the real path it is read from (the same, or a link's target in the folder). */
interface Entry extends SourceFile {
  real: string;
}

async function quietly<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

// Windows has no `O_NOFOLLOW`: `| undefined` is `| 0` there. Elsewhere a file swapped for a link
// between the listing and the read is refused by the system.
const READ_FLAGS = fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW;

export function createSources(options: SourcesOptions): SourcesManager {
  const { dialog, opener, log, homeDir } = options;
  const fs = options.fs ?? fsPromises;
  const choicesRoot = path.join(options.dataDir, 'sources');
  // The names are checked (`isSafeSegment`) before they make a path.
  const choiceFile = ({ uid, sessionId }: SessionRef) =>
    `${sessionFolder(choicesRoot, uid, sessionId)}.json`;

  const folderOf = async (ref: SessionRef): Promise<string | null> => {
    const text = await quietly(fs.readFile(choiceFile(ref), 'utf8'));
    if (text === null) return null;
    const parsed = choiceSchema.safeParse(parseJson(text));
    if (parsed.success) return parsed.data.folder;
    log.warn('Sources choice unreadable', { sessionId: ref.sessionId });
    return null;
  };

  const remember = async (ref: SessionRef, folder: string) => {
    const file = choiceFile(ref);
    await fs.mkdir(path.dirname(file), { recursive: true });
    // Beside the target, then a rename: a crash leaves the old choice or the new, never half.
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, JSON.stringify({ folder }), 'utf8');
      await fs.rename(temp, file);
    } catch (error) {
      await fs.rm(temp, { force: true });
      throw error;
    }
  };

  /** The plain files directly in `root` (a real path), sorted by name, at most `MAX_SOURCE_FILES`. */
  const entries = async (root: string): Promise<Entry[]> => {
    const found = await quietly(fs.readdir(root, { withFileTypes: true }));
    const files: Entry[] = [];
    for (const entry of found ?? []) {
      const { name } = entry;
      if (name.startsWith('.') || !isPlainFileName(name)) continue;
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      const real = path.join(root, name);
      // A link counts only when it ends at a file directly in this folder.
      const target = entry.isSymbolicLink() ? await quietly(fs.realpath(real)) : real;
      if (target === null || path.dirname(target) !== root) continue;
      const info = await quietly(fs.stat(target));
      if (info === null || !info.isFile()) continue;
      files.push({ name, bytes: info.size, real: target });
    }
    files.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    return files.slice(0, MAX_SOURCE_FILES);
  };

  /** The chosen folder as the window sees it; its files are empty when it has gone. */
  const describe = async (folder: string): Promise<SourcesFolder> => {
    const root = await quietly(fs.realpath(folder));
    const files = root === null ? [] : await entries(root);
    return {
      path: displayPath(folder, homeDir),
      files: files.map(({ name, bytes }) => ({ name, bytes })),
    };
  };

  /** Where the dialog starts: the suggested folder, created if missing, else Documents. */
  const startIn = async (suggestedName: string | undefined): Promise<string> => {
    const studio = path.join(options.documentsDir, STUDIO_FOLDER_NAME);
    const start =
      suggestedName === undefined ? studio : path.join(studio, suggestedName, 'sources');
    try {
      await fs.mkdir(start, { recursive: true });
      return start;
    } catch (error) {
      log.error('Sources folder not created', error);
      return options.documentsDir;
    }
  };

  return {
    async choose(choice) {
      const ref = { uid: choice.uid, sessionId: choice.sessionId };
      // `folderOf` checks the names (`choiceFile`) before any dialog opens.
      const current = await folderOf(ref);
      const defaultPath =
        current !== null && (await quietly(fs.stat(current)))?.isDirectory() === true
          ? current
          : await startIn(choice.suggestedName);
      const picked = await dialog.showOpenDialog({
        title: 'Choose a Sources folder',
        buttonLabel: 'Choose',
        defaultPath,
        properties: ['openDirectory', 'createDirectory'],
      });
      const first = picked.filePaths[0];
      if (picked.canceled || first === undefined) return null;
      const folder = await fs.realpath(first);
      // The app's own data holds every session's answer keys: never the agent's to read.
      if (isInside(await fs.realpath(options.dataDir), folder)) {
        log.warn('Sources folder refused', { reason: 'app_data' });
        throw new SourcesError('app_data', 'Choose a folder outside Gurukul Studio’s own data.');
      }
      await remember(ref, folder);
      const listed = await describe(folder);
      log.info('Sources folder chosen', { sessionId: ref.sessionId, count: listed.files.length });
      return listed;
    },

    async list(ref) {
      const folder = await folderOf(ref);
      return folder === null ? null : describe(folder);
    },

    async reveal(ref) {
      const folder = await folderOf(ref);
      if (folder === null) return;
      // Electron answers a failure as text, with the path in it: only that it failed is logged,
      // and the window gets a fixed sentence so it can say so.
      if ((await opener.openPath(folder)) === '') return;
      log.warn('Sources folder not shown', {});
      throw new SourcesError(
        'not_shown',
        'The Sources folder could not be opened. It may have been moved or deleted.',
      );
    },

    async read(ref, name) {
      const folder = await folderOf(ref);
      if (folder === null) return null;
      const root = await quietly(fs.realpath(folder));
      if (root === null) return null;
      // Only a name the folder's own listing gives: never a path, a hidden file or a link out.
      const entry = (await entries(root)).find((f) => f.name === name);
      if (entry === undefined) return null;
      if (!isTextSourceName(name)) throw refused('notText');
      const handle = await fs.open(entry.real, READ_FLAGS);
      let bytes: Buffer;
      try {
        if ((await handle.stat()).size > MAX_SOURCE_BYTES) throw refused('tooLarge');
        bytes = await handle.readFile();
      } finally {
        await handle.close();
      }
      // It may have grown since it was measured.
      if (bytes.length > MAX_SOURCE_BYTES) throw refused('tooLarge');
      const text = decodeText(bytes);
      if (text === null) throw refused('notText');
      log.info('Source read', { sessionId: ref.sessionId, bytes: bytes.length });
      return text;
    },

    // Used unbound (`sourcesFolder: sources.folderOf`): no `this` anywhere here.
    async folderOf(ref) {
      const folder = await folderOf(ref);
      return folder === null ? null : quietly(fs.realpath(folder));
    },

    async forget(ref) {
      await fs.rm(choiceFile(ref), { force: true });
    },

    async prune() {
      let removed = 0;
      try {
        for (const uid of (await quietly(fs.readdir(choicesRoot))) ?? []) {
          for (const file of (await quietly(fs.readdir(path.join(choicesRoot, uid)))) ?? []) {
            const sessionId = file.endsWith('.json') ? file.slice(0, -'.json'.length) : file;
            if (await quietly(fs.stat(path.join(options.sessionsRoot, uid, sessionId)))) continue;
            await fs.rm(path.join(choicesRoot, uid, file), { force: true, recursive: true });
            removed += 1;
          }
        }
      } catch (error) {
        // Start-up goes on: a choice left behind names a session that no longer exists.
        log.error('Sources choices not pruned', error);
      }
      if (removed > 0) log.info('Sources choices pruned', { count: removed });
      return removed;
    },
  };
}
