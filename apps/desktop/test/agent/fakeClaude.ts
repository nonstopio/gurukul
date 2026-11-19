import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The fake `claude` script (`test/fixtures/fake-claude.mjs`). */
export const FAKE_CLAUDE = fileURLToPath(new URL('../fixtures/fake-claude.mjs', import.meta.url));

export interface FakeClaudeScenario {
  version?: string;
  loggedIn?: boolean;
  turns?: Record<string, unknown>[][];
}

/**
 * A temporary computer for the fake `claude`: a `bin` folder with a `claude` wrapper on `PATH`, a
 * home folder, a Claude config folder holding the scenario, and the app's data folder.
 */
export async function fakeClaudeHome(scenario: FakeClaudeScenario = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'gurukul-fake-claude-'));
  const bin = path.join(root, 'bin');
  const home = path.join(root, 'home');
  const config = path.join(root, 'claude-config');
  const sessions = path.join(root, 'userData', 'sessions');
  await Promise.all([bin, home, config].map((dir) => mkdir(dir, { recursive: true })));
  const wrapper = path.join(bin, 'claude');
  await writeFile(
    wrapper,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_CLAUDE)} "$@"\n`,
  );
  await chmod(wrapper, 0o755);
  const setScenario = (next: FakeClaudeScenario) =>
    writeFile(path.join(config, 'fake-claude.json'), JSON.stringify(next));
  await setScenario(scenario);
  return {
    root,
    bin,
    home,
    config,
    sessions,
    setScenario,
    /** The environment the app would have: the wrapper first on `PATH`, Claude's folder moved. */
    env: {
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
      HOME: home,
      CLAUDE_CONFIG_DIR: config,
    } as Record<string, string | undefined>,
    /** What each start of the fake recorded: arguments, environment names, working folder. */
    async runs(): Promise<{ argv: string[]; env: string[]; cwd: string }[]> {
      const text = await readFile(path.join(config, 'fake-claude-runs.jsonl'), 'utf8').catch(
        () => '',
      );
      return text
        .split('\n')
        .filter((l) => l !== '')
        .map((l) => JSON.parse(l) as { argv: string[]; env: string[]; cwd: string });
    },
    remove: () => rm(root, { recursive: true, force: true }),
  };
}
