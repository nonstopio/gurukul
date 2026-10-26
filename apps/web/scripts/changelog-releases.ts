// Writes src/changelog/releases.generated.json: which release shipped each changelog entry.
//
//   GURUKUL_RELEASE=release-2026.11.02-1030 npm run changelog:releases -w @gurukul/web
//
// GURUKUL_RELEASE names the release being cut by this build (deploy.yml sets it on production
// deploys); entries not yet in any tag are filed under it. Without it they show as Unreleased.
// Thin glue: the logic is in src/changelog/releases.ts and git.ts, which are tested.
import { readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGitPort } from '../src/changelog/git';
import { resolveReleases } from '../src/changelog/releases';

const dir = resolve(import.meta.dirname, '../src/changelog');
const files = readdirSync(resolve(dir, 'entries')).filter((f) => f.endsWith('.ts'));
const git = createGitPort(dir, 'entries');
const data = resolveReleases(files, git, process.env.GURUKUL_RELEASE || undefined);
writeFileSync(resolve(dir, 'releases.generated.json'), `${JSON.stringify(data, null, 2)}\n`);
console.warn(`changelog: ${files.length} entries, ${data.releases.length} release(s)`);
