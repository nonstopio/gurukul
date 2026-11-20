import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createAnswerCheck } from './answerCheck';
import type {
  AnswerCheck,
  AnswerCheckInput,
  AnswerCheckOptions,
  AnswerCheckView,
} from './answerCheck';

/*
 * One answer check per session, shared by whatever shows it (Review's list, the selected row and
 * the checks), like the session runtime (`useAgentSession.ts`). The last one to leave ends it at
 * once, or, while an ask runs, once that ask's answer has been written: leaving Review never
 * throws away a second opinion already being asked for. It starts nothing new after that.
 */

interface Live {
  check: AnswerCheck;
  users: number;
  waiting: (() => void) | null;
}

const live = new Map<string, Live>();

export function acquireAnswerCheck(
  options: AnswerCheckOptions,
  create: (options: AnswerCheckOptions) => AnswerCheck = createAnswerCheck,
): { check: AnswerCheck; release: () => void } {
  const key = `${options.uid}/${options.sessionId}`;
  let entry = live.get(key);
  if (!entry) {
    const check = create(options);
    void check.open();
    entry = { check, users: 0, waiting: null };
    live.set(key, entry);
  }
  const held = entry;
  held.users += 1;
  held.waiting?.();
  held.waiting = null;
  held.check.setShown(true);
  const end = () => {
    held.waiting?.();
    held.waiting = null;
    held.check.dispose();
    live.delete(key);
  };
  return {
    check: held.check,
    release() {
      held.users -= 1;
      if (held.users > 0) return;
      // Nothing new starts once nobody shows it; a running ask still has its answer written.
      held.check.setShown(false);
      if (!held.check.busy()) return end();
      held.waiting = held.check.subscribe(() => {
        if (!held.check.busy()) end();
      });
    },
  };
}

const EMPTY: AnswerCheckView = {
  loaded: false,
  skipped: false,
  active: false,
  problem: null,
  questions: [],
  done: 0,
  pending: 0,
  disagreements: 0,
};

/** What Review gets: the check's view, and what the Educator can do with it. */
export interface AnswerCheckHandle extends AnswerCheckView {
  skip(): void;
  resume(): void;
  retry(): void;
}

type CheckKey = Pick<AnswerCheckOptions, 'desktop' | 'uid' | 'sessionId'>;

/**
 * The shared check as an external store: subscribing acquires it (and opens it the first time),
 * ending the subscription releases it. The newest input is kept, so a check acquired after the
 * component last drew still gets it.
 */
export function answerCheckSource(key: CheckKey) {
  let held: AnswerCheck | null = null;
  let latest: AnswerCheckInput | null = null;
  return {
    subscribe(listener: () => void) {
      const acquired = acquireAnswerCheck(key);
      const check = acquired.check;
      held = check;
      const stop = check.subscribe(listener);
      if (latest) check.update(latest);
      return () => {
        stop();
        held = null;
        acquired.release();
      };
    },
    getState: (): AnswerCheckView => held?.getState() ?? EMPTY,
    update(next: AnswerCheckInput) {
      latest = next;
      held?.update(next);
    },
    skip: () => void held?.skip(),
    resume: () => void held?.resume(),
    retry: () => held?.retry(),
  };
}

/**
 * The session's answer check for a component, fed with the working copy and its changes. `active`
 * says whether asks may start now (an open session, between turns, no hand edits open).
 */
export function useAnswerCheck(key: CheckKey, input: AnswerCheckInput): AnswerCheckHandle {
  const { desktop, uid, sessionId } = key;
  const source = useMemo(
    () => answerCheckSource({ desktop, uid, sessionId }),
    [desktop, uid, sessionId],
  );
  const view = useSyncExternalStore(source.subscribe, source.getState);
  const { work, changes, active } = input;
  useEffect(() => {
    source.update({ work, changes, active });
  }, [source, work, changes, active]);
  return { ...view, skip: source.skip, resume: source.resume, retry: source.retry };
}
