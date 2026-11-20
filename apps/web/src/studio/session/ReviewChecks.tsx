import type { SessionTodo } from '@gurukul/schema';
import type { ChangeRow, CourseChanges } from '@gurukul/schema/changes';
import {
  AlertIcon,
  Button,
  Card,
  CheckIcon,
  DEFAULT_PAGE_SIZE,
  InfoIcon,
  Pagination,
  ProgressBar,
  pageOf,
} from '@gurukul/ui';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useStudio } from '../StudioProvider';
import type { GurukulDesktop } from '../../desktop/bridge';
import type { Working } from '../types';
import type { AnswerFailure, AnswerProblem, AnswerQuestion } from './answerCheck';
import { answersFixMessage, lettersOf } from './answers';
import { MAX_ATTACHMENTS, questionTarget } from './attachments';
import type { AttachTarget, AttachWords } from './attachments';
import { UpdateTheAppButton, Words } from './Problem';
import type { AnswerCheckHandle } from './useAnswerCheck';
import {
  WRITING_FIX_MESSAGE,
  fixTargets,
  issueAt,
  reviewChecks,
  rowFor,
  rowName,
  sizeLine,
} from './review';
import type { CheckState, Numbers } from './review';

/*
 * Review's checks, like the checks on a pull request (`.plan/22-desktop-studio.md`, Checks): two can
 * stop a save (Course is valid, Size), the rest inform. Each finding links to its row; Writing and
 * Answers offer to send their findings to the agent. Draft is up to date comes from the save
 * (`DSK-15`), which reads the stored draft. Answers is the second opinion on changed Quiz questions
 * (`DSK-18`, `answerCheck.ts`): progress while it runs, each disagreement and failure, Skip answer
 * check. Answers never stops a save.
 */

const ICON: Record<CheckState, ReactNode> = {
  pass: <CheckIcon size={16} />,
  warn: <AlertIcon size={16} />,
  fail: <AlertIcon size={16} />,
  info: <InfoIcon size={16} />,
};

/** What the state means, for a screen reader: the words of the line say it too. */
const STATE_WORDS: Record<CheckState, string> = {
  pass: 'Passes',
  warn: 'Note',
  fail: 'Stops Save',
  info: 'Information',
};

function CheckLine({
  state,
  title,
  children,
}: {
  state: CheckState;
  title: string;
  children?: ReactNode;
}) {
  return (
    <li className={`ss-checks__item ss-checks__item--${state}`}>
      <p className="ss-checks__title">
        <span className="ss-checks__icon">{ICON[state]}</span>
        <span className="g-visually-hidden">{`${STATE_WORDS[state]}: `}</span>
        <span>{title}</span>
      </p>
      {children}
    </li>
  );
}

interface Finding {
  key: string;
  text: string;
  row: ChangeRow | null;
}

/** Findings, 25 to a page, each with a way to its row. */
function Findings({
  label,
  items,
  numbers,
  onShow,
}: {
  label: string;
  items: readonly Finding[];
  numbers: Numbers;
  onShow: (row: ChangeRow) => void;
}) {
  const [page, setPage] = useState(1);
  return (
    <>
      <ul className="ss-checks__findings" aria-label={label}>
        {pageOf(items, page).map((item) => (
          <li key={item.key}>
            <span>{item.text}</span>
            {item.row ? (
              <Button
                variant="quiet"
                size="sm"
                onClick={() => onShow(item.row as ChangeRow)}
              >{`Show ${rowName(item.row, numbers)}`}</Button>
            ) : null}
          </li>
        ))}
      </ul>
      {items.length > DEFAULT_PAGE_SIZE ? (
        <Pagination
          page={page}
          total={items.length}
          onPageChange={setPage}
          label={`${label}, pages`}
        />
      ) : null}
    </>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const FAILURE_WORDS: Record<AnswerFailure, string> = {
  timeout: 'It took too long.',
  failed: 'Claude Code did not answer.',
  unreadable: 'Its answer could not be read.',
};

/** "Quiz 2.4 · Question 3". */
export function questionName(q: AnswerQuestion, numbers: Numbers, words: AttachWords): string {
  return `${words.quiz} ${numbers.items.get(`quiz:${q.quizId}`) as string} · Question ${q.position}`;
}

/** What the second opinion said about one question, without its name; null until it has. */
export function answerWords(q: AnswerQuestion): string | null {
  const o = q.outcome;
  if (o.state === 'disagrees') {
    const why = o.reason === '' ? '' : ` “${o.reason}”`;
    return `A second opinion chose ${lettersOf(o.picked)}; the key says ${lettersOf(o.key)}.${why}`;
  }
  if (o.state === 'failed') return `No second opinion. ${FAILURE_WORDS[o.reason]}`;
  return null;
}

/** Why the answer check cannot run now, in words (`command` spans shown as code). */
export function answerProblemWords(problem: AnswerProblem): string {
  switch (problem.code) {
    case 'needs_update':
      return 'This version of Gurukul Studio cannot ask for a second opinion. Update the app, then open Review again.';
    case 'not_installed':
      return 'Claude Code is not on this computer, so no second opinion can be asked for.';
    case 'too_old':
      return `Claude Code ${problem.version} is older than this app needs (${problem.minimumVersion}). Open a terminal, run \`claude update\`, then try again.`;
    case 'not_signed_in':
      return 'Open a terminal, run `claude` and sign in, then try again.';
    case 'plan_limit':
      return 'Your Claude plan has reached its limit for now. Try again once it resets.';
  }
}

/** The Answers line: the second opinion on every Quiz question this session added or changed. */
function AnswersLine({
  answers,
  rows,
  numbers,
  words,
  open,
  desktop,
  onShow,
  onAsk,
}: {
  answers: AnswerCheckHandle;
  rows: readonly ChangeRow[];
  numbers: Numbers;
  words: AttachWords;
  open: boolean;
  desktop: GurukulDesktop;
  onShow: (row: ChangeRow) => void;
  onAsk: (targets: readonly AttachTarget[], draft: string) => void;
}) {
  const { questions, done, pending, disagreements, problem } = answers;
  const total = questions.length;
  if (!answers.loaded) return <CheckLine state="info" title="Answers: reading earlier checks" />;
  if (total === 0) return <CheckLine state="pass" title="Answers: no Quiz questions changed" />;
  const line = (q: AnswerQuestion) =>
    `${questionName(q, numbers, words)}: ${answerWords(q) as string}`;
  const finding = (q: AnswerQuestion): Finding => ({
    key: `a:${q.quizId}:${q.questionId}`,
    text: line(q),
    row: rowFor(rows, { itemId: q.quizId }),
  });
  const disagreeing = questions.filter((q) => q.outcome.state === 'disagrees');
  const ask = () => {
    const sent = disagreeing.slice(0, MAX_ATTACHMENTS);
    onAsk(
      sent.map((q) =>
        questionTarget(
          words,
          q.quizId,
          numbers.items.get(`quiz:${q.quizId}`) as string,
          q.questionId,
          q.position,
        ),
      ),
      answersFixMessage(sent.map(line)),
    );
  };
  const askButton =
    open && disagreeing.length > 0 ? (
      <Button variant="secondary" onClick={ask}>
        Ask the agent to fix these
      </Button>
    ) : null;
  if (answers.skipped) {
    // Skip stops new asks; the disagreements already found stay, as on their rows.
    return (
      <CheckLine
        state={disagreements > 0 ? 'warn' : 'info'}
        title={
          disagreements > 0
            ? `Answers: skipped for this session · ${plural(disagreements, 'answer', 'answers')} to check`
            : 'Answers: skipped for this session'
        }
      >
        <p className="sc-help">
          {disagreements > 0
            ? 'No more second opinions are asked for, so no more of your Claude plan is used for them. Those already given are kept.'
            : 'No second opinion is asked for, so none of your Claude plan is used for it.'}
        </p>
        {disagreements > 0 ? (
          <Findings
            label="Answers to check"
            items={disagreeing.map(finding)}
            numbers={numbers}
            onShow={onShow}
          />
        ) : null}
        {open ? (
          <div className="ss-checks__actions">
            {askButton}
            <Button variant="secondary" onClick={answers.resume}>
              Check answers
            </Button>
          </div>
        ) : null}
      </CheckLine>
    );
  }
  const failed = questions.filter((q) => q.outcome.state === 'failed').length;
  const progress = pending > 0 ? ` · ${done} of ${total} checked` : '';
  const [state, title]: [CheckState, string] =
    disagreements > 0
      ? ['warn', `Answers: ${plural(disagreements, 'answer', 'answers')} to check${progress}`]
      : pending > 0
        ? ['info', `Answers: ${done} of ${total} checked`]
        : failed > 0
          ? ['info', `Answers: ${failed} not checked`]
          : ['pass', `Answers: ${total} checked, all agree`];
  const findings = questions.filter((q) => answerWords(q) !== null).map(finding);
  return (
    <CheckLine state={state} title={title}>
      {problem ? (
        <>
          <p className="sc-help">
            <Words text={answerProblemWords(problem)} />
          </p>
          {problem.code === 'needs_update' ? (
            <UpdateTheAppButton desktop={desktop} variant="secondary" />
          ) : (
            <Button variant="secondary" onClick={answers.retry}>
              Try again
            </Button>
          )}
        </>
      ) : pending > 0 && answers.active ? (
        <>
          <ProgressBar
            className="ss-checks__progress"
            value={(done / total) * 100}
            label="Answer check"
            caption={`${done} of ${total}`}
            valueText={`${done} of ${total} questions checked`}
          />
          <p className="sc-help">
            A separate Claude Code run answers each new or changed question from the lessons,
            without the answer key. It uses your Claude plan, and nothing it finds stops Save.
          </p>
          {answers.waitingForPlace ? (
            <p className="sc-help">
              Waiting for a free place: the app checks two answers at a time, and both are in use
              elsewhere (another session’s check, or a page you left). This check goes on by itself.
            </p>
          ) : null}
        </>
      ) : pending > 0 ? (
        <p className="sc-help">
          {open
            ? 'The check waits until the agent finishes its turn and your edits are kept.'
            : 'This session is closed, so the rest were not checked.'}
        </p>
      ) : null}
      {findings.length > 0 ? (
        <Findings label="Answers to check" items={findings} numbers={numbers} onShow={onShow} />
      ) : null}
      {open ? (
        <div className="ss-checks__actions">
          {askButton}
          {failed > 0 && pending === 0 && problem === null ? (
            <Button variant="secondary" onClick={answers.retry}>
              Try again
            </Button>
          ) : null}
          {pending > 0 ? (
            <Button variant="quiet" onClick={answers.skip}>
              Skip answer check
            </Button>
          ) : null}
        </div>
      ) : null}
    </CheckLine>
  );
}

export function ReviewChecks({
  work,
  changes,
  todos,
  numbers,
  words,
  open,
  answers,
  desktop,
  onShow,
  onAsk,
  draft,
  className,
}: {
  work: Working;
  changes: CourseChanges;
  todos: readonly SessionTodo[];
  numbers: Numbers;
  words: AttachWords;
  open: boolean;
  answers: AnswerCheckHandle;
  desktop: GurukulDesktop;
  onShow: (row: ChangeRow) => void;
  onAsk: (targets: readonly AttachTarget[], draft: string) => void;
  /** Draft is up to date, from the stored draft (`DSK-15`), with what can be done about it. */
  draft: { state: CheckState; title: string; action?: ReactNode };
  className?: string;
}) {
  const { checks: publishChecks } = useStudio();
  const checks = useMemo(
    () => reviewChecks(work, changes, todos, publishChecks),
    [work, changes, todos, publishChecks],
  );
  const { rows } = changes;
  const writing = checks.writing.map((f, i): Finding => ({
    key: `w${i}`,
    text: `${f.message} “${f.excerpt}”`,
    row: rowFor(rows, f),
  }));
  const publish = checks.publish.map((issue, i): Finding => ({
    key: `p${i}`,
    text: issue.message,
    row: rowFor(rows, issueAt(issue)),
  }));
  const left = checks.todos.map((todo): Finding => ({
    key: todo.id,
    text: todo.text,
    row: rowFor(rows, { itemId: todo.itemId }),
  }));

  return (
    <Card as="section" title="Checks" className={className}>
      <ul className="ss-checks">
        <CheckLine
          state={checks.valid ? 'pass' : 'fail'}
          title={checks.valid ? 'Course is valid' : 'Course is not valid · stops Save'}
        >
          {checks.valid ? null : (
            <p className="sc-help">
              Something in the course does not fit its shape. Ask the agent to check the course, or
              undo the turn that broke it.
            </p>
          )}
        </CheckLine>
        <CheckLine
          state={checks.size === 'pass' ? 'pass' : checks.size}
          title={`Size ${sizeLine(checks.bytes)}${
            checks.size === 'fail'
              ? ' · over the limit, stops Save'
              : checks.size === 'warn'
                ? ' · close to the limit'
                : ''
          }`}
        />
        <CheckLine state={draft.state} title={draft.title}>
          {draft.action}
        </CheckLine>
        <CheckLine
          state={writing.length === 0 ? 'pass' : 'warn'}
          title={
            writing.length === 0
              ? 'Writing: no notes'
              : `Writing: ${plural(writing.length, 'note', 'notes')}`
          }
        >
          {writing.length > 0 ? (
            <>
              <Findings label="Writing notes" items={writing} numbers={numbers} onShow={onShow} />
              {open ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    onAsk(
                      fixTargets(
                        writing.map((f) => f.row),
                        words,
                        numbers,
                      ),
                      WRITING_FIX_MESSAGE,
                    )
                  }
                >
                  Ask the agent to fix these
                </Button>
              ) : null}
            </>
          ) : null}
        </CheckLine>
        <AnswersLine
          answers={answers}
          rows={rows}
          numbers={numbers}
          words={words}
          open={open}
          desktop={desktop}
          onShow={onShow}
          onAsk={onAsk}
        />
        <CheckLine
          state={publish.length === 0 ? 'pass' : 'info'}
          title={
            publish.length === 0
              ? 'Ready to publish'
              : `Not ready to publish: ${plural(publish.length, 'thing', 'things')} to fix first`
          }
        >
          {publish.length > 0 ? (
            <>
              <p className="sc-help">A draft may be saved unfinished; this only informs.</p>
              <Findings
                label="Before publishing"
                items={publish}
                numbers={numbers}
                onShow={onShow}
              />
            </>
          ) : null}
        </CheckLine>
        <CheckLine
          state={left.length === 0 ? 'pass' : 'info'}
          title={`Left for you: ${left.length}`}
        >
          {left.length > 0 ? (
            <Findings label="Left for you" items={left} numbers={numbers} onShow={onShow} />
          ) : null}
        </CheckLine>
      </ul>
    </Card>
  );
}
