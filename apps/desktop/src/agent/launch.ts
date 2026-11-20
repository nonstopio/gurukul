/**
 * How Claude Code is started: the pinned flags, the allow-listed environment and the oldest version
 * they were checked on. `.plan/22-desktop-studio.md` (Starting Claude Code, Spike findings) is the
 * source; a change here changes that section in the same commit.
 */

/** The Claude Code version the flags below were checked on (`DSK-04`). Older is "too old". */
export const MIN_CLAUDE_VERSION = '2.1.328';

/** The variable that carries the endpoint's token into `claude`, and only into it. */
export const BRIDGE_TOKEN_ENV = 'GURUKUL_BRIDGE_TOKEN';

/**
 * The only variables of the app's own environment `claude` is given. Anything else is dropped:
 * `ANTHROPIC_BASE_URL` would send course text and answer keys to another server,
 * `ANTHROPIC_API_KEY` or `CLAUDE_CODE_USE_BEDROCK` would bill someone other than the Educator's plan,
 * `ANTHROPIC_MODEL` would change the model, `NODE_OPTIONS` would load code into it.
 */
export const ALLOWED_ENV = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'CLAUDE_CONFIG_DIR',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
  'NODE_EXTRA_CA_CERTS',
] as const;

/** Prefixes allowed as a family: the locale (`LC_ALL`, `LC_CTYPE`, …). */
export const ALLOWED_ENV_PREFIXES = ['LC_'] as const;

export type Env = Readonly<Record<string, string | undefined>>;

/** True for a variable `claude` may inherit. Windows names are case-insensitive (`Path`). */
export function isAllowedEnvName(name: string, platform: string): boolean {
  const norm = (s: string) => (platform === 'win32' ? s.toUpperCase() : s);
  const n = norm(name);
  return (
    ALLOWED_ENV.some((allowed) => norm(allowed) === n) ||
    ALLOWED_ENV_PREFIXES.some((prefix) => n.startsWith(norm(prefix)))
  );
}

/**
 * The environment for a `claude` process: the allowed variables of `source`, plus the bridge token
 * when there is one. A `GURUKUL_BRIDGE_TOKEN` in `source` is never passed on.
 */
export function childEnv(source: Env, platform: string, token?: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined && isAllowedEnvName(name, platform)) env[name] = value;
  }
  if (token !== undefined) env[BRIDGE_TOKEN_ENV] = token;
  return env;
}

/** A variable of `env` by name; on Windows in any case (`Path` for `PATH`). */
export function envValue(env: Env, name: string, platform: string): string | undefined {
  if (platform !== 'win32') return env[name];
  const key = Object.keys(env).find((k) => k.toUpperCase() === name.toUpperCase());
  return key === undefined ? undefined : env[key];
}

/** The files a session hands `claude`, inside its session folder. */
export interface LaunchFiles {
  promptFile: string;
  pluginDir: string;
  mcpConfig: string;
}

/** First start: a new Claude session id. Later starts: resume the one kept from the first. */
export type LaunchSession = { sessionId: string } | { resumeId: string };

/**
 * The pinned command line, without the program. `--session-id` on the first start (reusing one
 * fails) and `--resume` on every later one. No token and no text from the window is ever an
 * argument: `mcp_status` echoes arguments back.
 */
export function claudeArgs(files: LaunchFiles, session: LaunchSession): string[] {
  return [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--append-system-prompt-file',
    files.promptFile,
    '--plugin-dir',
    files.pluginDir,
    '--mcp-config',
    files.mcpConfig,
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--tools',
    'Skill',
    '--allowedTools',
    'mcp__gurukul__*',
    '--permission-mode',
    'dontAsk',
    '--system-prompt-snapshot',
    'off',
    ...('sessionId' in session
      ? ['--session-id', session.sessionId]
      : ['--resume', session.resumeId]),
  ];
}

/**
 * The pinned command line of a one-shot `agent.ask` (`DSK-18`), without the program. The same
 * stream-json the session uses, with one message and its input then closed; nothing else: no tools
 * at all (`--tools ""`, so no skill loads either), no MCP server (`--strict-mcp-config` with no
 * `--mcp-config`), none of the Educator's settings, hooks, notes or skills (`--setting-sources ""`),
 * `dontAsk` so nothing waits for permission, and no chat kept in Claude Code's folder
 * (`--no-session-persistence`: such a chat cannot be resumed, which a one-shot never is). The prompt
 * goes to `claude`'s input, never an argument.
 */
export function askArgs(): string[] {
  return [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--tools',
    '',
    '--permission-mode',
    'dontAsk',
    '--no-session-persistence',
  ];
}

/** `2.1.328` from `claude --version` (`2.1.328 (Claude Code)`), or null when it says no version. */
export function parseVersion(output: string): string | null {
  const match = /^\s*v?(\d+)\.(\d+)\.(\d+)/.exec(output);
  return match === null ? null : `${match[1]}.${match[2]}.${match[3]}`;
}

/** True when `version` (`x.y.z`) is `minimum` or newer, compared number by number. */
export function isAtLeast(version: string, minimum: string): boolean {
  const a = version.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const x = a[i] as number;
    const y = b[i] as number;
    if (x !== y) return x > y;
  }
  return true;
}
