import type { CourseChanges } from '@gurukul/schema/changes';
import type { Question, Quiz } from '@gurukul/schema';
import { MAX_ASKS_RUNNING, bridgeFailure, canAsk } from '../../desktop/bridge';
import type { AgentAskFailure, AgentAskResult, GurukulDesktop } from '../../desktop/bridge';
import { log } from '../../log';
import type { Working } from '../types';
import { agrees, answerTargets, buildAnswerPrompt, keyPlaces, parseAnswer } from './answers';
import type { AnswerTarget } from './answers';
import { ANSWER_RESULTS_KEPT, createSessionStore } from './store';
import type { AnswerCheckFile, AnswerResult, SessionStore } from './store';

/*
 * The answer check (`DSK-18`): while Review is open, every Quiz question the session added or
 * changed is answered by a separate one-shot Claude Code run (`agent.ask`) that sees the lessons
 * and the question but never the key, at most `MAX_ASKS_RUNNING` at a time. Its answer is kept by
 * the question's hash in `answer-check.json`, so it runs once per question and again only when the
 * question or its lessons change, and compared with the key here. An ask whose question or lessons
 * changed while it ran (a turn, hand edits, bringing in a draft that moved) is cancelled. Nothing it
 * finds stops Save.
 *
 * It waits while a turn runs or hand edits are open (the questions are still changing), asks
 * nothing for a saved or discarded session, and stops for the session when the Educator presses
 * "Skip answer check". A failure is shown per question; a reason about Claude Code itself (not
 * installed, signed out, plan limit) stops the check until Try again. The shell's two places are
 * shared by every session and by a page the window left (a reload), so `busy` is no failure: the
 * question waits, and the check tries again after `BUSY_RETRY_MS` or when one of its own asks ends.
 * Logs carry ids and outcomes, never a question, an option, a key or a reply.
 */

/** Asks at once: the shell's own limit. */
export const ANSWER_CHECK_CONCURRENCY = MAX_ASKS_RUNNING;

/** How long the check waits to try again after the shell said both of its places were taken. */
export const BUSY_RETRY_MS = 5000;

/** Why a question has no second opinion. */
export type AnswerFailure = 'timeout' | 'failed' | 'unreadable';

/** Where one question stands. */
export type AnswerOutcome =
  /** Not asked yet: it runs when a place is free. */
  | { state: 'waiting' }
  | { state: 'checking' }
  | { state: 'agrees'; picked: number[]; key: number[]; reason: string }
  | { state: 'disagrees'; picked: number[]; key: number[]; reason: string }
  | { state: 'failed'; reason: AnswerFailure };

export interface AnswerQuestion extends AnswerTarget {
  /** Its place in the Quiz, from 1: "Question 3". */
  position: number;
  outcome: AnswerOutcome;
}

/** Why the check cannot run at all now; Try again clears it. */
export type AnswerProblem =
  | { code: 'needs_update' }
  | { code: 'not_installed' }
  | { code: 'too_old'; version: string; minimumVersion: string }
  | { code: 'not_signed_in' }
  | { code: 'plan_limit'; resetsAt: string | null };

export interface AnswerCheckView {
  /** False until `answer-check.json` was read. */
  loaded: boolean;
  /** The Educator pressed Skip answer check for this session. */
  skipped: boolean;
  /** Asks may start: an open session, between turns, with no hand edits open. */
  active: boolean;
  problem: AnswerProblem | null;
  questions: AnswerQuestion[];
  /** Questions with a second opinion or a failure. */
  done: number;
  /** Questions still waiting or being checked. */
  pending: number;
  disagreements: number;
}

export interface AnswerCheckInput {
  work: Working;
  changes: CourseChanges;
  active: boolean;
}

export interface AnswerCheck {
  open(): Promise<void>;
  /** The working copy and its changes as they are now, and whether asks may start. */
  update(input: AnswerCheckInput): void;
  /** Stops it for this session: running asks are cancelled, and the choice is written. */
  skip(): Promise<void>;
  /** Starts it again after Skip. */
  resume(): Promise<void>;
  /** Asks again for the questions that failed, and clears a problem. */
  retry(): void;
  subscribe(listener: () => void): () => void;
  getState(): AnswerCheckView;
  /** True while an ask is running: its answer is still written when it comes. */
  busy(): boolean;
  /** Whether a screen shows it: nothing new starts while none does. */
  setShown(shown: boolean): void;
  /** Starts nothing more; a running ask still has its answer written. */
  dispose(): void;
}

export interface AnswerCheckOptions {
  desktop: GurukulDesktop;
  uid: string;
  sessionId: string;
  store?: SessionStore;
  newId?: () => string;
  now?: () => Date;
  /** Runs `run` after `BUSY_RETRY_MS`; returns what cancels it. Tests play it by hand. */
  later?: (run: () => void) => () => void;
}

const afterBusyWait = (run: () => void) => {
  const timer = setTimeout(run, BUSY_RETRY_MS);
  return () => clearTimeout(timer);
};

interface Target extends AnswerTarget {
  position: number;
  prompt: string;
  hash: string;
  options: number;
  question: Question;
  key: number[];
}

const PROBLEMS = new Set(['not_installed', 'too_old', 'not_signed_in', 'plan_limit']);

/** The questions to check, each with its prompt (from the course only) and its key's places. */
export function checkTargets(work: Working, changes: CourseChanges): Target[] {
  const out: Target[] = [];
  for (const target of answerTargets(changes)) {
    const built = buildAnswerPrompt(work.course, target);
    if (built === null) continue;
    const quiz = work.course.chapters
      .flatMap((c) => c.items)
      .find((i): i is Quiz => i.type === 'quiz' && i.id === target.quizId) as Quiz;
    const position = quiz.questions.findIndex((q) => q.id === target.questionId);
    const question = quiz.questions[position] as Question;
    out.push({
      ...target,
      ...built,
      position: position + 1,
      question,
      key: keyPlaces(question, work.answers[target.quizId]?.[target.questionId]),
    });
  }
  return out;
}

export function createAnswerCheck({
  desktop,
  uid,
  sessionId,
  store = createSessionStore({ desktop, uid }),
  newId = () => crypto.randomUUID(),
  now = () => new Date(),
  later = afterBusyWait,
}: AnswerCheckOptions): AnswerCheck {
  const results = new Map<string, AnswerResult>();
  const failures = new Map<string, AnswerFailure>();
  /** Hash → the ask's id, while it runs. */
  const running = new Map<string, string>();
  /** Ask ids this check asked the shell to cancel, until their answer comes back. */
  const cancelling = new Set<string>();
  const listeners = new Set<() => void>();
  let targets: Target[] = [];
  let loaded = false;
  let skipped = false;
  let active = false;
  let disposed = false;
  let shown = true;
  let problem: AnswerProblem | null = null;
  /** Set while the check waits after `busy`: what cancels the wait. Nothing starts meanwhile. */
  let backOff: (() => void) | null = null;
  let writing: Promise<void> = Promise.resolve();
  let view: AnswerCheckView = compute();

  function outcomeOf(t: Target): AnswerOutcome {
    const result = results.get(t.hash);
    if (result) {
      return {
        state: agrees(result.picked, t.key) ? 'agrees' : 'disagrees',
        picked: result.picked,
        key: t.key,
        reason: result.reason,
      };
    }
    const failure = failures.get(t.hash);
    if (failure) return { state: 'failed', reason: failure };
    return running.has(t.hash) ? { state: 'checking' } : { state: 'waiting' };
  }

  function compute(): AnswerCheckView {
    const questions = targets.map((t): AnswerQuestion => ({
      quizId: t.quizId,
      questionId: t.questionId,
      position: t.position,
      outcome: outcomeOf(t),
    }));
    const count = (...states: AnswerOutcome['state'][]) =>
      questions.filter((q) => states.includes(q.outcome.state)).length;
    return {
      loaded,
      skipped,
      active,
      problem,
      questions,
      done: count('agrees', 'disagrees', 'failed'),
      pending: count('waiting', 'checking'),
      disagreements: count('disagrees'),
    };
  }

  const emit = () => {
    view = compute();
    for (const listener of [...listeners]) listener();
  };

  /** Writes the second opinions (newest first, at most `ANSWER_RESULTS_KEPT`) and the skip. */
  const persist = () => {
    const file: AnswerCheckFile = {
      schemaVersion: 1,
      skipped,
      results: [...results.values()]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, ANSWER_RESULTS_KEPT),
    };
    writing = writing
      .then(() => store.saveAnswerCheck(sessionId, file))
      .catch((error: unknown) => {
        log.warn('Answer check not written', { sessionId, reason: bridgeFailure(error) });
      });
    return writing;
  };

  const stopWaiting = () => {
    backOff?.();
    backOff = null;
  };

  /** Keeps what an ask that was not `busy` gave; returns its outcome for the log. */
  const record = (t: Target, result: AgentAskResult | { rejected: unknown }): string => {
    let outcome: string;
    if ('rejected' in result) {
      const reason = bridgeFailure(result.rejected);
      if (reason === 'not_available') problem = { code: 'needs_update' };
      else failures.set(t.hash, 'failed');
      outcome = reason;
    } else if (result.ok) {
      const opinion = parseAnswer(result.text, t.options);
      if (opinion === null) {
        failures.set(t.hash, 'unreadable');
        outcome = 'unreadable';
      } else {
        results.set(t.hash, { hash: t.hash, ...opinion, at: now().toISOString() });
        outcome = agrees(opinion.picked, t.key) ? 'agrees' : 'disagrees';
        void persist();
      }
    } else {
      const error: AgentAskFailure = result.error;
      outcome = error.code;
      if (PROBLEMS.has(error.code)) problem = error as AnswerProblem;
      else if (error.code !== 'cancelled') failures.set(t.hash, error.code as AnswerFailure);
    }
    return outcome;
  };

  const settle = (t: Target, result: AgentAskResult | { rejected: unknown }) => {
    running.delete(t.hash);
    let outcome: string;
    if (!('rejected' in result) && !result.ok && result.error.code === 'busy') {
      // Another session, or a page this window left, holds the shell's places: the question waits.
      backOff ??= later(() => {
        backOff = null;
        pump();
      });
      outcome = 'busy';
    } else {
      // One of this check's own asks ended, so a place is free: no need to wait any longer.
      stopWaiting();
      outcome = record(t, result);
    }
    log.info('Answer check ended', {
      sessionId,
      quizId: t.quizId,
      questionId: t.questionId,
      outcome,
    });
    emit();
    pump();
  };

  const start = (t: Target) => {
    const askId = newId();
    running.set(t.hash, askId);
    desktop.agent.ask({ askId, prompt: t.prompt }).then(
      (result) => {
        cancelling.delete(askId);
        settle(t, result);
      },
      (rejected: unknown) => {
        cancelling.delete(askId);
        settle(t, { rejected });
      },
    );
  };

  /** Starts asks while a place is free and the check may run. */
  function pump() {
    if (!loaded || disposed || !shown || skipped || !active || problem !== null) return;
    // Waiting after `busy`: the wait, or one of this check's own asks ending, pumps again.
    if (backOff !== null) return;
    if (!canAsk(desktop)) {
      problem = { code: 'needs_update' };
      emit();
      return;
    }
    let started = false;
    while (running.size < ANSWER_CHECK_CONCURRENCY) {
      const next = targets.find(
        (t) => !results.has(t.hash) && !failures.has(t.hash) && !running.has(t.hash),
      );
      if (next === undefined) break;
      start(next);
      started = true;
    }
    if (started) emit();
  }

  /** Ends one running ask, once: its `cancelled` answer then settles it like any other. */
  const cancel = (askId: string) => {
    if (cancelling.has(askId)) return;
    cancelling.add(askId);
    desktop.agent.cancelAsk(askId).catch((error: unknown) => {
      log.warn('Answer check not cancelled', { sessionId, reason: bridgeFailure(error) });
    });
  };

  const cancelAll = () => {
    for (const askId of running.values()) cancel(askId);
  };

  /*
   * Ends each running ask whose question is no longer one to check in the words it was asked in: a
   * turn, hand edits or bringing in a draft that moved (`bringIn`) changed the question or its
   * lessons, so its answer would be about words the course no longer has. Answers already kept are
   * keyed by those old words' hash, so they no longer match either.
   */
  const dropStale = () => {
    const asked = new Set(targets.map((t) => t.hash));
    for (const [hash, askId] of running) if (!asked.has(hash)) cancel(askId);
  };

  return {
    async open() {
      try {
        const file = await store.readAnswerCheck(sessionId);
        for (const result of file?.results ?? []) results.set(result.hash, result);
        skipped = file?.skipped ?? false;
      } catch (error) {
        log.warn('Answer check not read', { sessionId, reason: bridgeFailure(error) });
      }
      loaded = true;
      emit();
      pump();
    },

    update(input) {
      targets = checkTargets(input.work, input.changes);
      active = input.active;
      dropStale();
      emit();
      pump();
    },

    async skip() {
      skipped = true;
      stopWaiting();
      cancelAll();
      emit();
      log.info('Answer check skipped', { sessionId });
      await persist();
    },

    async resume() {
      skipped = false;
      emit();
      await persist();
      pump();
    },

    retry() {
      stopWaiting();
      failures.clear();
      problem = null;
      emit();
      pump();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getState: () => view,
    busy: () => running.size > 0,

    setShown(next) {
      shown = next;
      pump();
    },

    dispose() {
      disposed = true;
      stopWaiting();
    },
  };
}
