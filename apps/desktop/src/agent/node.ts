import { randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import crossSpawn from 'cross-spawn';
import type { Env } from './launch';
import type { AgentPlatform, ChildLike } from './platform';

/**
 * The real adapters, over Node. `cross-spawn` starts the program: on Windows it runs npm's
 * `claude.cmd` through `cmd.exe` with every argument quoted, which Node's own `spawn` refuses to do
 * safely; elsewhere it is Node's `spawn`. Tested against the fake `claude` in `test/fixtures/`.
 */
export function nodeAgentPlatform(platform: string, env: Env, homeDir: string): AgentPlatform {
  return {
    platform,
    env,
    homeDir,
    spawn: (file, args, options) =>
      crossSpawn(file, [...args], {
        cwd: options.cwd,
        env: options.env,
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
      }) as unknown as ChildLike,
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
