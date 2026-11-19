import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  INTRO,
  USAGE,
  askToContinue,
  checkClaudeMain,
  parseCheckArgs,
} from '../../src/agent/checkCli';
import { nodeAgentPlatform } from '../../src/agent/node';
import { fakeClaudeHome } from './fakeClaude';

const homes: Awaited<ReturnType<typeof fakeClaudeHome>>[] = [];
afterEach(async () => {
  await Promise.all(homes.splice(0).map((h) => h.remove()));
});

describe('parseCheckArgs', () => {
  it('reads --yes, --help and --claude', () => {
    expect(parseCheckArgs([])).toEqual({ yes: false, help: false, claudePath: null });
    expect(
      parseCheckArgs(['-y', '-h', '--claude', 'C:\\Program Files\\nodejs\\claude.cmd']),
    ).toEqual({ yes: true, help: true, claudePath: 'C:\\Program Files\\nodejs\\claude.cmd' });
    expect(parseCheckArgs(['--yes', '--help'])).toEqual({
      yes: true,
      help: true,
      claudePath: null,
    });
  });

  it('refuses what it does not know', () => {
    expect(parseCheckArgs(['--claude'])).toEqual({ error: '--claude needs a path' });
    expect(parseCheckArgs(['--claude', ''])).toEqual({ error: '--claude needs a path' });
    expect(parseCheckArgs(['--model', 'x'])).toEqual({ error: 'Unknown option: --model' });
  });
});

describe('askToContinue', () => {
  const ask = async (answer: string | null) => {
    const input = new PassThrough();
    const out: string[] = [];
    const asked = askToContinue(input, (t) => out.push(t));
    if (answer === null) input.end();
    else input.write(answer);
    return { yes: await asked, out: out.join('') };
  };

  it('goes on only for yes', async () => {
    expect(await ask('y\n')).toEqual({ yes: true, out: 'Continue? [y/N] ' });
    expect((await ask(' YES \n')).yes).toBe(true);
    expect((await ask('\n')).yes).toBe(false);
    expect((await ask('no\n')).yes).toBe(false);
  });

  it('takes no answer as no', async () => {
    expect((await ask(null)).yes).toBe(false);
  });
});

describe('checkClaudeMain', () => {
  async function main(argv: string[], answer: string | null = null) {
    const h = await fakeClaudeHome({
      turns: [[{ skill: 'signed-in-check' }, { tool: 'ping' }], [{ tool: 'ping' }]],
      resumeTurns: [[{ recall: true }]],
    });
    homes.push(h);
    const tempDir = path.join(h.root, 'temp');
    await mkdir(tempDir);
    const input = new PassThrough();
    if (answer !== null) input.write(answer);
    const out: string[] = [];
    const code = await checkClaudeMain({
      argv,
      platform: nodeAgentPlatform('linux', h.env, h.home),
      tempDir,
      input,
      write: (t) => out.push(t),
      system: 'linux x64, Node v22',
      date: '2026-11-19',
      now: () => Date.now(),
    });
    input.end();
    return { code, text: out.join('') };
  }

  it('prints the usage for a wrong option', async () => {
    const { code, text } = await main(['--nope']);
    expect(code).toBe(2);
    expect(text).toBe(`Unknown option: --nope\n\n${USAGE}`);
  });

  it('prints the usage for --help', async () => {
    expect(await main(['--help'])).toEqual({ code: 0, text: USAGE });
  });

  it('says what it spends and runs nothing on a no', async () => {
    const { code, text } = await main([], 'n\n');
    expect(code).toBe(2);
    expect(text).toBe(`${INTRO}Continue? [y/N] Stopped. Nothing was run.\n`);
    expect(INTRO).toContain('It uses a few messages of your Claude plan.');
  });

  it('runs on a yes and answers 0 when every step passed', async () => {
    const { code, text } = await main([], 'y\n');
    expect(code).toBe(0);
    expect(text).toContain('Result: PASS');
  });

  it('runs without asking with --yes and answers 1 when a step failed', async () => {
    const { code, text } = await main(['--yes', '--claude', '/nowhere/claude']);
    expect(code).toBe(1);
    expect(text).not.toContain('Continue?');
    expect(text).toContain('Result: FAIL (Find claude)');
  });
});
