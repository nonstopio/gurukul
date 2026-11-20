import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from './bridge';
import {
  agentSessionId,
  agentStartRequest,
  askId,
  askRequest,
  callId,
  id,
  toolResult,
} from './args';
import type { AgentManager } from './agent/manager';
import type { AreaHandlers } from './ipc';

/**
 * `agent.*`: Claude Code for a session (`DSK-10`), run by `agent/manager.ts`. The events
 * (`agent.onEvent`, `agent.onToolCall`) go out through `events.ts`. A refusal Claude Code makes
 * foreseeable (not installed, too old, not signed in) is `agent.start`'s result, not a rejection;
 * so is every way a one-shot `agent.ask` (`DSK-18`) can end without an answer.
 */
export function agentCalls(agent: AgentManager): AreaHandlers<'agent'> {
  return {
    'agent.status': { args: z.tuple([]), run: () => agent.status() },
    'agent.start': { args: z.tuple([agentStartRequest]), run: (request) => agent.start(request) },
    'agent.send': {
      args: z.tuple([id, z.string().min(1).max(MAX_MESSAGE_LENGTH)]),
      run: (sessionId, message) => agent.send(sessionId, message),
    },
    'agent.stop': { args: z.tuple([id]), run: (sessionId) => agent.stop(sessionId) },
    'agent.close': { args: z.tuple([id]), run: (sessionId) => agent.close(sessionId) },
    'agent.forget': {
      args: z.tuple([agentSessionId]),
      run: (claudeSessionId) => agent.forget(claudeSessionId),
    },
    'agent.toolResult': {
      args: z.tuple([id, callId, toolResult]),
      run: (sessionId, call, result) => agent.toolResult(sessionId, call, result),
    },
    'agent.ask': { args: z.tuple([askRequest]), run: (request) => agent.ask(request) },
    'agent.cancelAsk': { args: z.tuple([askId]), run: (ask) => agent.cancelAsk(ask) },
  };
}
