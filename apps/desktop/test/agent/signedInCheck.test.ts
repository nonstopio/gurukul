import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { nodeAgentPlatform } from '../../src/agent/node';
import {
  CHECK_TIMEOUTS,
  PING_WORD,
  STEP_TITLES,
  chosenProgram,
  droppedClaudeNames,
  emptyRecord,
  findTranscripts,
  formatSummary,
  plain,
  quoteReply,
  readAuth,
  recordLine,
  redact,
  runSignedInCheck,
  shape,
  tappedPlatform,
  tidyProject,
  withFirstOnPath,
  type CheckTimeouts,
} from '../../src/agent/signedInCheck';
import { fakeClaudeHome, type FakeClaudeScenario } from './fakeClaude';
import { fakeChild, fakePlatform } from './fakes';

/**
 * The signed-in check (`DSK-26`) over the shipped agent code and the real Node adapters, against
 * the fake `claude` (`test/fixtures/fake-claude.mjs`) and a silent one (`silent-claude.mjs`).
 * Nothing here starts the real `claude`.
 */

const SILENT_CLAUDE = fileURLToPath(new URL('../fixtures/silent-claude.mjs', import.meta.url));

const homes: Awaited<ReturnType<typeof fakeClaudeHome>>[] = [];
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(homes.splice(0).map((h) => h.remove()));
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});

/** Plays every scripted step: the skill, the ping round trip, Stop on a ping call, the recall. */
const GOOD: FakeClaudeScenario = {
  turns: [
    [
      { skill: 'signed-in-check' },
      { tool: 'ping' },
      {
        rateLimitEvent: { status: 'allowed', resetsAt: 1_800_000_000, rateLimitType: 'five_hour' },
      },
    ],
    [{ tool: 'ping' }, { text: 'Rivers carry silt to the fields.' }],
  ],
  resumeTurns: [[{ recall: true }]],
};

async function home(scenario: FakeClaudeScenario = GOOD) {
  const h = await fakeClaudeHome(scenario);
  homes.push(h);
  return h;
}

/** A home whose `claude` is the silent one, steered by `mode`. */
async function silentHome(mode: Record<string, unknown> = {}) {
  const h = await home();
  await writeFile(
    path.join(h.bin, 'claude'),
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(SILENT_CLAUDE)} "$@"\n`,
  );
  await writeFile(path.join(h.config, 'silent-claude.json'), JSON.stringify(mode));
  return h;
}

const FAST: CheckTimeouts = { turnMs: 600, stopAfterMs: 150, holdMs: 150 };

async function check(
  h: Awaited<ReturnType<typeof home>>,
  options: {
    claudePath?: string | null;
    timeouts?: CheckTimeouts;
    env?: Record<string, string | undefined>;
  } = {},
) {
  const tempDir = path.join(h.root, 'temp with space');
  await mkdir(tempDir, { recursive: true });
  const out: string[] = [];
  const report = await runSignedInCheck({
    platform: nodeAgentPlatform('linux', options.env ?? h.env, h.home),
    tempDir,
    claudePath: options.claudePath ?? null,
    write: (text) => out.push(text),
    system: 'linux x64, Node v22',
    date: '2026-11-19',
    now: () => Date.now(),
    timeouts: options.timeouts,
  });
  const text = out.join('');
  // The check never prints the account, and leaves no temporary session folder behind.
  expect(text).not.toContain('meera@example.com');
  expect(await readdir(tempDir)).toEqual([]);
  const status = (title: string) => report.steps.find((s) => s.title === title)?.status;
  const details = (title: string) =>
    report.steps.find((s) => s.title === title)?.details.join('\n') ?? '';
  return { report, text, status, details };
}

// Each run starts some eight node processes in turn: seconds on a loaded machine, past vitest's 5 s.
describe('the signed-in check against a fake claude', { timeout: 20_000 }, () => {
  it('passes every step and prints a summary to paste', async () => {
    const h = await home({ ...GOOD, apiKeySource: 'none' });
    const { report, text, status, details } = await check(h, {
      env: { ...h.env, ANTHROPIC_API_KEY: 'sk-not-printed', CLAUDE_CODE_USE_BEDROCK: '1' },
    });
    expect(report.passed).toBe(true);
    expect(report.steps.map((s) => s.status)).toEqual([
      'PASS',
      'PASS',
      'PASS',
      'PASS',
      'PASS',
      'PASS',
      'PASS',
      'PASS',
      'PASS',
      'INFO',
      'PASS',
    ]);
    expect(details(STEP_TITLES.find)).toContain('program: claude\n');
    expect(details(STEP_TITLES.auth)).toContain('method: claude.ai');
    expect(details(STEP_TITLES.auth)).toContain(
      'Claude variables dropped: ANTHROPIC_API_KEY, CLAUDE_CODE_USE_BEDROCK',
    );
    expect(text).not.toContain('sk-not-printed');
    expect(details(STEP_TITLES.start)).toContain('tokenSource claude.ai, apiKeySource none');
    expect(details(STEP_TITLES.start)).toContain('command line: claudeArgs, 25 arguments;');
    expect(details(STEP_TITLES.roundTrip)).toContain('connected, 1 tool(s)');
    expect(details(STEP_TITLES.roundTrip)).toContain(`reply: "tool: ${PING_WORD}" (has the word)`);
    expect(details(STEP_TITLES.skill)).toContain('loaded during the turn: yes');
    expect(details(STEP_TITLES.stop)).toContain('on the ping call');
    // Stop lands while the ping call is held, not in a race with its answer.
    expect(details(STEP_TITLES.stop)).toContain(
      'a gurukul call was pending at Stop; the turn ended with it still unanswered',
    );
    expect(details(STEP_TITLES.stop)).toContain('process kept for the next message: yes');
    expect(details(STEP_TITLES.resume)).toContain('started again with --resume and no tools');
    expect(details(STEP_TITLES.resume)).toContain('same Claude session id: yes');
    expect(details(STEP_TITLES.limits)).toContain(
      'rate_limit_event: rate_limit_info { status: allowed, resetsAt: 1800000000, rateLimitType: five_hour } (resetsAt 2027-01-15T08:00:00.000Z)',
    );
    expect(details(STEP_TITLES.transcript)).toContain('agent.forget: done; gone');
    expect(details(STEP_TITLES.transcript)).toContain('then held: memory/; removed');
    expect(status(STEP_TITLES.transcript)).toBe('PASS');
    // The transcript and its project folder are gone.
    expect(await readdir(path.join(h.config, 'projects'))).toEqual([]);
    expect(text).toContain('----- DSK-26 signed-in check: paste from here -----');
    expect(text).toContain('Result: PASS (10 of 10 checks passed)');
    // The chat the check printed is the scripted replies only, never the stop turn's text.
    expect(text).not.toContain('Rivers carry silt');
  });

  it('checks a chosen program, even outside PATH', async () => {
    const h = await home();
    const { report, details } = await check(h, {
      claudePath: path.join(h.bin, 'claude'),
      env: { ...h.env, PATH: '/nowhere' },
    });
    expect(report.passed).toBe(true);
    expect(details(STEP_TITLES.find)).toContain(`folder: ${h.bin}`);
  });

  it('fails at once on a chosen program with another name', async () => {
    const h = await home();
    const { report, text } = await check(h, { claudePath: path.join(h.bin, 'claude-dev') });
    expect(report.passed).toBe(false);
    expect(report.steps.map((s) => s.status)).toEqual(['FAIL', ...Array(10).fill('SKIP')]);
    expect(text).toContain('--claude must name a program called claude');
    expect(text).toContain('Result: FAIL (Find claude)');
  });

  it('fails when the chosen program is not there', async () => {
    const h = await home();
    const { report, text } = await check(h, { claudePath: path.join(h.root, 'claude') });
    expect(report.steps[0]?.status).toBe('FAIL');
    expect(text).toContain('is not there, or may not be run');
  });

  it('fails when no claude is on PATH', async () => {
    const h = await home();
    const { report, text } = await check(h, { env: { ...h.env, PATH: '/nowhere' } });
    expect(report.steps.map((s) => s.status)).toEqual(['FAIL', ...Array(10).fill('SKIP')]);
    expect(text).toContain('no claude on PATH');
  });

  it('fails a claude older than the pinned version', async () => {
    const h = await home({ version: '2.1.0' });
    const { report, details } = await check(h);
    expect(report.steps.map((s) => s.status)).toEqual(['PASS', 'FAIL', ...Array(9).fill('SKIP')]);
    expect(details(STEP_TITLES.version)).toContain('version 2.1.0;');
  });

  it('fails a claude that prints no version', async () => {
    const h = await silentHome({ version: 'nothing useful\n' });
    const { details } = await check(h);
    expect(details(STEP_TITLES.version)).toContain('printed no version');
  });

  it('stops before the plan is used when signed out', async () => {
    const h = await home({ loggedIn: false });
    const { report, details } = await check(h);
    expect(report.steps.map((s) => s.status)).toEqual([
      'PASS',
      'PASS',
      'FAIL',
      'FAIL',
      ...Array(7).fill('SKIP'),
    ]);
    expect(details(STEP_TITLES.auth)).toContain('signed in: no\nmethod: none');
    expect(details(STEP_TITLES.auth)).toContain('Claude variables dropped: none');
    expect(details(STEP_TITLES.status)).toContain('state: not_signed_in');
  });

  it('fails when auth status prints no JSON', async () => {
    const h = await silentHome({ auth: 'You are signed in as someone\n' });
    const { details, text } = await check(h);
    expect(details(STEP_TITLES.auth)).toContain('printed no JSON');
    expect(text).not.toContain('signed in as someone');
  });

  it('says how auth status answered without naming a method', async () => {
    const h = await silentHome({ auth: '{"loggedIn":true}', failStart: true });
    const { details } = await check(h);
    expect(details(STEP_TITLES.auth)).toContain('method: not said');
  });

  it('fails the session steps when claude will not start', async () => {
    const h = await silentHome({ failStart: true });
    const { report, details } = await check(h);
    expect(report.steps.map((s) => s.status)).toEqual([
      'PASS',
      'PASS',
      'PASS',
      'PASS',
      'FAIL',
      ...Array(6).fill('SKIP'),
      'INFO',
    ]);
    expect(details(STEP_TITLES.start)).toContain('not started: { code: crashed, exitCode: 1 }');
    expect(details(STEP_TITLES.start)).toContain('tokenSource not reported');
    expect(details('Bridge warnings')).toBe('Agent not started crashed');
  });

  it('fails the start when initialize reports no sign-in at all', async () => {
    const h = await silentHome({ noAccount: true });
    const { report, details } = await check(h, { timeouts: FAST });
    expect(status(report, STEP_TITLES.start)).toBe('FAIL');
    expect(details(STEP_TITLES.start)).toContain('started\ninitialize: tokenSource not reported');
    expect(report.steps.slice(5, 11).map((s) => s.status)).toEqual(Array(6).fill('SKIP'));
    expect(report.passed).toBe(false);
  });

  it('times out a claude that never answers, and reports what it could not remove', async () => {
    const h = await silentHome({ stuckTranscript: true });
    const { report, details } = await check(h, { timeouts: FAST });
    expect(report.passed).toBe(false);
    expect(details(STEP_TITLES.roundTrip)).toContain(
      "gurukul server at the turn's start: not listed, 0 tool(s)",
    );
    expect(details(STEP_TITLES.roundTrip)).toContain('ping was not called');
    expect(details(STEP_TITLES.roundTrip)).toContain('reply: "" (lacks the word)');
    expect(details(STEP_TITLES.roundTrip)).toContain('no end of the turn in time; Stop was sent');
    expect(details(STEP_TITLES.skill)).toContain('listed in init: no\n');
    expect(details(STEP_TITLES.stop)).toContain('on nothing in 0.1 s');
    expect(details(STEP_TITLES.resume)).toContain('same Claude session id: no');
    expect(details(STEP_TITLES.limits)).toContain('none arrived');
    expect(details(STEP_TITLES.transcript)).toMatch(/agent\.forget failed: \w+; still there: /);
    expect(status(report, STEP_TITLES.transcript)).toBe('FAIL');
  });

  it('fails a resume that will not start', async () => {
    const h = await silentHome({ failResume: true });
    const { details } = await check(h, { timeouts: FAST });
    expect(details(STEP_TITLES.resume)).toBe('not started: { code: crashed, exitCode: 1 }');
    expect(details(STEP_TITLES.transcript)).toContain('no ');
    expect(details(STEP_TITLES.transcript)).toContain('.jsonl under');
  });

  it('fails a round trip with no tool call and a resume that forgot', async () => {
    const h = await home({
      turns: [[{ text: 'Done.' }], []],
      resumeTurns: [[{ text: 'I do not know.' }]],
    });
    const { details } = await check(h);
    expect(details(STEP_TITLES.roundTrip)).toContain('ping was not called');
    expect(details(STEP_TITLES.skill)).toContain('loaded during the turn: no');
    // An empty turn ends before anything happens in it: Stop is never sent.
    expect(details(STEP_TITLES.stop)).toContain('the turn ended before Stop was sent');
    expect(details(STEP_TITLES.resume)).toContain('(does not remember the word)');
  });

  it('reports a message that could not be sent after claude ended', async () => {
    const h = await home({ turns: [[{ exit: 3 }]], resumeTurns: [[{ recall: true }]] });
    const { details } = await check(h);
    expect(details(STEP_TITLES.roundTrip)).toContain('turn: failed');
    expect(details(STEP_TITLES.roundTrip)).toContain(
      'the app was told: { code: crashed, exitCode: 3 }',
    );
    expect(details(STEP_TITLES.stop)).toContain('not sent: the session was not running');
  });

  it('answers a held call after a while when claude waits for it before ending the turn', async () => {
    const turns = GOOD.turns ?? [];
    const h = await home({
      ...GOOD,
      turns: [turns[0] ?? [], [{ tool: 'ping', waitsForAnswer: true }, { text: 'More.' }]],
    });
    const { details, report } = await check(h, {
      timeouts: { turnMs: 5_000, stopAfterMs: 3_000, holdMs: 300 },
    });
    expect(details(STEP_TITLES.stop)).toContain(
      'a gurukul call was pending at Stop; the turn had not ended 0.3 s later, so it was answered then',
    );
    expect(details(STEP_TITLES.stop)).toContain('turn: stopped');
    expect(status(report, STEP_TITLES.stop)).toBe('PASS');
  });

  it('fails Stop when the turn ended first', async () => {
    const h = await home({ ...GOOD, turns: [GOOD.turns?.[0] ?? [], [{ text: 'Quick.' }]] });
    const { details, report } = await check(h);
    expect(details(STEP_TITLES.stop)).toContain('on the first text');
    expect(details(STEP_TITLES.stop)).toContain('turn: done');
    expect(status(report, STEP_TITLES.stop)).toBe('FAIL');
  });

  it('fails Stop when claude ends instead, and records a plan limit as it arrives', async () => {
    const h = await home({
      turns: [[{ apiRetry: 'rate_limit' }], [{ exit: 3 }]],
      resumeTurns: [[{ recall: true }]],
    });
    const { details } = await check(h);
    expect(details(STEP_TITLES.roundTrip)).toContain(
      'the app was told: { code: plan_limit, resetsAt: null }',
    );
    expect(details(STEP_TITLES.limits)).toContain(
      'api_retry: error rate_limit, attempt 1 of 10, retry in 20 ms',
    );
    expect(details(STEP_TITLES.stop)).toContain('process kept for the next message: no');
    expect(details('Bridge warnings')).toContain('Agent error plan_limit');
  });
});

function status(report: { steps: { title: string; status: string }[] }, title: string) {
  return report.steps.find((s) => s.title === title)?.status;
}

describe('the signed-in check on Windows names', () => {
  /** A platform whose `claude` is `file`; each start answers from `answers` in turn, or throws. */
  async function windows(file: string, answers: (string | null)[]) {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'gurukul-check-'));
    roots.push(tempDir);
    const out: string[] = [];
    const platform = fakePlatform({
      platform: 'win32',
      env: { Path: path.win32.dirname(file) },
      homeDir: 'C:\\Users\\meera',
      isExecutable: async (f) => f === file,
      spawn: () => {
        const answer = answers.shift() ?? null;
        if (answer === null) throw new Error('spawn failed');
        const child = fakeChild();
        setTimeout(() => {
          child.printRaw(answer);
          child.close(0);
        });
        return child.child;
      },
    });
    const report = await runSignedInCheck({
      platform,
      tempDir,
      claudePath: null,
      write: (t) => out.push(t),
      system: 'win32 x64',
      date: '2026-11-19',
      now: () => 0,
    });
    return { report, text: out.join('') };
  }

  it('finds npm’s claude.cmd in a folder with spaces', async () => {
    const { report, text } = await windows('C:\\Program Files\\nodejs\\claude.cmd', [null]);
    expect(report.steps.slice(0, 2).map((s) => s.status)).toEqual(['PASS', 'FAIL']);
    expect(text).toContain('program: claude.cmd (npm install, started through cmd.exe)');
    expect(text).toContain('path has spaces: yes');
    expect(text).toContain('printed no version');
  });

  it('finds the native claude.exe, and fails when auth status will not run', async () => {
    const { report, text } = await windows('C:\\Users\\meera\\.local\\bin\\claude.exe', [
      '2.1.330 (Claude Code)\n',
      null,
    ]);
    expect(report.steps.slice(0, 4).map((s) => s.status)).toEqual(['PASS', 'PASS', 'FAIL', 'FAIL']);
    expect(text).toContain('program: claude.exe (native install)');
    expect(text).toContain('folder: ~\\.local\\bin');
    expect(text).toContain('path has spaces: no');
    expect(text).toContain('printed no JSON');
  });
});

describe('what the check reads from the stream', () => {
  it('reads only the source names from initialize', () => {
    const record = emptyRecord();
    recordLine(record, 'not json');
    recordLine(record, '[1]');
    recordLine(record, JSON.stringify({ type: 'control_response' }));
    recordLine(record, JSON.stringify({ type: 'control_response', response: { response: {} } }));
    expect(record).toEqual(emptyRecord());
    recordLine(
      record,
      JSON.stringify({
        type: 'control_response',
        response: {
          response: {
            account: { email: 'meera@example.com', tokenSource: 'claude.ai', apiKeySource: 'none' },
          },
        },
      }),
    );
    expect(record.tokenSource).toBe('claude.ai');
    expect(record.apiKeySource).toBe('none');
    expect(JSON.stringify(record)).not.toContain('meera');
  });

  it('reads the server, our tools and our skills from init', () => {
    const record = emptyRecord();
    recordLine(record, JSON.stringify({ type: 'system', subtype: 'init' }));
    expect(record.init).toEqual({ version: null, server: null, tools: 0, skills: [] });
    recordLine(
      record,
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        claude_code_version: '2.1.330',
        mcp_servers: [null, { name: 'other' }, { name: 'gurukul' }],
        tools: ['Skill', 'mcp__gurukul__ping', 7],
        skills: ['deep-research', 'gurukul:a', { name: 'gurukul:b' }, { name: 3 }, 5],
      }),
    );
    expect(record.init).toEqual({
      version: '2.1.330',
      server: 'unknown',
      tools: 1,
      skills: ['gurukul:a', 'gurukul:b'],
    });
  });

  it('records each plan-limit event with its shape', () => {
    const record = emptyRecord();
    recordLine(record, JSON.stringify({ type: 'rate_limit_event' }));
    recordLine(
      record,
      JSON.stringify({
        type: 'rate_limit_event',
        rate_limit_info: { status: 'rejected', resetsAt: 'soon' },
      }),
    );
    recordLine(
      record,
      JSON.stringify({ type: 'system', subtype: 'api_retry', error: 'rate_limit' }),
    );
    recordLine(record, JSON.stringify({ type: 'assistant', error: 'rate_limit' }));
    recordLine(record, JSON.stringify({ type: 'assistant', message: { content: [] } }));
    recordLine(record, JSON.stringify({ type: 'system', subtype: 'status' }));
    expect(record.limits).toEqual([
      'rate_limit_event: rate_limit_info <undefined>',
      'rate_limit_event: rate_limit_info { status: rejected, resetsAt: soon }',
      'api_retry: error rate_limit, attempt <undefined> of <undefined>, retry in <undefined> ms',
      'assistant error: rate_limit',
    ]);
  });

  it('reads every started program, string chunks and bytes alike', () => {
    const record = emptyRecord();
    const child = fakeChild();
    const platform = tappedPlatform(fakePlatform({ spawn: () => child.child }), record, null);
    platform.spawn('claude', ['--version'], { cwd: '/', env: {} });
    child.printRaw('{"type":"system","subtype":"init","claude_code_version":"2.1.3');
    child.printRaw(Buffer.from('30"}\n'));
    expect(record.init?.version).toBe('2.1.330');
    expect(record.sessionArgs).toEqual([]);
    platform.spawn('claude', ['-p', '--verbose'], { cwd: '/', env: {} });
    expect(record.sessionArgs).toEqual([['-p', '--verbose']]);
  });

  it('lets only the chosen program count as claude, its folder first on PATH', async () => {
    const isExecutable = async () => true;
    const win = tappedPlatform(
      fakePlatform({ platform: 'win32', env: { Path: 'C:\\Windows' }, isExecutable }),
      emptyRecord(),
      'C:\\Program Files\\nodejs\\claude.cmd',
    );
    expect(win.env).toEqual({ Path: 'C:\\Program Files\\nodejs;C:\\Windows' });
    expect(await win.isExecutable('c:\\program files\\nodejs\\CLAUDE.CMD')).toBe(true);
    expect(await win.isExecutable('C:\\Users\\meera\\.local\\bin\\claude.exe')).toBe(false);
    const posix = tappedPlatform(fakePlatform({ isExecutable }), emptyRecord(), '/opt/claude');
    expect(await posix.isExecutable('/opt/claude')).toBe(true);
    expect(await posix.isExecutable('/OPT/claude')).toBe(false);
    const plainPlatform = fakePlatform({ isExecutable });
    expect(tappedPlatform(plainPlatform, emptyRecord(), null).env).toBe(plainPlatform.env);
  });
});

describe('the check’s small pieces', () => {
  it('prints short plain values only', () => {
    expect(plain('claude.ai')).toBe('claude.ai');
    expect(plain('say "hi"')).toBeNull();
    expect(plain('x'.repeat(65))).toBeNull();
    expect(plain('')).toBeNull();
    expect(plain(3)).toBeNull();
  });

  it('describes a value by its shape', () => {
    expect(shape(1)).toBe('1');
    expect(shape(false)).toBe('false');
    expect(shape(null)).toBe('null');
    expect(shape('a "quoted" word')).toBe('<string 15>');
    expect(shape([1, 2])).toBe('<2 items>');
    expect(shape({ a: { b: { c: 1 } } })).toBe('{ a: { b: {…} } }');
    expect(shape(undefined)).toBe('<undefined>');
  });

  it('puts a folder first on PATH, on Windows under its own case', () => {
    expect(withFirstOnPath({ PATH: '/bin' }, '/opt', 'linux')).toEqual({ PATH: '/opt:/bin' });
    expect(withFirstOnPath({}, '/opt', 'linux')).toEqual({ PATH: '/opt' });
    expect(withFirstOnPath({ Path: 'C:\\W' }, 'D:\\x', 'win32')).toEqual({ Path: 'D:\\x;C:\\W' });
    expect(withFirstOnPath({}, 'D:\\x', 'win32')).toEqual({ PATH: 'D:\\x' });
  });

  it('takes a chosen program only under a name findClaude looks for', () => {
    expect(chosenProgram('/opt/bin/claude', 'linux')).toEqual({ file: '/opt/bin/claude' });
    expect(chosenProgram('/opt/bin/claude.exe', 'linux')).toEqual({
      error: '--claude must name a program called claude',
    });
    expect(chosenProgram('C:\\Program Files\\nodejs\\Claude.CMD', 'win32')).toEqual({
      file: 'C:\\Program Files\\nodejs\\claude.cmd',
    });
    expect(chosenProgram('C:\\tools\\claude', 'win32')).toEqual({
      error: '--claude must name a program called claude.exe or claude.cmd',
    });
  });

  it('reads auth status for the sign-in and the method only', () => {
    expect(readAuth('{"loggedIn":true,"authMethod":"claude.ai","email":"m@example.com"}')).toEqual({
      loggedIn: true,
      method: 'claude.ai',
    });
    expect(readAuth('{"loggedIn":"yes"}')).toEqual({ loggedIn: false, method: null });
    expect(readAuth('[]')).toBeNull();
    expect(readAuth('nope')).toBeNull();
  });

  it('names the dropped Claude variables, in any case on Windows', () => {
    const env = { ANTHROPIC_MODEL: 'x', Claude_Config_Dir: 'y', aws_profile: 'z', PATH: '/bin' };
    expect(droppedClaudeNames(env, 'linux')).toEqual([
      'ANTHROPIC_MODEL',
      'Claude_Config_Dir',
      'aws_profile',
    ]);
    expect(droppedClaudeNames(env, 'win32')).toEqual(['ANTHROPIC_MODEL', 'aws_profile']);
  });

  it('finds transcripts in project folders only, and tidies a project folder', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gurukul-check-'));
    roots.push(root);
    expect(await findTranscripts(root, 'id')).toEqual([]);
    const projects = path.join(root, 'projects');
    await mkdir(path.join(projects, 'p1', 'memory'), { recursive: true });
    await mkdir(path.join(projects, 'p2', 'memory'), { recursive: true });
    await writeFile(path.join(projects, 'p1', 'id.jsonl'), '');
    await writeFile(path.join(projects, 'stray.txt'), '');
    expect(await findTranscripts(root, 'id')).toEqual([path.join(projects, 'p1', 'id.jsonl')]);

    // A file left: kept.
    expect(await tidyProject(path.join(projects, 'p1'))).toBe(
      'its project folder then held: id.jsonl, memory/; kept (it holds files)',
    );
    // A folder with something in it: kept.
    await writeFile(path.join(projects, 'p2', 'memory', 'note.md'), '');
    expect(await tidyProject(path.join(projects, 'p2'))).toContain('held: memory/; kept');
    // Nothing at all: removed.
    await mkdir(path.join(projects, 'p3'));
    expect(await tidyProject(path.join(projects, 'p3'))).toBe(
      'its project folder then held: nothing; removed',
    );
    expect(existsSync(path.join(projects, 'p3'))).toBe(false);
  });

  it('writes the home folder as ~, also as Claude Code encodes it', () => {
    expect(redact('/Users/meera/x and -Users-meera-y', '/Users/meera')).toBe('~/x and ~-y');
    expect(redact('C:\\USERS\\Meera\\x', 'C:\\Users\\Meera')).toBe('~\\x');
    expect(redact('/x', '/')).toBe('/x');
  });

  it('quotes a reply on one line, cut to 80 characters', () => {
    expect(quoteReply(['a\nb', 'c'])).toBe('"a b c"');
    expect(quoteReply(['x'.repeat(100)])).toBe(`"${'x'.repeat(79)}…"`);
  });

  it('summarises a failed run by the steps that failed', () => {
    const summary = formatSummary(
      {
        passed: false,
        steps: [
          { title: 'One', status: 'PASS', details: ['in /Users/meera'] },
          { title: 'Two', status: 'FAIL', details: [] },
          { title: 'Three', status: 'SKIP', details: [] },
        ],
      },
      { date: '2026-11-19', system: 'darwin arm64', homeDir: '/Users/meera' },
    );
    expect(summary).toContain('      in ~\n');
    expect(summary).toContain('Result: FAIL (Two)');
  });

  it('waits long enough for a real turn by default', () => {
    expect(CHECK_TIMEOUTS).toEqual({ turnMs: 180_000, stopAfterMs: 3_000, holdMs: 10_000 });
  });
});
