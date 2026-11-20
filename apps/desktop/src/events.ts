import { eventChannel, type BridgeEvents, type EventName } from './bridge';
import { checkSender, type FrameLike } from './ipc';
import type { Logger } from './log';

/**
 * Events from the main process to the window (`agent.onEvent`, `agent.onToolCall`,
 * `app.onUpdateReady`). The other half of the bridge's gate: an event goes only to the window's top
 * frame, and only while that frame is on an allowed origin, so a page the window was somehow moved
 * to, or a frame inside the page, never hears one. The payload is plain data (`BridgeEvents`); the
 * log line names the event and a reason, never the payload, which can hold chat or course text.
 */

/** The parts of a frame the sender uses (Electron's `WebFrameMain`). */
export interface EventFrameLike extends FrameLike {
  send(channel: string, payload: unknown): void;
}

export interface EventSender {
  /** True when the event was handed to the window; false when there was no frame to send it to. */
  send<E extends EventName>(name: E, payload: BridgeEvents[E]): boolean;
}

/**
 * `frame` gives the window's top frame now, or null when there is no window; it is asked on every
 * send, because the window can be closed and opened again (macOS) and its frame replaced on reload.
 */
export function createEventSender(
  frame: () => EventFrameLike | null,
  origins: readonly string[],
  log: Logger,
): EventSender {
  return {
    send(name, payload) {
      const target = frame();
      const check = checkSender({ senderFrame: target }, origins);
      if (!check.ok) {
        log.warn('Bridge event not sent', { event: name, reason: check.reason });
        return false;
      }
      // `checkSender` refuses a null frame ('no frame'), so `target` is a frame here.
      const to = target as EventFrameLike;
      try {
        to.send(eventChannel(name), payload);
        return true;
      } catch (error) {
        // A frame that was disposed between the check and the send throws.
        log.error('Bridge event failed', error, { event: name });
        return false;
      }
    },
  };
}
