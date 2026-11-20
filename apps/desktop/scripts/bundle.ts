// Bundles the shell to dist/: main.cjs (the main process) and preload.cjs (the window's bridge).
//
// The Google Desktop OAuth client (src/googleClient.ts) is build-time configuration: the two
// GURUKUL_DESKTOP_GOOGLE_CLIENT_* variables, from GitHub Actions secrets in a release build, or from
// the environment or apps/desktop/.env (gitignored; see .env.example) in development, are written
// into main.cjs as string literals. Unset, they are empty and sign-in answers `not_configured`.
//
//   npx tsx scripts/bundle.ts [outdir]     (outdir defaults to dist; tests use a temporary one)
import { existsSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { clientDefines } from '../src/googleClient';

const root = path.resolve(import.meta.dirname, '..');
const outdir = path.resolve(root, process.argv[2] ?? 'dist');
const envFile = path.join(root, '.env');
// Variables already set (a CI secret, a shell export) win over the file.
if (existsSync(envFile)) process.loadEnvFile(envFile);

await build({
  entryPoints: [path.join(root, 'src/main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  define: clientDefines(process.env),
  outfile: path.join(outdir, 'main.cjs'),
  logLevel: 'warning',
});

await build({
  entryPoints: [path.join(root, 'src/preload.ts')],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2023',
  external: ['electron'],
  outfile: path.join(outdir, 'preload.cjs'),
  logLevel: 'warning',
});
