import { validateForPublish } from '@gurukul/schema';
import type { Block, BlockType, Lesson } from '@gurukul/schema';
import { Card, DragList, EmptyState, Input, Select, buttonClass } from '@gurukul/ui';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BlockPreviewFrame } from './blocks/BlockPreviewFrame';
import { BlockPalette } from './blocks/BlockPalette';
import { ConfirmDialog } from './ConfirmDialog';
import { DraftGate } from './DraftGate';
import { focusBlock } from './focusBlock';
import { EditorBar, PreviewLink } from './EditorBar';
import {
  BLOCK_LABELS,
  addBlock,
  duplicateBlock,
  editLesson,
  findLesson,
  isPristine,
  moveBlock,
  newBlock,
  parseMinutes,
  removeBlock,
  replaceBlock,
} from './lessonEdit';
import { newId } from './ids';
import { patch } from './patch';
import { itemEditorPath, nameOf } from './studioModel';
import type { Terms } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import type { Working } from './types';
import { useDraft } from './useDraft';
import type { DraftApi } from './useDraft';

const completion = (t: Terms): Array<{ value: Lesson['completeWhen']; label: string }> => [
  { value: 'manual', label: `The ${t.learner} marks it done` },
  { value: 'video90', label: 'After 90% of the video' },
  { value: 'scrolled', label: 'After scrolling to the end' },
];

/** `/studio/courses/:courseId/lessons/:lessonId`: lesson rail, block canvas and lesson settings. */
export function LessonEditorPage() {
  const { courseId = '', lessonId = '' } = useParams();
  const draft = useDraft(courseId);
  return (
    <DraftGate draft={draft} title="Lesson editor">
      {(work) => <LessonEditor draft={draft} work={work} courseId={courseId} lessonId={lessonId} />}
    </DraftGate>
  );
}

function LessonEditor({
  draft,
  work,
  courseId,
  lessonId,
}: {
  draft: DraftApi;
  work: Working;
  courseId: string;
  lessonId: string;
}) {
  const terms = useTerms();
  const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const issues = useMemo(() => validateForPublish(work.course, work.answers), [work]);

  const focusAfterRender = useRef<string | null>(null);

  // A block that was just added or duplicated takes focus, so the keyboard lands where the work is.
  useEffect(() => {
    const id = focusAfterRender.current;
    if (id === null) return;
    focusAfterRender.current = focusBlock(id);
  });

  // Focus anywhere inside a block selects it. A layout effect, so the listener is in place before
  // the blocks can be seen or focused; a plain effect can run after the first focus and miss it.
  useLayoutEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const block = (e.target as HTMLElement).closest<HTMLElement>('[data-block-id]');
      if (block) setSelected(block.dataset.blockId as string);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  // "/" outside a text field, or in an empty one, jumps to the block palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      const typing = t.matches('input, textarea, select');
      if (typing && (t as HTMLInputElement).value !== '') return;
      e.preventDefault();
      // Focusing the first tile scrolls the palette into view.
      (document.querySelector('[data-palette-tile]') as HTMLElement).focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const lesson = findLesson(work.course, lessonId);
  const crumbs = [
    { label: terms.Studio, render: (p: object) => <Link to="/studio" {...p} /> },
    {
      label: work.course.title,
      render: (p: object) => <Link to={`/studio/courses/${courseId}`} {...p} />,
    },
    { label: lesson?.title || 'Lesson' },
  ];
  const back = {
    to: `/studio/courses/${courseId}`,
    label: nameOf(work.course.title, 'Untitled course'),
  };
  if (!lesson) {
    return (
      <EditorBar title="Lesson not found" back={back} crumbs={crumbs} draft={draft}>
        <EmptyState
          headingAs="h2"
          title="This lesson does not exist"
          action={
            <Link className={buttonClass('secondary')} to={`/studio/courses/${courseId}`}>
              Back to the course
            </Link>
          }
        >
          It may have been deleted or moved.
        </EmptyState>
      </EditorBar>
    );
  }

  const edit = (change: (l: Lesson) => Lesson) =>
    draft.update((w) => ({ ...w, course: editLesson(w.course, lessonId, change) }));
  const messages = (blockId: string) =>
    issues
      .filter((i) => i.itemId === lessonId && i.blockId === blockId)
      .map((i) => i.message)
      .join(' ');
  const titleIssue = issues.find((i) => i.itemId === lessonId && i.code === 'item.title');

  const add = (type: BlockType) => {
    const block = newBlock(type);
    edit((l) => addBlock(l, block));
    setSelected(block.id);
    focusAfterRender.current = block.id;
  };
  const duplicate = (blockId: string) => {
    const copyId = newId('b');
    edit((l) => duplicateBlock(l, blockId, copyId));
    setSelected(copyId);
    focusAfterRender.current = copyId;
  };
  const remove = (block: Block) =>
    isPristine(block) ? edit((l) => removeBlock(l, block.id)) : setDeleting(block.id);
  const pendingDelete = lesson.blocks.find((b) => b.id === deleting);

  return (
    <>
      <EditorBar
        title={lesson.title || 'Untitled lesson'}
        back={back}
        crumbs={crumbs}
        draft={draft}
        actions={
          <PreviewLink draft={draft} to={`/studio/courses/${courseId}/preview/${lessonId}`}>
            {`Preview as ${terms.learner}`}
          </PreviewLink>
        }
      >
        <div className="studio-cols">
          <Card className="studio-rail" title={`Lessons and ${terms.Quizzes}`}>
            <nav aria-label="Lessons in this course">
              <ul>
                {work.course.chapters
                  .flatMap((p) => p.items)
                  .map((i) => (
                    <li key={i.id}>
                      <Link
                        to={itemEditorPath(courseId, i)}
                        aria-current={i.id === lessonId ? 'page' : undefined}
                      >
                        {i.title ||
                          (i.type === 'lesson' ? 'Untitled lesson' : `Untitled ${terms.Quiz}`)}
                        {i.type === 'quiz' ? (
                          <span className="studio-rail__kind">{` ${terms.Quiz}`}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
              </ul>
            </nav>
          </Card>

          <section className="studio-canvas" aria-label="Lesson content">
            <Input
              label="Lesson title"
              value={lesson.title}
              error={titleIssue?.message}
              onChange={(e) => edit((l) => ({ ...l, title: e.target.value }))}
            />
            <DragList
              className="studio-blocks"
              label="Blocks"
              items={lesson.blocks}
              itemKey={(b) => b.id}
              itemLabel={(b) => `${BLOCK_LABELS[b.type]} block`}
              onMove={(from, to) => edit((l) => moveBlock(l, from, to))}
              renderItem={(block, { handle }) => (
                <div data-block-id={block.id}>
                  <BlockPreviewFrame
                    block={block}
                    onChange={(next) => edit((l) => replaceBlock(l, next))}
                    label={BLOCK_LABELS[block.type]}
                    handle={handle}
                    selected={selected === block.id}
                    error={messages(block.id)}
                    onDuplicate={() => duplicate(block.id)}
                    onDelete={() => remove(block)}
                  />
                </div>
              )}
            />
            {lesson.blocks.length === 0 ? (
              <EmptyState title="This lesson is empty" headingAs="h2">
                Add a block below to start writing it.
              </EmptyState>
            ) : null}
            <BlockPalette onAdd={add} />
          </section>

          <aside className="studio-settings" aria-label="Lesson settings">
            <Card className="sc-panel" title="Lesson settings">
              <Input
                label="Estimated minutes"
                type="number"
                min={0}
                max={600}
                value={lesson.minutes}
                onChange={(e) => edit((l) => ({ ...l, minutes: parseMinutes(e.target.value) }))}
              />
              <Select
                label="Completion rule"
                value={lesson.completeWhen}
                onChange={(e) =>
                  edit((l) => ({ ...l, completeWhen: e.target.value as Lesson['completeWhen'] }))
                }
              >
                {completion(terms).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
              <Input
                label="Type label"
                hint="Shown beside the lesson, for example Reading or Hands-on."
                value={lesson.kindLabel ?? ''}
                onChange={(e) => edit((l) => patch(l, { kindLabel: e.target.value || undefined }))}
              />
              <p className="sc-help">
                Every block is plain JSON, so a lesson can be reviewed and restored like code.
              </p>
            </Card>
          </aside>
        </div>
      </EditorBar>
      {pendingDelete ? (
        <ConfirmDialog
          title={`Delete this ${BLOCK_LABELS[pendingDelete.type].toLowerCase()} block?`}
          confirmLabel="Delete block"
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            edit((l) => removeBlock(l, pendingDelete.id));
            setDeleting(null);
          }}
        >
          Its content is removed from the draft. You can still restore an older version of the
          course.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
