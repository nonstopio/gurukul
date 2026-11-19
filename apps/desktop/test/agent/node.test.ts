import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nodeAgentPlatform } from '../../src/agent/node';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'gurukul-agent-node-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('nodeAgentPlatform', () => {
  it('keeps what it is given', () => {
    const p = nodeAgentPlatform('darwin', { PATH: '/bin' }, '/Users/meera');
    expect([p.platform, p.env, p.homeDir]).toEqual(['darwin', { PATH: '/bin' }, '/Users/meera']);
  });

  it('runs only files that may be run; on Windows, any file', async () => {
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
