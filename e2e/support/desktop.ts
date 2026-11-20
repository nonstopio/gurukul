import { _electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_URL } from './env';
import { expect, test as base } from './fixtures';
import type { Person } from './fixtures';

/*
 * Gurukul Studio, the desktop shell (apps/desktop), driven by Playwright's Electron support against
 * the e2e app and the emulators (`DSK-24`, `.plan/22-desktop-studio.md`, Testing).
 *
 * - The shell is the real bundle (`apps/desktop/scripts/bundle.ts`), built once per run into
 *   e2e/dist/desktop so the developer's own apps/desktop/dist is left alone. It runs unpackaged, so
 *   it opens the page `GURUKUL_DESKTOP_TEST_URL` names (a development build only, loopback only:
 *   apps/desktop/src/config.ts).
 * - Claude Code is the fake (`apps/desktop/test/fixtures/fake-claude.mjs`) on PATH. The shell hands
 *   `claude` only its allow-listed environment, so a scenario reaches it as a file in
 *   `CLAUDE_CONFIG_DIR`, a temporary folder. Its tool calls go over the shell's real MCP endpoint.
 * - Google is never called: the consent page is "opened" by sending the shell's loopback listener
 *   its redirect, and the token endpoint answers an ID token the Auth emulator accepts unsigned.
 * - Nothing reaches the internet: Chromium is pointed at a proxy that does not exist, which the
 *   pages' own requests to 127.0.0.1 (the app, the emulators) bypass.
 */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../..');
const DESKTOP = join(ROOT, 'apps/desktop');
/** The bundled shell: package.json and dist/{main,preload}.cjs, as an installer would hold them. */
export const SHELL_DIR = join(ROOT, 'e2e/dist/desktop');
const FAKE_CLAUDE = join(DESKTOP, 'test/fixtures/fake-claude.mjs');
/** The Google client id the e2e bundle is built with. Not a real client: Google is never asked. */
const E2E_CLIENT_ID = 'e2e-desktop-client.apps.googleusercontent.com';
/** A port nothing listens on: every request that is not to this computer fails at once. */
const NO_INTERNET = 'http://127.0.0.1:9';

/** Bundles the shell for the e2e run. Called once, from global setup. */
export function buildDesktopShell(): void {
  const built = spawnSync('npx', ['tsx', 'scripts/bundle.ts', join(SHELL_DIR, 'dist')], {
    cwd: DESKTOP,
    env: {
      ...process.env,
      GURUKUL_DESKTOP_GOOGLE_CLIENT_ID: E2E_CLIENT_ID,
      GURUKUL_DESKTOP_GOOGLE_CLIENT_SECRET: '',
    },
    encoding: 'utf8',
  });
  if (built.status !== 0) {
    throw new Error(`Bundling the desktop shell failed:\n${built.stdout}${built.stderr}`);
  }
  mkdirSync(SHELL_DIR, { recursive: true });
  writeFileSync(
    join(SHELL_DIR, 'package.json'),
    JSON.stringify({
      name: 'gurukul-studio-e2e',
      productName: 'Gurukul Studio',
      version: '0.0.0',
      main: 'dist/main.cjs',
    }),
  );
}

/** Electron's own binary (`npx electron`): fetched on first use when it is not there yet. */
function electronBinary(): string {
  return createRequire(join(DESKTOP, 'package.json'))('electron') as string;
}

/** One step of a fake turn; see the list at the top of fake-claude.mjs. */
export type FakeStep = Record<string, unknown>;

export interface FakeClaudeScenario {
  /** Turn n of the process plays turns[n] (the last one again when there are fewer). */
  turns: FakeStep[][];
}

export interface Desktop {
  app: ElectronApplication;
  window: Page;
  /** Replaces the scenario the next `claude` start reads. */
  setScenario(scenario: FakeClaudeScenario): Promise<void>;
  /** How many times the shell started the fake `claude` for a session (not `--version` etc.). */
  sessionStarts(): Promise<number>;
  close(): Promise<void>;
}

/**
 * Starts the built shell with a fresh data folder and the fake `claude` on PATH, and waits for its
 * window. The window opens the e2e app's Studio.
 */
export async function launchDesktop(scenario: FakeClaudeScenario): Promise<Desktop> {
  const root = await mkdtemp(join(tmpdir(), 'gurukul-desktop-e2e-'));
  const bin = join(root, 'bin');
  const config = join(root, 'claude-config');
  const userData = join(root, 'userData');
  await Promise.all([bin, config, userData].map((dir) => mkdir(dir, { recursive: true })));
  const wrapper = join(bin, 'claude');
  await writeFile(
    wrapper,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_CLAUDE)} "$@"\n`,
  );
  await chmod(wrapper, 0o755);
  const setScenario = (next: FakeClaudeScenario) =>
    writeFile(join(config, 'fake-claude.json'), JSON.stringify(next));
  await setScenario(scenario);

  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    // No proxy settings: Chromium would send the app's own requests through them.
    if (value !== undefined && !/^(https?|all|no)_proxy$/i.test(name)) env[name] = value;
  }
  const app = await _electron.launch({
    executablePath: electronBinary(),
    args: [
      // Linux CI and containers run as a user without Chromium's sandbox (root, or no user
      // namespaces); the window's own sandbox and isolation stay on.
      '--no-sandbox',
      '--ozone-platform=headless',
      `--user-data-dir=${userData}`,
      `--proxy-server=${NO_INTERNET}`,
      SHELL_DIR,
    ],
    env: {
      ...env,
      PATH: `${bin}${delimiter}${env.PATH ?? ''}`,
      CLAUDE_CONFIG_DIR: config,
      GURUKUL_DESKTOP_TEST_URL: `${APP_URL}/studio`,
    },
  });
  const window = await app.firstWindow();
  // Without a display (`--ozone-platform=headless`) the window is drawn at a small default size;
  // give it the size the shell asks for (apps/desktop/src/window.ts).
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 860);
  });
  return {
    app,
    window,
    setScenario,
    async sessionStarts() {
      const text = await readFile(join(config, 'fake-claude-runs.jsonl'), 'utf8').catch(() => '');
      return text.split('\n').filter((line) => line.includes('"--mcp-config"')).length;
    },
    async close() {
      await app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * An unsigned Google ID token for the Auth emulator, which reads its claims without checking a
 * signature (a real Firebase project refuses it).
 */
export function emulatorIdToken(person: Person): string {
  const claims = {
    iss: 'https://accounts.google.com',
    aud: E2E_CLIENT_ID,
    sub: `e2e-${person.email}`,
    email: person.email,
    email_verified: true,
    name: person.name,
  };
  return `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(claims)}.e2e`;
}

/**
 * Stands in for Google in the shell's main process, for this one person: "opening" the consent
 * page sends the shell's loopback listener Google's redirect with its own `state`, and the token
 * endpoint answers the emulator's ID token. Everything between, the PKCE sign-in, the listener and
 * the web app's `signInWithCredential`, is the shell's and the app's own code.
 */
async function standInForGoogle(app: ElectronApplication, person: Person): Promise<void> {
  await app.evaluate(
    ({ net, shell }, { idToken, tokenUrl }) => {
      const realFetch = net.fetch.bind(net);
      net.fetch = async (input, init) =>
        String(input) === tokenUrl
          ? new Response(JSON.stringify({ id_token: idToken }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
          : realFetch(input, init);
      shell.openExternal = async (consent: string) => {
        const asked = new URL(consent);
        const back = new URL(asked.searchParams.get('redirect_uri') ?? '');
        back.searchParams.set('code', 'e2e-code');
        back.searchParams.set('state', asked.searchParams.get('state') ?? '');
        setTimeout(() => void fetch(back).catch(() => undefined), 0);
      };
    },
    { idToken: emulatorIdToken(person), tokenUrl: 'https://oauth2.googleapis.com/token' },
  );
}

/**
 * Signs in inside the shell's window the way an Educator does: Sign in with Google, then the
 * labels choice once. Waits for the Studio course list.
 */
export async function signInToDesktop(desktop: Desktop, person: Person): Promise<void> {
  const { app, window } = desktop;
  await standInForGoogle(app, person);
  const signIn = window.getByRole('button', { name: 'Sign in with Google' });
  await expect(signIn).toBeVisible({ timeout: 30_000 });
  const accept = window.getByRole('checkbox', { name: 'I accept the privacy policy' });
  if ((await accept.count()) && !(await accept.isChecked())) {
    await window.getByText('I accept the privacy policy').click();
  }
  await signIn.click();
  // Each test starts with no accounts, so this is the person's first sign-in: the labels choice.
  const choice = window.getByRole('heading', {
    level: 1,
    name: 'Which labels should Gurukul use?',
  });
  await expect(choice).toBeVisible();
  await window.getByRole('button', { name: 'Select Plain English' }).click();
  await expect(choice).toBeHidden();
}

/**
 * The e2e `test` with a `desktop`: the built shell, started for the test with the fake `claude`
 * and no scenario yet (`setScenario` before the session's page opens, which starts `claude`), and
 * closed after it, with a picture of its window when the test failed.
 */
export const test = base.extend<{ desktop: Desktop }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's needs from this pattern
  desktop: async ({}, use, testInfo) => {
    const desktop = await launchDesktop({ turns: [[{ text: 'Done.' }]] });
    try {
      await use(desktop);
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        await desktop.window
          .screenshot({ path: testInfo.outputPath('desktop-window.png'), fullPage: true })
          .catch(() => undefined);
      }
      await desktop.close();
    }
  },
});

export { expect };
