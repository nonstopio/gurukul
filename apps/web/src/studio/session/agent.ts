import { workingSchema } from '@gurukul/schema';
import { courseChanges } from '@gurukul/schema/changes';
import type { ChangeRow, CourseChanges } from '@gurukul/schema/changes';
import type { AuthoringSession, Turn } from '@gurukul/schema';
import { bridgeFailure } from '../../desktop/bridge';
import type {
  AgentError,
  AgentEvent,
  AgentStatus,
  AgentToolCall,
  AgentToolResult,
  BridgeFailure,
  GurukulDesktop,
  TurnOutcome,
} from '../../desktop/bridge';
import { log } from '../../log';
import { nameOf } from '../studioModel';
import type { Working } from '../types';
import { toolActivity } from './activity';
import { agentSetup } from './prompt';
import { bridgeSources } from './sources';
import { START_CHECKPOINT, createSessionStore } from './store';
import type { SessionStore } from './store';
import { TOOLS, defaultToolContext, runToolIn } from './tools';
import type { SessionSources, SessionState, Tool, ToolContext } from './tools';
import type { TranscriptEntry } from './transcript';

/*
 * The session runtime (`.plan/22-desktop-studio.md`, The session workspace, Starting Claude Code):
 * one open session, its agent and its working copy, in plain TypeScript so the screens stay thin.
 *
 *   open    reads the session and its chat from this computer, asks `agent.status()`, then
 *           `agent.start()` with the prompt, skills and tools (`agentSetup`), resuming the Claude
 *           session the last finished turn named.
 *   send    one message is one turn. The agent's tool calls run here, one at a time, against the
 *           working copy in memory (`runTool`).
 *   edit    hand edits from Studio's own editors (`DSK-19`), only between turns: each changes the
 *           working copy in memory and, at a pause, `session.json`; leaving the editor makes them one
 *           turn by the Educator, with its checkpoint and change count, so Undo and Review treat
 *           them like any turn. `editing.json` keeps the copy before them meanwhile, so a session
 *           opened after the app closed mid-edit still makes them a turn.
 *   turn    at its end: the turn's change count against the checkpoint before it, its checkpoint,
 *           the session and the chat written to disk (`saveTurn`), so a restart loses nothing.
 *   stop    `agent.stop`: the turn ends, and what it had changed stays as its checkpoint.
 *   undo    the newest turn goes; the checkpoint before it becomes the working copy again.
 *   note    undone turns and hand edits are told to the agent with the next message; until then
 *           `agent-note.json` keeps them, so a runtime opened later still tells it.
 *
 * Firestore is never read or written here: the draft was read once when the session started, and
 * hand edits go to this computer only.
 * Nothing logged carries chat text, course text, a source name or an answer key.
 */

/**
 * Longest message the Educator may send, in characters. Below the shell's `MAX_MESSAGE_LENGTH`
 * (64 KiB), leaving room for the note about undone turns (`undoNote`); a test holds the two apart.
 */
export const MESSAGE_MAX_LENGTH = 60_000;

/** The shell's `MAX_TOOL_RESULT_LENGTH`; a test holds the two equal. */
export const TOOL_RESULT_MAX_LENGTH = 4 * 1024 * 1024;

/** Why the agent cannot go on, or what went wrong, with the sentence the chat shows. */
export type AgentProblem =
  | { code: 'not_installed'; message: string }
  | { code: 'too_old'; version: string; minimumVersion: string; message: string }
  | { code: 'not_signed_in'; message: string }
  /** The session waits: sending again after the limit resets carries on. */
  | { code: 'plan_limit'; resetsAt: string | null; message: string }
  | { code: 'crashed'; exitCode: number | null; message: string }
  /** A bridge call was refused or failed: `not_available` means the app needs an update. */
  | { code: 'app'; reason: BridgeFailure; message: string }
  /** A finished turn could not be written to disk; its changes are still in memory. */
  | { code: 'not_saved'; message: string }
  /** The checkpoint before the newest turn is no longer kept, or could not be read. */
  | { code: 'undo_unavailable'; message: string };

export type AgentProblemCode = AgentProblem['code'];

export type AgentSessionStatus =
  /** Reading the session from this computer. */
  | 'loading'
  /** There is no such session on this computer, or its file cannot be read. */
  | 'missing'
  /** Saved or discarded: shown, never changed, and no agent is started. */
  | 'closed'
  /** Asking whether Claude Code can run, then starting it. */
  | 'connecting'
  /** The agent cannot run: `problem` says why; `retry` tries again. */
  | 'unavailable'
  /** Waiting for the Educator's next message. */
  | 'ready'
  /** A turn is running (and, at its end, being written to disk). */
  | 'working'
  /** Stop was pressed; the turn ends shortly. */
  | 'stopping'
  /** Undo of the newest turn is being written. */
  | 'undoing';

/**
 * How the hand edits stand on this computer: `dirty` waits for a pause, `incomplete` does not pass
 * the course schema yet (an empty title, a question with no prompt) so it is not written until it
 * does, `error` could not be written. Every state keeps the edits in memory.
 */
export type HandEditState = 'saved' | 'dirty' | 'saving' | 'incomplete' | 'error';

export interface HandEditsView {
  state: HandEditState;
  /** When the hand edits were last written to `session.json`; null before the first write. */
  savedAt: string | null;
}

/** Everything the session screens draw. A new object after every change; never mutate it. */
export interface AgentSessionView {
  status: AgentSessionStatus;
  problem: AgentProblem | null;
  /** The session as it stands in memory: the working copy and the agent's fields as changed. */
  session: AuthoringSession | null;
  /** The chat, oldest first. */
  transcript: readonly TranscriptEntry[];
  /** What the agent is doing now, in plain words; null between turns. */
  activity: string | null;
  /** Studio's own working copy type, so the editors can take it as it is (`DSK-19`). */
  work: Working | null;
  /** The stored draft the session compares with; null for a new course. */
  base: Working | null;
  /** Every difference between base and working copy: Review's rows and the header count. */
  changes: CourseChanges | null;
  /** Finished turns, each with its change count ("Turn 4 · 4 changes"). */
  turns: readonly Turn[];
  /**
   * A finished turn that could not be written (`not_saved`): newer than every turn in `turns`, and
   * the one Undo takes back first. Null once a later turn is written, or it is undone.
   */
  unsaved: Turn | null;
  /** Changes made so far by the turn that is running, against the checkpoint before it. */
  turnChanges: number;
  canSend: boolean;
  canStop: boolean;
  /**
   * Also true for a finished turn that could not be written (`not_saved`), which is not in
   * `turns`: Undo takes that one back first.
   */
  canUndo: boolean;
  /**
   * Hand edits may be made now (`DSK-19`): the session is open and no turn runs or is undone.
   * Claude Code need not be running: the editors do not use it.
   */
  canEdit: boolean;
  /** Hand edits not yet a turn, while an editor has them; null otherwise. */
  handEdits: HandEditsView | null;
}

export interface AgentSessionOptions {
  desktop: GurukulDesktop;
  uid: string;
  sessionId: string;
  /** The session files; by default `createSessionStore` over the same bridge. */
  store?: SessionStore;
  /**
   * The session's Sources folder (`DSK-20`); by default the bridge's `sources.*` for this session,
   * whose `list` is null until the Educator chooses a folder.
   */
  sources?: SessionSources | null;
  /** What the tools run with; by default `defaultToolContext(sources)`. */
  context?: ToolContext;
  /** The tools the agent is offered and may run; every course tool by default. */
  tools?: readonly Tool[];
  now?: () => Date;
  /** A new turn id: a safe file name, never `start`. */
  newId?: () => string;
}

export interface AgentSession {
  getState(): AgentSessionView;
  /** For `useSyncExternalStore`: called after every change. Answers the function that ends it. */
  subscribe(listener: () => void): () => void;
  /** Reads the session and starts its agent. Call once. */
  open(): Promise<void>;
  /** After `unavailable`: asks again whether Claude Code can run, and starts it. */
  retry(): Promise<void>;
  /** Starts a turn. False when it was not sent (not ready, empty, too long, or the app refused). */
  send(message: string): Promise<boolean>;
  /** Ends the running turn; what it had changed stays. */
  stop(): Promise<void>;
  /** Undoes the newest turn. False when there is none or its checkpoint before is gone. */
  undo(): Promise<boolean>;
  /**
   * A hand edit from Studio's editors: `change` applied to the working copy in memory. False, and
   * nothing changed, when `canEdit` is false. Nothing is written until `keepEdits` or `endEdits`.
   */
  edit(change: (work: Working) => Working): boolean;
  /** Writes the hand edits to `session.json` now. True when they are all on this computer. */
  keepEdits(): Promise<boolean>;
  /**
   * The editor is left: the hand edits become one turn by the Educator. Edits that do not pass the
   * course schema yet are dropped, back to the last copy that did.
   */
  endEdits(): Promise<void>;
  /**
   * Drops hand edits that do not pass the course schema yet, back to the last copy that did, and
   * keeps the editor's visit open: the Educator chose to leave them for another item.
   */
  dropIncomplete(): Promise<void>;
  /** True while a turn runs, an undo is written or hand edits are open: keep listening until then. */
  busy(): boolean;
  /** Resolves once every tool call, turn end and undo already received has been handled. */
  settled(): Promise<void>;
  /** Stops listening to the agent. The `claude` process keeps running for the next open. */
  dispose(): void;
}

const SIGN_IN = 'Open a terminal, run `claude` and sign in, then try again.';

/** The chat's sentence for each reason the agent cannot go on. */
export function problemOf(error: AgentError): AgentProblem {
  switch (error.code) {
    case 'not_installed':
      return {
        ...error,
        message:
          'Gurukul Studio runs Claude Code, which is not installed on this computer. Install it, then open a terminal, run `claude` and sign in, and try again.',
      };
    case 'too_old':
      return {
        ...error,
        message: `Claude Code ${error.version} is older than this app needs (${error.minimumVersion}). Open a terminal, run \`claude update\`, then try again.`,
      };
    case 'not_signed_in':
      return { ...error, message: SIGN_IN };
    case 'plan_limit':
      return {
        ...error,
        message:
          'Your Claude plan has reached its limit for now. The session waits here: send your message again once the limit resets.',
      };
    case 'crashed':
      return {
        ...error,
        message:
          'Claude Code stopped unexpectedly. Everything up to the last finished turn is kept. Start it again to carry on.',
      };
  }
}

/** `agent.status()` as a problem, or null when Claude Code is ready. */
export function statusProblem(status: AgentStatus): AgentProblem | null {
  switch (status.state) {
    case 'ready':
      return null;
    case 'too_old':
      return problemOf({
        code: 'too_old',
        version: status.version,
        minimumVersion: status.minimumVersion,
      });
    default:
      return problemOf({ code: status.state });
  }
}

/** A refused or failed bridge call, in words. */
export function appProblem(error: unknown): AgentProblem {
  const reason = bridgeFailure(error);
  return {
    code: 'app',
    reason,
    message:
      reason === 'not_available'
        ? 'This version of Gurukul Studio cannot run the agent. Choose Check for updates in the app menu, then restart it.'
        : 'Gurukul Studio did not answer. Try again; if it keeps failing, close the app and open it again. The session is kept on this computer.',
  };
}

const NOT_SAVED: AgentProblem = {
  code: 'not_saved',
  message:
    'The last turn could not be written to this computer, so closing the app now would lose it. Its changes are still here: the next turn writes them again, or Undo takes them back.',
};

const UNDO_GONE: AgentProblem = {
  code: 'undo_unavailable',
  message:
    'This turn cannot be undone: the copy of the course from before it is no longer kept on this computer.',
};

const TOO_LONG = 'That answer is too long to send. Ask for less at a time: one lesson or one Quiz.';

/**
 * What the agent is told, ahead of the Educator's next message, after turns were undone: its own
 * history still says it made those changes.
 */
export function undoNote(turns: number): string {
  const what = turns === 1 ? 'your last turn' : `your last ${turns} turns`;
  return `[From Gurukul: the Educator undid ${what}. The course is back as it was before, so read it again before you change it.]\n\n`;
}

/**
 * What the agent is told, ahead of the Educator's next message, after the course was edited by
 * hand (or a hand edit was undone) since its last turn.
 */
export const HAND_EDIT_NOTE =
  '[From Gurukul: the Educator edited the course by hand since your last turn. Read what you need again before you change it.]\n\n';

const SUMMARY_LENGTH = 120;

/** A turn's line for the timeline: the Educator's message, on one line and cut on a word. */
export function turnSummary(message: string | null): string {
  if (message === null) return 'Carried on after the page reloaded';
  const flat = message.replace(/\s+/g, ' ').trim();
  if (flat.length <= SUMMARY_LENGTH) return flat;
  const cut = flat.slice(0, SUMMARY_LENGTH - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > SUMMARY_LENGTH / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** What a Review row is called in a turn's line: an item or chapter by its title. */
function rowName(row: ChangeRow): string {
  switch (row.kind) {
    case 'course':
      return 'course details';
    case 'landing':
      return 'landing page';
    default:
      // A row is never missing on both sides.
      return nameOf(((row.after ?? row.before) as { title: string }).title, 'Untitled');
  }
}

/** A hand-edit turn's line: "Edited by hand: Rebase basics, Rebase check". */
export function handSummary(changes: CourseChanges): string {
  return turnSummary(`Edited by hand: ${changes.rows.map(rowName).join(', ')}`);
}

const ENDED: Record<Exclude<TurnOutcome, 'done'>, string> = {
  stopped: 'Stopped. What this turn had changed is kept.',
  failed: 'This turn did not finish. What it had changed is kept.',
};

interface RunningTurn {
  id: string;
  /** Null for a turn the agent was already in when the page opened. */
  message: string | null;
}

const noop = () => undefined;

/**
 * A session's working copies as Studio's `Working`. The same shape: the schema's output only adds
 * `undefined` to `answersChanged`, which a parsed file never holds.
 */
const workOf = (session: AuthoringSession): Working => session.work as Working;
const baseOf = (session: AuthoringSession): Working | null =>
  (session.base?.work ?? null) as Working | null;

/** Remembers the last answer, so a view drawn again for the same copies does not compare again. */
function lastOf<T>(compute: (base: Working | null, work: Working) => T) {
  let memo: { base: Working | null; work: Working; value: T } | null = null;
  return (base: Working | null, work: Working): T => {
    if (memo?.base !== base || memo.work !== work)
      memo = { base, work, value: compute(base, work) };
    return memo.value;
  };
}

export function createAgentSession({
  desktop,
  uid,
  sessionId,
  store = createSessionStore({ desktop, uid }),
  sources = bridgeSources(desktop.sources, { uid, sessionId }),
  context = defaultToolContext(sources),
  tools = TOOLS,
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
}: AgentSessionOptions): AgentSession {
  const { agent } = desktop;
  const listeners = new Set<() => void>();
  const unsubscribe: (() => void)[] = [];
  let disposed = false;
  let status: AgentSessionStatus = 'loading';
  let problem: AgentProblem | null = null;
  let session: AuthoringSession | null = null;
  /**
   * The session as `session.json` holds it. Its working copy is what the last saved turn left:
   * what the next turn is counted against.
   */
  let saved: AuthoringSession | null = null;
  /** A finished turn that could not be written: its changes are in `session` only. */
  let unsaved: Turn | null = null;
  let transcript: TranscriptEntry[] = [];
  let activity: string | null = null;
  let turn: RunningTurn | null = null;
  /** Turns undone since the agent was last told. */
  let undone = 0;
  /** A hand-edit turn was made or undone since the agent was last told. */
  let handEdited = false;
  /** `agent-note.json` is on disk: the two above, kept for a runtime opened after this one. */
  let noteKept = false;
  /**
   * Hand edits not yet a turn. `before` is the copy `session.json` held before them (what the turn
   * is counted against, and what `editing.json` keeps); `start` the copy in memory then, which an
   * edit that comes to nothing goes back to; `kept` the last copy written to `session.json`.
   */
  let hand: {
    since: string;
    before: Working;
    start: Working;
    kept: Working | null;
    state: HandEditState;
    savedAt: string | null;
  } | null = null;
  /** `editing.json` is on disk: removed once the hand edits it notes are a turn or are gone. */
  let handNoted = false;
  let queue: Promise<unknown> = Promise.resolve();

  const allChanges = lastOf(courseChanges);
  const turnCount = lastOf((before, work) => courseChanges(before, work).count);

  /** Hand edits are allowed: the session is open and no turn runs or is undone. */
  const editable = () =>
    session?.status === 'open' &&
    turn === null &&
    (status === 'ready' || status === 'connecting' || status === 'unavailable');

  const view = (): AgentSessionView => {
    const work = session ? workOf(session) : null;
    const base = session ? baseOf(session) : null;
    const turns = session?.turns ?? [];
    return {
      status,
      problem,
      session,
      transcript,
      activity,
      work,
      base,
      changes: work ? allChanges(base, work) : null,
      turns,
      unsaved,
      // A turn runs only once the session is open, so `work` is there.
      turnChanges: turn ? turnCount(workOf(saved as AuthoringSession), work as Working) : 0,
      canSend: status === 'ready' && hand === null,
      canStop: status === 'working',
      canUndo: status === 'ready' && hand === null && (turns.length > 0 || unsaved !== null),
      canEdit: editable(),
      handEdits: hand ? { state: hand.state, savedAt: hand.savedAt } : null,
    };
  };
  let snapshot = view();

  const emit = () => {
    snapshot = view();
    for (const listener of listeners) listener();
  };

  const say = (entry: TranscriptEntry) => {
    transcript = [...transcript, entry];
  };
  const notice = (turnId: string | null, text: string) =>
    say({ kind: 'notice', turnId, at: now().toISOString(), text });

  /** Runs tasks one after another, so tool calls, turn ends and undo never overlap. */
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task);
    queue = result.then(noop, noop);
    return result;
  };

  /** The chat to disk. Losing it loses no course work, so a failure is only logged. */
  const writeChat = async () => {
    try {
      await store.writeTranscript(sessionId, transcript);
    } catch (error) {
      log.warn('Session transcript not saved', { sessionId, reason: bridgeFailure(error) });
    }
  };

  const unavailable = (next: AgentProblem) => {
    status = 'unavailable';
    problem = next;
    activity = null;
    log.warn('Agent unavailable', { sessionId, reason: next.code });
    emit();
  };

  /**
   * The Educator's message the agent is still answering, as the chat on disk keeps it: the newest
   * message, when nothing follows it under its id and no turn is written under it. `send` writes
   * the chat as soon as a message is sent, so a page that reloads mid-turn finds it there; the
   * agent's words and any notice of the turn are written only at its end. A message something
   * follows is an answered, refused or undone turn's (an undone turn's id leaves `turns`), so when
   * the newest message never reached the disk the turn is "carried on", not given an old one's id.
   */
  const pendingMessage = (): RunningTurn | null => {
    const current = session as AuthoringSession;
    const last = transcript.findLast((entry) => entry.kind === 'educator');
    if (
      !last ||
      transcript.findLast((entry) => entry.turnId === last.turnId) !== last ||
      current.turns.some((t) => t.id === last.turnId) ||
      unsaved?.id === last.turnId
    )
      return null;
    return { id: last.turnId, message: last.text };
  };

  /** The agent is in a turn this page did not start (the page reloaded while it worked). */
  const adopt = (): RunningTurn => {
    if (turn) return turn;
    // A turn the page did not start, while hand edits are open (the page reloaded mid-turn and the
    // editor opened before the agent spoke): they become their own turn first, so neither is
    // counted in the other.
    if (hand) void enqueue(finishEdits);
    turn = pendingMessage() ?? { id: newId(), message: null };
    if (status === 'ready') status = 'working';
    return turn;
  };

  const connect = async () => {
    const current = session as AuthoringSession;
    status = 'connecting';
    problem = null;
    emit();
    try {
      const blocked = statusProblem(await agent.status());
      if (blocked) return unavailable(blocked);
      const started = await agent.start({
        uid,
        sessionId,
        ...agentSetup(tools),
        // Only an id a finished turn named: Claude Code keeps no chat for a session never sent to.
        resumeId: current.agentSessionId,
      });
      if (!started.ok) return unavailable(problemOf(started.error));
      status = turn ? 'working' : 'ready';
      log.info('Agent started', { sessionId, resumed: current.agentSessionId !== null });
      emit();
    } catch (error) {
      log.error('Agent not started', error, { sessionId });
      unavailable(appProblem(error));
    }
  };

  /**
   * Writes a Claude session id that came with no turn to write it (the turn had already ended on an
   * error), so the next open resumes that chat and the clean-up can remove Claude Code's copy of it.
   * Only the id: a turn that could not be written stays unwritten.
   */
  const keepAgentSessionId = async (agentSessionId: string | null) => {
    try {
      const written = await store.save({ ...(saved as AuthoringSession), agentSessionId });
      saved = written;
      session = { ...(session as AuthoringSession), updatedAt: written.updatedAt };
    } catch (error) {
      log.warn('Session agent id not saved', { sessionId, reason: bridgeFailure(error) });
    }
  };

  /**
   * `agent-note.json` as `undone` and `handEdited` stand: written while there is something to tell
   * the agent, removed once a message has told it, so the note survives the runtime (`open` reads
   * it). Only logged on failure: the note in memory still goes with this runtime's next message.
   */
  const keepNote = async () => {
    const note = undone > 0 || handEdited ? { undone, handEdited } : null;
    if (note === null && !noteKept) return;
    try {
      await store.saveAgentNote(sessionId, note);
      noteKept = note !== null;
    } catch (error) {
      log.warn('Session agent note not saved', { sessionId, reason: bridgeFailure(error) });
    }
  };

  /**
   * The session with hand edits that do not pass the course schema dropped, back to the last copy
   * written (or, before any, the copy from before them); the session as it is when they pass.
   */
  const withoutIncomplete = (pending: { start: Working; kept: Working | null }) => {
    const current = session as AuthoringSession;
    if (workingSchema.safeParse(workOf(current)).success) return current;
    log.warn('Session hand edits dropped', { sessionId, reason: 'incomplete' });
    return { ...current, work: pending.kept ?? pending.start };
  };

  /** Removes `editing.json` once nothing it notes is left to make a turn of. Only logged on failure. */
  const forgetHandNote = async () => {
    if (!handNoted) return;
    try {
      await store.clearHandEdits(sessionId);
      handNoted = false;
    } catch (error) {
      log.warn('Session hand edit note not removed', { sessionId, reason: bridgeFailure(error) });
    }
  };

  /**
   * Writes the hand edits to `session.json`, `editing.json` first so a crash after it still makes
   * them a turn. A copy that does not pass the course schema waits in memory (`incomplete`).
   */
  const writeEdits = async (): Promise<boolean> => {
    const pending = hand;
    if (!pending || pending.state === 'saved') return true;
    const current = session as AuthoringSession;
    const work = workOf(current);
    if (!workingSchema.safeParse(work).success) {
      pending.state = 'incomplete';
      emit();
      return false;
    }
    pending.state = 'saving';
    emit();
    try {
      if (!handNoted) {
        await store.saveHandEdits(sessionId, { since: pending.since, before: pending.before });
        handNoted = true;
      }
      const written = await store.save(current);
      pending.kept = work;
      pending.savedAt = written.updatedAt;
      // An edit made while it was written leaves it waiting for the next pause.
      pending.state = session === current ? 'saved' : 'dirty';
    } catch (error) {
      log.warn('Session hand edits not saved', { sessionId, reason: bridgeFailure(error) });
      pending.state = 'error';
    }
    emit();
    return pending.state === 'saved';
  };

  /**
   * Makes the hand edits one turn by the Educator: counted against the copy before them, with the
   * start checkpoint before a first turn, its own checkpoint and the session (`saveTurn`), and a
   * line in the chat. Edits that do not pass the course schema are dropped first, back to the last
   * copy written; edits that came to nothing make no turn. A turn that cannot be written stays in
   * memory as `unsaved`, as an agent turn would.
   */
  const finishEdits = async (): Promise<void> => {
    const pending = hand;
    if (!pending) return;
    const current = withoutIncomplete(pending);
    hand = null;
    session = current;
    if (courseChanges(pending.start, workOf(current)).count === 0) {
      // Nothing an Educator would see changed: back to the copy from before, on disk too.
      session = { ...current, work: pending.start };
      try {
        if (handNoted) session = await store.save(session as AuthoringSession);
        await forgetHandNote();
      } catch (error) {
        log.warn('Session hand edits not saved', { sessionId, reason: bridgeFailure(error) });
      }
      return emit();
    }
    const changes = courseChanges(pending.before, workOf(current));
    const id = newId();
    const record: Turn = {
      id,
      at: now().toISOString(),
      by: 'educator',
      summary: handSummary(changes),
      checkpoint: `${id}.json`,
      changes: changes.count,
    };
    notice(id, record.summary);
    handEdited = true;
    emit();
    try {
      if (current.turns.length === 0) await store.saveStart(sessionId, pending.before);
      const written = await store.saveTurn(current, record, current.work);
      session = written;
      saved = written;
      unsaved = null;
      await forgetHandNote();
      log.info('Session hand edits saved', { sessionId, turnId: id, changes: record.changes });
    } catch (error) {
      log.error('Session hand edits not saved as a turn', error, { sessionId, turnId: id });
      problem = NOT_SAVED;
      unsaved = record;
    }
    await keepNote();
    await writeChat();
    emit();
  };

  /**
   * Ends the running turn: its change count, the checkpoint before the first turn, the turn's own
   * checkpoint and the session (`saveTurn`), then the chat. A write that fails leaves the turn's
   * changes in memory, counted again by the next turn that is written, or taken back by Undo.
   */
  const endTurn = async (agentSessionId: string | null, outcome: TurnOutcome) => {
    const current = {
      ...(session as AuthoringSession),
      agentSessionId: agentSessionId ?? (session as AuthoringSession).agentSessionId,
    };
    session = current;
    const running = turn;
    if (!running) {
      if (current.agentSessionId !== (saved as AuthoringSession).agentSessionId)
        await keepAgentSessionId(current.agentSessionId);
      return emit();
    }
    const before = workOf(saved as AuthoringSession);
    if (outcome !== 'done') notice(running.id, ENDED[outcome]);
    activity = null;
    emit();
    const record: Turn = {
      id: running.id,
      at: now().toISOString(),
      by: 'agent',
      summary: turnSummary(running.message),
      checkpoint: `${running.id}.json`,
      changes: courseChanges(before, workOf(current)).count,
    };
    try {
      if (current.turns.length === 0) await store.saveStart(sessionId, before);
      const written = await store.saveTurn(current, record, current.work);
      session = written;
      saved = written;
      unsaved = null;
      // Hand edits whose own turn was not written are counted in this one.
      await forgetHandNote();
      log.info('Session turn saved', {
        sessionId,
        turnId: record.id,
        changes: record.changes,
        outcome,
      });
    } catch (error) {
      log.error('Session turn not saved', error, { sessionId, turnId: record.id });
      problem = NOT_SAVED;
      unsaved = record;
    }
    await writeChat();
    turn = null;
    // While the agent is still starting, `connect` decides once it has; a turn adopted while it
    // could not run leaves it unable to, and `retry` asks again.
    if (status !== 'connecting' && status !== 'unavailable') status = 'ready';
    emit();
  };

  const onError = async (error: AgentError) => {
    const next = problemOf(error);
    notice(turn?.id ?? null, next.message);
    if (error.code === 'plan_limit') {
      // The shell interrupts the turn, which ends `failed`; the session waits for the limit.
      problem = next;
      log.warn('Agent plan limit', { sessionId });
      return emit();
    }
    // The agent cannot go on: a turn it left open ends here, keeping what it had changed.
    if (turn) await endTurn(null, 'failed');
    unavailable(next);
  };

  const runCall = async (call: AgentToolCall) => {
    const current = session as AuthoringSession;
    const state: SessionState = {
      work: workOf(current),
      base: baseOf(current),
      title: current.title,
      goals: current.goals,
      summary: current.summary,
      todos: current.todos,
    };
    const result = await runToolIn(tools, state, call.name, call.input, context);
    let reply: AgentToolResult;
    if ('error' in result) reply = { error: result.error };
    else if (result.text.length > TOOL_RESULT_MAX_LENGTH) {
      log.warn('Session tool answer too long', { sessionId, tool: call.name });
      reply = { error: TOO_LONG };
    } else {
      const { work, title, goals, summary, todos } = result.state;
      session = { ...current, work, title, goals, summary, todos };
      reply = { text: result.text };
      emit();
    }
    try {
      await agent.toolResult(sessionId, call.callId, reply);
    } catch (error) {
      // The shell answers the model itself when a result is late; nothing else to do.
      log.warn('Session tool answer not delivered', {
        sessionId,
        tool: call.name,
        reason: bridgeFailure(error),
      });
    }
  };

  const onEvent = (event: AgentEvent) => {
    if (event.sessionId !== sessionId) return;
    const at = now().toISOString();
    switch (event.type) {
      case 'text':
        say({ kind: 'agent', turnId: adopt().id, at, text: event.text });
        return emit();
      case 'activity':
      case 'tool_call': {
        const text = event.type === 'activity' ? event.text : toolActivity(event.name);
        say({ kind: 'activity', turnId: adopt().id, at, text });
        activity = text;
        return emit();
      }
      case 'turn_end':
        void enqueue(() => endTurn(event.agentSessionId, event.outcome));
        return;
      case 'error':
        void enqueue(() => onError(event.error));
        return;
    }
  };

  const onToolCall = (call: AgentToolCall) => {
    if (call.sessionId !== sessionId) return;
    adopt();
    void enqueue(() => runCall(call));
  };

  const open = async () => {
    let found: AuthoringSession | null;
    try {
      found = await store.read(sessionId);
      if (found) transcript = await store.readTranscript(sessionId);
    } catch (error) {
      log.error('Session not opened', error, { sessionId });
      return unavailable(appProblem(error));
    }
    if (disposed) return;
    if (!found) {
      status = 'missing';
      return emit();
    }
    session = found;
    saved = found;
    if (found.status !== 'open') {
      status = 'closed';
      return emit();
    }
    // What an earlier runtime had not told the agent yet, read before hand edits add to it.
    try {
      const note = await store.readAgentNote(sessionId);
      if (note) {
        noteKept = true;
        undone = note.undone;
        handEdited = note.handEdited;
      }
    } catch (error) {
      log.warn('Session agent note not read', { sessionId, reason: bridgeFailure(error) });
    }
    // Hand edits the app closed on (`editing.json`): made a turn before the agent starts.
    try {
      const pending = await store.readHandEdits(sessionId);
      if (pending) {
        handNoted = true;
        hand = {
          since: pending.since,
          before: pending.before as Working,
          start: pending.before as Working,
          kept: workOf(found),
          state: 'saved',
          savedAt: found.updatedAt,
        };
        await enqueue(finishEdits);
      }
    } catch (error) {
      // Only the line in the chat is lost: the edits are in `session.json` all the same.
      log.warn('Session hand edits not recovered', { sessionId, reason: bridgeFailure(error) });
    }
    unsubscribe.push(agent.onEvent(onEvent), agent.onToolCall(onToolCall));
    await connect();
  };

  return {
    getState: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    open,

    async retry() {
      if (status !== 'unavailable') return;
      if (session === null) return open();
      await connect();
    },

    async send(message) {
      const text = message.trim();
      if (status !== 'ready' || hand || text === '' || text.length > MESSAGE_MAX_LENGTH)
        return false;
      const running: RunningTurn = { id: newId(), message: text };
      turn = running;
      status = 'working';
      problem = null;
      activity = null;
      say({ kind: 'educator', turnId: running.id, at: now().toISOString(), text });
      emit();
      try {
        const notes = (undone > 0 ? undoNote(undone) : '') + (handEdited ? HAND_EDIT_NOTE : '');
        await agent.send(sessionId, notes + text);
        undone = 0;
        handEdited = false;
        void enqueue(keepNote);
        // The message to disk now, not at the turn's end: a page reloaded mid-turn keeps it.
        void enqueue(writeChat);
        return true;
      } catch (error) {
        log.warn('Agent message not sent', { sessionId, reason: bridgeFailure(error) });
        turn = null;
        status = 'ready';
        problem = appProblem(error);
        notice(running.id, 'Not sent.');
        emit();
        return false;
      }
    },

    async stop() {
      if (status !== 'working') return;
      status = 'stopping';
      emit();
      try {
        await agent.stop(sessionId);
      } catch (error) {
        log.warn('Agent not stopped', { sessionId, reason: bridgeFailure(error) });
        // The turn may have ended on its own meanwhile.
        if (status === 'stopping') status = 'working';
        problem = appProblem(error);
        emit();
      }
    },

    async undo() {
      if (status !== 'ready' || hand || !session || (session.turns.length === 0 && !unsaved))
        return false;
      status = 'undoing';
      problem = null;
      emit();
      return enqueue(async () => {
        const current = session as AuthoringSession;
        const pending = unsaved;
        const last = pending ?? (current.turns[current.turns.length - 1] as Turn);
        try {
          let next: AuthoringSession;
          if (pending) {
            // Its changes never reached the disk: the copy before it is the one last written.
            next = await store.save({ ...current, work: (saved as AuthoringSession).work });
          } else {
            const file =
              current.turns.length === 1
                ? START_CHECKPOINT
                : (current.turns[current.turns.length - 2] as Turn).checkpoint;
            const before = await store.readCheckpoint(sessionId, file);
            if (!before) {
              problem = UNDO_GONE;
              return false;
            }
            next = await store.undoTurn(current, before);
          }
          session = next;
          saved = next;
          unsaved = null;
          // The agent's own history says it made an agent turn; a hand edit it never knew of.
          if (last.by === 'educator') handEdited = true;
          else undone += 1;
          await keepNote();
          await forgetHandNote();
          notice(last.id, 'Turn undone: the course is back as it was before it.');
          await writeChat();
          log.info('Session turn undone', { sessionId, turnId: last.id });
          return true;
        } catch (error) {
          log.error('Session turn not undone', error, { sessionId, turnId: last.id });
          problem = appProblem(error);
          return false;
        } finally {
          // A turn the agent was already in may have spoken meanwhile (`adopt`).
          status = turn ? 'working' : 'ready';
          emit();
        }
      });
    },

    edit(change) {
      if (!editable()) return false;
      const current = session as AuthoringSession;
      hand ??= {
        since: now().toISOString(),
        before: workOf(saved as AuthoringSession),
        start: workOf(current),
        kept: null,
        state: 'saved',
        savedAt: null,
      };
      hand.state = 'dirty';
      session = { ...current, work: change(workOf(current)) };
      emit();
      return true;
    },

    keepEdits: () => enqueue(writeEdits),

    endEdits: () => enqueue(finishEdits),

    dropIncomplete: () =>
      enqueue(async () => {
        const pending = hand;
        if (!pending) return;
        const next = withoutIncomplete(pending);
        if (next === session) return;
        session = next;
        // Back to a copy on disk already, or (before any write) to the one from before the edits.
        pending.state = 'saved';
        emit();
      }),

    busy: () => turn !== null || status === 'undoing' || hand !== null,

    settled: () => queue.then(noop),

    dispose() {
      disposed = true;
      for (const end of unsubscribe.splice(0)) end();
    },
  };
}
