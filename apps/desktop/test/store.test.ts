import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES, MAX_PATH_SEGMENTS } from '../src/bridge';
import { SessionFileError, createSessionStore, type SessionStore } from '../src/store';

let root: string;
let store: SessionStore;
const file = (p: string) => ({ uid: 'u1', sessionId: 's1', path: p });

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'gurukul-store-'));
  store = createSessionStore(path.join(root, 'sessions'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('session store', () => {
  it('writes and reads a file under sessions/{uid}/{sessionId}', async () => {
    await store.write(file('checkpoints/t1.json'), '{"a":1}');
    expect(await store.read(file('checkpoints/t1.json'))).toBe('{"a":1}');
    expect(await readdir(path.join(root, 'sessions', 'u1', 's1', 'checkpoints'))).toEqual([
      't1.json',
    ]);
  });

  it('replaces a file and leaves no temporary file behind', async () => {
    await store.write(file('session.json'), 'one');
    await store.write(file('session.json'), 'two');
    expect(await store.read(file('session.json'))).toBe('two');
    expect(await readdir(path.join(root, 'sessions', 'u1', 's1'))).toEqual(['session.json']);
  });

  it('reads a missing file as null', async () => {
    expect(await store.read(file('session.json'))).toBeNull();
  });

  it('passes on any other read failure', async () => {
    await mkdir(path.join(root, 'sessions', 'u1', 's1', 'session.json'), { recursive: true });
    await expect(store.read(file('session.json'))).rejects.toMatchObject({ code: 'EISDIR' });
  });

  it('removes the temporary file when the write fails, and passes the failure on', async () => {
    const target = path.join(root, 'sessions', 'u1', 's1', 'session.json');
    await mkdir(path.join(target, 'inside'), { recursive: true });
    await expect(store.write(file('session.json'), 'x')).rejects.toHaveProperty('code');
    expect(await readdir(path.dirname(target))).toEqual(['session.json']);
  });

  it('refuses a file over the size limit', async () => {
    await expect(store.write(file('big.json'), 'é'.repeat(MAX_FILE_BYTES / 2 + 1))).rejects.toThrow(
      new SessionFileError('Session file too large'),
    );
    expect(await store.list({ uid: 'u1', sessionId: 's1' })).toEqual([]);
  });

  it('lists the files of a session, sorted, skipping what is not a session file', async () => {
    await store.write(file('transcript.jsonl'), '');
    await store.write(file('checkpoints/t2.json'), '');
    await store.write(file('checkpoints/t1.json'), '');
    const dir = path.join(root, 'sessions', 'u1', 's1');
    await writeFile(path.join(dir, '.abc.tmp'), 'half written');
    const deep = [...Array(MAX_PATH_SEGMENTS).fill('d')];
    await mkdir(path.join(dir, ...deep), { recursive: true });
    await writeFile(path.join(dir, ...deep, 'too-deep.json'), '');
    await writeFile(path.join(dir, 'd', 'kept.json'), '');
    expect(await store.list({ uid: 'u1', sessionId: 's1' })).toEqual([
      'checkpoints/t1.json',
      'checkpoints/t2.json',
      'd/kept.json',
      'transcript.jsonl',
    ]);
  });

  it('lists a person’s sessions, folders only', async () => {
    await store.write({ uid: 'u1', sessionId: 'b', path: 'session.json' }, '');
    await store.write({ uid: 'u1', sessionId: 'a', path: 'session.json' }, '');
    await writeFile(path.join(root, 'sessions', 'u1', 'stray.txt'), '');
    await mkdir(path.join(root, 'sessions', 'u1', '.hidden'));
    expect(await store.list({ uid: 'u1' })).toEqual(['a', 'b']);
  });

  it('lists nothing for a person or session with no folder yet', async () => {
    expect(await store.list({ uid: 'nobody' })).toEqual([]);
    expect(await store.list({ uid: 'u1', sessionId: 'none' })).toEqual([]);
  });

  it('passes on any other list failure', async () => {
    await mkdir(path.join(root, 'sessions'), { recursive: true });
    await writeFile(path.join(root, 'sessions', 'u1'), 'a file where a folder should be');
    await expect(store.list({ uid: 'u1' })).rejects.toMatchObject({ code: 'ENOTDIR' });
  });

  it('removes one file, or a whole session', async () => {
    await store.write(file('session.json'), '');
    await store.write(file('checkpoints/t1.json'), '');
    await store.remove({ uid: 'u1', sessionId: 's1', path: 'checkpoints/t1.json' });
    expect(await store.list({ uid: 'u1', sessionId: 's1' })).toEqual(['session.json']);
    await store.remove({ uid: 'u1', sessionId: 's1' });
    expect(await store.list({ uid: 'u1' })).toEqual([]);
  });

  it.each([
    'prompt.md',
    'mcp.json',
    'skills/humanize/SKILL.md',
    'skills',
    'workdir/CLAUDE.md',
    // macOS and Windows ignore case: these are the same files there.
    'MCP.json',
    'Mcp.Json',
    'Prompt.md',
    'Skills/hooks/hooks.json',
    'WorkDir/x.txt',
  ])(
    'leaves %s to the agent bridge: the window may read it but not write or remove it',
    async (name) => {
      await expect(store.write(file(name), 'x')).rejects.toThrow('Reserved session file name');
      await expect(store.remove({ uid: 'u1', sessionId: 's1', path: name })).rejects.toBeInstanceOf(
        SessionFileError,
      );
      await expect(store.read(file(name))).resolves.toBeNull();
    },
  );

  it('still writes names that only start like a reserved one', async () => {
    await store.write(file('skills.json'), 'x');
    await store.write(file('checkpoints/prompt.md'), 'x');
    expect(await store.list({ uid: 'u1', sessionId: 's1' })).toEqual([
      'checkpoints/prompt.md',
      'skills.json',
    ]);
  });

  it('removes what is not there without an error', async () => {
    await expect(store.remove({ uid: 'u1', sessionId: 's1' })).resolves.toBeUndefined();
    await expect(
      store.remove({ uid: 'u1', sessionId: 's1', path: 'session.json' }),
    ).resolves.toBeUndefined();
  });

  describe('never leaves its folder', () => {
    it.each([
      ['a person id', { uid: '..', sessionId: 's1', path: 'x' }, 'Invalid person id'],
      ['a session id', { uid: 'u1', sessionId: '../u2', path: 'x' }, 'Invalid session id'],
      ['a path', { uid: 'u1', sessionId: 's1', path: '../../x' }, 'Invalid session file name'],
      [
        'an absolute path',
        { uid: 'u1', sessionId: 's1', path: '/etc/x' },
        'Invalid session file name',
      ],
    ])('refuses %s that climbs out', async (_label, ref, message) => {
      await expect(store.read(ref)).rejects.toThrow(new SessionFileError(message));
      await expect(store.write(ref, 'x')).rejects.toThrow(SessionFileError);
      await expect(store.remove(ref)).rejects.toThrow(SessionFileError);
    });

    it('refuses an unsafe id when listing', async () => {
      await expect(store.list({ uid: '..' })).rejects.toThrow(SessionFileError);
      await expect(store.list({ uid: 'u1', sessionId: '..' })).rejects.toThrow(SessionFileError);
      await expect(store.remove({ uid: 'u1', sessionId: '..' })).rejects.toThrow(SessionFileError);
    });

    it('wrote nothing outside the sessions folder', async () => {
      await store.write(file('ok.json'), '');
      expect(await readdir(root)).toEqual(['sessions']);
    });
  });

  it('names its refusals', () => {
    expect(new SessionFileError('x').name).toBe('SessionFileError');
  });
});
