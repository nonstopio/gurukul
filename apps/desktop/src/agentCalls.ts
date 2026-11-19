import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from './bridge';
import { agentSessionId, agentStartRequest, callId, id, toolResult } from './args';
import { notAvailable, type AreaHandlers } from './ipc';

/**
 * `agent.*`: Claude Code for a session (`DSK-10`). Every argument is checked here as the finished
 * calls will need it; until then each call is refused as not available in this version. The events
 * (`agent.onEvent`, `agent.onToolCall`) go out through `events.ts`.
 */
export function agentCalls(): AreaHandlers<'agent'> {
  return {
    'agent.status': notAvailable(z.tuple([])),
    'agent.start': notAvailable(z.tuple([agentStartRequest])),
    'agent.send': notAvailable(z.tuple([id, z.string().min(1).max(MAX_MESSAGE_LENGTH)])),
    'agent.stop': notAvailable(z.tuple([id])),
    'agent.close': notAvailable(z.tuple([id])),
    'agent.forget': notAvailable(z.tuple([agentSessionId])),
    'agent.toolResult': notAvailable(z.tuple([id, callId, toolResult])),
  };
}
