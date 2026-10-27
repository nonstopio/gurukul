// Builds the web app for the emulators and serves it. Playwright's `webServer` runs this.
//
// The build is the production build with the emulator switch on (`VITE_USE_EMULATORS`, see
// apps/web/src/firebase.ts), written to e2e/dist so the real `apps/web/dist` is left alone. The
// auth domain is a placeholder: the SDK refuses `signInWithPopup` without one, even though with
// the emulator switch on the popup opens on the Auth emulator and never on that domain.
// Set E2E_SKIP_BUILD=1 to reuse the last build while writing tests.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(root, 'e2e/dist');
const web = ['--workspace', '@gurukul/web'];

if (!process.env.E2E_SKIP_BUILD) {
  const env = {
    ...process.env,
    VITE_USE_EMULATORS: 'true',
    VITE_FIREBASE_API_KEY: 'demo-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'demo-gurukul.firebaseapp.com',
    VITE_FIREBASE_APP_ID: '1:000000000000:web:e2e',
  };
  // `changelog:releases` writes the generated file the build imports (it is not committed).
  for (const args of [
    ['run', 'changelog:releases', ...web],
    ['exec', ...web, '--', 'vite', 'build', '--outDir', out, '--emptyOutDir'],
  ]) {
    const built = spawnSync('npm', args, { cwd: root, env, stdio: 'inherit' });
    if (built.status !== 0) process.exit(built.status ?? 1);
  }
}

const server = spawn(
  'npm',
  [
    'exec',
    ...web,
    '--',
    'vite',
    'preview',
    '--outDir',
    out,
    '--host',
    '127.0.0.1',
    '--port',
    process.env.E2E_APP_PORT ?? '4173',
    '--strictPort',
  ],
  { cwd: root, stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
