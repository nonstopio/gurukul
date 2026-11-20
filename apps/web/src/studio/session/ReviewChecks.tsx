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
  pageOf,
} from '@gurukul/ui';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useStudio } from '../StudioProvider';
import type { Working } from '../types';
import type { AttachTarget, AttachWords } from './attachments';
import { WRITING_FIX_MESSAGE, fixTargets, reviewChecks, rowFor, rowName, sizeLine } from './review';
import type { CheckState, Numbers } from './review';

/*
 * Review's checks, like the checks on a pull request (`.plan/22-desktop-studio.md`, Checks): two can
 * stop a save (Course is valid, Size), the rest inform. Each finding links to its row; Writing offers
 * to send its findings to the agent. Draft is up to date and Answers are seams the save (`DSK-15`)
 * and the answer check (`DSK-18`) fill.
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

export function ReviewChecks({
  work,
  changes,
  todos,
  numbers,
  words,
  open,
  onShow,
  onAsk,
  className,
}: {
  work: Working;
  changes: CourseChanges;
  todos: readonly SessionTodo[];
  numbers: Numbers;
  words: AttachWords;
  open: boolean;
  onShow: (row: ChangeRow) => void;
  onAsk: (targets: readonly AttachTarget[], draft: string) => void;
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
    row: rowFor(rows, {
      itemId: issue.itemId,
      field:
        issue.code.startsWith('course.description') || issue.code.startsWith('course.outcome')
          ? 'description'
          : 'title',
    }),
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
        <CheckLine state="info" title="Draft is up to date: checked when you save" />
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
        {/* The answer check (`DSK-18`) fills this line, and offers to send what it finds. */}
        <CheckLine state="info" title="Answers: second opinion comes with the answer check" />
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
