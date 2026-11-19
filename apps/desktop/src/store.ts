import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  AGENT_SESSION_NAMES,
  MAX_FILE_BYTES,
  MAX_PATH_SEGMENTS,
  isSafePath,
  isSafeSegment,
  type SessionFileRef,
  type SessionListRef,
  type SessionRemoveRef,
} from './bridge';

/**
 * Session files on the laptop: `{root}/{uid}/{sessionId}/{path}`, where `root` is
 * `{app data folder}/sessions`. Every name is checked with `isSafeSegment` before it touches the
 * disk, so no call can read or write outside `root`. The files hold answer keys: nothing here logs a
 * name or a byte of content (`.plan/22-desktop-studio.md`, Where it is kept).
 */
export interface SessionStore {
  read(file: SessionFileRef): Promise<string | null>;
  write(file: SessionFileRef, data: string): Promise<void>;
  list(ref: SessionListRef): Promise<string[]>;
  remove(ref: SessionRemoveRef): Promise<void>;
}

/** A refused name or size. Its message is safe to show and to send to the window. */
export class SessionFileError extends Error {
  override name = 'SessionFileError';
}

function code(error: unknown): unknown {
  return (error as { code?: unknown }).code;
}

function folderOf(root: string, uid: string, sessionId?: string): string {
  if (!isSafeSegment(uid)) throw new SessionFileError('Invalid person id');
  if (sessionId === undefined) return path.join(root, uid);
  if (!isSafeSegment(sessionId)) throw new SessionFileError('Invalid session id');
  return path.join(root, uid, sessionId);
}

/** The folder of one session, its names checked. The agent bridge writes its own files there. */
export function sessionFolder(root: string, uid: string, sessionId: string): string {
  return folderOf(root, uid, sessionId);
}

/**
 * A path the window may write or remove: not under one of the shell's `AGENT_SESSION_NAMES`, in any
 * case. macOS and Windows file systems ignore case by default, so `MCP.json` there is `mcp.json`.
 */
function writableFileOf(root: string, file: SessionFileRef): string {
  const target = fileOf(root, file);
  // Safe names are ASCII only (`isSafeSegment`), so lower-casing is the whole case folding.
  const first = (file.path.split('/')[0] as string).toLowerCase();
  if ((AGENT_SESSION_NAMES as readonly string[]).includes(first)) {
    throw new SessionFileError('Reserved session file name');
  }
  return target;
}

function fileOf(root: string, file: SessionFileRef): string {
  const folder = folderOf(root, file.uid, file.sessionId);
  if (!isSafePath(file.path)) throw new SessionFileError('Invalid session file name');
  return path.join(folder, ...file.path.split('/'));
}

/** Relative paths of the files under `dir`, at most `MAX_PATH_SEGMENTS` deep, safe names only. */
async function walk(dir: string, prefix: string[] = []): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!isSafeSegment(entry.name)) continue; // a temporary file mid-write, or something not ours
    const parts = [...prefix, entry.name];
    if (entry.isFile()) out.push(parts.join('/'));
    else if (entry.isDirectory() && parts.length < MAX_PATH_SEGMENTS) {
      out.push(...(await walk(path.join(dir, entry.name), parts)));
    }
  }
  return out;
}

async function orEmpty(list: Promise<string[]>): Promise<string[]> {
  try {
    return (await list).sort();
  } catch (error) {
    if (code(error) === 'ENOENT') return [];
    throw error;
  }
}

export function createSessionStore(root: string): SessionStore {
  return {
    async read(file) {
      try {
        return await readFile(fileOf(root, file), 'utf8');
      } catch (error) {
        if (code(error) === 'ENOENT') return null;
        throw error;
      }
    },

    async write(file, data) {
      const target = writableFileOf(root, file);
      if (Buffer.byteLength(data, 'utf8') > MAX_FILE_BYTES) {
        throw new SessionFileError('Session file too large');
      }
      await mkdir(path.dirname(target), { recursive: true });
      // Write beside the target, then rename: a crash leaves the old file or the new, never half.
      // The leading dot keeps the temporary name out of `list`.
      const temp = path.join(path.dirname(target), `.${randomUUID()}.tmp`);
      try {
        await writeFile(temp, data, 'utf8');
        await rename(temp, target);
      } catch (error) {
        await rm(temp, { force: true });
        throw error;
      }
    },

    async list(ref) {
      const folder = folderOf(root, ref.uid, ref.sessionId);
      if (ref.sessionId !== undefined) return orEmpty(walk(folder));
      return orEmpty(
        readdir(folder, { withFileTypes: true }).then((entries) =>
          entries.filter((e) => e.isDirectory() && isSafeSegment(e.name)).map((e) => e.name),
        ),
      );
    },

    async remove(ref) {
      const target =
        ref.path === undefined
          ? folderOf(root, ref.uid, ref.sessionId)
          : writableFileOf(root, { uid: ref.uid, sessionId: ref.sessionId, path: ref.path });
      await rm(target, { recursive: ref.path === undefined, force: true });
    },
  };
}
