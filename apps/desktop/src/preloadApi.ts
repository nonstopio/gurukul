import { CALLS, EVENTS, channel, eventChannel, type GurukulDesktop } from './bridge';
import { ORIGINS_FLAG } from './config';

/**
 * What the preload does, as plain functions. The preload runs sandboxed, so it imports nothing but
 * Electron and what is bundled into it; the allowed origins reach it as a command-line flag
 * (`window.ts`).
 */

export type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

/** Listens on one event channel, handing over the payload alone; returns a function that stops. */
export type Listen = (channel: string, deliver: (payload: unknown) => void) => () => void;

/** Electron's `ipcRenderer`, as far as events use it. */
export interface RendererEventsLike {
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

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
 * (`ipc.ts`) and sends events to that frame only (`events.ts`); this keeps the object itself away
 * from any other page.
 */
export function shouldExpose(win: WindowLike, origins: readonly string[]): boolean {
  return win.top === win && origins.includes(win.location.origin);
}

/**
 * `Listen` over `ipcRenderer`. The page's handler gets the payload and nothing else: Electron's
 * event object holds `sender`, the `ipcRenderer` itself, which must never reach the page. The stop
 * function removes exactly this listener, once.
 */
export function listenVia(ipc: RendererEventsLike): Listen {
  return (name, deliver) => {
    const listener = (_event: unknown, payload: unknown) => deliver(payload);
    ipc.on(name, listener);
    let listening = true;
    return () => {
      if (!listening) return;
      listening = false;
      ipc.removeListener(name, listener);
    };
  };
}

/** Puts `value` at `a.b` inside `root`, making the objects on the way. */
function place(root: Record<string, unknown>, name: string, value: unknown): void {
  const parts = name.split('.');
  const leaf = parts.pop() as string;
  let node = root;
  for (const part of parts) node = (node[part] ??= {}) as Record<string, unknown>;
  node[leaf] = value;
}

/**
 * `window.gurukulDesktop`: one function per call in `CALLS`, each a call to the main process, and
 * one subscribe function per event in `EVENTS`. There is no way to listen on any other channel.
 */
export function buildBridge(invoke: Invoke, listen: Listen): GurukulDesktop {
  const root: Record<string, unknown> = {};
  for (const name of CALLS) {
    place(root, name, (...args: unknown[]) => invoke(channel(name), ...args));
  }
  for (const name of EVENTS) {
    place(root, name, (handler: unknown) => {
      if (typeof handler !== 'function') throw new TypeError('A handler function is needed');
      return listen(eventChannel(name), (payload) => (handler as (p: unknown) => void)(payload));
    });
  }
  return root as unknown as GurukulDesktop;
}
