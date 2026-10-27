import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Cloud Build installs firebase/functions/package.json from the public npm registry. A workspace
// package listed there (even as a devDependency) is a 404 and every function fails to build, so
// the bundle (esbuild) must be the only way @gurukul/* code reaches the deployed functions.
describe('firebase/functions/package.json', () => {
  it('lists no @gurukul workspace package in any dependency field', () => {
    const pkg = JSON.parse(readFileSync('firebase/functions/package.json', 'utf8'));
    const fields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
    const workspace = fields.flatMap((f) =>
      Object.keys(pkg[f] ?? {}).filter((name) => name.startsWith('@gurukul/')),
    );
    assert.deepEqual(workspace, []);
  });
});
