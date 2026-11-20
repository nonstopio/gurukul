import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Env } from './launch';

/**
 * What the agent bridge needs from the computer, as adapters: starting a program, listening on a
 * loopback port, timers, randomness and the app's own environment. `node.ts` gives the real ones;
 * tests give fakes, or the real ones over a fake `claude` (`test/fixtures/fake-claude.mjs`).
 */

/** A started program, as far as the bridge uses it (Node's `ChildProcess` with piped stdio). */
export interface ChildLike {
  readonly stdin: {
    write(data: string): unknown;
    end(): unknown;
    on(event: 'error', listener: (error: Error) => void): unknown;
  };
  readonly stdout: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown };
  /** Ended, and its output has all been read (Node's `close`, which comes after `exit`). */
  on(event: 'close', listener: (code: number | null, signal: string | null) => void): unknown;
  /** Could not start (`ENOENT`), or could not be signalled. */
  on(event: 'error', listener: (error: Error) => void): unknown;
  kill(signal?: 'SIGTERM' | 'SIGKILL'): unknown;
}

/** Starts `file` with `args`, stdin and stdout piped, stderr ignored (never read, never logged). */
export type SpawnFn = (
  file: string,
  args: readonly string[],
  options: { cwd: string; env: Record<string, string> },
) => ChildLike;

/** A server listening on `127.0.0.1`. */
export interface Listener {
  readonly port: number;
  close(): Promise<void>;
}

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

/** Listens on `127.0.0.1`, on a port the system picks. */
export type ListenFn = (handler: RequestHandler) => Promise<Listener>;

export interface Clock {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AgentPlatform {
  /** Node's `process.platform`. */
  platform: string;
  /** The app's own environment: where `PATH` is read and the allow-list is taken from. */
  env: Env;
  homeDir: string;
  spawn: SpawnFn;
  listen: ListenFn;
  /** True when `file` exists and may be run (on Windows: exists). */
  isExecutable(file: string): Promise<boolean>;
  clock: Clock;
  /** A fresh 256-bit secret, as hex. */
  randomToken(): string;
  /** A fresh UUID: Claude session ids and tool call ids. */
  randomId(): string;
}
