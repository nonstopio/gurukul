import {
  Button,
  Callout,
  ChatActivity,
  ChatAttachments,
  ChatLog,
  ChatMessage,
  ChatTurn,
  SendIcon,
  Textarea,
  buttonClass,
} from '@gurukul/ui';
import type { Turn } from '@gurukul/schema';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Link } from 'react-router';
import type { GurukulDesktop } from '../../desktop/bridge';
import { Prose } from '../../player/blocks';
import { ConfirmDialog } from '../ConfirmDialog';
import { MESSAGE_MAX_LENGTH } from './agent';
import { attachmentKey } from './attachments';
import type { AttachTarget } from './attachments';
import { ProblemNote, UnavailableCard, Words } from './Problem';
import type { AgentSessionHandle } from './useAgentSession';
import { chatLines, turnBy, turnLabel } from './workspace';

/** Where Review opens on one turn's changes (`DSK-14` reads `turn`). */
export const reviewPath = (sessionId: string, turnId?: string) =>
  `/studio/sessions/${sessionId}/review${turnId ? `?turn=${encodeURIComponent(turnId)}` : ''}`;

/** Attached parts as chips: keyed by what they point at, named in plain words. */
const chips = (targets: readonly AttachTarget[]) =>
  targets.map((t) => ({ id: attachmentKey(t), label: t.label }));

const CLOSED = {
  saved:
    'This session was saved and closed. Its chat and its copy of the course are kept here to read; nothing more changes.',
  discarded:
    'This session was discarded. Its chat and its copy of the course are kept here to read; the draft was never touched.',
} as const;

/**
 * The session's chat (`.plan/22-desktop-studio.md`, The session workspace): what was said, a line
 * after each written turn with its count and, on the newest, Undo behind a confirmation; the live
 * line of what the agent is doing, never a tool name; Stop during a turn; and the message box. The
 * draft message lives with the caller, so it survives the drawer closing.
 */
export function ChatPanel({
  agent,
  desktop,
  sessionId,
  draft,
  onDraft,
}: {
  agent: AgentSessionHandle;
  desktop: GurukulDesktop;
  sessionId: string;
  draft: string;
  onDraft: (text: string) => void;
}) {
  const { status, problem, transcript, turns, unsaved, activity, canSend, canUndo } = agent;
  const { attachments, detach } = agent;
  const attached = useMemo(() => chips(attachments), [attachments]);
  const lines = useMemo(() => chatLines(transcript, turns, unsaved), [transcript, turns, unsaved]);
  const log = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [undoing, setUndoing] = useState<{ turn: Turn; number: number } | null>(null);
  const working = status === 'working' || status === 'stopping';

  // The newest message in view as the chat grows.
  const atEnd = useRef(true);
  useEffect(() => {
    const el = log.current as HTMLDivElement;
    el.scrollTop = el.scrollHeight;
    atEnd.current = true;
  }, [lines.length, activity]);

  // And as the log's own height changes: the top bar is measured after the log has scrolled, and a
  // long title, or one the agent sets, makes it taller and the sticky chat shorter. A log the
  // Educator scrolled up in stays where they left it.
  useEffect(() => {
    const el = log.current as HTMLDivElement;
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
    if (!canSend || text.trim() === '') return;
    onDraft('');
    if (!(await agent.send(text))) onDraft(text);
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send();
  };

  const closed = agent.session && agent.session.status !== 'open' ? agent.session.status : null;

  return (
    <>
      {lines.length === 0 ? (
        <p className="sc-help">
          {closed
            ? 'Nothing was said in this session.'
            : 'Your goal is in the box below: send it to start, or change it first. The agent changes only this copy of the course; the draft changes when you save from Review.'}
        </p>
      ) : null}
      <ChatLog label="Chat with the agent" className="ss-chat__log" ref={log} tabIndex={0}>
        {lines.map((line) => {
          if (line.kind === 'turn') {
            return (
              <ChatTurn key={`turn-${line.turn.id}`}>
                <Link
                  className={buttonClass('quiet', undefined, 'sm')}
                  to={reviewPath(sessionId, line.turn.id)}
                >
                  {turnLabel(line.number, line.turn.changes, line.saved, turnBy(line.turn))}
                </Link>
                {line.newest && canUndo ? (
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => setUndoing({ turn: line.turn, number: line.number })}
                  >
                    {`Undo turn ${line.number}`}
                  </Button>
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
          <form className="ss-composer" onSubmit={onSubmit}>
            <ChatAttachments
              label="Attached to your next message"
              items={attached}
              onRemove={detach}
              onEmptied={() => box.current?.focus()}
            />
            <Textarea
              ref={box}
              label="Ask for a change"
              hint={
                status === 'connecting'
                  ? 'Starting the agent…'
                  : attached.length === 0
                    ? 'Enter sends; Shift and Enter start a new line. To point at one part of the course, attach it from the Preview or the Outline.'
                    : 'Enter sends, with what is attached; Shift and Enter start a new line.'
              }
              rows={3}
              maxLength={MESSAGE_MAX_LENGTH}
              value={draft}
              onChange={(event) => onDraft(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="ss-composer__actions">
              {working ? (
                <Button
                  variant="secondary"
                  loading={status === 'stopping'}
                  onClick={() => void agent.stop()}
                >
                  Stop
                </Button>
              ) : (
                <Button
                  type="submit"
                  icon={<SendIcon />}
                  disabled={!canSend || draft.trim() === ''}
                >
                  Send
                </Button>
              )}
            </div>
          </form>
        </>
      )}
      {undoing ? (
        <ConfirmDialog
          title={`Undo turn ${undoing.number}?`}
          confirmLabel={`Undo turn ${undoing.number}`}
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
    </>
  );
}
