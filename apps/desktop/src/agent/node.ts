import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import crossSpawn from 'cross-spawn';
import { envValue, type Env } from './launch';
import type { AgentPlatform, ChildLike } from './platform';

/**
 * The real adapters, over Node. `cross-spawn` starts the program: on Windows it runs npm's
 * `claude.cmd` through `cmd.exe` with every argument quoted, which Node's own `spawn` refuses to do
 * safely; elsewhere it is Node's `spawn`. On Windows `kill` ends the program's whole tree
 * (`killTree`). Tested against the fake `claude` in `test/fixtures/`.
 */
export function nodeAgentPlatform(platform: string, env: Env, homeDir: string): AgentPlatform {
  return {
    platform,
    env,
    homeDir,
    spawn: (file, args, options) => {
      const child = crossSpawn(file, [...args], {
        cwd: options.cwd,
        env: options.env,
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
      });
      if (platform === 'win32') killTree(child, taskkillPath(env));
      return child as unknown as ChildLike;
    },
    listen: (handler) =>
      new Promise((resolve, reject) => {
        const server = createServer(handler);
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const { port } = server.address() as { port: number };
          resolve({
            port,
            close: () =>
              new Promise<void>((done) => {
                server.close(() => done());
                server.closeAllConnections();
              }),
          });
        });
      }),
    async isExecutable(file) {
      try {
        if (!(await stat(file)).isFile()) return false;
        if (platform !== 'win32') await access(file, constants.X_OK);
        return true;
      } catch {
        return false;
      }
    },
    clock: {
      setTimeout: (callback, ms) => setTimeout(callback, ms),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
    randomToken: () => randomBytes(32).toString('hex'),
    randomId: () => randomUUID(),
  };
}

/** Windows' own `taskkill.exe`, by its full path so no `PATH` entry can stand in for it. */
export function taskkillPath(env: Env): string {
  const root = envValue(env, 'SystemRoot', 'win32') ?? 'C:\\Windows';
  return path.win32.join(root, 'System32', 'taskkill.exe');
}

/**
 * Makes `child.kill` end the child and everything it started, for Windows. There Node's `kill` is
 * `TerminateProcess` on the one process whatever the signal, and npm's `claude.cmd` runs as
 * `cmd.exe` with `claude` (Node) under it: ending only `cmd.exe` leaves `claude` running, its turn
 * going on with nobody listening, and a `claude` that hangs is never ended. `taskkill /T /F` ends
 * the tree. When `taskkill` cannot start or fails, Node's own `kill` is the fallback.
 */
export function killTree(child: ChildProcess, taskkill: string): void {
  const own = child.kill.bind(child);
  child.kill = (signal) => {
    if (child.pid === undefined) return own(signal);
    const killer = nodeSpawn(taskkill, ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    // A `taskkill` that cannot start emits `error`, then `close` with the negative error number.
    killer.on('error', () => undefined);
    killer.on('close', (code) => {
      if (code !== 0) own(signal);
    });
    return true;
  };
}
