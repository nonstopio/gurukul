import { describe, expect, it, vi } from 'vitest';
import { createEventSender, type EventFrameLike } from '../src/events';
import { createLogger } from '../src/log';

const ORIGINS = ['https://gurukul.nonstopio.com'];
const call = { sessionId: 's1', callId: 'c1', name: 'get_course', input: {} };

function frame(overrides: Partial<EventFrameLike> = {}): EventFrameLike {
  return { origin: ORIGINS[0] as string, parent: null, send: vi.fn(), ...overrides };
}

function setup(target: EventFrameLike | null) {
  const sink = vi.fn();
  const events = createEventSender(() => target, ORIGINS, createLogger({ sink }));
  return { events, sink };
}

describe('createEventSender', () => {
  it('sends the payload alone to the top frame of an allowed origin', () => {
    const target = frame();
    const { events, sink } = setup(target);
    expect(events.send('agent.onToolCall', call)).toBe(true);
    expect(target.send).toHaveBeenCalledWith('gurukul-event:agent.onToolCall', call);
    expect(sink).not.toHaveBeenCalled();
  });

  it.each([
    ['no window', null, 'no frame'],
    ['a subframe', frame({ parent: {} }), 'subframe'],
    ['another origin', frame({ origin: 'https://evil.example' }), 'origin'],
  ])('sends nothing to %s, and logs the event name without the payload', (_l, target, reason) => {
    const { events, sink } = setup(target);
    expect(events.send('agent.onEvent', { type: 'text', sessionId: 's1', text: 'secret' })).toBe(
      false,
    );
    if (target) expect(target.send).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith('warn', 'Bridge event not sent', {
      event: 'agent.onEvent',
      reason,
    });
  });

  it('reports a frame that went away mid-send, without the payload', () => {
    const target = frame({
      send: vi.fn(() => {
        throw new Error('Render frame was disposed');
      }),
    });
    const { events, sink } = setup(target);
    expect(events.send('app.onUpdateReady', { version: '0.2.0' })).toBe(false);
    expect(sink).toHaveBeenCalledWith('error', 'Bridge event failed', {
      event: 'app.onUpdateReady',
      error: { name: 'Error' },
    });
  });
});
