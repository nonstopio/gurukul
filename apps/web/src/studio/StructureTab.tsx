import {
  Button,
  Callout,
  Card,
  Chip,
  Dialog,
  DragList,
  Input,
  Select,
  TypeTile,
} from '@gurukul/ui';
import { diffCourses, itemsOf } from '@gurukul/schema';
import type { Course, CourseDiff, Item } from '@gurukul/schema';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  addLesson,
  addChapter,
  addQuiz,
  deleteItem,
  deleteChapter,
  moveItemToChapter,
  moveItemWithin,
  moveChapter,
  renameItem,
  renameChapter,
} from './courseEdit';
import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { newId } from './ids';
import { itemEditorPath, itemKind, itemMeta, nameOf } from './studioModel';
import { useStudio } from './StudioProvider';
import type { Working } from './types';

type Confirm = {
  kind: 'chapter' | 'item';
  id: string;
  title: string;
  count: number;
  /** Learners who completed this lesson; null until the count arrives, or when it does not apply. */
  learners: number | null;
} | null;

/** The course outline: chapters you can reorder, and the lessons and Quizzes inside them. */
export function StructureTab({
  course,
  live,
  update,
}: {
  course: Course;
  /** The published copy, or null before the first publication. */
  live: Course | null;
  update: (edit: (w: Working) => Working) => void;
}) {
  const t = useTerms();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<Confirm>(null);
  const { data } = useStudio();
  const diff = useMemo(() => diffCourses(live, course), [live, course]);
  const version = live?.version ?? 0;

  /** A lesson that learners can already have completed: ask how many, once, when the dialog opens. */
  const askDelete = (item: Item) => {
    setConfirm({ kind: 'item', id: item.id, title: item.title, count: 0, learners: null });
    if (item.type !== 'lesson' || !live || !itemsOf(live).some((i) => i.id === item.id)) return;
    data
      .completedCount(course.id, item.id)
      .then((learners) => setConfirm((c) => (c?.id === item.id ? { ...c, learners } : c)))
      .catch(() => log.warn('Counting lesson completions failed', { courseId: course.id }));
  };

  const remove = ({ kind, id }: NonNullable<Confirm>) => {
    update((w) => (kind === 'chapter' ? deleteChapter(w, id) : deleteItem(w, id)));
    setConfirm(null);
  };

  return (
    <section className="sc-structure" aria-labelledby="structure-title">
      <div className="sc-structure__head">
        <div>
          <h2 id="structure-title" className="sc-h2">
            Structure
          </h2>
          <p className="sc-help">
            {version > 0
              ? `${t.Learners} on v${version} keep their progress — matched by lesson id.`
              : `${t.Learners} keep their progress by lesson id, so renaming and moving are safe.`}
          </p>
        </div>
        <Button variant="secondary" onClick={() => update((w) => addChapter(w, newId('chapter')))}>
          {`Add ${t.chapter}`}
        </Button>
      </div>
      {course.chapters.length === 0 ? (
        <Callout tone="tip" title={`Start with ${article(t.chapter)}`}>
          <p>{`A ${t.chapter} groups lessons. Add one, then put lessons and ${t.Quizzes} inside it.`}</p>
        </Callout>
      ) : (
        <DragList
          label={t.Chapters}
          className="sc-chapters"
          items={course.chapters}
          itemKey={(p) => p.id}
          itemLabel={(p) => nameOf(p.title, `Untitled ${t.chapter}`)}
          onMove={(from, to) => update((w) => moveChapter(w, from, to))}
          renderItem={(chapter, { index, handle }) => {
            const open = !collapsed[chapter.id];
            const minutes = chapter.items.reduce(
              (s, i) => s + (i.type === 'lesson' ? i.minutes : 0),
              0,
            );
            return (
              <Card as="section" className="sc-chapter" aria-label={`${t.Chapter} ${index + 1}`}>
                <div className="sc-chapter__head">
                  {handle}
                  <span className="sc-chapter__no">{`${t.Chapter} ${index + 1}`}</span>
                  {open ? (
                    <Input
                      className="sc-chapter__input"
                      label={`Title of ${t.chapter} ${index + 1}`}
                      hideLabel
                      value={chapter.title}
                      maxLength={160}
                      onChange={(e) => update((w) => renameChapter(w, chapter.id, e.target.value))}
                    />
                  ) : (
                    <span className="sc-chapter__title">{chapter.title}</span>
                  )}
                  <span className="sc-chapter__meta">
                    {chapter.items.length} {chapter.items.length === 1 ? 'item' : 'items'} ·{' '}
                    {minutes} min
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={open}
                    aria-controls={`chapter-body-${chapter.id}`}
                    onClick={() => setCollapsed({ ...collapsed, [chapter.id]: open })}
                  >
                    {open ? 'Collapse' : 'Expand'}{' '}
                    <span className="sr-only">{`${t.chapter} ${index + 1}`}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${t.chapter} ${nameOf(chapter.title, `Untitled ${t.chapter}`)}`}
                    onClick={() =>
                      setConfirm({
                        kind: 'chapter',
                        id: chapter.id,
                        title: chapter.title,
                        count: chapter.items.length,
                        learners: null,
                      })
                    }
                  >
                    Delete
                  </Button>
                </div>
                {open ? (
                  <div id={`chapter-body-${chapter.id}`} className="sc-chapter__body">
                    {chapter.items.length === 0 ? (
                      <p className="sc-help">Nothing here yet.</p>
                    ) : (
                      <DragList
                        label={`Items in ${nameOf(chapter.title, `Untitled ${t.chapter}`)}`}
                        className="sc-items"
                        items={chapter.items}
                        itemKey={(i) => i.id}
                        itemLabel={(i) => nameOf(i.title, 'Untitled')}
                        onMove={(from, to) =>
                          update((w) => moveItemWithin(w, chapter.id, from, to))
                        }
                        renderItem={(item, ctx) => (
                          <ItemRow
                            item={item}
                            courseId={course.id}
                            handle={ctx.handle}
                            diff={diff}
                            others={course.chapters.filter((p) => p.id !== chapter.id)}
                            onMoveTo={(target) =>
                              update((w) => moveItemToChapter(w, item.id, target))
                            }
                            onRename={(title) => update((w) => renameItem(w, item.id, title))}
                            onDelete={() => askDelete(item)}
                          />
                        )}
                      />
                    )}
                    <div className="sc-chapter__add">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => update((w) => addLesson(w, chapter.id, newId('lesson')))}
                      >
                        + Lesson <span className="sr-only">{`in ${t.chapter} ${index + 1}`}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => update((w) => addQuiz(w, chapter.id, newId('quiz')))}
                      >
                        + {t.Quiz} <span className="sr-only">{`in ${t.chapter} ${index + 1}`}</span>
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          }}
        />
      )}
      {confirm ? (
        <Dialog
          open
          onClose={() => setConfirm(null)}
          title={confirm.kind === 'chapter' ? `Delete this ${t.chapter}?` : 'Delete this item?'}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Keep it
              </Button>
              <Button variant="danger" onClick={() => remove(confirm)}>
                Delete
              </Button>
            </>
          }
        >
          <p>
            “{confirm.title}”
            {confirm.kind === 'chapter' && confirm.count > 0
              ? ` and its ${confirm.count} ${confirm.count === 1 ? 'item' : 'items'} will be removed from the draft.`
              : ' will be removed from the draft.'}{' '}
            {confirm.learners !== null && confirm.learners > 0
              ? `${confirm.learners} ${confirm.learners === 1 ? `${t.learner} has` : `${t.learners} have`} completed it; they `
              : `${t.Learners} who completed it `}
            keep their progress record.
          </p>
        </Dialog>
      ) : null}
    </section>
  );
}

function ItemRow({
  item,
  courseId,
  handle,
  diff,
  others,
  onMoveTo,
  onRename,
  onDelete,
}: {
  item: Item;
  courseId: string;
  handle: React.ReactNode;
  diff: CourseDiff;
  others: Course['chapters'];
  onMoveTo: (chapterId: string) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const t = useTerms();
  const title = nameOf(item.title, 'Untitled');
  const [renaming, setRenaming] = useState(false);
  return (
    <div className="sc-item">
      {handle}
      <TypeTile kind={itemKind(item)} />
      {renaming ? (
        <Input
          className="sc-item__input"
          label={`Title of ${title}`}
          hideLabel
          value={item.title}
          maxLength={160}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves to the field the person just asked to edit
          autoFocus
          onChange={(e) => onRename(e.target.value)}
          onBlur={() => setRenaming(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <>
          <Link className="sc-item__title" to={itemEditorPath(courseId, item)}>
            {title}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Rename ${title}`}
            onClick={() => setRenaming(true)}
          >
            Rename
          </Button>
        </>
      )}
      {diff.added.includes(item.id) ? <Chip tone="accent">New</Chip> : null}
      {diff.edited.includes(item.id) ? <Chip tone="info">Edited</Chip> : null}
      <span className="sc-item__meta">{itemMeta(item)}</span>
      {others.length > 0 ? (
        <Select
          className="sc-item__move"
          label={`Move ${title} to another ${t.chapter}`}
          hideLabel
          value=""
          onChange={(e) => onMoveTo(e.target.value)}
        >
          <option value="" disabled>
            Move to…
          </option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {nameOf(p.title, `Untitled ${t.chapter}`)}
            </option>
          ))}
        </Select>
      ) : null}
      <Button variant="ghost" size="sm" aria-label={`Delete ${title}`} onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}
