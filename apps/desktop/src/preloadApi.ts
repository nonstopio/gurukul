import { CALLS, channel, type GurukulDesktop } from './bridge';
import { ORIGINS_FLAG } from './config';

/**
 * What the preload does, as plain functions. The preload runs sandboxed, so it imports nothing but
 * Electron and what is bundled into it; the allowed origins reach it as a command-line flag
 * (`window.ts`).
 */

export type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

/** The allowed origins from `process.argv`, or none when the flag is missing. */
export function originsFromArgv(argv: readonly string[]): string[] {
  const flag = argv.find((arg) => arg.startsWith(ORIGINS_FLAG));
  return flag === undefined ? [] : flag.slice(ORIGINS_FLAG.length).split(',').filter(Boolean);
}

/** The parts of `window` the preload reads. */
export interface WindowLike {
  readonly top: unknown;
  readonly location: { readonly origin: string };
}

/**
 * True only in the top frame of an allowed origin. The main process checks every call again
 * (`ipc.ts`); this keeps the object itself away from any other page.
 */
export function shouldExpose(win: WindowLike, origins: readonly string[]): boolean {
  return win.top === win && origins.includes(win.location.origin);
}

/** `window.gurukulDesktop`, one function per call in `CALLS`, each a call to the main process. */
export function buildBridge(invoke: Invoke): GurukulDesktop {
  const root: Record<string, unknown> = {};
  for (const name of CALLS) {
    const parts = name.split('.');
    const leaf = parts.pop() as string;
    let node = root;
    for (const part of parts) node = (node[part] ??= {}) as Record<string, unknown>;
    node[leaf] = (...args: unknown[]) => invoke(channel(name), ...args);
  }
  return root as unknown as GurukulDesktop;
}
