import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ENV,
  BRIDGE_TOKEN_ENV,
  MIN_CLAUDE_VERSION,
  childEnv,
  claudeArgs,
  envValue,
  isAllowedEnvName,
  isAtLeast,
  parseVersion,
} from '../../src/agent/launch';

const files = { promptFile: '/s/prompt.md', pluginDir: '/s/skills', mcpConfig: '/s/mcp.json' };

describe('the allow-listed environment', () => {
  it('is the plan’s list, and nothing that steers or bills claude', () => {
    expect(ALLOWED_ENV).toEqual([
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
    ]);
    for (const name of [
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_MODEL',
      'CLAUDE_CODE_USE_BEDROCK',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'AWS_PROFILE',
      'NODE_OPTIONS',
      'ELECTRON_RUN_AS_NODE',
      BRIDGE_TOKEN_ENV,
    ]) {
      expect(isAllowedEnvName(name, 'darwin')).toBe(false);
      expect(isAllowedEnvName(name, 'win32')).toBe(false);
    }
  });

  it('takes the locale family by prefix', () => {
    expect(isAllowedEnvName('LC_ALL', 'linux')).toBe(true);
    expect(isAllowedEnvName('LC_CTYPE', 'darwin')).toBe(true);
    expect(isAllowedEnvName('LCX', 'linux')).toBe(false);
  });

  it('matches names in any case on Windows only', () => {
    expect(isAllowedEnvName('Path', 'win32')).toBe(true);
    expect(isAllowedEnvName('SYSTEMROOT', 'win32')).toBe(true);
    expect(isAllowedEnvName('lc_all', 'win32')).toBe(true);
    expect(isAllowedEnvName('Path', 'linux')).toBe(false);
    expect(isAllowedEnvName('https_proxy', 'darwin')).toBe(false);
  });

  it('builds the child’s environment from the allowed names, with a fresh token', () => {
    const source = {
      PATH: '/usr/bin',
      HOME: '/home/meera',
      LANG: undefined,
      ANTHROPIC_BASE_URL: 'http://elsewhere',
      [BRIDGE_TOKEN_ENV]: 'stale',
    };
    expect(childEnv(source, 'linux', 'fresh')).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/meera',
      [BRIDGE_TOKEN_ENV]: 'fresh',
    });
    expect(childEnv(source, 'linux')).toEqual({ PATH: '/usr/bin', HOME: '/home/meera' });
  });

  it('reads a variable in any case on Windows', () => {
    expect(envValue({ Path: 'C:\\bin' }, 'PATH', 'win32')).toBe('C:\\bin');
    expect(envValue({ Path: 'C:\\bin' }, 'PATH', 'linux')).toBeUndefined();
    expect(envValue({}, 'PATH', 'win32')).toBeUndefined();
    expect(envValue({ PATH: '/bin' }, 'PATH', 'linux')).toBe('/bin');
  });
});

describe('claudeArgs', () => {
  it('pins every flag, with --session-id on the first start', () => {
    expect(claudeArgs(files, { sessionId: 'id-1' })).toEqual([
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--append-system-prompt-file',
      '/s/prompt.md',
      '--plugin-dir',
      '/s/skills',
      '--mcp-config',
      '/s/mcp.json',
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
      '--session-id',
      'id-1',
    ]);
  });

  it('resumes on a later start', () => {
    expect(claudeArgs(files, { resumeId: 'id-1' }).slice(-2)).toEqual(['--resume', 'id-1']);
  });
});

describe('versions', () => {
  it('reads what claude --version prints', () => {
    expect(parseVersion('2.1.328 (Claude Code)\n')).toBe('2.1.328');
    expect(parseVersion('v3.0.1')).toBe('3.0.1');
    expect(parseVersion('Claude Code')).toBeNull();
  });

  it('compares number by number', () => {
    expect(isAtLeast(MIN_CLAUDE_VERSION, MIN_CLAUDE_VERSION)).toBe(true);
    expect(isAtLeast('2.1.1000', '2.1.328')).toBe(true);
    expect(isAtLeast('2.2.0', '2.1.328')).toBe(true);
    expect(isAtLeast('2.1.99', '2.1.328')).toBe(false);
    expect(isAtLeast('1.9.999', '2.1.328')).toBe(false);
  });
});
