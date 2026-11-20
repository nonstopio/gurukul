import { useMemo, useSyncExternalStore } from 'react';
import { createAgentSession } from './agent';
import type { AgentSession, AgentSessionOptions, AgentSessionView } from './agent';

/*
 * One runtime per open session, shared by every component that shows it (the chat, the preview,
 * Review), and kept alive past the last of them while a turn is still running: the turn is then
 * written to disk when it ends, instead of its tool calls going unanswered. Leaving the page during
 * a turn therefore loses nothing, and opening it again picks up the same runtime.
 */

interface Live {
  session: AgentSession;
  opened: Promise<void>;
  users: number;
  /** Set while nobody shows the session but a turn still runs. */
  waiting: (() => void) | null;
}

const live = new Map<string, Live>();

/**
 * The runtime for this session, created and opened on first use. Call `release` when done with
 * it; the last release ends it, at once or when its running turn has been written.
 */
export function acquireAgentSession(
  options: AgentSessionOptions,
  create: (options: AgentSessionOptions) => AgentSession = createAgentSession,
): { session: AgentSession; opened: Promise<void>; release: () => void } {
  const key = `${options.uid}/${options.sessionId}`;
  let entry = live.get(key);
  if (!entry) {
    const session = create(options);
    entry = { session, opened: session.open(), users: 0, waiting: null };
    live.set(key, entry);
  }
  const held = entry;
  held.users += 1;
  held.waiting?.();
  held.waiting = null;
  const end = () => {
    held.waiting?.();
    live.delete(key);
    held.session.dispose();
  };
  return {
    session: held.session,
    /** Resolves once the session was read and its agent started, or found unable to start. */
    opened: held.opened,
    release() {
      held.users -= 1;
      if (held.users > 0) return;
      if (!held.session.busy()) return end();
      held.waiting = held.session.subscribe(() => {
        if (!held.session.busy()) end();
      });
    },
  };
}

/** What the Educator can do with a session, from any screen showing it. */
type SessionActions = Pick<
  AgentSession,
  | 'send'
  | 'stop'
  | 'undo'
  | 'retry'
  | 'attach'
  | 'detach'
  | 'updateReview'
  | 'educatorTurn'
  | 'edit'
  | 'keepEdits'
  | 'endEdits'
  | 'dropIncomplete'
  | 'saveToDraft'
  | 'bringIn'
  | 'courseCreated'
  | 'noteCreating'
  | 'ownCourse'
>;

/** What the session screens get: the view, and what the Educator can do. */
export interface AgentSessionHandle extends AgentSessionView, SessionActions {}

const LOADING: AgentSessionView = {
  status: 'loading',
  problem: null,
  session: null,
  transcript: [],
  activity: null,
  work: null,
  base: null,
  changes: null,
  turns: [],
  unsaved: null,
  turnChanges: 0,
  attachments: [],
  canAttach: false,
  canSend: false,
  canStop: false,
  canUndo: false,
  canEdit: false,
  handEdits: null,
  canSave: false,
  saving: false,
  pendingCourse: null,
  creating: null,
};

type SessionKey = Pick<AgentSessionOptions, 'desktop' | 'uid' | 'sessionId'>;

/** What `useAgentSession` reads: the shared runtime while a component subscribes, else nothing. */
export interface AgentSessionSource extends SessionActions {
  subscribe(listener: () => void): () => void;
  getState(): AgentSessionView;
}

/**
 * The runtime as an external store: subscribing acquires it (and opens it the first time), ending
 * the subscription releases it. Before that the view is `loading` and the actions do nothing.
 */
export function agentSessionSource(key: SessionKey): AgentSessionSource {
  let held: AgentSession | null = null;
  return {
    subscribe(listener) {
      const acquired = acquireAgentSession(key);
      held = acquired.session;
      const stop = acquired.session.subscribe(listener);
      return () => {
        stop();
        held = null;
        acquired.release();
      };
    },
    getState: () => held?.getState() ?? LOADING,
    send: async (message) => (held ? held.send(message) : false),
    stop: async () => held?.stop(),
    undo: async () => (held ? held.undo() : false),
    retry: async () => held?.retry(),
    attach: (target) => held?.attach(target) ?? false,
    detach: (target) => held?.detach(target),
    updateReview: async (patch) => (held ? held.updateReview(patch) : false),
    educatorTurn: async (work, summary) => (held ? held.educatorTurn(work, summary) : false),
    edit: (change) => held?.edit(change) ?? false,
    keepEdits: async () => (held ? held.keepEdits() : false),
    endEdits: async () => held?.endEdits(),
    dropIncomplete: async () => held?.dropIncomplete(),
    saveToDraft: async (write) =>
      held ? held.saveToDraft(write) : { ok: false, reason: 'busy' as const },
    bringIn: async (base, work, summary) => (held ? held.bringIn(base, work, summary) : false),
    courseCreated: async (base) => (held ? held.courseCreated(base) : false),
    noteCreating: async (slug, title) => held?.noteCreating(slug, title),
    ownCourse: async (stored) => (held ? held.ownCourse(stored) : null),
  };
}

/**
 * The open session's runtime for a component: its view, redrawn after every change, and its
 * actions. Shared by every component showing the same session (`acquireAgentSession`).
 */
export function useAgentSession({ desktop, uid, sessionId }: SessionKey): AgentSessionHandle {
  const source = useMemo(
    () => agentSessionSource({ desktop, uid, sessionId }),
    [desktop, uid, sessionId],
  );
  const view = useSyncExternalStore(source.subscribe, source.getState);
  return {
    ...view,
    send: source.send,
    stop: source.stop,
    undo: source.undo,
    retry: source.retry,
    attach: source.attach,
    detach: source.detach,
    updateReview: source.updateReview,
    educatorTurn: source.educatorTurn,
    edit: source.edit,
    keepEdits: source.keepEdits,
    endEdits: source.endEdits,
    dropIncomplete: source.dropIncomplete,
    saveToDraft: source.saveToDraft,
    bringIn: source.bringIn,
    courseCreated: source.courseCreated,
    noteCreating: source.noteCreating,
    ownCourse: source.ownCourse,
  };
}
