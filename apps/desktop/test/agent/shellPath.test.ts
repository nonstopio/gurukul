import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../src/log';
import type { SpawnFn } from '../../src/agent/platform';
import { SHELL_PATH_TIMEOUT_MS, withUserPath } from '../../src/agent/shellPath';
import { fakeChild, fakeClock } from './fakes';

const MARK = '__GURUKUL_PATH__';
const log = { warn: vi.fn() } as unknown as Logger;

function run(
  platform: string,
  env: Record<string, string>,
  reply: (f: ReturnType<typeof fakeChild>) => void,
) {
  const fake = fakeChild();
  const time = fakeClock();
  const spawn = vi.fn<SpawnFn>(() => fake.child);
  const result = withUserPath(platform, env, '/Users/meera', spawn, time.clock, log);
  reply(fake);
  return { result, spawn, time };
}

describe('withUserPath', () => {
  it('leaves Windows alone', async () => {
    const env = { PATH: 'C:\\x' };
    const spawn = vi.fn<SpawnFn>();
    await expect(withUserPath('win32', env, 'C:\\u', spawn, fakeClock().clock, log)).resolves.toBe(
      env,
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it('adds the login shell PATH after the current one, ignoring rc-file noise', async () => {
    const { result, spawn } = run(
      'darwin',
      { SHELL: '/bin/bash', PATH: '/tmp/fake bin:/usr/bin', A: 'b' },
      (f) => {
        f.printRaw(`welcome\n${MARK}/Users/meera/.local/bin:/usr/bin${MARK}\nbye`);
        f.close(0);
      },
    );
    await expect(result).resolves.toEqual({
      SHELL: '/bin/bash',
      PATH: '/tmp/fake bin:/usr/bin:/Users/meera/.local/bin',
      A: 'b',
    });
    expect(spawn.mock.calls[0]?.[0]).toBe('/bin/bash');
    expect(spawn.mock.calls[0]?.[1][0]).toBe('-ilc');
  });

  it('uses zsh on a Mac and sh on Linux when SHELL is unset', async () => {
    const a = run('darwin', {}, (f) => f.close(1));
    await a.result;
    expect(a.spawn.mock.calls[0]?.[0]).toBe('/bin/zsh');
    const b = run('linux', {}, (f) => f.close(1));
    await b.result;
    expect(b.spawn.mock.calls[0]?.[0]).toBe('/bin/sh');
  });

  it('falls back to the current PATH plus the usual folders, without repeats, when the shell fails', async () => {
    const { result } = run('darwin', { PATH: '/usr/bin::/opt/homebrew/bin' }, (f) => f.close(1));
    await expect(result).resolves.toEqual({
      PATH: '/usr/bin:/opt/homebrew/bin:/Users/meera/.local/bin:/Users/meera/.claude/local:/usr/local/bin',
    });
    expect(log.warn).toHaveBeenCalledWith('Shell PATH not read', { reason: 'unusable' });
  });

  it('falls back when the shell prints no markers, or has no PATH to start from', async () => {
    const { result } = run('linux', {}, (f) => {
      f.printRaw('nothing');
      f.close(0);
    });
    await expect(result).resolves.toEqual({
      PATH: '/Users/meera/.local/bin:/Users/meera/.claude/local:/opt/homebrew/bin:/usr/local/bin',
    });
  });

  it('falls back when the shell does not answer in time', async () => {
    const { result, time } = run('darwin', { PATH: '/usr/bin' }, () => undefined);
    time.advance(SHELL_PATH_TIMEOUT_MS);
    await result;
    expect(log.warn).toHaveBeenCalledWith('Shell PATH not read', { reason: 'no_answer' });
  });

  it('ignores variables that are unset', async () => {
    const { result, spawn } = run('darwin', { A: undefined, B: 'x' } as never, (f) => f.close(1));
    await result;
    expect(spawn.mock.calls[0]?.[2].env).toEqual({ B: 'x' });
  });
});

// The fakes above never run the command itself: this one does, so the shell really prints both
// markers (`$PATH__GURUKUL_PATH__` would be read as one variable and the closing marker lost).
it.skipIf(process.platform === 'win32')('asks a real shell a question it answers', async () => {
  const { nodeAgentPlatform } = await import('../../src/agent/node');
  const real = nodeAgentPlatform(process.platform, process.env, '/');
  const env = { SHELL: '/bin/sh', PATH: '/usr/bin:/bin:/x y' };
  const result = await withUserPath('linux', env, '/', real.spawn, real.clock, log);
  expect(result.PATH).toContain('/x y');
  expect(log.warn).not.toHaveBeenCalledWith('Shell PATH not read', expect.anything());
});
