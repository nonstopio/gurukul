import { workingSchema } from '@gurukul/schema';
import type { Item, SessionGoal } from '@gurukul/schema';
import { courseChanges } from '@gurukul/schema/changes';
import type { ChangeRow, CourseChanges } from '@gurukul/schema/changes';
import {
  Button,
  Callout,
  Card,
  CheckIcon,
  Checkbox,
  ChecklistIcon,
  Chip,
  ChevronRightIcon,
  EmptyState,
  Menu,
  MoreIcon,
  SegmentedControl,
  Select,
  Skeleton,
  Textarea,
  buttonClass,
  iconButtonClass,
  useToast,
} from '@gurukul/ui';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { GurukulDesktop } from '../../desktop/bridge';
import { useTerms } from '../../labels/useTerms';
import { log } from '../../log';
import { BlockView } from '../../player/blocks';
import { ConfirmDialog } from '../ConfirmDialog';
import { sessionItemPath } from '../editorPlace';
import { PreviewExam } from '../PreviewExam';
import { useStudio } from '../StudioProvider';
import type { Working } from '../types';
import type { AttachTarget, AttachWords } from './attachments';
import { MAX_ATTACHMENTS } from './attachments';
import { StatusChips } from './PreviewPanel';
import type { AnswerQuestion } from './answerCheck';
import { ReviewChecks, answerWords } from './ReviewChecks';
import { RowDiff, hasProse } from './ReviewDiff';
import type { Layout, TextMode } from './ReviewDiff';
import { canRevert, revertRow } from './revert';
import type { RevertRefusal } from './revert';
import {
  comparedLine,
  countLine,
  groupRows,
  itemOf,
  numbersOf,
  rowName,
  rowTarget,
  turnFiles,
} from './review';
import type { Numbers } from './review';
import { createSessionStore } from './store';
import type { AgentSessionHandle } from './useAgentSession';
import { useAnswerCheck } from './useAnswerCheck';
import { useSideBySide } from './useSideBySide';
import { turnLabel } from './workspace';

/*
 * The session's Review tab (`.plan/22-desktop-studio.md`, Review: the whole session at once): the
 * summary and goals, every change against the draft the session started from (or one turn's), the
 * selected row compared side by side, inline or as a learner, the checks, and the way back to the
 * chat. Reviewing is one decision at the end: a row offers Viewed, Ask for a change, Open in editor
 * and Undo this item, and nothing accepts it on its own. Nothing here writes Firestore; the one
 * read is the count of learners who completed a removed lesson, when that row is opened.
 */

/** Where the chat opens with this message ready, or with a part just attached (below 1024px, its drawer). */
export interface ChatState {
  chat: true;
  draft?: string;
}

type View = Layout | 'learner';

/** The copies a list compares: the base and the working copy, or one turn's two checkpoints. */
interface Compared {
  before: Working | null;
  after: Working;
  changes: CourseChanges;
}

type TurnCopies =
  | { status: 'loading'; turnId: string }
  | { status: 'ready'; turnId: string; compared: Compared }
  | { status: 'gone'; turnId: string };

/** One turn's checkpoints, read from this computer when the filter picks it. */
function useTurnCopies(
  desktop: GurukulDesktop,
  uid: string,
  sessionId: string,
  turnId: string | null,
  files: [string, string] | null,
): TurnCopies | null {
  const [copies, setCopies] = useState<TurnCopies | null>(null);
  const [first, second] = files ?? [null, null];
  useEffect(() => {
    if (turnId === null || first === null || second === null) return;
    // A late answer for a turn no longer picked is set but never shown: the hook answers only
    // for the turn asked, and says loading until its answer is in.
    const store = createSessionStore({ desktop, uid });
    void Promise.all([
      store.readCheckpoint(sessionId, first),
      store.readCheckpoint(sessionId, second),
    ])
      .then(([before, after]) => {
        if (!before || !after) return setCopies({ status: 'gone', turnId });
        const was = before as Working;
        const now = after as Working;
        setCopies({
          status: 'ready',
          turnId,
          compared: { before: was, after: now, changes: courseChanges(was, now) },
        });
      })
      .catch((error: unknown) => {
        log.warn('Session turn copies not read', { sessionId, reason: String(error) });
        setCopies({ status: 'gone', turnId });
      });
  }, [desktop, uid, sessionId, turnId, first, second]);
  if (turnId === null) return null;
  return copies?.turnId === turnId ? copies : { status: 'loading', turnId };
}

/** How many learners completed a removed lesson: one count, asked when its row is opened. */
function useCompleted(courseId: string | null, itemId: string | null): number | null | 'failed' {
  const { data } = useStudio();
  const [count, setCount] = useState<{ itemId: string; value: number | 'failed' } | null>(null);
  useEffect(() => {
    if (courseId === null || itemId === null) return;
    // A late answer for another row is set but never shown: the hook answers only for its item.
    data
      .completedCount(courseId, itemId)
      .then((value) => setCount({ itemId, value }))
      .catch(() => {
        log.warn('Counting lesson completions failed', { courseId, itemId });
        setCount({ itemId, value: 'failed' });
      });
  }, [data, courseId, itemId]);
  return count?.itemId === itemId ? count.value : null;
}

/** While the agent or the Educator is changing the course, the answer check starts nothing new. */
const BUSY = new Set<AgentSessionHandle['status']>([
  'loading',
  'working',
  'stopping',
  'undoing',
  'editing',
]);

const REFUSALS: Record<RevertRefusal, string> = {
  no_base: 'A new course has no draft to go back to.',
  repeated: 'This id is used twice in the course, so it cannot be put back on its own.',
  not_empty: 'This chapter still holds lessons. Undo those first, then the chapter.',
  chapter_gone: 'The chapter this belonged to is gone too. Undo the chapter first.',
  id_taken: 'What took its place this session has the same id. Undo that first, then this.',
};

export function ReviewPanel({
  agent,
  desktop,
  uid,
  sessionId,
}: {
  agent: AgentSessionHandle;
  desktop: GurukulDesktop;
  uid: string;
  sessionId: string;
}) {
  const t = useTerms();
  const toast = useToast();
  const navigate = useNavigate();
  const wide = useSideBySide();
  const [params, setParams] = useSearchParams();
  const session = agent.session as NonNullable<AgentSessionHandle['session']>;
  const work = agent.work as Working;
  const changes = agent.changes as CourseChanges;
  const open = session.status === 'open';
  const words: AttachWords = { lesson: 'Lesson', quiz: t.Quiz, chapter: t.Chapter };

  const turnId = params.get('turn');
  const turnIndex = turnId === null ? -1 : agent.turns.findIndex((x) => x.id === turnId);
  const files = turnIndex < 0 ? null : turnFiles(agent.turns, turnId as string);
  const copies = useTurnCopies(desktop, uid, sessionId, turnIndex < 0 ? null : turnId, files);
  const turnCompared = copies?.status === 'ready' ? copies.compared : null;
  const compared = useMemo(
    (): Compared | null =>
      turnIndex < 0 ? { before: agent.base, after: work, changes } : turnCompared,
    [turnIndex, agent.base, work, changes, turnCompared],
  );

  const rows = compared?.changes.rows ?? [];
  const listNumbers = useMemo(() => numbersOf((compared?.after ?? work).course), [compared, work]);
  const workNumbers = useMemo(() => numbersOf(work.course), [work]);
  const viewed = useMemo(() => new Set(session.viewed), [session.viewed]);
  const selected = rows.find((r) => r.key === params.get('row')) ?? rows[0] ?? null;
  const [undoing, setUndoing] = useState<ChangeRow | null>(null);

  // The second opinion on changed Quiz answers (`DSK-18`): asks start only between turns, with no
  // hand edits open, in an open session.
  const answers = useAnswerCheck(
    { desktop, uid, sessionId },
    { work, changes, active: open && !BUSY.has(agent.status) && agent.handEdits === null },
  );
  const toCheck = useMemo(() => {
    const byQuiz = new Map<string, AnswerQuestion[]>();
    for (const q of answers.questions) {
      if (q.outcome.state !== 'disagrees') continue;
      byQuiz.set(q.quizId, [...(byQuiz.get(q.quizId) ?? []), q]);
    }
    return byQuiz;
  }, [answers.questions]);

  const go = (next: { turn?: string | null; row?: string | null }) => {
    const search = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === undefined) search.delete(key);
      else search.set(key, value);
    }
    setParams(search, { replace: true });
  };

  const toChat = (state: ChatState) => navigate(`/studio/sessions/${sessionId}`, { state });

  const ask = (targets: readonly AttachTarget[], draft?: string) => {
    const refused = targets.filter((target) => !agent.attach(target));
    if (refused.length > 0) {
      toast.show(
        `A message carries at most ${MAX_ATTACHMENTS} parts of the course. Remove one first.`,
        { tone: 'warning' },
      );
      return;
    }
    toChat(draft === undefined ? { chat: true } : { chat: true, draft });
  };

  const undo = async (row: ChangeRow) => {
    setUndoing(null);
    const result = revertRow(agent.base, work, row);
    if (!result.ok) {
      toast.show(REFUSALS[result.reason], { tone: 'warning' });
      return;
    }
    if (workingSchema.safeParse(work).success && !workingSchema.safeParse(result.work).success) {
      toast.show(
        'Putting this back would leave the course invalid, so nothing changed. Ask the agent instead.',
        { tone: 'warning' },
      );
      return;
    }
    const name = rowName(row, workNumbers);
    if (await agent.educatorTurn(result.work, `Put back ${name} as it is in the draft`)) {
      toast.show(
        `${name} is back as it is in the draft. Undo it from the chat if you change your mind.`,
        {
          tone: 'success',
        },
      );
    } else {
      toast.show('That could not be put back. Try again.', { tone: 'danger' });
    }
  };

  const goals = session.goals;
  const leftForYou = session.todos.filter((x) => !x.done).length;

  return (
    <>
      <SummaryCard
        open={open}
        summary={session.summary}
        goals={goals}
        compared={comparedLine(session.base)}
        onSave={(patch) => agent.updateReview(patch)}
      />
      <div className="ss-review">
        <Card title="Changes" className="ss-review__list">
          <ChangeList
            turns={agent.turns}
            turnId={turnIndex < 0 ? null : turnId}
            onTurn={(turn) => go({ turn, row: null })}
            loading={turnIndex >= 0 && copies?.status !== 'ready' && copies?.status !== 'gone'}
            gone={copies?.status === 'gone'}
            rows={rows}
            groups={
              compared
                ? groupRows(
                    rows,
                    compared.after.course,
                    compared.before?.course ?? null,
                    listNumbers,
                  )
                : []
            }
            numbers={listNumbers}
            viewed={viewed}
            toCheck={toCheck}
            selected={selected}
            onSelect={(row) => go({ row: row.key })}
          />
        </Card>
        <Card as="section" className="ss-review__detail" aria-label="The selected change">
          {selected && compared ? (
            <RowDetail
              key={`${turnId ?? 'all'}:${selected.key}`}
              row={selected}
              compared={compared}
              numbers={listNumbers}
              wide={wide}
              courseId={session.courseId}
              sessionId={sessionId}
              open={open}
              toCheck={
                selected.kind === 'quiz' && selected.after ? (toCheck.get(selected.id) ?? []) : []
              }
              viewed={viewed.has(selected.key)}
              onViewed={(on) =>
                void agent.updateReview({
                  viewed: on
                    ? [...session.viewed, selected.key]
                    : session.viewed.filter((k) => k !== selected.key),
                })
              }
              target={(() => {
                const row = changes.rows.find((r) => r.key === selected.key) ?? selected;
                return open ? rowTarget(row, words, workNumbers) : null;
              })()}
              onAsk={(target) => ask([target])}
              // Undo puts back what the whole session changed, so it needs the row against the base.
              undoable={
                open &&
                canRevert(agent.base, selected) &&
                changes.rows.some((r) => r.key === selected.key)
              }
              canUndo={agent.status === 'ready'}
              onUndo={() =>
                setUndoing(changes.rows.find((r) => r.key === selected.key) as ChangeRow)
              }
            />
          ) : (
            <EmptyState
              title={turnIndex < 0 ? 'Nothing has changed yet' : 'Nothing to show for this turn'}
              headingAs="h2"
              icon={<ChecklistIcon size={24} />}
              action={
                <Link className={buttonClass('secondary')} to={`/studio/sessions/${sessionId}`}>
                  Keep working
                </Link>
              }
            >
              {turnIndex < 0
                ? 'Every change the agent makes against the draft is listed here, to read before you save.'
                : 'Pick another turn, or All changes.'}
            </EmptyState>
          )}
        </Card>
        <ReviewChecks
          className="ss-review__checks"
          work={work}
          changes={changes}
          todos={session.todos}
          numbers={workNumbers}
          words={words}
          open={open}
          answers={answers}
          desktop={desktop}
          onShow={(row) => go({ turn: null, row: row.key })}
          onAsk={ask}
        />
      </div>
      <div className="ss-review__footer">
        <p className="ss-review__left">{`Left for you: ${leftForYou}`}</p>
        <Link className={buttonClass('secondary')} to={`/studio/sessions/${sessionId}`}>
          Keep working
        </Link>
        {/* The Save to draft button (`DSK-15`) takes this place. */}
        <p className="sc-help">Save to draft comes next.</p>
      </div>
      {undoing ? (
        <ConfirmDialog
          title="Undo this item?"
          confirmLabel="Undo this item"
          onClose={() => setUndoing(null)}
          onConfirm={() => void undo(undoing)}
        >
          {`${rowName(undoing, workNumbers)} goes back to how it is in the draft, and what this session changed in it is thrown away. It is written as a turn of your own, which Undo in the chat takes back.`}
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function SummaryCard({
  open,
  summary,
  goals,
  compared,
  onSave,
}: {
  open: boolean;
  summary: string;
  goals: readonly SessionGoal[];
  compared: string;
  onSave: (patch: { summary?: string; goals?: SessionGoal[] }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const done = await onSave({ summary: (editing as string).trim() });
    setSaving(false);
    if (done) setEditing(null);
  };
  return (
    <Card
      title="Summary"
      actions={
        open && editing === null ? (
          <Button variant="secondary" onClick={() => setEditing(summary)}>
            Edit summary
          </Button>
        ) : undefined
      }
    >
      <div className="ss-review__summary">
        <p className="sc-help">{compared}</p>
        {goals.length > 0 ? (
          <fieldset className="ss-review__goals">
            <legend className="ss-review__h3">Goals</legend>
            {goals.map((goal, i) => (
              <Checkbox
                key={`${i}-${goal.text}`}
                label={goal.done ? goal.text : `${goal.text} (not done yet)`}
                checked={goal.done}
                disabled={!open}
                onChange={(event) =>
                  void onSave({
                    goals: goals.map((g, j) =>
                      j === i ? { ...g, done: event.target.checked } : g,
                    ),
                  })
                }
              />
            ))}
          </fieldset>
        ) : null}
        {editing === null ? (
          <p className="ss-review__text">
            {summary.trim() === '' ? 'The agent has not written a summary yet.' : summary}
          </p>
        ) : (
          <form
            className="ss-review__edit"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Textarea
              label="Summary"
              hint="What this session did, in a few sentences. Kept with the session."
              value={editing}
              maxLength={4000}
              rows={5}
              onChange={(event) => setEditing(event.target.value)}
            />
            <div className="ss-review__edit-actions">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Save summary
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}

function ChangeList({
  turns,
  turnId,
  onTurn,
  loading,
  gone,
  rows,
  groups,
  numbers,
  viewed,
  toCheck,
  selected,
  onSelect,
}: {
  turns: AgentSessionHandle['turns'];
  turnId: string | null;
  onTurn: (turnId: string | null) => void;
  loading: boolean;
  gone: boolean;
  rows: readonly ChangeRow[];
  groups: ReturnType<typeof groupRows>;
  numbers: Numbers;
  viewed: ReadonlySet<string>;
  /** Quiz ids whose answers a second opinion disagreed with. */
  toCheck: ReadonlyMap<string, readonly AnswerQuestion[]>;
  selected: ChangeRow | null;
  onSelect: (row: ChangeRow) => void;
}) {
  const entry = (row: ChangeRow): ReactNode => {
    const name = rowName(row, numbers);
    const current = row.key === selected?.key;
    const seen = viewed.has(row.key);
    const check = row.kind === 'quiz' && row.after !== null && toCheck.has(row.id);
    return (
      <li key={row.key} className="ss-review__row">
        <Button
          variant="quiet"
          size="sm"
          className="ss-review__pick"
          aria-current={current ? 'true' : undefined}
          onClick={() => onSelect(row)}
        >
          <span className="ss-review__marker" aria-hidden="true">
            {current ? <ChevronRightIcon size={16} /> : null}
          </span>
          <span className={row.statuses.includes('removed') ? 'ss-outline__gone' : undefined}>
            {name}
          </span>
          <span className="g-visually-hidden">{`: ${row.statuses.join(', ')}${check ? ', check this answer' : ''}${seen ? ', viewed' : ''}`}</span>
          <span className="ss-review__chips" aria-hidden="true">
            <StatusChips statuses={row.statuses} />
            {check ? <Chip tone="warning">Check this answer</Chip> : null}
            {seen ? <CheckIcon size={16} /> : null}
          </span>
        </Button>
      </li>
    );
  };
  return (
    <div className="ss-review__changes">
      <p className="ss-review__count">{loading ? 'Reading this turn…' : countLine(rows, viewed)}</p>
      {turns.length > 0 ? (
        <Select
          label="Show"
          value={turnId ?? 'all'}
          onChange={(event) => onTurn(event.target.value === 'all' ? null : event.target.value)}
        >
          <option value="all">All changes</option>
          {turns.map((turn, i) => (
            <option key={turn.id} value={turn.id}>
              {turnLabel(i + 1, turn.changes)}
            </option>
          ))}
        </Select>
      ) : null}
      {loading ? (
        <Skeleton height="8rem" />
      ) : gone ? (
        <Callout tone="warning" title="This turn is no longer kept">
          <p>
            Only the newest 30 turns keep a copy of the course on this computer, so this turn’s
            changes cannot be shown on their own. All changes still lists them.
          </p>
          <Button variant="secondary" onClick={() => onTurn(null)}>
            Show all changes
          </Button>
        </Callout>
      ) : rows.length === 0 ? null : (
        <ol className="ss-review__tree" aria-label="Changes">
          {groups.map((group) =>
            group.title === null ? (
              group.rows.map(entry)
            ) : (
              <li key={group.key} className="ss-review__group">
                {group.row ? (
                  <ol className="ss-review__tree">{entry(group.row)}</ol>
                ) : (
                  <p className="ss-review__chapter">{group.title}</p>
                )}
                {group.rows.length > 0 ? (
                  <ol className="ss-review__items">{group.rows.map(entry)}</ol>
                ) : null}
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}

/** A lesson or Quiz as a learner sees it, on one side. */
function AsLearner({ item, answers }: { item: Item; answers: Working['answers'] }) {
  if (item.type === 'quiz') return <PreviewExam key={item.id} quiz={item} answers={answers} />;
  return (
    <div className={`article article--${item.layout} ss-review__learner`}>
      {item.blocks.length === 0 ? <p>This lesson is empty.</p> : null}
      {item.blocks.map((block) => (
        <div key={block.id} className="ss-preview__block">
          <BlockView block={block} />
        </div>
      ))}
    </div>
  );
}

function RowDetail({
  row,
  compared,
  numbers,
  wide,
  courseId,
  sessionId,
  open,
  toCheck,
  viewed,
  onViewed,
  target,
  onAsk,
  undoable,
  canUndo,
  onUndo,
}: {
  row: ChangeRow;
  compared: Compared;
  numbers: Numbers;
  wide: boolean;
  courseId: string | null;
  sessionId: string;
  open: boolean;
  /** This Quiz's questions a second opinion disagreed with (`DSK-18`). */
  toCheck: readonly AnswerQuestion[];
  viewed: boolean;
  onViewed: (on: boolean) => void;
  target: AttachTarget | null;
  onAsk: (target: AttachTarget) => void;
  undoable: boolean;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const t = useTerms();
  const itemRow = row.kind === 'lesson' || row.kind === 'quiz' ? row : null;
  const item = itemRow ? itemOf(itemRow) : null;
  const added = row.statuses.includes('added');
  const removed = row.statuses.includes('removed');
  // Something added has no before, and something removed no after: both open as a learner sees them.
  const [view, setView] = useState<View>(
    item && (added || removed) ? 'learner' : wide ? 'split' : 'inline',
  );
  const shown: View = view === 'split' && !wide ? 'inline' : view;
  const [mode, setMode] = useState<TextMode>('source');
  const [side, setSide] = useState<'before' | 'after'>(removed ? 'before' : 'after');
  const lesson = row.kind === 'lesson' && removed && courseId !== null ? row.id : null;
  const completed = useCompleted(courseId, lesson);
  const name = rowName(row, numbers);
  const views: { value: View; label: string }[] = [
    ...(wide ? [{ value: 'split' as const, label: 'Side by side' }] : []),
    { value: 'inline', label: 'Inline' },
    ...(item ? [{ value: 'learner' as const, label: 'As a learner' }] : []),
  ];

  const learner = () => {
    // Only a lesson or Quiz row offers this view, and only on a side it has: something added
    // opens after, something removed before, and Version is offered only when both are there.
    const copy = (side === 'before' ? compared.before : compared.after) as Working;
    const at = itemRow as NonNullable<typeof itemRow>;
    const there = (side === 'before' ? at.before : at.after) as Item;
    return <AsLearner item={there} answers={copy.answers} />;
  };

  return (
    <div className="ss-review__row-detail">
      <div className="ss-review__head">
        <h2 className="ss-review__title">{name}</h2>
        <StatusChips statuses={row.statuses} />
      </div>
      <div className="ss-review__tools">
        <SegmentedControl label="View" value={shown} options={views} onChange={setView} />
        {shown !== 'learner' && hasProse(row) ? (
          <SegmentedControl
            label="Show text as"
            value={mode}
            options={[
              { value: 'source', label: 'Source' },
              { value: 'rendered', label: 'Rendered' },
            ]}
            onChange={setMode}
          />
        ) : null}
        {shown === 'learner' && itemRow?.before && itemRow.after ? (
          <SegmentedControl
            label="Version"
            value={side}
            options={[
              { value: 'before', label: 'Before' },
              { value: 'after', label: 'After' },
            ]}
            onChange={setSide}
          />
        ) : null}
      </div>
      <div className="ss-review__actions">
        <Checkbox
          label="Viewed"
          checked={viewed}
          disabled={!open}
          onChange={(event) => onViewed(event.target.checked)}
        />
        {target ? (
          <Button variant="secondary" onClick={() => onAsk(target)}>
            Ask for a change
          </Button>
        ) : null}
        {open && item && !removed ? (
          <Link className={buttonClass('secondary')} to={sessionItemPath(sessionId, item.id)}>
            Open in editor
          </Link>
        ) : null}
        {undoable ? (
          <Menu
            label={`More for ${name}`}
            tip="More"
            trigger={<MoreIcon />}
            triggerClassName={iconButtonClass()}
            align="end"
            items={[
              {
                label: 'Undo this item',
                danger: true,
                disabled: !canUndo,
                ...(canUndo ? {} : { hint: 'Wait for the agent to finish' }),
                onSelect: onUndo,
              },
            ]}
          />
        ) : null}
      </div>
      {toCheck.length > 0 ? (
        <Callout tone="warning" title="Check this answer">
          <ul className="ss-review__answers">
            {toCheck.map((q) => (
              <li key={q.questionId}>{`Question ${q.position}: ${answerWords(q) as string}`}</li>
            ))}
          </ul>
        </Callout>
      ) : null}
      {removed && item ? (
        <Callout tone="warning" title="Removed from the course">
          <p>
            {row.kind === 'quiz'
              ? `This ${t.Quiz} is not in the course once you save and publish.`
              : lesson === null
                ? 'This lesson is not in the course after you save.'
                : completed === null
                  ? `Counting the ${t.learners} who completed it: —`
                  : completed === 'failed'
                    ? `${t.Learners} who completed it: Unavailable`
                    : `${completed} ${completed === 1 ? t.learner : t.learners} completed it.`}
          </p>
        </Callout>
      ) : null}
      {shown === 'learner' ? (
        learner()
      ) : (
        <RowDiff
          row={row}
          before={compared.before}
          after={compared.after}
          layout={shown}
          mode={mode}
          name={name}
        />
      )}
    </div>
  );
}
