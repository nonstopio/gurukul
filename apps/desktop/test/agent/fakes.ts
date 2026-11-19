import { EventEmitter } from 'node:events';
import { vi } from 'vitest';
import type { AgentPlatform, ChildLike, Clock } from '../../src/agent/platform';

/** A started program the test drives: lines out, exit, and what was written to it. */
export function fakeChild() {
  const emitter = new EventEmitter();
  const stdout = new EventEmitter();
  const stdinEvents = new EventEmitter();
  const written: string[] = [];
  const child = {
    stdin: {
      write: vi.fn((data: string) => {
        written.push(data);
        return true;
      }),
      end: vi.fn(),
      on: (event: 'error', listener: (error: Error) => void) => stdinEvents.on(event, listener),
    },
    stdout: {
      on: (event: 'data', listener: (chunk: Buffer | string) => void) => stdout.on(event, listener),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- EventEmitter's own listener type
    on: (event: string, listener: (...args: any[]) => void) => emitter.on(event, listener),
    kill: vi.fn(),
  } satisfies ChildLike;
  return {
    child,
    written,
    /** The JSON values written to stdin, one per line. */
    messages: () => written.map((w) => JSON.parse(w) as Record<string, unknown>),
    print: (value: unknown) => stdout.emit('data', `${JSON.stringify(value)}\n`),
    printRaw: (chunk: Buffer | string) => stdout.emit('data', chunk),
    close: (code: number | null, signal: string | null = null) =>
      emitter.emit('close', code, signal),
    fail: (error: Error) => emitter.emit('error', error),
    stdinError: (error: Error) => stdinEvents.emit('error', error),
  };
}

/** Timers that run only when the test says so. */
export function fakeClock() {
  let now = 0;
  let next = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clock: Clock = {
    setTimeout: (callback, ms) => {
      next += 1;
      timers.set(next, { at: now + ms, callback });
      return next;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as number);
    },
  };
  return {
    clock,
    pending: () => timers.size,
    /** Moves time on, running every timer that falls due, in order. */
    advance(ms: number) {
      now += ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= now)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) return;
        timers.delete(due[0]);
        due[1].callback();
      }
    },
  };
}

/** A platform whose every adapter is a fake the test can replace. */
export function fakePlatform(overrides: Partial<AgentPlatform> = {}): AgentPlatform {
  let id = 0;
  return {
    platform: 'linux',
    env: { PATH: '/usr/bin' },
    homeDir: '/home/meera',
    spawn: vi.fn(() => fakeChild().child),
    listen: vi.fn(async () => ({ port: 4000, close: async () => undefined })),
    isExecutable: vi.fn(async () => false),
    clock: fakeClock().clock,
    randomToken: () => 'a'.repeat(64),
    randomId: () => {
      id += 1;
      return `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`;
    },
    ...overrides,
  };
}
