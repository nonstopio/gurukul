import type { Block, BlockType, Chapter, Course, Question } from '@gurukul/schema';
import type {
  BlockChange,
  ChangeRow,
  DiffPart,
  FieldChange,
  ListEntryChange,
  QuestionChange,
} from '@gurukul/schema/changes';
import {
  DiffCode,
  DiffFields,
  DiffMedia,
  DiffNote,
  DiffRow,
  DiffText,
  DiffUnchanged,
  DiffView,
} from '@gurukul/ui';
import type { DiffFieldItem, DiffSide, DiffStatus } from '@gurukul/ui';
import type { ReactNode } from 'react';
import { useTerms } from '../../labels/useTerms';
import { BlockView } from '../../player/blocks';
import type { Working } from '../types';
import {
  answerLine,
  checkPlaces,
  fieldName,
  fieldValue,
  letter,
  questionPlaces,
  runsOf,
} from './review';
import { BLOCK_WORDS } from './workspace';

/*
 * One row of Review compared, side by side or inline (`.plan/22-desktop-studio.md`, How each kind of
 * content is compared): words for prose, lines for code, thumbnails and link cards for media,
 * settings as before → after, a changed correct answer on a line of its own, and unchanged blocks
 * and questions folded away.
 */

export type Layout = 'split' | 'inline';
/** Text and callout blocks: their markdown source compared word by word, or both drawn. */
export type TextMode = 'source' | 'rendered';

/**
 * A side of a field: its words or lines as a difference, else its value in words. `owner` names
 * what the field belongs to, so each code well has a name of its own ("Code block 4: Code, before").
 */
function fieldOn(change: FieldChange, side: DiffSide, owner: string): ReactNode {
  if (change.words) return <DiffText parts={change.words} side={side} />;
  if (change.lines)
    return (
      <DiffCode
        parts={change.lines}
        side={side}
        label={`${owner}: ${fieldName(change.field)}${side === 'both' ? '' : `, ${side}`}`}
      />
    );
  const value = side === 'before' ? change.before : change.after;
  return fieldValue(change.field, value) ?? 'Not set';
}

/** Changed fields as one list: before → after, or a drawn difference for text and code. */
function fieldItems(
  fields: readonly FieldChange[],
  side: DiffSide,
  owner: string,
): DiffFieldItem[] {
  return fields.map((change) => {
    const label = fieldName(change.field);
    if (side !== 'both' || change.words || change.lines)
      return { label, change: fieldOn(change, side, owner) };
    return {
      label,
      before: fieldValue(change.field, change.before),
      after: fieldValue(change.field, change.after),
    };
  });
}

/** A whole text, as a difference that is all added or all removed (an entry that came or went). */
const whole = (text: string, op: DiffPart['op']): DiffPart[] => [{ op, text }];

/** An entry of a list without ids (an option, an outcome) as words on one side. */
function entryText(entry: ListEntryChange, side: DiffSide): ReactNode {
  if (entry.statuses.includes('added'))
    return <DiffText parts={whole(String(entry.after), 'added')} side={side} />;
  if (entry.statuses.includes('removed'))
    return <DiffText parts={whole(String(entry.before), 'removed')} side={side} />;
  const words = entry.fields[0]?.words;
  if (words) return <DiffText parts={words} side={side} />;
  return String(side === 'before' ? entry.before : entry.after);
}

/** The text of an option entry: a check block's option is a string, a question's an object. */
const optionText = (value: unknown) =>
  typeof value === 'string' ? value : (value as { text: string }).text;

/** Whether an option is right on one side; a side it is not on never asks. */
type CorrectOn = (entry: ListEntryChange, side: 'before' | 'after') => boolean;

/** The mark of an option inline: right on both sides, or on one of them only. */
function correctMark(before: boolean, after: boolean): string | null {
  if (before && after) return ' (correct)';
  if (before) return ' (correct before)';
  return after ? ' (correct now)' : null;
}

/**
 * Options listed with their letters and marks. On one side, each has that side's letter and the
 * right ones say so. Inline, each has its letter before and after ("A → B." for one that moved), and
 * the right ones say on which side, so "Correct answer changed: A → B" points at letters on screen.
 */
function Options({
  entries,
  side,
  correct,
  placeBefore,
}: {
  entries: readonly ListEntryChange[];
  side: DiffSide;
  /** Whether the option is right on a side; lists with no answer (outcomes) leave it out. */
  correct?: CorrectOn;
  /**
   * The place of each entry in the base, for a list matched by id whose order changed: the entries
   * come in the working copy's order, so the side before is put back in its own.
   */
  placeBefore?: (entry: ListEntryChange) => number;
}) {
  const was = entries.filter((e) => e.before !== null);
  const now = entries.filter((e) => e.after !== null);
  const before = (e: ListEntryChange) => (placeBefore ? placeBefore(e) : was.indexOf(e));
  const present = side === 'before' ? was : side === 'after' ? now : entries;
  const shown =
    side === 'before' && placeBefore ? [...present].sort((a, b) => before(a) - before(b)) : present;
  const label = (entry: ListEntryChange, i: number) => {
    if (side !== 'both') return letter(i);
    if (entry.after === null) return letter(before(entry));
    if (entry.before === null) return letter(now.indexOf(entry));
    const [b, a] = [letter(before(entry)), letter(now.indexOf(entry))];
    return b === a ? a : `${b} → ${a}`;
  };
  const mark = (entry: ListEntryChange) => {
    if (!correct) return null;
    if (side !== 'both') return correct(entry, side) ? ' (correct)' : null;
    return correctMark(
      entry.before !== null && correct(entry, 'before'),
      entry.after !== null && correct(entry, 'after'),
    );
  };
  return (
    <ol className="ss-review__options">
      {shown.map((entry, i) => {
        const text = {
          ...entry,
          before: entry.before === null ? null : optionText(entry.before),
          after: entry.after === null ? null : optionText(entry.after),
        };
        const right = mark(entry);
        return (
          <li key={entry.id}>
            <span className="ss-review__letter">{`${label(entry, i)}. `}</span>
            {entryText(text, side)}
            {right ? <strong className="ss-review__right">{right}</strong> : null}
          </li>
        );
      })}
    </ol>
  );
}

const statusesOf = (entry: { statuses: readonly string[] }) => entry.statuses as DiffStatus[];

/** "Text block 2": a block's kind and its place in the lesson as it is now (or was). */
const blockWhat = (type: BlockType, place: number) => `${BLOCK_WORDS[type]} ${place}`;

function mediaOf(block: Block): ReactNode {
  switch (block.type) {
    case 'image':
      return (
        <DiffMedia kind="image" url={block.url} name={block.caption || 'Image'} alt={block.alt} />
      );
    case 'video':
      return <DiffMedia kind="video" url={block.url} name={block.title || 'Video'} />;
    case 'embed':
      return <DiffMedia kind="embed" url={block.url} name={block.title || 'Embed'} />;
    case 'file':
      return <DiffMedia kind="file" url={block.url} name={block.label || 'File'} />;
    default:
      return null;
  }
}

/** A check block's options and its answer, on one side or inline. */
function checkOn(entry: BlockChange, side: DiffSide): ReactNode {
  type Check = Extract<Block, { type: 'check' }>;
  const options = entry.options as ListEntryChange[];
  const correct: CorrectOn = (o, on) =>
    options.filter((x) => x[on] !== null).indexOf(o) === (entry[on] as Check).correct;
  return <Options entries={options} side={side} correct={correct} />;
}

/** One changed block: what it was and is, compared as its kind is compared. */
function BlockDiff({ entry, place, mode }: { entry: BlockChange; place: number; mode: TextMode }) {
  const what = blockWhat(entry.type, place);
  const was = entry.before as Block | null;
  const now = entry.after as Block | null;
  if (!was || !now) {
    return (
      <DiffRow
        statuses={statusesOf(entry)}
        what={what}
        before={was ? <BlockView block={was} /> : null}
        after={now ? <BlockView block={now} /> : null}
      />
    );
  }
  const notes =
    entry.answer && was.type === 'check' && now.type === 'check' ? (
      <DiffNote>
        {answerLine(entry.answer, ...checkPlaces(entry.options as ListEntryChange[], was, now))}
      </DiffNote>
    ) : undefined;
  if (entry.fields.length === 0 && !entry.options?.some((o) => o.statuses.length > 0)) {
    // Moved, or only its answer changed: the words are the same, so it is drawn once.
    return (
      <DiffRow
        statuses={statusesOf(entry)}
        what={what}
        notes={notes}
        before={<BlockView block={was} />}
        after={<BlockView block={now} />}
        same
      />
    );
  }
  if (mode === 'rendered' && (now.type === 'markdown' || now.type === 'callout')) {
    return (
      <DiffRow
        statuses={statusesOf(entry)}
        what={what}
        before={<BlockView block={was} />}
        after={<BlockView block={now} />}
      />
    );
  }
  const side = (s: DiffSide) => (
    <>
      {s === 'both' ? null : mediaOf(s === 'before' ? was : now)}
      {entry.fields.length > 0 ? <DiffFields items={fieldItems(entry.fields, s, what)} /> : null}
      {entry.options ? checkOn(entry, s) : null}
    </>
  );
  const media = mediaOf(now) !== null;
  return (
    <DiffRow
      statuses={statusesOf(entry)}
      what={what}
      notes={notes}
      before={side('before')}
      after={side('after')}
      // Media shows its before and after pictures; everything else is one difference inline.
      {...(media ? {} : { merged: side('both') })}
    />
  );
}

/** A question's key in a copy; none when it has none (a copy before it was added never asks). */
const keyOf = (w: Working | null, quizId: string, id: string): readonly string[] =>
  (w as Working).answers[quizId]?.[id] ?? [];

/** A question on one side: prompt, code, options with the right ones marked, explanation. */
function QuestionOn({
  question,
  keys,
  label,
}: {
  question: Question;
  keys: readonly string[];
  /** Names its code: "Question 2, before". */
  label: string;
}) {
  return (
    <div className="ss-review__question">
      <p>{question.prompt}</p>
      {question.code ? (
        <DiffCode parts={whole(question.code, 'same')} label={`${label}: Code`} />
      ) : null}
      <ol className="ss-review__options">
        {question.options.map((o, i) => (
          <li key={o.id}>
            <span className="ss-review__letter">{`${letter(i)}. `}</span>
            {o.text}
            {keys.includes(o.id) ? <strong className="ss-review__right"> (correct)</strong> : null}
          </li>
        ))}
      </ol>
      {question.explanation ? <p className="sc-help">{question.explanation}</p> : null}
    </div>
  );
}

function QuestionDiff({
  entry,
  place,
  quizId,
  before,
  after,
}: {
  entry: QuestionChange;
  place: number;
  quizId: string;
  before: Working | null;
  after: Working;
}) {
  const what = `Question ${place}`;
  const was = entry.before as Question | null;
  const now = entry.after as Question | null;
  // A question there before means a copy before it.
  const keysOf = (w: Working | null, q: Question) => keyOf(w, quizId, q.id);
  if (!was || !now) {
    return (
      <DiffRow
        statuses={statusesOf(entry)}
        what={what}
        before={
          was ? (
            <QuestionOn question={was} keys={keysOf(before, was)} label={`${what}, before`} />
          ) : null
        }
        after={
          now ? (
            <QuestionOn question={now} keys={keysOf(after, now)} label={`${what}, after`} />
          ) : null
        }
      />
    );
  }
  const notes = entry.answer ? (
    <DiffNote>{answerLine(entry.answer, ...questionPlaces(was, now))}</DiffNote>
  ) : undefined;
  const side = (s: DiffSide) => {
    const keys = { before: keysOf(before, was), after: keysOf(after, now) };
    return (
      <>
        {entry.fields.length > 0 ? <DiffFields items={fieldItems(entry.fields, s, what)} /> : null}
        <Options
          entries={entry.options}
          side={s}
          correct={(o, on) => keys[on].includes(o.id)}
          placeBefore={(o) => was.options.findIndex((w) => w.id === o.id)}
        />
      </>
    );
  };
  return (
    <DiffRow
      statuses={statusesOf(entry)}
      what={what}
      notes={notes}
      before={side('before')}
      after={side('after')}
      merged={side('both')}
    />
  );
}

/** Entries that did not change, folded: "3 unchanged blocks". */
function Unchanged({
  count,
  noun,
  children,
}: {
  count: number;
  noun: string;
  children: ReactNode;
}) {
  return (
    <DiffUnchanged label={`${count} unchanged ${noun}${count === 1 ? '' : 's'}`}>
      {children}
    </DiffUnchanged>
  );
}

/**
 * Where each entry sits, for "Text block 2": its place in the copy after, or, when it is gone, its
 * place in the copy before (`base`, the list it was matched from, so the same objects).
 */
function places<T extends { after: unknown; before: unknown }>(
  entries: readonly T[],
  base: readonly unknown[],
) {
  let now = 0;
  return new Map(
    entries.map((e) => {
      if (e.after === null) return [e, base.indexOf(e.before) + 1];
      now += 1;
      return [e, now];
    }),
  );
}

function SettingsDiff({ fields, label }: { fields: readonly FieldChange[]; label: string }) {
  if (fields.length === 0) return null;
  return (
    <section className="ss-review__section" aria-label={label}>
      <h3 className="ss-review__h3">Settings</h3>
      <DiffFields items={fieldItems(fields, 'both', 'Settings')} />
    </section>
  );
}

/** A move is between chapters of the two copies: the base has the one it left. */
function moveLine(
  move: { fromChapterId: string; fromIndex: number; toChapterId: string; toIndex: number },
  before: Course,
  after: Course,
): string {
  const name = (course: Course, id: string) =>
    (course.chapters.find((c) => c.id === id) as Chapter).title.trim() || 'Untitled';
  const from = `${name(before, move.fromChapterId)}, position ${move.fromIndex + 1}`;
  const to = `${name(after, move.toChapterId)}, position ${move.toIndex + 1}`;
  return `Moved from ${from} to ${to}.`;
}

/** What one row of Review shows, side by side or inline. */
export function RowDiff({
  row,
  before,
  after,
  layout,
  mode,
  name,
  settingsLabel = 'Settings',
}: {
  row: ChangeRow;
  before: Working | null;
  after: Working;
  layout: Layout;
  mode: TextMode;
  /** The row's name, for the comparison's label. */
  name: string;
  /** Names a lesson's or Quiz's settings region: unique on the page when several rows are drawn. */
  settingsLabel?: string;
}) {
  const t = useTerms();
  const label = `${name}, before and after`;
  switch (row.kind) {
    case 'course':
      return (
        <DiffView layout={layout} label={label}>
          <DiffFields items={fieldItems(row.fields, 'both', name)} />
        </DiffView>
      );
    case 'landing':
      return (
        <DiffView layout={layout} label={label}>
          {row.fields.length > 0 ? (
            <DiffFields items={fieldItems(row.fields, 'both', name)} />
          ) : null}
          {row.outcomes.some((o) => o.statuses.length > 0) ? (
            <DiffRow
              statuses={['changed']}
              what="Outcomes"
              before={<Options entries={row.outcomes} side="before" />}
              after={<Options entries={row.outcomes} side="after" />}
              merged={<Options entries={row.outcomes} side="both" />}
            />
          ) : null}
        </DiffView>
      );
    case 'chapter':
      return (
        <DiffView layout={layout} label={label}>
          {row.fields.length > 0 ? (
            <DiffFields items={fieldItems(row.fields, 'both', name)} />
          ) : null}
          {row.move ? (
            <p className="sc-help">{`Moved from position ${row.move.fromIndex + 1} to ${row.move.toIndex + 1}.`}</p>
          ) : null}
          {row.statuses.includes('added') || row.statuses.includes('removed') ? (
            <p className="sc-help">
              {row.statuses.includes('added')
                ? `Added: its lessons and ${t.quizzes} are listed under it.`
                : `Removed, with the lessons and ${t.quizzes} still in it.`}
            </p>
          ) : null}
        </DiffView>
      );
    case 'lesson': {
      const at = places(row.blocks, row.before?.blocks ?? []);
      return (
        <>
          {row.move ? (
            <p className="sc-help">
              {moveLine(row.move, (before as Working).course, after.course)}
            </p>
          ) : null}
          <SettingsDiff fields={row.fields} label={settingsLabel} />
          <DiffView layout={layout} label={label}>
            {runsOf(row.blocks).map((run) =>
              run.kind === 'changed' ? (
                <BlockDiff
                  key={run.entry.id}
                  entry={run.entry}
                  place={at.get(run.entry) as number}
                  mode={mode}
                />
              ) : (
                <Unchanged
                  key={`same-${run.entries[0]?.id}`}
                  count={run.entries.length}
                  noun="block"
                >
                  {run.entries.map((e) => (
                    <DiffRow
                      key={e.id}
                      what={blockWhat(e.type, at.get(e) as number)}
                      before={null}
                      after={<BlockView block={e.after as Block} />}
                      same
                    />
                  ))}
                </Unchanged>
              ),
            )}
          </DiffView>
        </>
      );
    }
    case 'quiz': {
      const at = places(row.questions, row.before?.questions ?? []);
      return (
        <>
          {row.move ? (
            <p className="sc-help">
              {moveLine(row.move, (before as Working).course, after.course)}
            </p>
          ) : null}
          <SettingsDiff fields={row.fields} label={settingsLabel} />
          <DiffView layout={layout} label={label}>
            {runsOf(row.questions).map((run) =>
              run.kind === 'changed' ? (
                <QuestionDiff
                  key={run.entry.id}
                  entry={run.entry}
                  place={at.get(run.entry) as number}
                  quizId={row.id}
                  before={before}
                  after={after}
                />
              ) : (
                <Unchanged
                  key={`same-${run.entries[0]?.id}`}
                  count={run.entries.length}
                  noun="question"
                >
                  {run.entries.map((e) => (
                    <DiffRow
                      key={e.id}
                      what={`Question ${at.get(e) as number}`}
                      // The same on both sides: drawn once, as it is now.
                      before={null}
                      after={
                        <QuestionOn
                          question={e.after as Question}
                          keys={keyOf(after, row.id, e.id)}
                          label={`Question ${at.get(e) as number}`}
                        />
                      }
                      same
                    />
                  ))}
                </Unchanged>
              ),
            )}
          </DiffView>
        </>
      );
    }
  }
}

/** Whether the row holds a text or callout block whose words changed: the Rendered switch applies. */
export function hasProse(row: ChangeRow): boolean {
  return (
    row.kind === 'lesson' &&
    row.blocks.some(
      (b) =>
        (b.type === 'markdown' || b.type === 'callout') &&
        b.before !== null &&
        b.after !== null &&
        b.fields.length > 0,
    )
  );
}
