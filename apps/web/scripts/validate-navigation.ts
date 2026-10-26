// Checks every area's navigation metadata against the route table.
//   npm run validate:navigation
// Run by the build, CI and the Claude navigation-nudge hook. Thin glue: the rules live in
// src/navigation/validate.ts, which is tested. Areas are read by file here, the same set the
// app's import.meta.glob collects.
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AreaNavigation } from '../src/navigation/types';
import { validateNavigation } from '../src/navigation/validate';

const quiet = process.argv.includes('--quiet');
const areasDir = resolve(import.meta.dirname, '../src/navigation/areas');
const areas: AreaNavigation[] = [];
for (const file of readdirSync(areasDir)
  .filter((f) => f.endsWith('.ts'))
  .sort()) {
  const mod = (await import(pathToFileURL(resolve(areasDir, file)).href)) as {
    navigation: AreaNavigation;
  };
  areas.push(mod.navigation);
}
// The route table imports React screens, so its keys are read from source rather than executed.
const { ROUTE_PATHS } = await import('../src/route-paths');
const problems = validateNavigation(areas, ROUTE_PATHS);
if (problems.length) {
  console.error(`x navigation: ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
  for (const p of problems) console.error(`  x ${p}`);
  process.exit(1);
}
if (!quiet)
  console.warn(`navigation: ${areas.length} area(s), ${ROUTE_PATHS.length} route(s), clean`);
