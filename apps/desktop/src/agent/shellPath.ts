import path from 'node:path';
import { runCommand } from './find';
import type { Env } from './launch';
import type { Clock, SpawnFn } from './platform';
import type { Logger } from '../log';

/**
 * The Educator's real `PATH`. A Mac or Linux app opened from the Dock or a launcher gets the
 * system's minimal `PATH` (`/usr/bin:/bin:...`), not the one their terminal has, so `claude`
 * (`~/.local/bin`) and the `node` an npm-installed `claude` needs are both out of reach. Like VS
 * Code, ask the login shell once at start-up. Windows apps get the full `PATH`: nothing to do.
 * The value is never logged: its folders hold the user's name.
 */

const MARK = '__GURUKUL_PATH__';
export const SHELL_PATH_TIMEOUT_MS = 5000;

/** Where `claude` is installed when the shell cannot be asked (home-relative first). */
export function wellKnownDirs(homeDir: string): string[] {
  return [
    path.posix.join(homeDir, '.local', 'bin'),
    path.posix.join(homeDir, '.claude', 'local'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
}

/**
 * `env` with the login shell's `PATH` folders added after the current ones, or the well-known
 * folders if the shell cannot be asked. The current folders stay first: a launch from a terminal
 * (and the end-to-end specs' fake `claude`) keeps the `claude` it was started with.
 */
export async function withUserPath(
  platform: string,
  env: Env,
  homeDir: string,
  spawn: SpawnFn,
  clock: Clock,
  log: Logger,
): Promise<Env> {
  if (platform !== 'darwin' && platform !== 'linux') return env;
  const shell = env.SHELL || (platform === 'darwin' ? '/bin/zsh' : '/bin/sh');
  const clean = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const result = await runCommand(
    spawn,
    clock,
    shell,
    ['-ilc', `printf '%s' "${MARK}\${PATH}${MARK}"`],
    { cwd: homeDir, env: clean },
    SHELL_PATH_TIMEOUT_MS,
  );
  const found =
    result?.code === 0 ? result.stdout.match(new RegExp(`${MARK}(.+)${MARK}`, 's')) : null;
  if (!found?.[1])
    log.warn('Shell PATH not read', { reason: result === null ? 'no_answer' : 'unusable' });
  const added = found?.[1] ? found[1].split(':') : wellKnownDirs(homeDir);
  const dirs = [...(env.PATH ?? '').split(':'), ...added];
  return { ...env, PATH: [...new Set(dirs.filter((dir) => dir !== ''))].join(':') };
}
