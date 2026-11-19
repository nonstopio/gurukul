import { mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type {
  AgentEvent,
  AgentSkill,
  AgentStartRequest,
  AgentTool,
  AgentToolCall,
  BridgeEvents,
  EventName,
  TurnOutcome,
} from '../bridge';
import type { EventSender } from '../events';
import { createLogger, type LogFields } from '../log';
import { claudeConfigDir } from './files';
import { claudeNames, findClaude, runCommand } from './find';
import {
  MIN_CLAUDE_VERSION,
  childEnv,
  envValue,
  isAllowedEnvName,
  isAtLeast,
  parseVersion,
  type Env,
} from './launch';
import { COMMAND_TIMEOUT_MS, createAgentManager, type AgentManager } from './manager';
import type { AgentPlatform, ChildLike } from './platform';
import { createLineSplitter } from './stream';

/**
 * The signed-in check (`DSK-26`): what the maintainer runs on a signed-in Mac and Windows PC to see
 * the pinned launch work against the real `claude`. It drives the shipped code — `findClaude`,
 * `runCommand`, the agent manager with its pinned flags, allow-listed environment, session files
 * and HTTP MCP endpoint, `forget` — over the real platform, with a window stand-in that answers one
 * read-only `ping` tool with a fixed word. `checkCli.ts` asks before it spends the person's plan.
 *
 * It prints no credential, token, account name or chat text beyond the scripted replies: it reads
 * only `loggedIn` and `authMethod` from `auth status`, only `tokenSource` and `apiKeySource` from
 * `initialize`, and from the stream only the fields a finding needs (`StreamRecord`).
 */

/** The word the `ping` tool answers; a model cannot guess it. */
export const PING_WORD = 'saffron-kite';

export const PING_TOOL: AgentTool = {
  name: 'ping',
  description: 'Answers with a fixed word. Read-only: it changes nothing.',
  inputSchema: { type: 'object', properties: {} },
};

export const CHECK_SKILL: AgentSkill = {
  name: 'signed-in-check',
  files: [
    {
      path: 'SKILL.md',
      text: [
        '---',
        'name: signed-in-check',
        'description: Use when asked to run the Gurukul signed-in check.',
        '---',
        '',
        'When asked to run the signed-in check, call the `ping` tool once and answer with exactly',
        'the word it returns, nothing else.',
        '',
      ].join('\n'),
    },
  ],
};

export const CHECK_PROMPT =
  'Gurukul Studio is checking that it can talk to you. Follow each message exactly and keep answers short.';

/** The scripted messages: the only chat the check sends. */
export const MESSAGES = {
  roundTrip:
    'Run the signed-in check: load the gurukul:signed-in-check skill, call the ping tool once, then answer with exactly the word it returned and nothing else.',
  stop: 'Call the ping tool once more, then write about 300 words on how rivers shape the villages along them.',
  resume:
    'Without calling any tool: what word did the ping tool return earlier in this conversation? Answer with that word only.',
} as const;

/** The check's own ids for its one session. `uid` and `sessionId` are safe names (`store.ts`). */
export const CHECK_SESSION = { uid: 'signed-in-check', sessionId: 'check' } as const;

export interface CheckTimeouts {
  /** The longest one turn may take before the check stops it and calls it failed. */
  turnMs: number;
  /** In the Stop step: when nothing has happened yet in the turn, Stop is sent after this long. */
  stopAfterMs: number;
}

export const CHECK_TIMEOUTS: CheckTimeouts = { turnMs: 180_000, stopAfterMs: 3_000 };

export type StepStatus = 'PASS' | 'FAIL' | 'INFO' | 'SKIP';

export interface StepResult {
  title: string;
  status: StepStatus;
  details: string[];
}

export interface CheckReport {
  steps: StepResult[];
  /** True when no step failed. */
  passed: boolean;
}

export interface SignedInCheckOptions {
  /** The real adapters (`nodeAgentPlatform`) in the runner; the fake `claude` in the tests. */
  platform: AgentPlatform;
  /** Where the temporary session folder is made (a folder whose name has a space), then removed. */
  tempDir: string;
  /** Check this program instead of the first `claude` on `PATH` (Windows: the other install). */
  claudePath: string | null;
  write(text: string): void;
  /** `darwin arm64, Node v22.11.0`: for the summary. */
  system: string;
  /** `2026-11-19`: for the summary. */
  date: string;
  now(): number;
  timeouts?: CheckTimeouts | undefined;
}

// ---- what the stream says, without the chat ----

/** The findings read straight from `claude`'s output; never text, never the account. */
export interface StreamRecord {
  tokenSource: string | null;
  apiKeySource: string | null;
  /** From the latest `system`/`init`. */
  init: { version: string | null; server: string | null; tools: number; skills: string[] } | null;
  /** One line per plan-limit related event: `rate_limit_event`, `api_retry`, an assistant error. */
  limits: string[];
  /** The arguments of every `claude` started for a session (not the short commands). */
  sessionArgs: string[][];
}

export function emptyRecord(): StreamRecord {
  return { tokenSource: null, apiKeySource: null, init: null, limits: [], sessionArgs: [] };
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A short value fit to print: printable ASCII, no quotes, at most 64 characters; else null. */
export function plain(value: unknown): string | null {
  return typeof value === 'string' && /^[\x20-\x7e]{1,64}$/.test(value) && !/["'`]/.test(value)
    ? value
    : null;
}

/** A value's shape for the report: numbers, booleans and short words as they are, nested keys. */
export function shape(value: unknown, depth = 0): string {
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value);
  }
  if (typeof value === 'string') return plain(value) ?? `<string ${value.length}>`;
  if (Array.isArray(value)) return `<${value.length} items>`;
  if (isObject(value)) {
    if (depth > 1) return '{…}';
    const parts = Object.entries(value).map(([k, v]) => `${k}: ${shape(v, depth + 1)}`);
    return `{ ${parts.join(', ')} }`;
  }
  return `<${typeof value}>`;
}

/** Seconds since 1970 as ISO-8601, for a `resetsAt`; null for anything else. */
function isoSeconds(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
}

function skillName(value: unknown): string | null {
  return plain(value) ?? (isObject(value) ? plain(value.name) : null);
}

/** Reads one output line into `record`. A line it has no use for changes nothing. */
export function recordLine(record: StreamRecord, line: string): void {
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (!isObject(msg)) return;
  if (msg.type === 'control_response') {
    // `initialize`'s answer names the account: only the two source names are read.
    const response = isObject(msg.response) ? msg.response : {};
    const answer = isObject(response.response) ? response.response : {};
    if (!isObject(answer.account)) return;
    record.tokenSource = plain(answer.account.tokenSource);
    record.apiKeySource = plain(answer.account.apiKeySource);
  } else if (msg.type === 'system' && msg.subtype === 'init') {
    const servers = Array.isArray(msg.mcp_servers) ? msg.mcp_servers : [];
    const gurukul = servers.find((s) => isObject(s) && s.name === 'gurukul') as Json | undefined;
    const tools = Array.isArray(msg.tools) ? msg.tools : [];
    const skills = Array.isArray(msg.skills) ? msg.skills : [];
    record.init = {
      version: plain(msg.claude_code_version),
      server: gurukul === undefined ? null : (plain(gurukul.status) ?? 'unknown'),
      tools: tools.filter((t) => typeof t === 'string' && t.startsWith('mcp__gurukul__')).length,
      skills: skills.map(skillName).filter((s): s is string => s?.startsWith('gurukul:') === true),
    };
  } else if (msg.type === 'rate_limit_event') {
    const info = msg.rate_limit_info;
    const resets = isObject(info) ? isoSeconds(info.resetsAt) : null;
    record.limits.push(
      `rate_limit_event: rate_limit_info ${shape(info)}${resets === null ? '' : ` (resetsAt ${resets})`}`,
    );
  } else if (msg.type === 'system' && msg.subtype === 'api_retry') {
    record.limits.push(
      `api_retry: error ${shape(msg.error)}, attempt ${shape(msg.attempt)} of ${shape(msg.max_retries)}, retry in ${shape(msg.retry_delay_ms)} ms`,
    );
  } else if (msg.type === 'assistant' && msg.error !== undefined) {
    record.limits.push(`assistant error: ${shape(msg.error)}`);
  }
}

/** The platform the manager runs on, with every started program's output read into `record`. */
export function tappedPlatform(
  base: AgentPlatform,
  record: StreamRecord,
  chosen: string | null,
): AgentPlatform {
  const paths = base.platform === 'win32' ? path.win32 : path.posix;
  const same = (a: string, b: string) =>
    base.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  return {
    ...base,
    // A chosen program: its folder first on `PATH`, and nothing else counts as `claude`.
    env:
      chosen === null ? base.env : withFirstOnPath(base.env, paths.dirname(chosen), base.platform),
    isExecutable:
      chosen === null
        ? base.isExecutable
        : (file) => (same(file, chosen) ? base.isExecutable(file) : Promise.resolve(false)),
    spawn(file, args, options) {
      const child: ChildLike = base.spawn(file, args, options);
      if (args[0] === '-p') record.sessionArgs.push([...args]);
      const decoder = new TextDecoder();
      const split = createLineSplitter((line) => recordLine(record, line));
      child.stdout.on('data', (chunk) =>
        split(typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })),
      );
      return child;
    },
  };
}

/** `env` with `dir` first on `PATH` (on Windows, under whatever case `Path` has there). */
export function withFirstOnPath(env: Env, dir: string, platform: string): Env {
  const delimiter = platform === 'win32' ? ';' : ':';
  const key =
    (platform === 'win32' ? Object.keys(env).find((k) => k.toUpperCase() === 'PATH') : undefined) ??
    'PATH';
  const current = envValue(env, 'PATH', platform);
  return { ...env, [key]: current ? `${dir}${delimiter}${current}` : dir };
}

/** The `--claude` program, resolved; or why it cannot be the one checked. */
export function chosenProgram(
  claudePath: string,
  platform: string,
): { file: string } | { error: string } {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const file = paths.resolve(claudePath);
  const name = paths.basename(file);
  const names = claudeNames(platform);
  const match = names.find((n) =>
    platform === 'win32' ? n.toLowerCase() === name.toLowerCase() : n === name,
  );
  // `findClaude` looks for these names in each folder, so the file is named exactly one of them.
  return match === undefined
    ? { error: `--claude must name a program called ${names.join(' or ')}` }
    : { file: paths.join(paths.dirname(file), match) };
}

/** `loggedIn` and the method's name from `claude auth status`; nothing else it prints. */
export function readAuth(stdout: string): { loggedIn: boolean; method: string | null } | null {
  try {
    const value = JSON.parse(stdout) as unknown;
    if (!isObject(value)) return null;
    return { loggedIn: value.loggedIn === true, method: plain(value.authMethod) };
  } catch {
    return null;
  }
}

/** Names of the person's Claude-related variables the allow-list drops: names only, never values. */
export function droppedClaudeNames(env: Env, platform: string): string[] {
  return Object.keys(env)
    .filter((name) => /^(ANTHROPIC_|CLAUDE_|AWS_|VERTEX_|CLOUD_ML_)/i.test(name))
    .filter((name) => !isAllowedEnvName(name, platform))
    .sort();
}

/** Every `{config}/projects/*\/{id}.jsonl` there is. */
export async function findTranscripts(configDir: string, id: string): Promise<string[]> {
  const projects = path.join(configDir, 'projects');
  let names: string[];
  try {
    names = await readdir(projects);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const name of names) {
    const dir = path.join(projects, name);
    try {
      if ((await readdir(dir)).includes(`${id}.jsonl`)) found.push(path.join(dir, `${id}.jsonl`));
    } catch {
      // A file, not a project folder.
    }
  }
  return found;
}

/**
 * After `forget`: what Claude Code left in the project folder (an empty `memory/`), and whether the
 * folder was removed, as one line. It is removed only when nothing in it holds a file.
 */
export async function tidyProject(dir: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  let empty = true;
  for (const entry of entries) {
    if (!entry.isDirectory() || (await readdir(path.join(dir, entry.name))).length > 0) {
      empty = false;
    }
  }
  if (empty) await rm(dir, { recursive: true, force: true });
  const left = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
  return `its project folder then held: ${left.length === 0 ? 'nothing' : left.join(', ')}; ${empty ? 'removed' : 'kept (it holds files)'}`;
}

// ---- printing ----

/** `text` with the home folder, also as Claude Code encodes it in a project name, written `~`. */
export function redact(text: string, homeDir: string): string {
  if (homeDir.length < 2) return text;
  const encoded = homeDir.replace(/[^A-Za-z0-9]/g, '-');
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .replace(new RegExp(escape(homeDir), 'gi'), '~')
    .replace(new RegExp(escape(encoded), 'gi'), '~');
}

/** A reply, on one line, cut to 80 characters, in quotes. */
export function quoteReply(texts: readonly string[]): string {
  const joined = texts.join(' ').replace(/\s+/g, ' ').trim();
  return `"${joined.length > 80 ? `${joined.slice(0, 79)}…` : joined}"`;
}

export function formatStep(step: StepResult, homeDir: string): string {
  const lines = [
    `${step.status.padEnd(5)} ${step.title}`,
    ...step.details.map((d) => `      ${d}`),
  ];
  return `${redact(lines.join('\n'), homeDir)}\n`;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** The block the maintainer pastes into the checklist note. */
export function formatSummary(
  report: CheckReport,
  meta: { date: string; system: string; homeDir: string },
): string {
  const failed = report.steps.filter((s) => s.status === 'FAIL');
  const counted = report.steps.filter((s) => s.status === 'PASS' || s.status === 'FAIL');
  const lines = [
    '----- DSK-26 signed-in check: paste from here -----',
    `Date: ${meta.date}`,
    `System: ${meta.system}`,
    ...report.steps.flatMap((s) => [
      `${s.status.padEnd(5)} ${s.title}`,
      ...s.details.map((d) => `      ${d}`),
    ]),
    report.passed
      ? `Result: PASS (${counted.length} of ${counted.length} checks passed)`
      : `Result: FAIL (${failed.map((s) => s.title).join('; ')})`,
    '----- to here -----',
  ];
  return `${redact(lines.join('\n'), meta.homeDir)}\n`;
}

// ---- the run ----

interface TurnRecord {
  /** `timeout`: no end within `turnMs`; `not_sent`: the session was not running. */
  outcome: TurnOutcome | 'timeout' | 'not_sent';
  texts: string[];
  activities: string[];
  toolCalls: string[];
  errors: Extract<AgentEvent, { type: 'error' }>[];
  agentSessionId: string | null;
  /** Milliseconds from the message to the first tool call, to the end; to Stop and its end. */
  firstToolMs: number | null;
  endMs: number;
  stop: { atMs: number; on: string; endedAfterMs: number } | null;
}

/** The window's half, as the check plays it: events in a list, `ping` answered, or held. */
function createWindow(clock: AgentPlatform['clock'], now: () => number) {
  const events: { event: AgentEvent; at: number }[] = [];
  let listeners: (() => void)[] = [];
  let holding = false;
  const held: AgentToolCall[] = [];
  let manager: AgentManager | null = null;

  const answer = (call: AgentToolCall) =>
    (manager as AgentManager).toolResult(call.sessionId, call.callId, { text: PING_WORD });

  const sender: EventSender = {
    send<E extends EventName>(name: E, payload: BridgeEvents[E]) {
      if (name === 'agent.onEvent') {
        events.push({ event: payload as AgentEvent, at: now() });
        const due = listeners;
        listeners = [];
        due.forEach((listener) => listener());
      } else {
        // `agent.onToolCall`: the only other event the agent bridge sends.
        const call = payload as AgentToolCall;
        if (holding) held.push(call);
        else answer(call);
      }
      return true;
    },
  };

  /** The first event from `from` on that `match` accepts, or null after `ms`. */
  const wait = (
    match: (e: AgentEvent) => boolean,
    from: number,
    ms: number,
  ): Promise<{ event: AgentEvent; at: number } | null> =>
    new Promise((resolve) => {
      const look = () => {
        const hit = events.slice(from).find((e) => match(e.event));
        if (hit === undefined) {
          listeners.push(look);
          return;
        }
        clock.clearTimeout(timer);
        resolve(hit);
      };
      const timer = clock.setTimeout(() => {
        listeners = listeners.filter((listener) => listener !== look);
        resolve(null);
      }, ms);
      look();
    });

  return {
    sender,
    events,
    wait,
    attach(next: AgentManager) {
      manager = next;
    },
    hold() {
      holding = true;
    },
    release() {
      holding = false;
      held.splice(0).forEach(answer);
    },
  };
}

type CheckWindow = ReturnType<typeof createWindow>;

const isEnd = (e: AgentEvent) => e.type === 'turn_end';

async function runTurn(
  manager: AgentManager,
  window: CheckWindow,
  message: string,
  options: { stop: boolean; timeouts: CheckTimeouts; now: () => number },
): Promise<TurnRecord> {
  const { timeouts, now } = options;
  const from = window.events.length;
  const started = now();
  let stop: TurnRecord['stop'] = null;
  let stopAt = 0;
  let stopOn = '';
  if (options.stop) window.hold();
  const record = (outcome: TurnRecord['outcome']): TurnRecord => {
    const slice = window.events.slice(from);
    const of = <T extends AgentEvent['type']>(type: T) =>
      slice.filter((e) => e.event.type === type) as {
        event: Extract<AgentEvent, { type: T }>;
        at: number;
      }[];
    const firstTool = of('tool_call')[0];
    const end = of('turn_end')[0];
    if (stopOn !== '') {
      stop = { atMs: stopAt - started, on: stopOn, endedAfterMs: (end?.at ?? now()) - stopAt };
    }
    return {
      outcome,
      texts: of('text').map((e) => e.event.text),
      activities: of('activity').map((e) => e.event.text),
      toolCalls: of('tool_call').map((e) => e.event.name),
      errors: of('error').map((e) => e.event),
      agentSessionId: end?.event.agentSessionId ?? null,
      firstToolMs: firstTool === undefined ? null : firstTool.at - started,
      endMs: (end?.at ?? now()) - started,
      stop,
    };
  };
  try {
    manager.send(CHECK_SESSION.sessionId, message);
  } catch {
    window.release();
    return record('not_sent');
  }
  if (options.stop) {
    const first = await window.wait((e) => e.type !== 'error', from, timeouts.stopAfterMs);
    if (first === null || first.event.type !== 'turn_end') {
      stopAt = now();
      stopOn =
        first === null
          ? `nothing in ${seconds(timeouts.stopAfterMs)}`
          : first.event.type === 'tool_call'
            ? `the ${first.event.name} call`
            : `the first ${first.event.type}`;
      manager.stop(CHECK_SESSION.sessionId);
    }
    // A held call answered now goes nowhere when Stop ended the request, as in the app.
    window.release();
  }
  const end = await window.wait(isEnd, from, timeouts.turnMs);
  if (end === null) {
    manager.stop(CHECK_SESSION.sessionId);
    window.release();
    return record('timeout');
  }
  return record((end.event as Extract<AgentEvent, { type: 'turn_end' }>).outcome);
}

function turnDetails(turn: TurnRecord): string[] {
  const details = [];
  if (turn.outcome === 'timeout') details.push('no end of the turn in time; Stop was sent');
  else if (turn.outcome === 'not_sent') details.push('not sent: the session was not running');
  else details.push(`turn: ${turn.outcome} after ${seconds(turn.endMs)}`);
  for (const e of turn.errors) details.push(`the app was told: ${shape(e.error)}`);
  return details;
}

const skip = (title: string, why: string): StepResult => ({
  title,
  status: 'SKIP',
  details: [why],
});

export const STEP_TITLES = {
  find: 'Find claude',
  version: 'claude --version',
  auth: 'claude auth status',
  status: 'agent.status, as the app asks',
  start: 'Start a session (pinned flags, allow-listed environment, temporary folder)',
  roundTrip: 'One message, one gurukul tool call over the HTTP endpoint',
  skill: 'A skill from --plugin-dir',
  stop: 'Stop mid-turn (interrupt)',
  resume: 'Resume with --resume; the history is there',
  limits: 'Plan-limit events',
  transcript: 'Where Claude Code wrote the transcript; removed',
} as const;

const SESSION_STEPS = [
  STEP_TITLES.start,
  STEP_TITLES.roundTrip,
  STEP_TITLES.skill,
  STEP_TITLES.stop,
  STEP_TITLES.resume,
  STEP_TITLES.limits,
  STEP_TITLES.transcript,
];

export async function runSignedInCheck(options: SignedInCheckOptions): Promise<CheckReport> {
  const { write, now } = options;
  const timeouts = options.timeouts ?? CHECK_TIMEOUTS;
  const homeDir = options.platform.homeDir;
  const steps: StepResult[] = [];
  const add = (step: StepResult) => {
    steps.push(step);
    write(formatStep(step, homeDir));
    return step.status !== 'FAIL';
  };
  const finish = (): CheckReport => {
    const report = { steps, passed: steps.every((s) => s.status !== 'FAIL') };
    write(`\n${formatSummary(report, { date: options.date, system: options.system, homeDir })}`);
    return report;
  };
  const skipAll = (titles: readonly string[], why: string) =>
    titles.forEach((title) => add(skip(title, why)));

  // ---- find, version, sign-in: no plan used ----

  let chosen: string | null = null;
  if (options.claudePath !== null) {
    const program = chosenProgram(options.claudePath, options.platform.platform);
    if ('error' in program) {
      add({ title: STEP_TITLES.find, status: 'FAIL', details: [program.error] });
      skipAll(
        [STEP_TITLES.version, STEP_TITLES.auth, STEP_TITLES.status, ...SESSION_STEPS],
        'needs claude',
      );
      return finish();
    }
    chosen = program.file;
  }
  const record = emptyRecord();
  const platform = tappedPlatform(options.platform, record, chosen);
  const paths = platform.platform === 'win32' ? path.win32 : path.posix;
  const file = await findClaude(platform.env, platform.platform, platform.isExecutable);
  if (file === null) {
    add({
      title: STEP_TITLES.find,
      status: 'FAIL',
      details: [
        chosen === null
          ? `no ${claudeNames(platform.platform).join(' or ')} on PATH`
          : `${chosen} is not there, or may not be run`,
      ],
    });
    skipAll(
      [STEP_TITLES.version, STEP_TITLES.auth, STEP_TITLES.status, ...SESSION_STEPS],
      'needs claude',
    );
    return finish();
  }
  const name = paths.basename(file).toLowerCase();
  add({
    title: STEP_TITLES.find,
    status: 'PASS',
    details: [
      `program: ${paths.basename(file)}${name.endsWith('.cmd') ? ' (npm install, started through cmd.exe)' : name.endsWith('.exe') ? ' (native install)' : ''}`,
      `folder: ${paths.dirname(file)}`,
      `path has spaces: ${file.includes(' ') ? 'yes' : 'no'}`,
    ],
  });

  const commandOptions = { cwd: homeDir, env: childEnv(platform.env, platform.platform) };
  const version = await runCommand(
    platform.spawn,
    platform.clock,
    file,
    ['--version'],
    commandOptions,
    COMMAND_TIMEOUT_MS,
  );
  const parsed = version === null || version.code !== 0 ? null : parseVersion(version.stdout);
  if (
    !add({
      title: STEP_TITLES.version,
      status: parsed !== null && isAtLeast(parsed, MIN_CLAUDE_VERSION) ? 'PASS' : 'FAIL',
      details: [
        parsed === null
          ? 'printed no version (did not run, or ended with an error)'
          : `version ${parsed}; the pinned flags were checked on ${MIN_CLAUDE_VERSION}`,
      ],
    })
  ) {
    skipAll([STEP_TITLES.auth, STEP_TITLES.status, ...SESSION_STEPS], 'needs a claude new enough');
    return finish();
  }

  const authOut = await runCommand(
    platform.spawn,
    platform.clock,
    file,
    ['auth', 'status'],
    commandOptions,
    COMMAND_TIMEOUT_MS,
  );
  const auth = authOut === null ? null : readAuth(authOut.stdout);
  const dropped = droppedClaudeNames(platform.env, platform.platform);
  const authPassed = add({
    title: STEP_TITLES.auth,
    status: auth?.loggedIn === true ? 'PASS' : 'FAIL',
    details: [
      ...(auth === null
        ? ['printed no JSON']
        : [`signed in: ${auth.loggedIn ? 'yes' : 'no'}`, `method: ${auth.method ?? 'not said'}`]),
      `run with the allow-listed environment; Claude variables dropped: ${dropped.length === 0 ? 'none' : dropped.join(', ')}`,
    ],
  });

  const warnings: string[] = [];
  const log = createLogger({
    level: 'warn',
    sink: (_level, event, fields: LogFields) => {
      warnings.push([event, plain(fields.reason), plain(fields.code)].filter(Boolean).join(' '));
    },
  });
  const window = createWindow(platform.clock, now);
  const root = await mkdtemp(path.join(options.tempDir, 'Gurukul check '));
  const manager = createAgentManager({
    platform,
    sessionsRoot: path.join(root, 'sessions'),
    events: window.sender,
    log,
  });
  window.attach(manager);

  try {
    const status = await manager.status();
    const statusPassed = add({
      title: STEP_TITLES.status,
      status: status.state === 'ready' ? 'PASS' : 'FAIL',
      details: [`state: ${status.state}`],
    });
    if (!authPassed || !statusPassed) {
      skipAll(SESSION_STEPS, 'needs a signed-in claude');
      return finish();
    }
    await sessionSteps({ manager, window, record, platform, add, now, timeouts });
    if (warnings.length > 0) {
      add({ title: 'Bridge warnings', status: 'INFO', details: [...new Set(warnings)] });
    }
    return finish();
  } finally {
    manager.closeAll();
    await rm(root, { recursive: true, force: true });
  }
}

interface SessionContext {
  manager: AgentManager;
  window: CheckWindow;
  record: StreamRecord;
  platform: AgentPlatform;
  add(step: StepResult): boolean;
  now(): number;
  timeouts: CheckTimeouts;
}

async function sessionSteps(ctx: SessionContext): Promise<void> {
  const { manager, window, record, platform, add, now, timeouts } = ctx;
  const request: AgentStartRequest = {
    ...CHECK_SESSION,
    systemPrompt: CHECK_PROMPT,
    skills: [CHECK_SKILL],
    tools: [PING_TOOL],
    resumeId: null,
  };

  const started = await manager.start(request);
  const args = record.sessionArgs.flat();
  if (
    !add({
      title: STEP_TITLES.start,
      status: started.ok && record.tokenSource !== 'none' ? 'PASS' : 'FAIL',
      details: [
        started.ok ? 'started' : `not started: ${shape(started.error)}`,
        `initialize: tokenSource ${record.tokenSource ?? 'not reported'}${record.apiKeySource === null ? '' : `, apiKeySource ${record.apiKeySource}`}`,
        `command line: claudeArgs, ${args.length} arguments; session files in a temporary folder whose path has spaces`,
      ],
    }) ||
    !started.ok
  ) {
    SESSION_STEPS.slice(1).forEach((title) => add(skip(title, 'needs a started session')));
    return;
  }
  const agentSessionId = started.agentSessionId;

  try {
    const trip = await runTurn(manager, window, MESSAGES.roundTrip, { stop: false, timeouts, now });
    const init = record.init;
    const answered = trip.texts.join(' ').toLowerCase().includes(PING_WORD);
    add({
      title: STEP_TITLES.roundTrip,
      status:
        trip.outcome === 'done' && trip.toolCalls.includes('ping') && answered ? 'PASS' : 'FAIL',
      details: [
        `gurukul server at the turn's start: ${init?.server ?? 'not listed'}, ${init?.tools ?? 0} tool(s)`,
        trip.firstToolMs === null
          ? 'ping was not called'
          : `ping called ${trip.toolCalls.filter((t) => t === 'ping').length} time(s), first after ${seconds(trip.firstToolMs)}, answered "${PING_WORD}"`,
        `reply: ${quoteReply(trip.texts)} (${answered ? 'has' : 'lacks'} the word)`,
        ...turnDetails(trip),
      ],
    });

    const skillName = `gurukul:${CHECK_SKILL.name}`;
    const listed = init?.skills.includes(skillName) === true;
    add({
      title: STEP_TITLES.skill,
      status: listed ? 'PASS' : 'FAIL',
      details: [
        `${skillName} listed in init: ${listed ? 'yes' : 'no'}${init?.version ? ` (claude_code_version ${init.version})` : ''}`,
        `loaded during the turn: ${trip.activities.includes(`Loading the ${CHECK_SKILL.name} skill`) ? 'yes' : 'no'}`,
      ],
    });

    const spawned = record.sessionArgs.length;
    const stopped = await runTurn(manager, window, MESSAGES.stop, { stop: true, timeouts, now });
    const again = await manager.start(request);
    const kept = again.ok && record.sessionArgs.length === spawned;
    add({
      title: STEP_TITLES.stop,
      status: stopped.outcome === 'stopped' && kept ? 'PASS' : 'FAIL',
      details: [
        stopped.stop === null
          ? 'the turn ended before Stop was sent'
          : `Stop sent ${seconds(stopped.stop.atMs)} into the turn, on ${stopped.stop.on}; the turn ended ${seconds(stopped.stop.endedAfterMs)} later`,
        ...turnDetails(stopped),
        `process kept for the next message: ${kept ? 'yes' : 'no'}`,
      ],
    });

    await manager.close(CHECK_SESSION.sessionId);
    const resumed = await manager.start({ ...request, tools: [], resumeId: agentSessionId });
    const recalled = resumed.ok
      ? await runTurn(manager, window, MESSAGES.resume, { stop: false, timeouts, now })
      : null;
    const remembered = recalled?.texts.join(' ').toLowerCase().includes(PING_WORD) === true;
    add({
      title: STEP_TITLES.resume,
      status:
        recalled?.outcome === 'done' && remembered && recalled.agentSessionId === agentSessionId
          ? 'PASS'
          : 'FAIL',
      details: [
        resumed.ok
          ? 'started again with --resume and no tools'
          : `not started: ${shape(resumed.error)}`,
        ...(recalled === null
          ? []
          : [
              `reply: ${quoteReply(recalled.texts)} (${remembered ? 'remembers' : 'does not remember'} the word)`,
              `same Claude session id: ${recalled.agentSessionId === agentSessionId ? 'yes' : 'no'}`,
              ...turnDetails(recalled),
            ]),
      ],
    });
  } finally {
    await manager.close(CHECK_SESSION.sessionId);
  }

  add({
    title: STEP_TITLES.limits,
    status: 'INFO',
    details:
      record.limits.length === 0
        ? ['none arrived (expected while the plan has room)']
        : [...new Set(record.limits)],
  });

  const configDir = claudeConfigDir(platform.env, platform.platform, platform.homeDir);
  const found = await findTranscripts(configDir, agentSessionId);
  // What `agent.forget` does when a session is retired after 30 days.
  const forgot = await manager.forget(agentSessionId).then(
    () => 'agent.forget: done',
    (error: unknown) => `agent.forget failed: ${shape((error as { code?: unknown }).code)}`,
  );
  const left = await findTranscripts(configDir, agentSessionId);
  const tidied = [];
  for (const transcript of found.filter((f) => !left.includes(f))) {
    tidied.push(await tidyProject(path.dirname(transcript)));
  }
  add({
    title: STEP_TITLES.transcript,
    status: found.length > 0 && left.length === 0 ? 'PASS' : 'FAIL',
    details: [
      ...(found.length === 0
        ? [`no ${agentSessionId}.jsonl under ${path.join(configDir, 'projects')}`]
        : found.map((f) => `written: ${f}`)),
      `${forgot}; ${left.length === 0 ? 'gone' : `still there: ${left.join(', ')}`}`,
      ...tidied,
    ],
  });
}
