import {
  ArrowUpIcon,
  BookIcon,
  Button,
  Callout,
  ChatActivity,
  ChatAttachments,
  ChatChanges,
  ChatCheck,
  ChatComposer,
  ChatLog,
  ChatMessage,
  ChatRoundButton,
  ChatSteps,
  ChatTurn,
  ChatTurnFooter,
  ChecklistIcon,
  CopyIcon,
  HomeIcon,
  IconButton,
  PlusIcon,
  SettingsIcon,
  StopIcon,
  TextIcon,
  UndoIcon,
  useToast,
} from '@gurukul/ui';
import type { ChatChange } from '@gurukul/ui';
import type { Turn, TurnPart } from '@gurukul/schema';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent, DragEvent, FormEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import type { GurukulDesktop } from '../../desktop/bridge';
import { Prose } from '../../player/blocks';
import { useTerms } from '../../labels/useTerms';
import type { Terms } from '../../labels/terms';
import { ConfirmDialog } from '../ConfirmDialog';
import { toastError } from '../../errors';
import { log } from '../../log';
import { copyText } from '../media/clipboard';
import { relativeTime } from '../studioModel';
import { MESSAGE_MAX_LENGTH } from './agent';
import { MAX_ATTACHMENTS, attachmentKey } from './attachments';
import type { AttachTarget } from './attachments';
import { ChatBar } from './ChatBar';
import { ProblemNote, UnavailableCard, Words } from './Problem';
import type { AgentSessionHandle } from './useAgentSession';
import { MAX_ADD_BYTES } from './sources';
import { chatLines, turnFooter } from './workspace';
import type { HeaderChecks } from './workspace';

/** Where Review opens on one turn's changes (`DSK-14` reads `turn`). */
export const reviewPath = (sessionId: string, turnId?: string) =>
  `/studio/sessions/${sessionId}/review${turnId ? `?turn=${encodeURIComponent(turnId)}` : ''}`;

/** Attached parts as chips: keyed by what they point at, named in plain words. */
const chips = (targets: readonly AttachTarget[]) =>
  targets.map((t) => ({ id: attachmentKey(t), label: t.label }));

/** True while a drag carries files (not text or a link). */
const dragsFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

const PART_ICON: Record<TurnPart['kind'], ReactNode> = {
  course: <SettingsIcon size={16} />,
  landing: <HomeIcon size={16} />,
  chapter: <BookIcon size={16} />,
  lesson: <TextIcon size={16} />,
  quiz: <ChecklistIcon size={16} />,
};

const PART_VERB: Record<TurnPart['status'], string> = {
  added: 'Added',
  changed: 'Edited',
  moved: 'Moved',
  removed: 'Removed',
  renamed: 'Renamed',
};

/** A turn's changed parts as the list draws them: "Edited Quiz · Branching", with when. */
function changeItems(turn: Turn, t: Terms, now: Date): ChatChange[] {
  const detail = relativeTime(new Date(turn.at), now);
  return (turn.parts ?? []).map((part, i) => {
    const title = part.title || 'Untitled';
    const name =
      part.kind === 'course'
        ? 'course details'
        : part.kind === 'landing'
          ? 'landing page'
          : part.kind === 'lesson'
            ? title
            : `${t[part.kind === 'quiz' ? 'Quiz' : 'Chapter']} · ${title}`;
    return {
      id: `${i}`,
      icon: PART_ICON[part.kind],
      label: `${PART_VERB[part.status]} ${name}`,
      detail,
    };
  });
}

const CLOSED = {
  saved:
    'This session was saved and closed. Its chat and its copy of the course are kept here to read; nothing more changes.',
  discarded:
    'This session was discarded. Its chat and its copy of the course are kept here to read; the draft was never touched.',
} as const;

/**
 * The session's chat (`.plan/22-desktop-studio.md`, The session workspace): what was said, and
 * after each written turn what it changed, its footer with its count and, on the newest, Go back to
 * before this behind a confirmation, and its check; the live
 * line of what the agent is doing, never a tool name; Stop during a turn; and the message box. The
 * draft message lives with the caller, so it survives the drawer closing.
 */
export function ChatPanel({
  agent,
  desktop,
  platform,
  sessionId,
  draft,
  onDraft,
  checks,
  onAdded,
}: {
  agent: AgentSessionHandle;
  desktop: GurukulDesktop;
  platform: string;
  sessionId: string;
  draft: string;
  onDraft: (text: string) => void;
  /** The working copy's checks, as the top bar shows them: the newest turn says what they found. */
  checks: HeaderChecks;
  /** Files were copied into the Sources folder: the Sources tab reads it again. */
  onAdded: () => void;
}) {
  const t = useTerms();
  const toast = useToast();
  const { status, problem, transcript, turns, unsaved, activity, canSend, canUndo } = agent;
  const { attachments, detach } = agent;
  const attached = useMemo(() => chips(attachments), [attachments]);
  const lines = useMemo(() => chatLines(transcript, turns, unsaved), [transcript, turns, unsaved]);
  const logEl = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [undoing, setUndoing] = useState<{ turn: Turn; number: number } | null>(null);
  const working = status === 'working' || status === 'stopping';
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState(false);
  // dragenter and dragleave fire for every child the pointer crosses: count them.
  const depth = useRef(0);
  const picker = useRef<HTMLInputElement>(null);

  // The newest message in view as the chat grows.
  const atEnd = useRef(true);
  useEffect(() => {
    const el = logEl.current as HTMLDivElement;
    el.scrollTop = el.scrollHeight;
    atEnd.current = true;
  }, [lines.length, activity]);

  // And as the log's own height changes: the top bar is measured after the log has scrolled, and a
  // long title, or one the agent sets, makes it taller and the sticky chat shorter. A log the
  // Educator scrolled up in stays where they left it.
  useEffect(() => {
    const el = logEl.current as HTMLDivElement;
    const onScroll = () => {
      atEnd.current = el.scrollHeight - el.clientHeight - el.scrollTop <= 1;
    };
    el.addEventListener('scroll', onScroll);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (atEnd.current) el.scrollTop = el.scrollHeight;
          });
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      observer?.disconnect();
    };
  }, []);

  // Stop, Send and Undo come and go with a turn: focus that would be lost returns to the box.
  const was = useRef(status);
  useEffect(() => {
    if (was.current !== status && status === 'ready' && document.activeElement === document.body)
      box.current?.focus();
    was.current = status;
  }, [status]);

  const send = async () => {
    const text = draft;
    if (!canSend || adding || text.trim() === '') return;
    onDraft('');
    if (!(await agent.send(text))) onDraft(text);
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };
  const copy = async (text: string) => {
    const copied = await copyText(text);
    toast.show(copied ? 'Reply copied' : 'Could not copy the reply', {
      tone: copied ? 'success' : 'danger',
    });
  };
  const closed = agent.session && agent.session.status !== 'open' ? agent.session.status : null;
  // The message box is there (so files can be added) unless the session ended or has no agent.
  const composing = !closed && !(status === 'unavailable' && problem);

  // Copies the files into the session's Sources folder through the shell, then attaches each to the
  // next message so the agent is told its name. The window sends names and bytes, never a path.
  const addFiles = async (picked: File[]) => {
    if (picked.length === 0 || adding || !composing) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (picked.length > room) {
      toast.show(
        room === 0
          ? 'This message already carries 10 things. Send it, or remove one, before adding files.'
          : `This message has room for ${room} more. Add fewer files, or send it first.`,
        { tone: 'danger' },
      );
      return;
    }
    if (picked.some((file) => file.size > MAX_ADD_BYTES)) {
      toast.show('A file is larger than 25 MB. Add a smaller copy.', { tone: 'danger' });
      return;
    }
    const { uid, courseId } = agent.session as NonNullable<typeof agent.session>;
    setAdding(true);
    try {
      const files = await Promise.all(
        picked.map(async (file) => ({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      );
      const { added } = await desktop.sources.add(
        { uid, sessionId, ...(courseId && { suggestedName: courseId }) },
        files,
      );
      for (const name of added) agent.attach({ kind: 'file', ids: { name }, label: name });
      onAdded();
    } catch (error) {
      log.error('Files not added', error, { sessionId });
      toastError(
        toast,
        error,
        'The files could not be added. Folders and files with a name starting with a dot are not accepted.',
      );
    } finally {
      setAdding(false);
    }
  };
  const onDragEnter = (event: DragEvent) => {
    if (!composing || !dragsFiles(event)) return;
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  };
  const onDragOver = (event: DragEvent) => {
    if (composing && dragsFiles(event)) event.preventDefault();
  };
  const onDragLeave = (event: DragEvent) => {
    if (!composing || !dragsFiles(event)) return;
    depth.current -= 1;
    if (depth.current <= 0) setDragging(false);
  };
  const onDrop = (event: DragEvent) => {
    if (!composing || !dragsFiles(event)) return;
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  };
  const onPaste = (event: ClipboardEvent) => {
    if (event.clipboardData.files.length === 0) return;
    event.preventDefault();
    void addFiles(Array.from(event.clipboardData.files));
  };
  const passing = checks.valid && !checks.overLimit;
  const now = new Date();

  return (
    <div
      role="presentation"
      className="ss-chat__panel"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      {dragging ? (
        <div className="ss-chat__drop" aria-hidden="true">
          Drop files to add them to this session
        </div>
      ) : null}
      {lines.length === 0 ? (
        <p className="sc-help">
          {closed
            ? 'Nothing was said in this session.'
            : 'Say what you want to do in the box below, then send it. The agent changes only this copy of the course; the draft changes when you save from Review.'}
        </p>
      ) : null}
      <ChatLog label="Chat with the agent" className="ss-chat__log" ref={logEl} tabIndex={0}>
        {lines.map((line) => {
          if (line.kind === 'turn') {
            const { lead, count, tail } = turnFooter(line);
            return (
              <ChatTurn key={`turn-${line.turn.id}`}>
                {line.steps.length > 0 ? (
                  <ChatSteps label="How it got there" steps={line.steps} />
                ) : null}
                <ChatChanges
                  label="What this turn changed"
                  items={changeItems(line.turn, t, now)}
                />
                <ChatTurnFooter
                  end={
                    line.newest && canUndo ? (
                      <Button
                        variant="quiet"
                        size="sm"
                        icon={<UndoIcon />}
                        onClick={() => setUndoing({ turn: line.turn, number: line.number })}
                      >
                        Go back to before this
                      </Button>
                    ) : null
                  }
                >
                  {line.reply === '' ? null : (
                    <IconButton label="Copy reply" onClick={() => void copy(line.reply)}>
                      <CopyIcon />
                    </IconButton>
                  )}
                  <span>
                    {lead}
                    <Link
                      to={reviewPath(sessionId, line.turn.id)}
                      aria-label={`${count} in turn ${line.number}, open in Review`}
                    >
                      {count}
                    </Link>
                    {tail}
                  </span>
                </ChatTurnFooter>
                {line.newest && line.saved ? (
                  <ChatCheck ok={passing}>
                    {passing
                      ? 'Checked: no new problems'
                      : 'Checked: problems to fix before saving'}
                  </ChatCheck>
                ) : null}
              </ChatTurn>
            );
          }
          const { entry } = line;
          const key = `${entry.kind}-${entry.at}-${transcript.indexOf(entry)}`;
          if (entry.kind === 'educator') {
            return (
              <ChatMessage key={key} from="you" author="You">
                {entry.text}
                {entry.attachments ? (
                  <ChatAttachments
                    label="Attached to this message"
                    items={chips(entry.attachments)}
                    className="ss-chat__attached"
                  />
                ) : null}
              </ChatMessage>
            );
          }
          if (entry.kind === 'agent') {
            return (
              <ChatMessage key={key} from="agent" author="Agent">
                {line.steps.length > 0 ? (
                  <ChatSteps label="How it got there" steps={line.steps} />
                ) : null}
                <Prose md={entry.text} pictures={false} links={false} />
              </ChatMessage>
            );
          }
          return (
            <ChatMessage key={key} from="notice">
              <Words text={entry.text} />
            </ChatMessage>
          );
        })}
      </ChatLog>
      <ChatActivity>{working ? (activity ?? 'Thinking') : null}</ChatActivity>
      {adding ? (
        <p className="sc-help" role="status" aria-busy="true">
          Adding files…
        </p>
      ) : null}
      {closed ? (
        <Callout tone="note" title={closed === 'saved' ? 'Saved' : 'Discarded'}>
          <p>{CLOSED[closed]}</p>
        </Callout>
      ) : status === 'unavailable' && problem ? (
        // In place of the message box: nothing can be sent until the agent runs.
        <UnavailableCard problem={problem} desktop={desktop} onRetry={() => void agent.retry()} />
      ) : (
        <>
          {problem ? <ProblemNote problem={problem} desktop={desktop} /> : null}
          <ChatComposer
            ref={box}
            className="ss-composer"
            label="Ask for a change"
            placeholder={
              status === 'connecting'
                ? 'Starting the agent…'
                : 'Ask for a change. Drop files here, or attach a part from the Preview or Outline.'
            }
            hint={
              attached.length === 0
                ? 'Enter sends; Shift and Enter start a new line. Files dropped on the chat are added to this session.'
                : 'Enter sends, with what is attached; Shift and Enter start a new line.'
            }
            maxLength={MESSAGE_MAX_LENGTH}
            value={draft}
            onChange={onDraft}
            onSend={() => void send()}
            onSubmit={onSubmit}
            start={
              <>
                <input
                  ref={picker}
                  type="file"
                  multiple
                  hidden
                  tabIndex={-1}
                  aria-label="Choose files to add"
                  onChange={(event) => {
                    void addFiles(Array.from(event.target.files as FileList));
                    event.target.value = '';
                  }}
                />
                <ChatRoundButton
                  label={adding ? 'Adding files…' : 'Add files'}
                  disabled={adding}
                  onClick={() => picker.current?.click()}
                >
                  <PlusIcon />
                </ChatRoundButton>
              </>
            }
            end={
              working ? (
                <ChatRoundButton
                  label="Stop"
                  tone="primary"
                  disabled={status === 'stopping'}
                  aria-busy={status === 'stopping'}
                  onClick={() => void agent.stop()}
                >
                  <StopIcon />
                </ChatRoundButton>
              ) : (
                <ChatRoundButton
                  label="Send"
                  tone="primary"
                  type="submit"
                  disabled={!canSend || adding || draft.trim() === ''}
                >
                  <ArrowUpIcon />
                </ChatRoundButton>
              )
            }
          >
            <ChatAttachments
              label="Attached to your next message"
              items={attached}
              onRemove={detach}
              onEmptied={() => box.current?.focus()}
            />
          </ChatComposer>
          <ChatBar
            agent={agent}
            sources={desktop.sources}
            sessionId={sessionId}
            platform={platform}
          />
          <p className="sc-help">
            This runs Claude Code on this computer, under your own Claude account. The course and
            what you write are sent to Anthropic, so leave out client names and internal documents.
          </p>
        </>
      )}
      {undoing ? (
        <ConfirmDialog
          title={`Go back to before turn ${undoing.number}?`}
          confirmLabel={`Go back to before turn ${undoing.number}`}
          onClose={() => setUndoing(null)}
          onConfirm={() => {
            setUndoing(null);
            void agent.undo();
          }}
        >
          The course goes back to how it was before this turn, and what the turn changed is lost.
          The chat keeps what was said, and the agent is told with your next message.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
