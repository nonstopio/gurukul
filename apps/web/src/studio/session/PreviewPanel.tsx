import type { Quiz } from '@gurukul/schema';
import type { ChangeRow, CourseChanges, RowStatus } from '@gurukul/schema/changes';
import {
  Attachable,
  Button,
  ChangeMark,
  CheckIcon,
  Chip,
  EmptyState,
  IconButton,
  PageHeader,
  PaperclipIcon,
  PenIcon,
  Select,
  Tabs,
  BookIcon,
  buttonClass,
  iconButtonClass,
  useToast,
} from '@gurukul/ui';
import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTerms } from '../../labels/useTerms';
import { BlockView } from '../../player/blocks';
import { PreviewExam } from '../PreviewExam';
import { nameOf } from '../studioModel';
import type { Working } from '../types';
import {
  COURSE_TARGET,
  LANDING_TARGET,
  MAX_ATTACHMENTS,
  attachmentKey,
  blockTarget,
  chapterTarget,
  itemTarget,
  questionTarget,
} from './attachments';
import type { AttachTarget, AttachWords } from './attachments';
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
 *
 * In an open session each block and question in the preview, and each chapter, lesson, Quiz, the
 * course details and the landing page in the outline, has an Attach toggle (`DSK-20`): the next
 * message carries what is attached. A third tab, Sources, shows the session's Sources folder.
 */

/** Attaching parts of the course to the next message: the session runtime's, in an open session. */
export interface Attaching {
  attachments: readonly AttachTarget[];
  attach: (target: AttachTarget) => boolean;
  detach: (target: AttachTarget) => void;
}

const AttachingContext = createContext<Attaching | null>(null);

type Toggle = [attached: boolean, toggle: (on: boolean) => void];

/**
 * Whether a part is attached, and the toggle that attaches or removes it; null outside an open
 * session. A refused attach is the limit (the session is open, or there would be no toggle), and a
 * toast says so.
 */
function useAttach(): ((target: AttachTarget) => Toggle) | null {
  const attaching = useContext(AttachingContext);
  const toast = useToast();
  const attachments = attaching?.attachments;
  const keys = useMemo(() => new Set(attachments?.map(attachmentKey)), [attachments]);
  if (!attaching) return null;
  return (target) => [
    keys.has(attachmentKey(target)),
    (on) => {
      if (!on) return attaching.detach(target);
      if (!attaching.attach(target)) {
        toast.show(
          `A message carries at most ${MAX_ATTACHMENTS} parts of the course. Remove one first.`,
          { tone: 'warning' },
        );
      }
    },
  ];
}

/** The outline's Attach toggle for one row. */
function AttachButton({ target }: { target: AttachTarget }) {
  const attach = useAttach();
  if (!attach) return null;
  const [attached, toggle] = attach(target);
  return (
    <IconButton
      className="ss-outline__attach"
      label={`Attach ${target.label} to your message`}
      tip={attached ? 'Attached' : 'Attach'}
      aria-pressed={attached}
      onClick={() => toggle(!attached)}
    >
      {attached ? <CheckIcon /> : <PaperclipIcon />}
    </IconButton>
  );
}

/** A block or question in the preview, attachable in an open session. */
function Attach({ target, children }: { target: AttachTarget; children: ReactNode }) {
  const attach = useAttach();
  if (!attach) return children;
  const [attached, toggle] = attach(target);
  return (
    <Attachable label={target.label} attached={attached} onAttachedChange={toggle}>
      {children}
    </Attachable>
  );
}

/** A label is running words, so "Lesson" stays itself in every label set, as in the eyebrow. */
function useAttachWords(): AttachWords {
  const t = useTerms();
  return { lesson: 'Lesson', quiz: t.Quiz, chapter: t.Chapter };
}

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
  attaching = null,
  sources = null,
  initialItem = null,
  editPath,
}: {
  work: Working;
  base: Working | null;
  changes: CourseChanges;
  /** In an open session: attaching parts to the next message. */
  attaching?: Attaching | null;
  /** The Sources tab's content, drawn only while it is open; no tab without it. */
  sources?: ReactNode;
  /** The item to open on (`lesson:l2`), when it is in the course. */
  initialItem?: string | null;
  /**
   * Studio's editor for a lesson or Quiz of the working copy (`DSK-19`): "Open in editor" on the
   * preview and on each Outline row. Undefined where the copy may not change (a closed session).
   */
  editPath?: ((itemId: string) => string) | undefined;
}) {
  const t = useTerms();
  const rows = useMemo(() => rowsByKey(changes), [changes]);
  const entries = useMemo(() => previewEntries(work.course, rows), [work.course, rows]);
  const [tab, setTab] = useState('preview');
  const [picked, setPicked] = useState<string | null>(initialItem);
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
    <AttachingContext.Provider value={attaching}>
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
                editPath={editPath}
              />
            ) : (
              <EmptyState
                title="Nothing to preview yet"
                headingAs="h2"
                icon={<BookIcon size={24} />}
              >
                {`Ask the agent for an outline. Each lesson and ${t.Quiz} appears here as it is written, as ${t.learners} will see it.`}
              </EmptyState>
            ),
          },
          {
            id: 'outline',
            label: 'Outline',
            panel: (
              <Outline work={work} base={base} changes={changes} onShow={show} editPath={editPath} />
            ),
          },
          ...(sources === null
            ? []
            : [{ id: 'sources', label: 'Sources', panel: tab === 'sources' ? sources : null }]),
        ]}
      />
    </AttachingContext.Provider>
  );
}

function ItemPreview({
  entries,
  entry,
  row,
  work,
  onPick,
  editPath,
}: {
  entries: readonly PreviewEntry[];
  entry: PreviewEntry;
  row: ChangeRow | undefined;
  work: Working;
  onPick: (key: string) => void;
  editPath: ((itemId: string) => string) | undefined;
}) {
  const t = useTerms();
  const words = useAttachWords();
  const { item } = entry;
  const index = entries.indexOf(entry);
  const prev = entries[index - 1];
  const next = entries[index + 1];
  const kind = item.type === 'lesson' ? 'Lesson' : t.Quiz;
  const marks = questionMarks(row);
  const markQuestion = (id: string, question: ReactNode) => {
    const [first, ...rest] = marks.get(id) ?? [];
    // Only a Quiz draws questions.
    const position = (item as Quiz).questions.findIndex((q) => q.id === id) + 1;
    return (
      <Attach target={questionTarget(words, item.id, entry.number, id, position)}>
        {first ? (
          <ChangeMark statuses={[first, ...rest]} what="Question">
            {question}
          </ChangeMark>
        ) : (
          question
        )}
      </Attach>
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
          actions={
            editPath ? (
              <Link className={buttonClass('secondary')} to={editPath(item.id)}>
                Open in editor
              </Link>
            ) : undefined
          }
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
              const target = blockTarget(
                words,
                item.id,
                entry.number,
                mark.block,
                BLOCK_WORDS[mark.block.type],
                item.blocks.indexOf(mark.block) + 1,
              );
              return (
                <Attach key={mark.block.id} target={target}>
                  {first ? (
                    <ChangeMark statuses={[first, ...rest]} what={BLOCK_WORDS[mark.block.type]}>
                      {view}
                    </ChangeMark>
                  ) : (
                    <div className="ss-preview__block">{view}</div>
                  )}
                </Attach>
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
  editPath,
}: {
  work: Working;
  base: Working | null;
  changes: CourseChanges;
  onShow: (key: string) => void;
  editPath: ((itemId: string) => string) | undefined;
}) {
  const t = useTerms();
  const words = useAttachWords();
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
              <AttachButton target={COURSE_TARGET} />
            </li>
          ) : null}
          {outline.landing.length > 0 ? (
            <li className="ss-outline__row">
              <span>Landing page</span>
              <StatusChips statuses={outline.landing} />
              <AttachButton target={LANDING_TARGET} />
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
              <div className="ss-outline__head">
                <h3 className="ss-outline__row">
                  <span className={chapter.number === null ? 'ss-outline__gone' : undefined}>
                    {`${chapter.number ? `${chapter.number} · ` : ''}${nameOf(chapter.title, `Untitled ${t.chapter}`)}`}
                  </span>
                  <StatusChips statuses={chapter.statuses} />
                </h3>
                {chapter.number === null ? null : (
                  <AttachButton
                    target={chapterTarget(
                      words,
                      { id: chapter.id, title: chapter.title },
                      chapter.number,
                    )}
                  />
                )}
              </div>
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
                    {item.number === null ? null : (
                      <AttachButton
                        target={itemTarget(
                          words,
                          { id: item.id, type: item.type, title: item.title },
                          item.number,
                        )}
                      />
                    )}
                    {editPath && item.number !== null ? (
                      <Link
                        className={iconButtonClass()}
                        to={editPath(item.id)}
                        aria-label={`Open ${item.number} · ${nameOf(item.title, 'Untitled')} in the editor`}
                        data-tip="Open in editor"
                      >
                        <PenIcon size={18} />
                      </Link>
                    ) : null}
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
