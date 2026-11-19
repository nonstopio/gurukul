import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AgentSkill } from '../bridge';
import { sessionFolder } from '../store';
import { BRIDGE_TOKEN_ENV, envValue, type Env, type LaunchFiles } from './launch';

/**
 * The files `claude` is started with, in the session's folder (`sessions/{uid}/{sessionId}/`), and
 * Claude Code's own copy of a chat. Only the main process writes these names (`AGENT_SESSION_NAMES`
 * in `bridge.ts`): the window's `store.write` refuses them. Nothing here logs a name or a byte of
 * content: prompts and skills are the web app's, and transcripts hold answer keys.
 */

/** The plugin around the skills: Claude Code shows each one as `gurukul:{name}`. */
export const PLUGIN_MANIFEST = {
  name: 'gurukul',
  version: '1.0.0',
  description: 'Gurukul Studio course-writing skills',
};

export interface SessionFilesInput {
  sessionsRoot: string;
  uid: string;
  sessionId: string;
  systemPrompt: string;
  skills: readonly AgentSkill[];
  /** The endpoint's address, `http://127.0.0.1:{port}/mcp`. */
  endpointUrl: string;
}

/** `mcp.json`: one HTTP server, the token by reference only, expanded by Claude Code. */
export function mcpConfig(endpointUrl: string): string {
  return `${JSON.stringify(
    {
      mcpServers: {
        gurukul: {
          type: 'http',
          url: endpointUrl,
          headers: { Authorization: `Bearer \${${BRIDGE_TOKEN_ENV}}` },
        },
      },
    },
    null,
    2,
  )}\n`;
}

/**
 * Writes `prompt.md`, the `skills` plugin folder (replaced whole, so nothing but this start's skills
 * is in it) and `mcp.json`, and makes the empty working folder. Gives the paths for `claudeArgs`.
 */
export async function writeSessionFiles(
  input: SessionFilesInput,
): Promise<LaunchFiles & { emptyDir: string }> {
  const folder = sessionFolder(input.sessionsRoot, input.uid, input.sessionId);
  const promptFile = path.join(folder, 'prompt.md');
  const pluginDir = path.join(folder, 'skills');
  const mcpFile = path.join(folder, 'mcp.json');
  const emptyDir = path.join(folder, 'workdir');

  await mkdir(folder, { recursive: true });
  await writeFile(promptFile, input.systemPrompt, 'utf8');
  await rm(pluginDir, { recursive: true, force: true });
  await mkdir(path.join(pluginDir, '.claude-plugin'), { recursive: true });
  await writeFile(
    path.join(pluginDir, '.claude-plugin', 'plugin.json'),
    `${JSON.stringify(PLUGIN_MANIFEST, null, 2)}\n`,
    'utf8',
  );
  for (const skill of input.skills) {
    // Names and paths passed `isSafeSegment` / `isSafePath` (args.ts): they stay in the skill folder.
    const skillDir = path.join(pluginDir, 'skills', skill.name);
    for (const file of skill.files) {
      const target = path.join(skillDir, ...file.path.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.text, 'utf8');
    }
  }
  await writeFile(mcpFile, mcpConfig(input.endpointUrl), 'utf8');
  await rm(emptyDir, { recursive: true, force: true });
  await mkdir(emptyDir, { recursive: true });
  return { promptFile, pluginDir, mcpConfig: mcpFile, emptyDir };
}

/** True when `dir` is a folder that exists now. */
export async function isFolder(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

/** Claude Code's own folder: `CLAUDE_CONFIG_DIR` when set, else `~/.claude`. */
export function claudeConfigDir(env: Env, platform: string, homeDir: string): string {
  const configured = envValue(env, 'CLAUDE_CONFIG_DIR', platform);
  return configured !== undefined && configured !== '' ? configured : path.join(homeDir, '.claude');
}

function code(error: unknown): unknown {
  return (error as { code?: unknown }).code;
}

/**
 * Deletes Claude Code's copy of one chat: `{config}/projects/*\/{id}.jsonl` and a folder `{id}`
 * beside it. The project folder's name is Claude Code's encoding of the working folder, so every one
 * is looked in. Never `claude purge`, which would delete every session of that folder. Gives how
 * many were removed; what is not there is no error. `agentSessionId` is a UUID (args.ts).
 */
export async function forgetTranscript(configDir: string, agentSessionId: string): Promise<number> {
  const projects = path.join(configDir, 'projects');
  let entries;
  try {
    entries = await readdir(projects, { withFileTypes: true });
  } catch (error) {
    if (code(error) === 'ENOENT') return 0;
    throw error;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(projects, entry.name);
    try {
      await rm(path.join(dir, `${agentSessionId}.jsonl`));
      removed += 1;
    } catch (error) {
      if (code(error) !== 'ENOENT') throw error;
    }
    await rm(path.join(dir, agentSessionId), { recursive: true, force: true });
  }
  return removed;
}
