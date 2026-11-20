import type { ConflictChoices, MergeConflict, Side } from '@gurukul/schema/merge';
import {
  Button,
  Callout,
  DEFAULT_PAGE_SIZE,
  Dialog,
  Pagination,
  Radio,
  pageOf,
  useToast,
} from '@gurukul/ui';
import { useId, useMemo, useState } from 'react';
import type { DraftDoc, Working } from '../types';
import { RowDiff } from './ReviewDiff';
import { numbersOf } from './review';
import type { Numbers } from './review';
import {
  bringInDraft,
  conflictName,
  conflictReason,
  conflictRows,
  mergeSides,
  mergeWithDraft,
  movedLine,
  orderLine,
  saverName,
} from './save';
import type { MergeSides } from './save';
import type { AgentSessionHandle } from './useAgentSession';

/*
 * Bring in their changes (`.plan/22-desktop-studio.md`, Save to draft, when the draft moved
 * underneath): the three-way merge of this session with the draft saved after it started. What only
 * one side changed comes in without a question; each thing both changed is a choice, Keep this
 * session's or Keep theirs, with both changes shown as Review shows them; a list both reordered
 * keeps this session's order, said in words. Nothing is overwritten without it, and the stored draft
 * then becomes the session's base.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function SideChange({
  title,
  rows,
  before,
  after,
  name,
}: {
  title: string;
  rows: ReturnType<typeof conflictRows>;
  before: Working;
  after: Working;
  name: string;
}) {
  return (
    <div className="ss-merge__side">
      <h4 className="ss-merge__h4">{title}</h4>
      {rows.map((row) => (
        <RowDiff
          key={row.key}
          row={row}
          before={before}
          after={after}
          layout="inline"
          mode="source"
          name={`${name}, ${title.toLowerCase()}`}
          settingsLabel={`${name}, ${title.toLowerCase()}: settings`}
        />
      ))}
    </div>
  );
}

function ConflictCard({
  conflict,
  sides,
  base,
  mine,
  theirs,
  numbers,
  who,
  choice,
  onChoose,
}: {
  conflict: MergeConflict;
  sides: MergeSides;
  base: Working;
  mine: Working;
  theirs: Working;
  numbers: Numbers;
  who: string;
  choice: Side | undefined;
  onChoose: (side: Side) => void;
}) {
  const id = useId();
  const name = conflictName(conflict, numbers);
  return (
    <li className="ss-merge__conflict">
      <section aria-labelledby={id}>
        <h3 id={id} className="ss-merge__h3">
          {name}
        </h3>
        <p className="sc-help">{conflictReason(conflict, who)}</p>
        <div className="ss-merge__sides">
          <SideChange
            title="This session’s change"
            rows={conflictRows(conflict, sides.mine)}
            before={base}
            after={mine}
            name={name}
          />
          <SideChange
            title="Their change"
            rows={conflictRows(conflict, sides.theirs)}
            before={base}
            after={theirs}
            name={name}
          />
        </div>
        <fieldset className="ss-merge__choice">
          <legend className="ss-merge__legend">{`Keep for ${name}`}</legend>
          <Radio
            name={conflict.key}
            label="Keep this session’s"
            checked={choice === 'mine'}
            onChange={() => onChoose('mine')}
          />
          <Radio
            name={conflict.key}
            label="Keep theirs"
            checked={choice === 'theirs'}
            onChange={() => onChoose('theirs')}
          />
        </fieldset>
      </section>
    </li>
  );
}

export function MergeDialog({
  agent,
  stored,
  uid,
  onClose,
}: {
  agent: AgentSessionHandle;
  stored: DraftDoc;
  uid: string;
  onClose: () => void;
}) {
  const toast = useToast();
  // Worked out once, when the dialog opens: nothing else changes the course while it is open.
  const [result] = useState(() =>
    mergeWithDraft(agent.base as Working, agent.work as Working, stored),
  );
  const sides = useMemo(() => mergeSides(result), [result]);
  const base = result.base as Working;
  const mine = result.mine as Working;
  const theirs = result.theirs as Working;
  const numbers = useMemo(() => numbersOf(mine.course), [mine]);
  const who = saverName(stored, uid);
  const [choices, setChoices] = useState<ConflictChoices>({});
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { conflicts, orderKept } = result;
  const open = conflicts.filter((c) => choices[c.key] === undefined).length;

  const bring = async () => {
    setBusy(true);
    setProblem(null);
    const outcome = await bringInDraft(agent, stored, result, choices, who);
    setBusy(false);
    if (outcome === 'done') {
      toast.show(`Their changes are in. Review now compares with Draft v${stored.rev}.`, {
        tone: 'success',
      });
      onClose();
      return;
    }
    setProblem(
      outcome === 'invalid'
        ? 'Together the two versions do not fit a course (more chapters or lessons than a course holds, say). Keep theirs for some of what this session added, or close this and undo a turn first.'
        : 'Their changes could not be brought in: this computer did not keep the session. Try again.',
    );
  };

  return (
    <Dialog
      open
      size="lg"
      title="Bring in their changes"
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={open > 0}
            aria-describedby={open > 0 ? 'ss-merge-left' : undefined}
            onClick={() => void bring()}
          >
            Bring in their changes
          </Button>
        </>
      }
    >
      <div className="ss-merge">
        <p>{movedLine(stored, uid, new Date())}</p>
        <p>
          {`In the draft, ${who} changed ${plural(sides.theirs.count, 'thing', 'things')}. What only the draft changed comes in as it is, and what only this session changed stays.`}
        </p>
        {orderKept.map((order) => (
          <p key={JSON.stringify(order)}>{orderLine(order, mine.course, numbers)}</p>
        ))}
        {conflicts.length > 0 ? (
          <>
            <h3 className="ss-merge__h3">{`Changed on both sides: ${plural(conflicts.length, 'choice', 'choices')} to make`}</h3>
            <ol className="ss-merge__conflicts">
              {pageOf(conflicts, page).map((conflict) => (
                <ConflictCard
                  key={conflict.key}
                  conflict={conflict}
                  sides={sides}
                  base={base}
                  mine={mine}
                  theirs={theirs}
                  numbers={numbers}
                  who={who}
                  choice={choices[conflict.key]}
                  onChoose={(side) => setChoices((c) => ({ ...c, [conflict.key]: side }))}
                />
              ))}
            </ol>
            {conflicts.length > DEFAULT_PAGE_SIZE ? (
              <Pagination
                page={page}
                total={conflicts.length}
                onPageChange={setPage}
                label="Choices, pages"
              />
            ) : null}
          </>
        ) : (
          <p>Nothing was changed on both sides, so there is nothing to choose.</p>
        )}
        {open > 0 ? (
          <p id="ss-merge-left" className="sc-help">
            {`Choose a side for ${plural(open, 'more thing', 'more things')}.`}
          </p>
        ) : null}
        {problem ? (
          <Callout tone="warning" title="Not brought in">
            <p>{problem}</p>
          </Callout>
        ) : null}
      </div>
    </Dialog>
  );
}
