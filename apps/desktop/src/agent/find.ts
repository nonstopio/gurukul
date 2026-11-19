import path from 'node:path';
import { envValue, type Env } from './launch';
import type { ChildLike, Clock, SpawnFn } from './platform';

/**
 * Finding `claude` and asking it short questions (`--version`, `auth status`). Nothing it prints is
 * logged: `auth status` names the account.
 */

/** Program names to look for in each `PATH` folder: the native install first, then npm's. */
export function claudeNames(platform: string): string[] {
  return platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude'];
}

/** The first `claude` on `PATH` that may be run, or null when there is none. */
export async function findClaude(
  env: Env,
  platform: string,
  isExecutable: (file: string) => Promise<boolean>,
): Promise<string | null> {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const dirs = (envValue(env, 'PATH', platform) ?? '')
    .split(paths.delimiter)
    .filter((dir) => dir !== '' && paths.isAbsolute(dir));
  for (const dir of dirs) {
    for (const name of claudeNames(platform)) {
      const file = paths.join(dir, name);
      if (await isExecutable(file)) return file;
    }
  }
  return null;
}

/** The most a short command may print before the rest is dropped. */
export const MAX_COMMAND_OUTPUT = 64 * 1024;

export interface CommandResult {
  code: number | null;
  stdout: string;
}

/**
 * Runs a short command to its end and gives its exit code and output, or null when it could not
 * start or did not finish within `timeoutMs` (it is then killed).
 */
export function runCommand(
  spawn: SpawnFn,
  clock: Clock,
  file: string,
  args: readonly string[],
  options: { cwd: string; env: Record<string, string> },
  timeoutMs: number,
): Promise<CommandResult | null> {
  return new Promise((resolve) => {
    let child: ChildLike;
    try {
      child = spawn(file, args, options);
    } catch {
      resolve(null);
      return;
    }
    let stdout = '';
    let done = false;
    const finish = (result: CommandResult | null) => {
      if (done) return;
      done = true;
      clock.clearTimeout(timer);
      resolve(result);
    };
    const timer = clock.setTimeout(() => {
      finish(null);
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdin.on('error', () => undefined);
    child.stdin.end();
    child.stdout.on('data', (chunk) => {
      if (stdout.length < MAX_COMMAND_OUTPUT) stdout += chunk.toString();
    });
    child.on('error', () => finish(null));
    child.on('close', (code) => finish({ code, stdout: stdout.slice(0, MAX_COMMAND_OUTPUT) }));
  });
}
