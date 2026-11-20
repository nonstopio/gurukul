import { MAX_ASK_REPLY_LENGTH, type AgentAskFailure, type AgentAskResult } from '../bridge';
import type { ChildLike, Clock } from './platform';
import { createLineSplitter, readLine, userMessageLine } from './stream';

/**
 * One `agent.ask` (`DSK-18`): a `claude` started with `askArgs()` is given the prompt as its one
 * stream-json message, its input is closed, and the words of its reply are the answer. The signals
 * are the session's (`stream.ts`, from the spike): a missing sign-in or a plan limit ends it at
 * once rather than waiting through Claude Code's retries. Nothing it prints is logged: the prompt
 * holds course text and the reply talks about it.
 */

/** How long one ask may take before its process is ended and it answers `timeout`. */
export const ASK_TIMEOUT_MS = 180_000;
/** How long an ended ask's process has after SIGTERM before SIGKILL. */
export const ASK_KILL_GRACE_MS = 5_000;

export interface AskRun {
  /** Settles once, with the answer or why there is none. Never rejects. */
  readonly result: Promise<AgentAskResult>;
  /** Ends it now; it answers `cancelled` unless it had already answered. */
  cancel(): void;
}

export function runAsk(options: {
  child: ChildLike;
  prompt: string;
  clock: Clock;
  timeoutMs?: number;
}): AskRun {
  const { child, clock } = options;
  let settled = false;
  let killTimer: unknown = null;
  const texts: string[] = [];
  let length = 0;
  let resolve!: (result: AgentAskResult) => void;
  const result = new Promise<AgentAskResult>((done) => (resolve = done));

  // Only reached before the process closed: once it has, the ask is settled and nothing ends it.
  const end = () => {
    child.kill('SIGTERM');
    // Cleared when it closes, so this runs only for a process still there.
    killTimer = clock.setTimeout(() => child.kill('SIGKILL'), ASK_KILL_GRACE_MS);
  };
  const finish = (answer: AgentAskResult, stop: boolean) => {
    if (settled) return;
    settled = true;
    clock.clearTimeout(timer);
    resolve(answer);
    if (stop) end();
  };
  const fail = (error: AgentAskFailure, stop = true) => finish({ ok: false, error }, stop);

  const timer = clock.setTimeout(
    () => fail({ code: 'timeout' }),
    options.timeoutMs ?? ASK_TIMEOUT_MS,
  );

  const onLine = createLineSplitter((line) => {
    for (const item of readLine(line)) {
      if (item.kind === 'text') {
        texts.push(item.text);
        length += item.text.length;
      } else if (item.kind === 'not_signed_in') {
        fail({ code: 'not_signed_in' });
      } else if (item.kind === 'plan_limit') {
        fail({ code: 'plan_limit', resetsAt: item.resetsAt });
      } else if (item.kind === 'result') {
        const text = texts.join('\n').trim();
        if (item.failed || text === '' || length > MAX_ASK_REPLY_LENGTH) fail({ code: 'failed' });
        // Its input is closed, so `claude` exits by itself after the result.
        else finish({ ok: true, text }, false);
      }
    }
  });

  child.stdout.on('data', (chunk) => onLine(chunk.toString()));
  child.on('error', () => fail({ code: 'failed' }, false));
  child.on('close', () => {
    if (killTimer !== null) clock.clearTimeout(killTimer);
    fail({ code: 'failed' }, false);
  });
  child.stdin.on('error', () => undefined);
  child.stdin.write(userMessageLine(options.prompt));
  child.stdin.end();

  return {
    result,
    cancel: () => fail({ code: 'cancelled' }),
  };
}
