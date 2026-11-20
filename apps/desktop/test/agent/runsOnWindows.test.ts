import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/** The test files here that start the fake `claude` (`fakeClaudeHome`), with their text. */
async function realProcessTests(): Promise<{ name: string; text: string }[]> {
  const names = (await readdir(HERE)).filter((n) => n.endsWith('.test.ts'));
  const files = await Promise.all(
    names.map(async (name) => ({ name, text: await readFile(`${HERE}${name}`, 'utf8') })),
  );
  return files.filter((f) => f.text.includes('fakeClaudeHome('));
}

// CI runs this folder on Windows, where the fake is `bin\claude.cmd` on a `;`-separated `Path`.
// A test that starts it as 'linux' looks for `claude` and splits `PATH` on `:`: it finds nothing
// there, and passes everywhere else, so only this check catches it before the Windows job.
describe('the tests that start the fake claude', () => {
  it('are found', async () => {
    const names = (await realProcessTests()).map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(['checkCli.test.ts', 'realProcess.test.ts']));
  });

  it('start it as the system they run on (PLATFORM), never a named one', async () => {
    const named = (await realProcessTests()).filter((f) =>
      /nodeAgentPlatform\(\s*['"`]/.test(f.text),
    );
    expect(named.map((f) => f.name)).toEqual([]);
  });
});
