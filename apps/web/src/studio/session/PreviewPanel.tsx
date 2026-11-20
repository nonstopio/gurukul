import type { ChangeRow, CourseChanges, RowStatus } from '@gurukul/schema/changes';
import {
  Button,
  ChangeMark,
  Chip,
  EmptyState,
  PageHeader,
  Select,
  Tabs,
  BookIcon,
} from '@gurukul/ui';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTerms } from '../../labels/useTerms';
import { BlockView } from '../../player/blocks';
import { PreviewExam } from '../PreviewExam';
import { nameOf } from '../studioModel';
import type { Working } from '../types';
import {
  BLOCK_WORDS,
  STATUS_TONE,
  STATUS_WORD,
  lessonBlocks,
  outlineOf,
  previewEntries,
  questionMarks,
  rowsByKey,
} from './workspace';
import type { PreviewEntry } from './workspace';

/*
 * The right-hand pane of a session (`.plan/22-desktop-studio.md`, The session workspace): Preview,
 * the learner's player drawing the working copy with every changed block marked, and Outline, the
 * chapter tree with a badge on everything that changed. Both read `courseChanges`. Nothing here is
 * specific to a course: the player renders whatever the working copy holds.
 */

/** Status words as chips: a word on its tone, never the colour alone. */
export function StatusChips({ statuses }: { statuses: readonly RowStatus[] }) {
  return (
    <>
      {statuses.map((s) => (
        <Chip key={s} tone={STATUS_TONE[s]}>
          {STATUS_WORD[s]}
        </Chip>
      ))}
    </>
  );
}

export function PreviewPanel({
  work,
  base,
  changes,
}: {
  work: Working;
  base: Working | null;
  changes: CourseChanges;
}) {
  const t = useTerms();
  const rows = useMemo(() => rowsByKey(changes), [changes]);
  const entries = useMemo(() => previewEntries(work.course, rows), [work.course, rows]);
  const [tab, setTab] = useState('preview');
  const [picked, setPicked] = useState<string | null>(null);
  // Until one is picked, the first item that changed, else the first item.
  const current =
    entries.find((e) => e.key === picked) ??
    entries.find((e) => e.statuses.length > 0) ??
    entries[0];
  const show = (key: string) => {
    setPicked(key);
    setTab('preview');
  };

  return (
    <Tabs
      label="The course"
      value={tab}
      onValueChange={setTab}
      tabs={[
        {
          id: 'preview',
          label: 'Preview',
          panel: current ? (
            <ItemPreview
              entries={entries}
              entry={current}
              row={rows.get(current.key)}
              work={work}
              onPick={setPicked}
            />
          ) : (
            <EmptyState title="Nothing to preview yet" headingAs="h2" icon={<BookIcon size={24} />}>
              {`Ask the agent for an outline. Each lesson and ${t.Quiz} appears here as it is written, as ${t.learners} will see it.`}
            </EmptyState>
          ),
        },
        {
          id: 'outline',
          label: 'Outline',
          panel: <Outline work={work} base={base} changes={changes} onShow={show} />,
        },
      ]}
    />
  );
}

function ItemPreview({
  entries,
  entry,
  row,
  work,
  onPick,
}: {
  entries: readonly PreviewEntry[];
  entry: PreviewEntry;
  row: ChangeRow | undefined;
  work: Working;
  onPick: (key: string) => void;
}) {
  const t = useTerms();
  const { item } = entry;
  const index = entries.indexOf(entry);
  const prev = entries[index - 1];
  const next = entries[index + 1];
  const kind = item.type === 'lesson' ? 'Lesson' : t.Quiz;
  const marks = questionMarks(row);
  const markQuestion = (id: string, question: ReactNode) => {
    const [first, ...rest] = marks.get(id) ?? [];
    return first ? (
      <ChangeMark statuses={[first, ...rest]} what="Question">
        {question}
      </ChangeMark>
    ) : (
      question
    );
  };

  return (
    <div className="ss-preview">
      <div className="ss-preview__nav">
        <Select
          label={`Lesson or ${t.Quiz}`}
          value={entry.key}
          onChange={(event) => onPick(event.target.value)}
          className="ss-preview__pick"
        >
          {entries.map((e) => (
            <option key={e.key} value={e.key}>
              {`${e.number} · ${nameOf(e.item.title, 'Untitled')}${
                e.statuses.length > 0
                  ? ` (${e.statuses.map((s) => STATUS_WORD[s].toLowerCase()).join(', ')})`
                  : ''
              }`}
            </option>
          ))}
        </Select>
        <div className="ss-preview__step">
          <Button variant="secondary" disabled={!prev} onClick={() => prev && onPick(prev.key)}>
            Previous
          </Button>
          <Button variant="secondary" disabled={!next} onClick={() => next && onPick(next.key)}>
            Next
          </Button>
        </div>
      </div>
      <div className={item.type === 'lesson' ? `article article--${item.layout}` : 'article'}>
        <PageHeader
          titleAs="h2"
          eyebrow={`${kind} ${entry.number}`}
          title={nameOf(item.title, 'Untitled')}
          meta={entry.statuses.length > 0 ? <StatusChips statuses={entry.statuses} /> : undefined}
        />
        {item.type === 'lesson' ? (
          <>
            {item.blocks.length === 0 && row === undefined ? <p>This lesson is empty.</p> : null}
            {lessonBlocks(item.blocks, row).map((mark) => {
              if (mark.kind === 'removed') {
                return (
                  <ChangeMark
                    key={`removed-${mark.id}`}
                    statuses={['removed']}
                    what={BLOCK_WORDS[mark.type]}
                  />
                );
              }
              const view = <BlockView block={mark.block} />;
              const [first, ...rest] = mark.statuses;
              return first ? (
                <ChangeMark
                  key={mark.block.id}
                  statuses={[first, ...rest]}
                  what={BLOCK_WORDS[mark.block.type]}
                >
                  {view}
                </ChangeMark>
              ) : (
                <div key={mark.block.id} className="ss-preview__block">
                  {view}
                </div>
              );
            })}
          </>
        ) : (
          <PreviewExam
            key={item.id}
            quiz={item}
            answers={work.answers}
            markQuestion={markQuestion}
          />
        )}
      </div>
    </div>
  );
}

function Outline({
  work,
  base,
  changes,
  onShow,
}: {
  work: Working;
  base: Working | null;
  changes: CourseChanges;
  onShow: (key: string) => void;
}) {
  const t = useTerms();
  const outline = useMemo(
    () => outlineOf(base?.course ?? null, work.course, changes),
    [base, work, changes],
  );
  const { count } = changes;
  return (
    <div className="ss-outline">
      <p className="sc-help">
        {base === null
          ? 'A new course: everything in it is added.'
          : count === 0
            ? 'Nothing has changed yet against the draft this session started from.'
            : `${count} ${count === 1 ? 'change' : 'changes'} against the draft this session started from.`}
      </p>
      {outline.details.length > 0 || outline.landing.length > 0 ? (
        <ul className="ss-outline__list">
          {outline.details.length > 0 ? (
            <li className="ss-outline__row">
              <span>Course details</span>
              <StatusChips statuses={outline.details} />
            </li>
          ) : null}
          {outline.landing.length > 0 ? (
            <li className="ss-outline__row">
              <span>Landing page</span>
              <StatusChips statuses={outline.landing} />
            </li>
          ) : null}
        </ul>
      ) : null}
      {outline.chapters.length === 0 ? (
        <p className="sc-help">{`No ${t.chapters} yet.`}</p>
      ) : (
        <ol className="ss-outline__list">
          {outline.chapters.map((chapter) => (
            <li key={chapter.key} className="ss-outline__chapter">
              <h3 className="ss-outline__row">
                <span className={chapter.number === null ? 'ss-outline__gone' : undefined}>
                  {`${chapter.number ? `${chapter.number} · ` : ''}${nameOf(chapter.title, `Untitled ${t.chapter}`)}`}
                </span>
                <StatusChips statuses={chapter.statuses} />
              </h3>
              <ol className="ss-outline__items">
                {chapter.items.map((item) => (
                  <li key={item.key} className="ss-outline__row">
                    {item.number === null ? (
                      <span className="ss-outline__gone">{nameOf(item.title, 'Untitled')}</span>
                    ) : (
                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={() => onShow(item.key)}
                        aria-label={`Preview ${item.number} · ${nameOf(item.title, 'Untitled')}`}
                      >
                        {`${item.number} · ${nameOf(item.title, 'Untitled')}`}
                      </Button>
                    )}
                    <StatusChips statuses={item.statuses} />
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
