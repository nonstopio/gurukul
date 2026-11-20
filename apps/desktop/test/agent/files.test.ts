import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PLUGIN_MANIFEST,
  claudeConfigDir,
  forgetTranscript,
  isFolder,
  mcpConfig,
  writeSessionFiles,
} from '../../src/agent/files';
import { SessionFileError } from '../../src/store';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'gurukul-agent-files-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const input = (overrides = {}) => ({
  sessionsRoot: path.join(root, 'sessions'),
  uid: 'u1',
  sessionId: 's1',
  systemPrompt: 'Prompt',
  skills: [
    {
      name: 'humanize',
      files: [
        { path: 'SKILL.md', text: '# Humanize' },
        { path: 'references/words.md', text: 'words' },
      ],
    },
  ],
  endpointUrl: 'http://127.0.0.1:4000/mcp',
  ...overrides,
});

describe('mcpConfig', () => {
  it('names the HTTP endpoint and the token by reference only', () => {
    expect(JSON.parse(mcpConfig('http://127.0.0.1:4000/mcp'))).toEqual({
      mcpServers: {
        gurukul: {
          type: 'http',
          url: 'http://127.0.0.1:4000/mcp',
          headers: { Authorization: 'Bearer ${GURUKUL_BRIDGE_TOKEN}' },
        },
      },
    });
  });
});

describe('writeSessionFiles', () => {
  it('writes the prompt, the skills as a plugin, mcp.json and an empty working folder', async () => {
    const files = await writeSessionFiles(input());
    const folder = path.join(root, 'sessions', 'u1', 's1');
    expect(files).toEqual({
      promptFile: path.join(folder, 'prompt.md'),
      pluginDir: path.join(folder, 'skills'),
      mcpConfig: path.join(folder, 'mcp.json'),
      emptyDir: path.join(folder, 'workdir'),
    });
    expect(await readFile(files.promptFile, 'utf8')).toBe('Prompt');
    expect(
      JSON.parse(
        await readFile(path.join(files.pluginDir, '.claude-plugin', 'plugin.json'), 'utf8'),
      ),
    ).toEqual(PLUGIN_MANIFEST);
    expect(
      await readFile(
        path.join(files.pluginDir, 'skills', 'humanize', 'references', 'words.md'),
        'utf8',
      ),
    ).toBe('words');
    expect(await readFile(files.mcpConfig, 'utf8')).toBe(mcpConfig('http://127.0.0.1:4000/mcp'));
    expect(await readdir(files.emptyDir)).toEqual([]);
  });

  it('replaces the skills folder and empties the working folder on every start', async () => {
    const first = await writeSessionFiles(input());
    await mkdir(path.join(first.pluginDir, 'hooks'));
    await writeFile(path.join(first.pluginDir, 'hooks', 'hooks.json'), '{}');
    await writeFile(path.join(first.emptyDir, 'CLAUDE.md'), 'stray');
    const second = await writeSessionFiles(input({ skills: [] }));
    expect((await readdir(second.pluginDir)).sort()).toEqual(['.claude-plugin']);
    expect(await readdir(second.emptyDir)).toEqual([]);
  });

  it('refuses a person or session id that is not a safe name', async () => {
    await expect(writeSessionFiles(input({ uid: '..' }))).rejects.toBeInstanceOf(SessionFileError);
    await expect(writeSessionFiles(input({ sessionId: 'a/b' }))).rejects.toThrow(
      'Invalid session id',
    );
  });
});

describe('isFolder', () => {
  it('is true for a folder only', async () => {
    await writeFile(path.join(root, 'file'), '');
    expect(await isFolder(root)).toBe(true);
    expect(await isFolder(path.join(root, 'file'))).toBe(false);
    expect(await isFolder(path.join(root, 'missing'))).toBe(false);
  });
});

describe('claudeConfigDir', () => {
  it('honours CLAUDE_CONFIG_DIR, else ~/.claude', () => {
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: '/cfg' }, 'linux', '/home/m')).toBe('/cfg');
    expect(claudeConfigDir({ claude_config_dir: 'C:\\cfg' }, 'win32', 'C:\\Users\\m')).toBe(
      'C:\\cfg',
    );
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: '' }, 'linux', '/home/m')).toBe(
      path.join('/home/m', '.claude'),
    );
    expect(claudeConfigDir({}, 'linux', '/home/m')).toBe(path.join('/home/m', '.claude'));
  });
});

describe('forgetTranscript', () => {
  const id = '0b6e4f3e-6b7a-4c1e-9d55-2f1a3c4b5d6e';
  const other = '11111111-6b7a-4c1e-9d55-2f1a3c4b5d6e';

  it('removes that chat, and its folder, from every project; nothing else', async () => {
    const a = path.join(root, 'projects', '-Users-meera-git-basics');
    const b = path.join(root, 'projects', '-tmp-workdir');
    await mkdir(path.join(a, id, 'subagents'), { recursive: true });
    await mkdir(b, { recursive: true });
    await mkdir(path.join(root, 'projects', '-another-folder'));
    await writeFile(path.join(a, `${id}.jsonl`), 'chat');
    await writeFile(path.join(a, `${other}.jsonl`), 'newer chat');
    await writeFile(path.join(b, `${id}.jsonl`), 'chat');
    await writeFile(path.join(root, 'projects', 'stray.json'), '');
    await expect(forgetTranscript(root, id)).resolves.toBe(2);
    expect(await readdir(a)).toEqual([`${other}.jsonl`]);
    expect(await readdir(b)).toEqual([]);
    expect(existsSync(path.join(root, 'projects', 'stray.json'))).toBe(true);
  });

  it('removes nothing, without an error, when Claude Code has no projects folder', async () => {
    await expect(forgetTranscript(path.join(root, 'none'), id)).resolves.toBe(0);
  });

  it('passes on any other failure', async () => {
    await writeFile(path.join(root, 'projects'), 'a file where a folder should be');
    await expect(forgetTranscript(root, id)).rejects.toMatchObject({ code: 'ENOTDIR' });
    await rm(path.join(root, 'projects'));
    await mkdir(path.join(root, 'projects', 'p', `${id}.jsonl`), { recursive: true });
    await expect(forgetTranscript(root, id)).rejects.toMatchObject({ code: 'ERR_FS_EISDIR' });
  });
});
