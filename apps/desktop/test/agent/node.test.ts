import { spawn } from 'node:child_process';
import { chmod, copyFile, link, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claudeArgs } from '../../src/agent/launch';
import { killTree, nodeAgentPlatform, taskkillPath } from '../../src/agent/node';
import type { AgentPlatform, ChildLike } from '../../src/agent/platform';
import { PLATFORM, writeClaudeWrapper } from './fakeClaude';

const PRINT_ARGS = fileURLToPath(new URL('../fixtures/print-args.mjs', import.meta.url));
const WINDOWS = PLATFORM === 'win32';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'gurukul agent node-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10 });
});

/** Output and exit code (or signal) of a started program, once it has closed. */
function ended(child: ChildLike) {
  let out = '';
  child.stdout.on('data', (chunk) => (out += chunk.toString()));
  return new Promise<{ code: number | null; signal: string | null; out: string }>((resolve) =>
    child.on('close', (code, signal) => resolve({ code, signal, out })),
  );
}

/** The environment a started program needs here: this one's, for `PATH` and Windows' own. */
function envOf(p: AgentPlatform): Record<string, string> {
  return Object.fromEntries(
    Object.entries(p.env).filter((e): e is [string, string] => e[1] !== undefined),
  );
}

/** Starts `file` on `p` and gives what it printed and its exit code once it has ended. */
function run(p: AgentPlatform, file: string, args: readonly string[]) {
  return ended(p.spawn(file, args, { cwd: root, env: envOf(p) }));
}

/** A Node program that stays until it is killed. */
const HANG = ['-e', 'setInterval(() => {}, 1000)'];

describe('nodeAgentPlatform', () => {
  it('keeps what it is given', () => {
    const p = nodeAgentPlatform('darwin', { PATH: '/bin' }, '/Users/meera');
    expect([p.platform, p.env, p.homeDir]).toEqual(['darwin', { PATH: '/bin' }, '/Users/meera']);
  });

  // Windows has no execute bit: there Node's X_OK check is an existence check.
  it.skipIf(WINDOWS)('runs only files that may be run; on Windows, any file', async () => {
    const script = path.join(root, 'claude');
    const plain = path.join(root, 'notes.txt');
    await writeFile(script, '#!/bin/sh\n');
    await chmod(script, 0o755);
    await writeFile(plain, '');
    const linux = nodeAgentPlatform('linux', {}, root);
    expect(await linux.isExecutable(script)).toBe(true);
    expect(await linux.isExecutable(plain)).toBe(false);
    expect(await linux.isExecutable(root)).toBe(false);
    expect(await linux.isExecutable(path.join(root, 'missing'))).toBe(false);
    expect(await nodeAgentPlatform('win32', {}, root).isExecutable(plain)).toBe(true);
  });

  it('listens on 127.0.0.1 and closes, open connections included', async () => {
    const p = nodeAgentPlatform('linux', {}, root);
    const listener = await p.listen((_req, res) => res.end('hi'));
    const res = await fetch(`http://127.0.0.1:${listener.port}/`, {
      headers: { connection: 'keep-alive' },
    });
    expect(await res.text()).toBe('hi');
    await listener.close();
    await expect(fetch(`http://127.0.0.1:${listener.port}/`)).rejects.toThrow();
  });

  it('gives timers, 256-bit tokens and UUIDs', () => {
    const p = nodeAgentPlatform('linux', {}, root);
    const callback = vi.fn();
    p.clock.clearTimeout(p.clock.setTimeout(callback, 0));
    expect(callback).not.toHaveBeenCalled();
    expect(p.randomToken()).toMatch(/^[0-9a-f]{64}$/);
    expect(p.randomToken()).not.toBe(p.randomToken());
    expect(p.randomId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('passes every argument through unchanged, to a wrapper in a folder with spaces', async () => {
    // On Windows the wrapper is a `.cmd` file, started through `cmd.exe` as npm's `claude.cmd` is:
    // what Node refuses without a shell since its fix for CVE-2024-27980, and cross-spawn quotes.
    const bin = path.join(root, 'Program Files (x86)', 'Claude & Co');
    await mkdir(bin, { recursive: true });
    const wrapper = await writeClaudeWrapper(bin, PRINT_ARGS);
    const folder = path.join(root, 'Meera Rao', 'Gurukul Studio', 'sessions', 'u1', 's1');
    const args = [
      ...claudeArgs(
        {
          promptFile: path.join(folder, 'prompt.md'),
          pluginDir: path.join(folder, 'skills'),
          mcpConfig: path.join(folder, 'mcp.json'),
        },
        { sessionId: '1b4e28ba-2fa1-11d2-883f-0016d3cca427' },
      ),
      'a & b',
      '(c)',
      'trailing\\',
    ];
    // The pinned flags hold an empty argument (`--setting-sources ""`) and a `*`.
    expect(args).toContain('');
    expect(args).toContain('mcp__gurukul__*');
    const result = await run(nodeAgentPlatform(PLATFORM, process.env, root), wrapper, args);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual(args);
  });

  it.runIf(WINDOWS)('passes every argument through unchanged to an .exe with spaces', async () => {
    // Node standing in for the native `claude.exe`: no `cmd.exe` between, Node's own quoting.
    const bin = path.join(root, 'Program Files', 'Claude');
    await mkdir(bin, { recursive: true });
    const exe = path.join(bin, 'claude.exe');
    await link(process.execPath, exe).catch(() => copyFile(process.execPath, exe));
    const args = ['', 'mcp__gurukul__*', path.join(root, 'Meera Rao', 'prompt.md'), 'a & b'];
    const result = await run(nodeAgentPlatform(PLATFORM, process.env, root), exe, [
      '-e',
      'process.stdout.write(JSON.stringify(process.argv.slice(1)))',
      ...args,
    ]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual(args);
  });

  it('starts a program with piped input and output', async () => {
    const p = nodeAgentPlatform('linux', {}, root);
    const child = p.spawn(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], {
      cwd: root,
      env: {},
    });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk.toString()));
    const closed = new Promise<number | null>((resolve) => child.on('close', resolve));
    child.stdin.write('echo');
    child.stdin.end();
    expect(await closed).toBe(0);
    expect(out).toBe('echo');
  });
});

describe('ending a program on Windows', () => {
  it('finds taskkill under SystemRoot, in any case, else under C:\\Windows', () => {
    expect(taskkillPath({ SYSTEMROOT: 'D:\\Win' })).toBe('D:\\Win\\System32\\taskkill.exe');
    expect(taskkillPath({})).toBe('C:\\Windows\\System32\\taskkill.exe');
  });

  it('tree-kills what it starts for Windows, with Node’s kill when taskkill cannot start', async () => {
    // `nodeAgentPlatform('win32')` puts killTree on every program it starts. Here no taskkill is
    // under SystemRoot, so Node's own kill ends the program (on Windows, TerminateProcess).
    const p = nodeAgentPlatform('win32', { ...process.env, SystemRoot: root }, root);
    const child = p.spawn(process.execPath, HANG, { cwd: root, env: envOf(p) });
    const closed = ended(child);
    // killTree's own `kill`, not Node's; elsewhere the program keeps Node's.
    expect(Object.hasOwn(child, 'kill')).toBe(true);
    const plain = nodeAgentPlatform('linux', process.env, root).spawn(process.execPath, ['-v'], {
      cwd: root,
      env: envOf(p),
    });
    expect(Object.hasOwn(plain, 'kill')).toBe(false);
    await ended(plain);
    expect(child.kill('SIGTERM')).toBe(true);
    const result = await closed;
    expect(result.code !== 0 || result.signal !== null).toBe(true);
  });

  // Node's own spawn, not the platform's: on Windows cross-spawn starts a file it cannot find
  // through `cmd.exe`, which has a pid, so a program with none is made here the same everywhere.
  it('kills with Node a program that never started', async () => {
    const child = spawn(path.join(root, 'missing'), [], { stdio: ['pipe', 'pipe', 'ignore'] });
    const failed = new Promise<NodeJS.ErrnoException>((resolve) => child.on('error', resolve));
    killTree(child, path.join(root, 'taskkill'));
    expect(child.pid).toBeUndefined();
    expect(child.kill('SIGTERM')).toBe(false);
    expect((await failed).code).toBe('ENOENT');
  });

  // A shell script stands in for taskkill.exe, so these run everywhere but Windows; there the
  // real taskkill is proved by ask.test.ts (a hung `claude.cmd` cancelled, its `node` gone).
  describe.skipIf(WINDOWS)('with a stand-in taskkill', () => {
    /** `taskkill /pid <pid> /T /F`, played by a script that records its arguments, then `body`. */
    async function standIn(body: string) {
      const file = path.join(root, 'taskkill');
      const record = path.join(root, 'taskkill.args');
      await writeFile(file, `#!/bin/sh\necho "$@" > ${JSON.stringify(record)}\n${body}\n`);
      await chmod(file, 0o755);
      return { file, record };
    }

    it('ends the program with taskkill /pid <pid> /T /F', async () => {
      const { file, record } = await standIn('kill -9 "$2"');
      const child = spawn(process.execPath, HANG, { stdio: ['pipe', 'pipe', 'ignore'] });
      killTree(child, file);
      const closed = ended(child as unknown as ChildLike);
      expect(child.kill('SIGTERM')).toBe(true);
      // SIGKILL: the stand-in's `kill -9`, not Node's SIGTERM.
      expect((await closed).signal).toBe('SIGKILL');
      expect((await readFile(record, 'utf8')).trim()).toBe(`/pid ${child.pid} /T /F`);
    });

    it('falls back to Node’s kill when taskkill fails', async () => {
      const { file } = await standIn('exit 1');
      const child = spawn(process.execPath, HANG, { stdio: ['pipe', 'pipe', 'ignore'] });
      killTree(child, file);
      const closed = ended(child as unknown as ChildLike);
      child.kill('SIGTERM');
      expect((await closed).signal).toBe('SIGTERM');
    });
  });
});
