import { Button, Callout, Card, Chip, Dialog, DragList, TypeTile } from '@gurukul/ui';
import { diffCourses, itemsOf } from '@gurukul/schema';
import type { Course, CourseDiff, Item } from '@gurukul/schema';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  addLesson,
  addParva,
  addPariksha,
  deleteItem,
  deleteParva,
  moveItemToParva,
  moveItemWithin,
  moveParva,
  renameParva,
} from './courseEdit';
import { log } from '../log';
import { newId } from './ids';
import { itemEditorPath, itemKind, itemMeta, nameOf } from './studioModel';
import { useStudio } from './StudioProvider';
import type { Working } from './types';

type Confirm = {
  kind: 'parva' | 'item';
  id: string;
  title: string;
  count: number;
  /** Learners who completed this lesson; null until the count arrives, or when it does not apply. */
  learners: number | null;
} | null;

/** The course outline: parvas you can reorder, and the lessons and Parikshas inside them. */
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
    update((w) => (kind === 'parva' ? deleteParva(w, id) : deleteItem(w, id)));
    setConfirm(null);
  };

  return (
    <section aria-labelledby="structure-title">
      <div className="sc-structure__head">
        <div>
          <h2 id="structure-title" className="sc-h2">
            Structure
          </h2>
          <p className="sc-help">
            {version > 0
              ? `Learners on v${version} keep their progress — matched by lesson id.`
              : 'Learners keep their progress by lesson id, so renaming and moving are safe.'}
          </p>
        </div>
        <Button variant="secondary" onClick={() => update((w) => addParva(w, newId('parva')))}>
          Add parva
        </Button>
      </div>
      {course.parvas.length === 0 ? (
        <Callout tone="tip" title="Start with a parva">
          <p>A parva is a chapter. Add one, then put lessons and Parikshas inside it.</p>
        </Callout>
      ) : (
        <DragList
          label="Parvas"
          className="sc-parvas"
          items={course.parvas}
          itemKey={(p) => p.id}
          itemLabel={(p) => nameOf(p.title, 'Untitled parva')}
          onMove={(from, to) => update((w) => moveParva(w, from, to))}
          renderItem={(parva, { index, handle }) => {
            const open = !collapsed[parva.id];
            const minutes = parva.items.reduce(
              (s, i) => s + (i.type === 'lesson' ? i.minutes : 0),
              0,
            );
            return (
              <Card as="section" className="sc-parva" aria-label={`Parva ${index + 1}`}>
                <div className="sc-parva__head">
                  {handle}
                  <span className="sc-parva__no">Parva {index + 1}</span>
                  {open ? (
                    <input
                      className="g-control sc-parva__input"
                      aria-label={`Title of parva ${index + 1}`}
                      value={parva.title}
                      maxLength={160}
                      onChange={(e) => update((w) => renameParva(w, parva.id, e.target.value))}
                    />
                  ) : (
                    <span className="sc-parva__title">{parva.title}</span>
                  )}
                  <span className="sc-parva__meta">
                    {parva.items.length} {parva.items.length === 1 ? 'item' : 'items'} · {minutes}{' '}
                    min
                  </span>
                  <Button
                    variant="ghost"
                    aria-expanded={open}
                    aria-controls={`parva-body-${parva.id}`}
                    onClick={() => setCollapsed({ ...collapsed, [parva.id]: open })}
                  >
                    {open ? 'Collapse' : 'Expand'}{' '}
                    <span className="sr-only">parva {index + 1}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Delete parva ${nameOf(parva.title, 'Untitled parva')}`}
                    onClick={() =>
                      setConfirm({
                        kind: 'parva',
                        id: parva.id,
                        title: parva.title,
                        count: parva.items.length,
                        learners: null,
                      })
                    }
                  >
                    Delete
                  </Button>
                </div>
                {open ? (
                  <div id={`parva-body-${parva.id}`} className="sc-parva__body">
                    {parva.items.length === 0 ? (
                      <p className="sc-help">Nothing here yet.</p>
                    ) : (
                      <DragList
                        label={`Items in ${nameOf(parva.title, 'Untitled parva')}`}
                        className="sc-items"
                        items={parva.items}
                        itemKey={(i) => i.id}
                        itemLabel={(i) => nameOf(i.title, 'Untitled')}
                        onMove={(from, to) => update((w) => moveItemWithin(w, parva.id, from, to))}
                        renderItem={(item, ctx) => (
                          <ItemRow
                            item={item}
                            courseId={course.id}
                            handle={ctx.handle}
                            diff={diff}
                            others={course.parvas.filter((p) => p.id !== parva.id)}
                            onMoveTo={(target) =>
                              update((w) => moveItemToParva(w, item.id, target))
                            }
                            onDelete={() => askDelete(item)}
                          />
                        )}
                      />
                    )}
                    <div className="sc-parva__add">
                      <Button
                        variant="ghost"
                        onClick={() => update((w) => addLesson(w, parva.id, newId('lesson')))}
                      >
                        + Lesson <span className="sr-only">in parva {index + 1}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => update((w) => addPariksha(w, parva.id, newId('pariksha')))}
                      >
                        + Pariksha <span className="sr-only">in parva {index + 1}</span>
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
          title={confirm.kind === 'parva' ? 'Delete this parva?' : 'Delete this item?'}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Keep it
              </Button>
              <Button onClick={() => remove(confirm)}>Delete</Button>
            </>
          }
        >
          <p>
            “{confirm.title}”
            {confirm.kind === 'parva' && confirm.count > 0
              ? ` and its ${confirm.count} ${confirm.count === 1 ? 'item' : 'items'} will be removed from the draft.`
              : ' will be removed from the draft.'}{' '}
            {confirm.learners !== null && confirm.learners > 0
              ? `${confirm.learners} ${confirm.learners === 1 ? 'learner has' : 'learners have'} completed it; they `
              : 'Learners who completed it '}
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
  onDelete,
}: {
  item: Item;
  courseId: string;
  handle: React.ReactNode;
  diff: CourseDiff;
  others: Course['parvas'];
  onMoveTo: (parvaId: string) => void;
  onDelete: () => void;
}) {
  const title = nameOf(item.title, 'Untitled');
  return (
    <div className="sc-item">
      {handle}
      <TypeTile kind={itemKind(item)} />
      <Link className="sc-item__title" to={itemEditorPath(courseId, item)}>
        {title}
      </Link>
      {diff.added.includes(item.id) ? <Chip tone="accent">New</Chip> : null}
      {diff.edited.includes(item.id) ? <Chip tone="info">Edited</Chip> : null}
      <span className="sc-item__meta">{itemMeta(item)}</span>
      {others.length > 0 ? (
        <label className="sc-item__move">
          <span className="sr-only">Move {title} to another parva</span>
          <select
            className="g-control g-control--select"
            value=""
            onChange={(e) => onMoveTo(e.target.value)}
          >
            <option value="" disabled>
              Move to…
            </option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {nameOf(p.title, 'Untitled parva')}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Button variant="ghost" aria-label={`Delete ${title}`} onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}
