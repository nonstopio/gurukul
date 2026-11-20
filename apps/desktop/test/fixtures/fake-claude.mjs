// A fake `claude` for the agent bridge's tests (and DSK-24's end to end). It speaks the stream-json
// Claude Code 2.1.328 printed in the DSK-04 spike (.plan/22-desktop-studio.md, Spike findings) and
// makes its tool calls over the real HTTP MCP endpoint named in `mcp.json`, with the token from
// `GURUKUL_BRIDGE_TOKEN`. It never calls Anthropic.
//
// Run it as `claude`: put a wrapper named `claude` on PATH that runs `node fake-claude.mjs "$@"`
// (test/agent/fakeClaude.ts does). The bridge passes only its allow-listed environment, so the
// script is steered through a file in `CLAUDE_CONFIG_DIR`, which is on the list:
//
//   $CLAUDE_CONFIG_DIR/fake-claude.json   the scenario (below); missing means signed in, "Done."
//   $CLAUDE_CONFIG_DIR/fake-claude-runs.jsonl   one line per start: argv, environment names, cwd
//   $CLAUDE_CONFIG_DIR/projects/<cwd, non-alphanumerics as ->/<session id>.jsonl   the transcript
//
// Scenario: { "version": "2.1.328", "loggedIn": true, "apiKeySource": "…" (in `initialize`),
// "turns": [[step, …], …], "resumeTurns": … }.
// Turn n of a process plays turns[n] (the last one again when there are fewer); a process started
// with --resume plays resumeTurns instead, when the scenario has them. Steps:
//   { "text": "…" }                 an assistant text block
//   { "thinking": true }            a thinking block
//   { "skill": "humanize" }         the Skill tool loading gurukul:humanize
//   { "tool": "get_course", "input": {…} }  a call through the MCP endpoint; the answer's text is
//                                    then said back as "tool: <text>" (or "tool error: <text>").
//                                    "capture": { "chapter": "Added chapter (\\S+)" } keeps the
//                                    first group of each pattern found in the answer, and a later
//                                    input's "${chapter}" is replaced by it (ids the app makes).
//                                    An interrupt while the call is pending cancels the request
//                                    and ends the turn; with "waitsForAnswer": true the turn
//                                    ends only once the answer is in. Which of the two the real
//                                    `claude` does is for the signed-in check (DSK-26) to find.
//   { "listTools": true }           says the endpoint's tool names, comma-separated
//   { "waitForInterrupt": true }    waits until an `interrupt` control request ends the turn
//   { "apiRetry": "rate_limit" }    api_retry events every 20 ms until interrupted (10, then fails)
//   { "rateLimitEvent": {…} }       a rate_limit_event with that rate_limit_info
//   { "controlRequest": true }      asks the bridge a control request and waits for its answer
//   { "exit": 3 }                   exits at once with that code
//   { "recall": true }              says back the last tool result in the transcript (history kept)
//   { "echoPrompt": true }          says back the words of the message that started the turn
//   { "hang": true }                never answers, even with its input closed, until killed
// A one-shot `agent.ask` (DSK-18) starts it with neither --session-id nor --resume, no
// --append-system-prompt-file, no --mcp-config and --no-session-persistence: it then gets a new
// session id, keeps no transcript file, offers no tools (`--tools ""`) and answers turns[0].
// Signed out ("loggedIn": false), `initialize` answers tokenSource "none" and every turn fails as
// the spike recorded: an assistant error `authentication_failed`, then an error result.

import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const argv = process.argv.slice(2);
const configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(process.env.HOME ?? '.', '.claude');
const scenarioFile = path.join(configDir, 'fake-claude.json');
const scenario = existsSync(scenarioFile) ? JSON.parse(readFileSync(scenarioFile, 'utf8')) : {};
const version = scenario.version ?? '2.1.328';
const loggedIn = scenario.loggedIn ?? true;

if (argv[0] === '--version') {
  process.stdout.write(`${version} (Claude Code)\n`);
  process.exit(0);
}
if (argv[0] === 'auth' && argv[1] === 'status') {
  process.stdout.write(
    `${JSON.stringify({ loggedIn, authMethod: loggedIn ? 'claude.ai' : 'none' }, null, 2)}\n`,
  );
  process.exit(loggedIn ? 0 : 1);
}

// ---- flags, as strictly as Claude Code checks them ----

const VALUED = new Set([
  '--input-format',
  '--output-format',
  '--append-system-prompt-file',
  '--plugin-dir',
  '--mcp-config',
  '--setting-sources',
  '--tools',
  '--allowedTools',
  '--permission-mode',
  '--system-prompt-snapshot',
  '--session-id',
  '--resume',
]);
const SWITCHES = new Set(['-p', '--verbose', '--strict-mcp-config', '--no-session-persistence']);
const flags = {};
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (SWITCHES.has(arg)) flags[arg] = true;
  else if (VALUED.has(arg) && i + 1 < argv.length) flags[arg] = argv[(i += 1)];
  else fail(`error: unknown option '${arg}'`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (flags['--output-format'] === 'stream-json' && !flags['--verbose']) {
  fail('Error: When using --print, --output-format=stream-json requires --verbose');
}
if (
  flags['--append-system-prompt-file'] !== undefined &&
  !existsSync(flags['--append-system-prompt-file'])
) {
  fail('Error: Append system prompt file not found');
}
const persist = !flags['--no-session-persistence'];

const projectDir = path.join(configDir, 'projects', process.cwd().replace(/[^A-Za-z0-9]/g, '-'));
const transcriptOf = (id) => {
  const projects = path.join(configDir, 'projects');
  if (!existsSync(projects)) return null;
  for (const dir of readdirSync(projects)) {
    const file = path.join(projects, dir, `${id}.jsonl`);
    if (existsSync(file)) return file;
  }
  return null;
};

let sessionId;
if (flags['--resume'] !== undefined) {
  if (!persist) fail('Error: --resume cannot be used with --no-session-persistence');
  sessionId = flags['--resume'];
  if (transcriptOf(sessionId) === null) fail(`No conversation found with session ID: ${sessionId}`);
} else if (flags['--session-id'] !== undefined) {
  sessionId = flags['--session-id'];
  if (transcriptOf(sessionId) !== null) fail(`Error: Session ID ${sessionId} is already in use.`);
} else {
  sessionId = randomUUID();
}
const transcript = path.join(projectDir, `${sessionId}.jsonl`);
// Without persistence the chat lives only in memory, as Claude Code keeps none on disk.
const memory = [];
const keep = (text) => (persist ? appendFileSync(transcript, text) : memory.push(text));
const kept = () => (persist ? readFileSync(transcript, 'utf8') : memory.join(''));
if (persist) {
  mkdirSync(path.join(projectDir, 'memory'), { recursive: true });
  appendFileSync(transcript, '');
}

mkdirSync(configDir, { recursive: true });
appendFileSync(
  path.join(configDir, 'fake-claude-runs.jsonl'),
  `${JSON.stringify({ argv, env: Object.keys(process.env).sort(), cwd: process.cwd() })}\n`,
);

// ---- the MCP endpoint ----

let mcp = null;
let mcpStatus = 'pending';
async function connect() {
  if (flags['--mcp-config'] === undefined) {
    mcpStatus = 'none';
    return;
  }
  const config = JSON.parse(readFileSync(flags['--mcp-config'], 'utf8')).mcpServers.gurukul;
  const headers = Object.fromEntries(
    Object.entries(config.headers ?? {}).map(([k, v]) => [
      k,
      v.replace(/\$\{([A-Z_]+)\}/g, (_, name) => process.env[name] ?? ''),
    ]),
  );
  const client = new Client({ name: 'fake-claude', version });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers } }),
    );
    mcp = client;
    mcpStatus = 'connected';
  } catch {
    mcpStatus = 'failed';
  }
}
const connecting = connect();

// ---- output ----

function print(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  keep(`${JSON.stringify(value)}\n`);
}
const assistant = (content, extra = {}) =>
  print({
    type: 'assistant',
    message: { role: 'assistant', content },
    session_id: sessionId,
    ...extra,
  });
const result = (subtype, isError, terminalReason) =>
  print({
    type: 'result',
    subtype,
    is_error: isError,
    terminal_reason: terminalReason,
    session_id: sessionId,
    total_cost_usd: 0,
  });

// ---- turns ----

/** The `--plugin-dir` skills, as Claude Code lists them: `gurukul:<name>`. */
function pluginSkills() {
  const dir = path.join(flags['--plugin-dir'] ?? '', 'skills');
  return existsSync(dir) ? readdirSync(dir).map((name) => `gurukul:${name}`) : [];
}

let turnIndex = 0;
let interrupted = null; // resolves the wait of the turn in progress
let turnRunning = false;
let lastFailed = false;
const pendingControls = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** What `capture` kept, by name, for the rest of this process. */
const captured = {};
/** A tool input with every "${name}" in its strings replaced by what `capture` kept. */
function withCaptured(value) {
  if (typeof value === 'string') {
    return value.replace(/\$\{(\w+)\}/g, (whole, name) => captured[name] ?? whole);
  }
  if (Array.isArray(value)) return value.map(withCaptured);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withCaptured(v)]));
  }
  return value;
}

async function runStep(step, state) {
  if (step.text !== undefined) assistant([{ type: 'text', text: step.text }]);
  else if (step.thinking) assistant([{ type: 'thinking', thinking: '…' }]);
  else if (step.skill !== undefined) {
    assistant([
      {
        type: 'tool_use',
        id: `toolu_${state.n++}`,
        name: 'Skill',
        input: { skill: `gurukul:${step.skill}` },
      },
    ]);
  } else if (step.tool !== undefined) {
    const id = `toolu_${state.n++}`;
    const input = withCaptured(step.input ?? {});
    assistant([{ type: 'tool_use', id, name: `mcp__gurukul__${step.tool}`, input }]);
    const request = new AbortController();
    const call = mcp.callTool({ name: step.tool, arguments: input }, undefined, {
      signal: request.signal,
    });
    const answer = step.waitsForAnswer
      ? await call
      : await Promise.race([call, new Promise((resolve) => (interrupted = () => resolve(null)))]);
    if (answer === null) {
      request.abort();
      state.aborted = true;
      return;
    }
    const text = answer.content.map((c) => c.text).join('');
    for (const [name, pattern] of Object.entries(step.capture ?? {})) {
      const found = new RegExp(pattern).exec(text);
      if (found) captured[name] = found[1];
    }
    print({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: id,
            content: text,
            is_error: answer.isError === true,
          },
        ],
      },
      session_id: sessionId,
    });
    assistant([{ type: 'text', text: `${answer.isError ? 'tool error' : 'tool'}: ${text}` }]);
  } else if (step.listTools) {
    const tools = mcp ? (await mcp.listTools()).tools : [];
    assistant([{ type: 'text', text: tools.map((t) => t.name).join(',') || 'none' }]);
  } else if (step.waitForInterrupt) {
    await new Promise((resolve) => (interrupted = resolve));
    state.aborted = true;
  } else if (step.apiRetry !== undefined) {
    for (let attempt = 1; attempt <= 10 && !state.aborted; attempt += 1) {
      print({
        type: 'system',
        subtype: 'api_retry',
        attempt,
        max_retries: 10,
        retry_delay_ms: 20,
        error: step.apiRetry,
        session_id: sessionId,
      });
      await Promise.race([sleep(20), new Promise((resolve) => (interrupted = resolve))]);
      if (state.interrupt) state.aborted = true;
    }
    if (!state.aborted) state.failed = true;
  } else if (step.rateLimitEvent !== undefined) {
    print({
      type: 'rate_limit_event',
      rate_limit_info: step.rateLimitEvent,
      session_id: sessionId,
    });
  } else if (step.controlRequest) {
    const requestId = `req_${state.n++}`;
    const answered = new Promise((resolve) => pendingControls.set(requestId, resolve));
    print({
      type: 'control_request',
      request_id: requestId,
      request: { subtype: 'can_use_tool', tool_name: 'Bash', input: {} },
    });
    const response = await answered;
    assistant([{ type: 'text', text: `control: ${response.subtype}` }]);
  } else if (step.exit !== undefined) {
    process.exit(step.exit);
  } else if (step.hang) {
    // A timer keeps Node from exiting once the input has closed and nothing else is pending.
    setInterval(() => undefined, 1000);
    await new Promise(() => undefined);
  } else if (step.echoPrompt) {
    const words = state.message.message.content.map((c) => c.text).join('');
    assistant([{ type: 'text', text: words }]);
  } else if (step.recall) {
    const results = kept()
      .split('\n')
      .filter((l) => l.includes('"tool_result"'))
      .map((l) => JSON.parse(l).message.content[0].content);
    assistant([{ type: 'text', text: results.at(-1) ?? 'I remember nothing.' }]);
  }
}

async function runTurn(message) {
  keep(`${JSON.stringify(message)}\n`);
  await connecting;
  print({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    cwd: process.cwd(),
    tools:
      flags['--tools'] === ''
        ? []
        : [
            'Skill',
            ...(mcp ? (await mcp.listTools()).tools.map((t) => `mcp__gurukul__${t.name}`) : []),
          ],
    mcp_servers: mcpStatus === 'none' ? [] : [{ name: 'gurukul', status: mcpStatus }],
    skills: pluginSkills(),
    claude_code_version: version,
  });
  const state = { n: 0, aborted: false, failed: false, interrupt: false, message };
  currentTurn = state;
  if (!loggedIn) {
    assistant([{ type: 'text', text: 'Not logged in · Please run /login' }], {
      error: 'authentication_failed',
    });
    result('success', true, 'api_error');
    lastFailed = true;
    return;
  }
  const resumed = flags['--resume'] !== undefined && scenario.resumeTurns !== undefined;
  const turns = (resumed ? scenario.resumeTurns : scenario.turns) ?? [[{ text: 'Done.' }]];
  const steps = turns[Math.min(turnIndex, turns.length - 1)] ?? [];
  turnIndex += 1;
  for (const step of steps) {
    if (state.aborted) break;
    await runStep(step, state);
  }
  if (state.aborted) {
    print({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] },
      session_id: sessionId,
    });
    result('error_during_execution', true, 'aborted_streaming');
  } else if (state.failed) {
    result('error_during_execution', true, 'api_error');
  } else {
    result('success', false, 'completed');
  }
  lastFailed = state.aborted || state.failed;
}

let currentTurn = null;
let queue = Promise.resolve();
const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  if (line.trim() === '') return;
  const msg = JSON.parse(line);
  if (msg.type === 'control_request') {
    const { subtype } = msg.request;
    let response = {};
    if (subtype === 'initialize') {
      response = {
        commands: [],
        account: {
          email: 'meera@example.com',
          tokenSource: loggedIn ? 'claude.ai' : 'none',
          ...(scenario.apiKeySource ? { apiKeySource: scenario.apiKeySource } : {}),
        },
      };
    } else if (subtype === 'interrupt' && turnRunning && currentTurn) {
      currentTurn.interrupt = true;
      currentTurn.aborted = true;
      interrupted?.();
    }
    print({
      type: 'control_response',
      response: { subtype: 'success', request_id: msg.request_id, response },
    });
  } else if (msg.type === 'control_response') {
    pendingControls.get(msg.response.request_id)?.(msg.response);
  } else if (msg.type === 'user') {
    queue = queue.then(async () => {
      turnRunning = true;
      await runTurn(msg);
      turnRunning = false;
      currentTurn = null;
    });
  }
});
input.on('close', () => {
  // Closing stdin: the turn in progress finishes, then the process exits.
  void queue.then(() => process.exit(lastFailed ? 1 : 0));
});
