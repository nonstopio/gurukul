import { describe, expect, it, vi } from 'vitest';
import { MAX_COMMAND_OUTPUT, claudeNames, findClaude, runCommand } from '../../src/agent/find';
import type { SpawnFn } from '../../src/agent/platform';
import { fakeChild, fakeClock } from './fakes';

describe('findClaude', () => {
  it('looks for the native install, then npm’s, on Windows', () => {
    expect(claudeNames('win32')).toEqual(['claude.exe', 'claude.cmd']);
    expect(claudeNames('darwin')).toEqual(['claude']);
  });

  it('gives the first claude on PATH that may be run, skipping empty and relative entries', async () => {
    const isExecutable = vi.fn(async (file: string) => file === '/opt/b/claude');
    await expect(
      findClaude({ PATH: ':relative/bin:/opt/a:/opt/b:/opt/c' }, 'linux', isExecutable),
    ).resolves.toBe('/opt/b/claude');
    expect(isExecutable.mock.calls.map(([f]) => f)).toEqual(['/opt/a/claude', '/opt/b/claude']);
  });

  it('reads Path with Windows separators and names', async () => {
    const isExecutable = vi.fn(async (file: string) => file === 'C:\\npm\\claude.cmd');
    await expect(findClaude({ Path: 'C:\\tools;C:\\npm' }, 'win32', isExecutable)).resolves.toBe(
      'C:\\npm\\claude.cmd',
    );
    expect(isExecutable.mock.calls.map(([f]) => f)).toEqual([
      'C:\\tools\\claude.exe',
      'C:\\tools\\claude.cmd',
      'C:\\npm\\claude.exe',
      'C:\\npm\\claude.cmd',
    ]);
  });

  it('gives null when there is none, or no PATH', async () => {
    const isExecutable = vi.fn(async () => false);
    await expect(findClaude({ PATH: '/opt/a' }, 'linux', isExecutable)).resolves.toBeNull();
    await expect(findClaude({}, 'linux', isExecutable)).resolves.toBeNull();
  });
});

describe('runCommand', () => {
  const options = { cwd: '/home/meera', env: { PATH: '/usr/bin' } };

  function setup() {
    const fake = fakeChild();
    const time = fakeClock();
    const spawn = vi.fn<SpawnFn>(() => fake.child);
    const result = runCommand(spawn, time.clock, '/bin/claude', ['--version'], options, 1000);
    return { fake, time, spawn, result };
  }

  it('gives the exit code and all of the output, closing its input', async () => {
    const { fake, time, spawn, result } = setup();
    fake.printRaw('2.1.');
    fake.printRaw(Buffer.from('328 (Claude Code)\n'));
    fake.close(0);
    await expect(result).resolves.toEqual({ code: 0, stdout: '2.1.328 (Claude Code)\n' });
    expect(spawn).toHaveBeenCalledWith('/bin/claude', ['--version'], options);
    expect(fake.child.stdin.end).toHaveBeenCalled();
    expect(time.pending()).toBe(0);
    fake.stdinError(new Error('EPIPE'));
  });

  it('keeps at most MAX_COMMAND_OUTPUT characters', async () => {
    const { fake, result } = setup();
    fake.printRaw('x'.repeat(MAX_COMMAND_OUTPUT - 1));
    fake.printRaw('yy');
    fake.printRaw('z');
    fake.close(1);
    const out = await result;
    expect(out?.stdout).toHaveLength(MAX_COMMAND_OUTPUT);
    expect(out?.code).toBe(1);
  });

  it('gives null when the program cannot start', async () => {
    const { fake, result } = setup();
    fake.fail(new Error('ENOENT'));
    fake.close(null);
    await expect(result).resolves.toBeNull();
  });

  it('gives null and kills the program when it takes too long', async () => {
    const { fake, time, result } = setup();
    time.advance(1000);
    await expect(result).resolves.toBeNull();
    expect(fake.child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('gives null when spawn throws', async () => {
    const time = fakeClock();
    const spawn = vi.fn<SpawnFn>(() => {
      throw new Error('EINVAL');
    });
    await expect(
      runCommand(spawn, time.clock, '/bin/claude', [], options, 1000),
    ).resolves.toBeNull();
    expect(time.pending()).toBe(0);
  });
});
