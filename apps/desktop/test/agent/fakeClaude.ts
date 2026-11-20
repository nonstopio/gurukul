import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The fake `claude` script (`test/fixtures/fake-claude.mjs`). */
export const FAKE_CLAUDE = fileURLToPath(new URL('../fixtures/fake-claude.mjs', import.meta.url));

/** The platform the tests run on: they run on Linux, macOS and, in CI, Windows. */
export const PLATFORM = process.platform;

/**
 * The name `findClaude` finds the wrapper under: npm's `claude.cmd` on Windows, which Node starts
 * only through `cmd.exe` (cross-spawn), so every test that starts the fake proves that path too.
 */
export const CLAUDE_PROGRAM = PLATFORM === 'win32' ? 'claude.cmd' : 'claude';

/**
 * What the platform adds to the environment the script sees, none of it from the bridge: `/bin/sh`
 * sets `PWD`; on Windows `cmd.exe` sets `PROMPT`, and libuv (Node's spawn) copies in the parent's
 * value of each variable on its list of ones Windows programs need (`required_vars` in libuv's
 * `src/win/process.c`) when the given environment lacks it. The rest of that list (`PATH`,
 * `SYSTEMROOT`, `TEMP`, `USERPROFILE`) is allow-listed already.
 */
export const WRAPPER_ENV: readonly string[] =
  PLATFORM === 'win32'
    ? [
        'PROMPT',
        'HOMEDRIVE',
        'HOMEPATH',
        'LOGONSERVER',
        'SYSTEMDRIVE',
        'USERDOMAIN',
        'USERNAME',
        'WINDIR',
      ]
    : ['PWD'];

/**
 * Writes `bin/claude` (`bin\claude.cmd` on Windows): a wrapper that runs `script` with this Node,
 * passing every argument through (`"$@"`, `%*`), as an install of Claude Code would.
 */
export async function writeClaudeWrapper(bin: string, script: string): Promise<string> {
  const file = path.join(bin, CLAUDE_PROGRAM);
  if (PLATFORM === 'win32') {
    await writeFile(file, `@"${process.execPath}" "${script}" %*\r\n`);
  } else {
    await writeFile(
      file,
      `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`,
    );
    await chmod(file, 0o755);
  }
  return file;
}

/**
 * The variables Windows needs for a program to start and open a socket (`SystemRoot` among them),
 * which the app has from its own environment and passes on through the allow-list.
 */
const WINDOWS_ENV = ['SystemRoot', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP'] as const;

export interface FakeClaudeScenario {
  version?: string;
  loggedIn?: boolean;
  /** `initialize`'s `account.apiKeySource`, when set. */
  apiKeySource?: string;
  turns?: Record<string, unknown>[][];
  /** Played instead of `turns` by a process started with `--resume`. */
  resumeTurns?: Record<string, unknown>[][];
}

export interface FakeClaudeRun {
  argv: string[];
  env: string[];
  cwd: string;
  /** The fake's own process: on Windows the `node` under the `cmd.exe` the bridge started. */
  pid: number;
}

/** Whether a process is still running. */
export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * A temporary computer for the fake `claude`: a `bin` folder with a `claude` wrapper on `PATH`, a
 * home folder, a Claude config folder holding the scenario, and the app's data folder.
 */
export async function fakeClaudeHome(scenario: FakeClaudeScenario = {}) {
  // A space in every path, as in Windows' `C:\Users\Meera Rao` and macOS's `Application Support`.
  const root = await mkdtemp(path.join(tmpdir(), 'gurukul fake claude-'));
  const bin = path.join(root, 'bin');
  const home = path.join(root, 'home');
  const config = path.join(root, 'claude-config');
  const sessions = path.join(root, 'userData', 'sessions');
  await Promise.all([bin, home, config].map((dir) => mkdir(dir, { recursive: true })));
  const program = await writeClaudeWrapper(bin, FAKE_CLAUDE);
  const setScenario = (next: FakeClaudeScenario) =>
    writeFile(path.join(config, 'fake-claude.json'), JSON.stringify(next));
  await setScenario(scenario);
  return {
    root,
    bin,
    /** The wrapper's full path. */
    program,
    home,
    config,
    sessions,
    setScenario,
    /** The environment the app would have: the wrapper first on `PATH`, Claude's folder moved. */
    env: {
      ...(PLATFORM === 'win32'
        ? Object.fromEntries(WINDOWS_ENV.map((name) => [name, process.env[name]]))
        : {}),
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
      HOME: home,
      CLAUDE_CONFIG_DIR: config,
    } as Record<string, string | undefined>,
    /** What each start of the fake recorded: arguments, environment names, working folder, pid. */
    async runs(): Promise<FakeClaudeRun[]> {
      const text = await readFile(path.join(config, 'fake-claude-runs.jsonl'), 'utf8').catch(
        () => '',
      );
      return text
        .split('\n')
        .filter((l) => l !== '')
        .map((l) => JSON.parse(l) as FakeClaudeRun);
    },
    // Windows refuses to remove a folder a process still has open; a killed one lets go soon after.
    remove: () => rm(root, { recursive: true, force: true, maxRetries: 10 }),
  };
}
