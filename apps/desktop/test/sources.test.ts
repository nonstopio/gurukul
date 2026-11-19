import * as fsPromises from 'node:fs/promises';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SOURCE_BYTES, MAX_SOURCE_FILES, SOURCE_REFUSALS } from '../src/bridge';
import { createLogger } from '../src/log';
import {
  SOURCE_TEXT_EXTENSIONS,
  SourcesError,
  createSources,
  decodeText,
  displayPath,
  isInside,
  isTextSourceName,
  type FolderDialogLike,
  type SourcesFs,
} from '../src/sources';
import { SessionFileError } from '../src/store';

let root: string;
let home: string;
let dataDir: string;
let documents: string;
let material: string;
const ref = { uid: 'u1', sessionId: 's1' };

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'gurukul-sources-'));
  home = path.join(root, 'home');
  dataDir = path.join(root, 'data');
  documents = path.join(home, 'Documents');
  material = path.join(home, 'Material');
  await mkdir(dataDir, { recursive: true });
  await mkdir(material, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function setup({
  pick = material as string | null,
  fs,
  opened = '',
}: { pick?: string | null; fs?: Partial<SourcesFs>; opened?: string } = {}) {
  const sink = vi.fn();
  const showOpenDialog = vi.fn<FolderDialogLike['showOpenDialog']>(async () =>
    pick === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [pick] },
  );
  const openPath = vi.fn(async () => opened);
  const sources = createSources({
    dataDir,
    sessionsRoot: path.join(dataDir, 'sessions'),
    documentsDir: documents,
    homeDir: home,
    dialog: { showOpenDialog },
    opener: { openPath },
    ...(fs && { fs: { ...fsPromises, ...fs } }),
    log: createLogger({ sink }),
  });
  return { sources, showOpenDialog, openPath, sink };
}

const choiceFile = () => path.join(dataDir, 'sources', 'u1', 's1.json');
const put = (name: string, text: string | Buffer = 'notes') =>
  writeFile(path.join(material, name), text);

describe('helpers', () => {
  it('reads text types by extension, in any case', () => {
    expect(isTextSourceName('Rebase notes.md')).toBe(true);
    expect(isTextSourceName('TRANSCRIPT.TXT')).toBe(true);
    expect(isTextSourceName('slides.pdf')).toBe(false);
    expect(isTextSourceName('Makefile')).toBe(false);
    expect(SOURCE_TEXT_EXTENSIONS.every((e) => e.startsWith('.') && e === e.toLowerCase())).toBe(
      true,
    );
  });

  it('writes the home folder as ~ for display only', () => {
    expect(displayPath('/home/meera', '/home/meera')).toBe('~');
    expect(displayPath('/home/meera/Documents/x', '/home/meera')).toBe('~/Documents/x');
    expect(displayPath('/home/meera2/x', '/home/meera')).toBe('/home/meera2/x');
    expect(displayPath('/srv/x', '/home/meera')).toBe('/srv/x');
  });

  it('knows a folder inside another, the same one included', () => {
    expect(isInside('/a/b', '/a/b')).toBe(true);
    expect(isInside('/a/b', '/a/b/c')).toBe(true);
    expect(isInside('/a/b', '/a/bc')).toBe(false);
    expect(isInside('/a/b', '/a')).toBe(false);
  });

  it('decodes UTF-8 text without its BOM, and refuses anything else', () => {
    expect(decodeText(Buffer.from('﻿नमस्ते'))).toBe('नमस्ते');
    expect(decodeText(Buffer.from([0xff, 0xfe, 0x00]))).toBeNull();
    expect(decodeText(Buffer.from('a\0b'))).toBeNull();
  });
});

describe('sources.choose', () => {
  it('starts in Documents/Gurukul Studio/{name}/sources, created, and remembers the pick', async () => {
    const { sources, showOpenDialog, sink } = setup();
    await put('notes.md');
    await expect(sources.choose({ ...ref, suggestedName: 'git-basics' })).resolves.toEqual({
      path: '~/Material',
      files: [{ name: 'notes.md', bytes: 5 }],
    });
    const start = path.join(documents, 'Gurukul Studio', 'git-basics', 'sources');
    expect((await stat(start)).isDirectory()).toBe(true);
    expect(showOpenDialog).toHaveBeenCalledWith({
      title: 'Choose a Sources folder',
      buttonLabel: 'Choose',
      defaultPath: start,
      properties: ['openDirectory', 'createDirectory'],
    });
    // Outside the session files, with nothing left over from the write.
    expect(JSON.parse(await readFile(choiceFile(), 'utf8'))).toEqual({ folder: material });
    expect(await readdir(path.dirname(choiceFile()))).toEqual(['s1.json']);
    expect(sink).toHaveBeenCalledWith('info', 'Sources folder chosen', {
      sessionId: 's1',
      count: 1,
    });
  });

  it('starts in Documents/Gurukul Studio without a name, and in the chosen folder after', async () => {
    const { sources, showOpenDialog } = setup();
    await sources.choose(ref);
    expect(showOpenDialog.mock.calls[0]?.[0].defaultPath).toBe(
      path.join(documents, 'Gurukul Studio'),
    );
    await sources.choose({ ...ref, suggestedName: 'git-basics' });
    expect(showOpenDialog.mock.calls[1]?.[0].defaultPath).toBe(material);
  });

  it('starts in the suggestion again when the chosen folder has gone', async () => {
    await setup().sources.choose(ref);
    await rm(material, { recursive: true });
    const other = path.join(home, 'Other');
    await mkdir(other);
    const { sources, showOpenDialog } = setup({ pick: other });
    await expect(sources.choose(ref)).resolves.toEqual({ path: '~/Other', files: [] });
    expect(showOpenDialog.mock.calls[0]?.[0].defaultPath).toBe(
      path.join(documents, 'Gurukul Studio'),
    );
  });

  it('starts in Documents when the suggested folder cannot be made', async () => {
    const { sources, showOpenDialog, sink } = setup({
      fs: {
        mkdir: vi.fn(async () => {
          throw Object.assign(new Error('EACCES /home/meera'), { code: 'EACCES' });
        }) as unknown as SourcesFs['mkdir'],
      },
      pick: null,
    });
    await expect(sources.choose(ref)).resolves.toBeNull();
    expect(showOpenDialog.mock.calls[0]?.[0].defaultPath).toBe(documents);
    expect(sink).toHaveBeenCalledWith('error', 'Sources folder not created', {
      error: { name: 'Error', code: 'EACCES' },
    });
  });

  it('answers null and remembers nothing when the Educator cancels', async () => {
    const { sources } = setup({ pick: null });
    await expect(sources.choose(ref)).resolves.toBeNull();
    await expect(sources.list(ref)).resolves.toBeNull();
  });

  it('answers null when the dialog gives no folder', async () => {
    const { sources, showOpenDialog } = setup();
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [] });
    await expect(sources.choose(ref)).resolves.toBeNull();
  });

  it('checks the person and session ids before any dialog opens', async () => {
    const { sources, showOpenDialog } = setup();
    await expect(sources.choose({ uid: '..', sessionId: 's1' })).rejects.toThrow(SessionFileError);
    await expect(sources.choose({ uid: 'u1', sessionId: 'a/b' })).rejects.toThrow(SessionFileError);
    expect(showOpenDialog).not.toHaveBeenCalled();
  });

  it('refuses a folder inside the app’s own data', async () => {
    const inside = path.join(dataDir, 'sessions', 'u1');
    await mkdir(inside, { recursive: true });
    for (const pick of [dataDir, inside]) {
      const { sources, sink } = setup({ pick });
      const refusal = sources.choose(ref);
      await expect(refusal).rejects.toThrow(SourcesError);
      await expect(refusal).rejects.toMatchObject({
        reason: 'app_data',
        message: 'Choose a folder outside Gurukul Studio’s own data.',
      });
      expect(sink).toHaveBeenCalledWith('warn', 'Sources folder refused', { reason: 'app_data' });
    }
    await expect(setup().sources.list(ref)).resolves.toBeNull();
  });

  it('keeps the old choice and leaves no temporary file when the write fails', async () => {
    const { sources } = setup();
    await sources.choose(ref);
    const other = path.join(home, 'Other');
    await mkdir(other);
    const failing = setup({
      pick: other,
      fs: {
        rename: vi.fn(async () => {
          throw Object.assign(new Error('EIO'), { code: 'EIO' });
        }),
      },
    });
    await expect(failing.sources.choose(ref)).rejects.toThrow('EIO');
    expect(await readdir(path.dirname(choiceFile()))).toEqual(['s1.json']);
    await expect(sources.folderOf(ref)).resolves.toBe(material);
  });
});

describe('sources.list', () => {
  it('answers null when no folder was chosen', async () => {
    await expect(setup().sources.list(ref)).resolves.toBeNull();
  });

  it('lists plain files only, sorted: no folders, hidden files or links that leave', async () => {
    const { sources } = setup();
    await sources.choose(ref);
    await put('b.md', 'bb');
    await put('a.txt', 'a');
    await put('.env', 'SECRET=1');
    await put('slides.pdf', '%PDF');
    await put('back\\slash.md');
    await mkdir(path.join(material, 'folder'));
    await writeFile(path.join(home, 'outside.md'), 'private');
    await symlink(path.join(home, 'outside.md'), path.join(material, 'out.md'));
    await symlink(path.join(material, 'a.txt'), path.join(material, 'same.txt'));
    await symlink(path.join(material, 'folder'), path.join(material, 'dir-link'));
    await symlink(path.join(material, 'missing.md'), path.join(material, 'dangling.md'));
    await expect(sources.list(ref)).resolves.toEqual({
      path: '~/Material',
      files: [
        { name: 'a.txt', bytes: 1 },
        { name: 'b.md', bytes: 2 },
        { name: 'same.txt', bytes: 1 },
        { name: 'slides.pdf', bytes: 4 },
      ],
    });
  });

  it('gives the first files by name, up to the limit', async () => {
    const { sources } = setup();
    await sources.choose(ref);
    const names = Array.from(
      { length: MAX_SOURCE_FILES + 1 },
      (_, i) => `n${String(i).padStart(5, '0')}.md`,
    );
    await Promise.all(names.map((n) => put(n, '')));
    const listed = await sources.list(ref);
    expect(listed?.files).toHaveLength(MAX_SOURCE_FILES);
    expect(listed?.files.at(-1)?.name).toBe(names[MAX_SOURCE_FILES - 1]);
  });

  it('shows a path outside the home folder as it is', async () => {
    const outside = path.join(root, 'shared');
    await mkdir(outside);
    const { sources } = setup({ pick: outside });
    await expect(sources.choose(ref)).resolves.toEqual({ path: outside, files: [] });
  });

  it('lists no files when the folder has gone or cannot be read', async () => {
    const { sources } = setup();
    await sources.choose(ref);
    const unreadable = setup({
      fs: {
        readdir: vi.fn(async () => {
          throw new Error('EACCES');
        }) as unknown as SourcesFs['readdir'],
      },
    });
    await expect(unreadable.sources.list(ref)).resolves.toEqual({
      path: '~/Material',
      files: [],
    });
    await rm(material, { recursive: true });
    await expect(sources.list(ref)).resolves.toEqual({ path: '~/Material', files: [] });
  });

  it('skips a file that goes while it is listed', async () => {
    const { sources } = setup();
    await sources.choose(ref);
    await put('a.md');
    const racing = setup({
      fs: {
        stat: vi.fn(async () => {
          throw new Error('ENOENT');
        }) as unknown as SourcesFs['stat'],
      },
    });
    await expect(racing.sources.list(ref)).resolves.toEqual({ path: '~/Material', files: [] });
  });

  it('forgets a choice it cannot read, with one warning', async () => {
    const { sources, sink } = setup();
    await mkdir(path.dirname(choiceFile()), { recursive: true });
    for (const text of ['not json', '{"folder":""}']) {
      await writeFile(choiceFile(), text);
      await expect(sources.list(ref)).resolves.toBeNull();
    }
    expect(sink).toHaveBeenCalledWith('warn', 'Sources choice unreadable', { sessionId: 's1' });
  });
});

describe('sources.reveal', () => {
  it('opens the chosen folder, and does nothing without one', async () => {
    const { sources, openPath } = setup();
    await sources.reveal(ref);
    expect(openPath).not.toHaveBeenCalled();
    await sources.choose(ref);
    await sources.reveal(ref);
    expect(openPath).toHaveBeenCalledWith(material);
  });

  it('logs that the folder was not shown, without the system’s words', async () => {
    const { sources, sink } = setup({ opened: 'Failed to open /home/meera/Material' });
    await sources.choose(ref);
    await sources.reveal(ref);
    expect(sink).toHaveBeenCalledWith('warn', 'Sources folder not shown', {});
  });
});

describe('sources.read', () => {
  it('reads a listed text file, and logs its size only', async () => {
    const { sources, sink } = setup();
    await sources.choose(ref);
    await put('Rebase notes.md', 'Rebase rewrites history.');
    await expect(sources.read(ref, 'Rebase notes.md')).resolves.toBe('Rebase rewrites history.');
    expect(sink).toHaveBeenCalledWith('info', 'Source read', { sessionId: 's1', bytes: 24 });
    expect(JSON.stringify(sink.mock.calls)).not.toContain('Rebase');
  });

  it('reads a link that stays in the folder', async () => {
    const { sources } = setup();
    await sources.choose(ref);
    await put('a.txt', 'alpha');
    await symlink(path.join(material, 'a.txt'), path.join(material, 'same.txt'));
    await expect(sources.read(ref, 'same.txt')).resolves.toBe('alpha');
  });

  it('answers null without a folder, or when the folder has gone', async () => {
    const { sources } = setup();
    await expect(sources.read(ref, 'a.md')).resolves.toBeNull();
    await sources.choose(ref);
    await put('a.md');
    await rm(material, { recursive: true });
    await expect(sources.read(ref, 'a.md')).resolves.toBeNull();
  });

  it('never reads what the listing does not give', async () => {
    const { sources } = setup();
    await sources.choose(ref);
    await put('.env', 'SECRET=1');
    await mkdir(path.join(material, 'sub'));
    await writeFile(path.join(material, 'sub', 'x.md'), 'x');
    await writeFile(path.join(home, 'outside.md'), 'private');
    await symlink(path.join(home, 'outside.md'), path.join(material, 'out.md'));
    for (const name of ['.env', 'sub', 'out.md', 'missing.md', '../outside.md', 'sub/x.md']) {
      await expect(sources.read(ref, name)).resolves.toBeNull();
    }
  });

  it('refuses a file that is not a text type, or not text inside', async () => {
    const { sources, sink } = setup();
    await sources.choose(ref);
    await put('slides.pdf', '%PDF-1.7');
    await put('binary.txt', Buffer.from([0x00, 0x01, 0x02]));
    for (const name of ['slides.pdf', 'binary.txt']) {
      const refusal = sources.read(ref, name);
      await expect(refusal).rejects.toThrow(SOURCE_REFUSALS.notText);
      await expect(refusal).rejects.toMatchObject({ reason: 'notText' });
    }
    expect(sink).not.toHaveBeenCalledWith('info', 'Source read', expect.anything());
  });

  it('refuses a file over the size limit', async () => {
    const { sources } = setup();
    await sources.choose(ref);
    await put('big.md', Buffer.alloc(MAX_SOURCE_BYTES + 1, 'a'));
    await put('limit.md', Buffer.alloc(MAX_SOURCE_BYTES, 'a'));
    await expect(sources.read(ref, 'big.md')).rejects.toThrow(SOURCE_REFUSALS.tooLarge);
    await expect(sources.read(ref, 'limit.md')).resolves.toHaveLength(MAX_SOURCE_BYTES);
  });

  it('refuses a file that grew past the limit after it was measured', async () => {
    const { sources } = setup();
    await sources.choose(ref);
    await put('grows.md', 'small');
    const close = vi.fn(async () => undefined);
    const growing = setup({
      fs: {
        open: vi.fn(async () => ({
          stat: async () => ({ size: 5 }),
          readFile: async () => Buffer.alloc(MAX_SOURCE_BYTES + 1, 'a'),
          close,
        })) as unknown as SourcesFs['open'],
      },
    });
    await expect(growing.sources.read(ref, 'grows.md')).rejects.toThrow(SOURCE_REFUSALS.tooLarge);
    expect(close).toHaveBeenCalled();
  });
});

describe('the session’s folder for the agent, and forgetting it', () => {
  it('gives the chosen folder’s real path, or null', async () => {
    const { sources } = setup();
    const { folderOf } = sources; // used unbound, as app.ts does
    await expect(folderOf(ref)).resolves.toBeNull();
    await sources.choose(ref);
    await expect(folderOf(ref)).resolves.toBe(material);
    await rm(material, { recursive: true });
    await expect(folderOf(ref)).resolves.toBeNull();
  });

  it('forgets a session’s choice and keeps the folder', async () => {
    const { sources } = setup();
    await sources.choose(ref);
    await sources.forget(ref);
    await expect(sources.list(ref)).resolves.toBeNull();
    expect((await stat(material)).isDirectory()).toBe(true);
    await expect(sources.forget(ref)).resolves.toBeUndefined();
  });

  it('prunes choices whose session folder is gone', async () => {
    const { sources, sink } = setup();
    await expect(sources.prune()).resolves.toBe(0);
    await sources.choose(ref);
    await sources.choose({ uid: 'u1', sessionId: 's2' });
    await sources.choose({ uid: 'u2', sessionId: 's3' });
    await writeFile(path.join(dataDir, 'sources', 'u2', 'stray'), '');
    // Not a person's folder: left as it is.
    await writeFile(path.join(dataDir, 'sources', 'notes'), '');
    await mkdir(path.join(dataDir, 'sessions', 'u1', 's2'), { recursive: true });
    await expect(sources.prune()).resolves.toBe(3);
    expect(await readdir(path.join(dataDir, 'sources', 'u1'))).toEqual(['s2.json']);
    expect(await readdir(path.join(dataDir, 'sources', 'u2'))).toEqual([]);
    expect(sink).toHaveBeenCalledWith('info', 'Sources choices pruned', { count: 3 });
  });

  it('logs and goes on when pruning fails', async () => {
    const { sources } = setup();
    await sources.choose(ref);
    const failing = setup({
      fs: {
        rm: vi.fn(async () => {
          throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
        }),
      },
    });
    await expect(failing.sources.prune()).resolves.toBe(0);
    expect(failing.sink).toHaveBeenCalledWith('error', 'Sources choices not pruned', {
      error: { name: 'Error', code: 'EPERM' },
    });
  });
});
