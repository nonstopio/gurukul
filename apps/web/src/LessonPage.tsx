import { itemStates, itemsOf, resumeItemId } from '@gurukul/schema';
import type { Course, ItemState, Lesson } from '@gurukul/schema';
import {
  Button,
  Callout,
  ProgressBar,
  Toggle,
  TopBar,
  buttonClass,
  topBarBackClass,
  useToast,
} from '@gurukul/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useSession } from './auth/AuthProvider';
import { useLearnerData } from './data/DataProvider';
import type { ProgressRow } from './data/types';
import { useAsync } from './data/useAsync';
import { percentFor } from './learn/model';
import { Loaded } from './learn/ui';
import { BlockView } from './player/blocks';

const EMPTY = { completedItemIds: [], pariksha: {}, lastItemId: null };

/** True when focus is somewhere the J / K shortcuts would be typed into. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable === true);
}

/** True once the end-of-article sentinel has been seen; true at once where IntersectionObserver is missing. */
function useReachedEnd(ref: React.RefObject<HTMLElement | null>, key: string): boolean {
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (typeof IntersectionObserver === 'undefined' || !el) {
      setSeen(key);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setSeen(key);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, key]);
  return seen === key;
}

/** The lesson player: a generic renderer over the lesson's blocks, with the outline rail. */
export function LessonPage() {
  const { courseId = '', itemId = '' } = useParams();
  const data = useLearnerData();
  const { user } = useSession();
  const uid = user?.uid ?? '';
  const [progress, setProgress] = useState<ProgressRow | null | undefined>(undefined);
  const result = useAsync(useCallback(() => data.getCourse(courseId), [data, courseId]));
  useEffect(() => data.watchProgress(uid, courseId, setProgress), [data, uid, courseId]);

  return (
    <Loaded loadable={result}>
      {(course) =>
        course === null ? (
          <Navigate to="/courses" replace />
        ) : (
          <Player course={course} itemId={itemId} progress={progress} uid={uid} />
        )
      }
    </Loaded>
  );
}

function Player({
  course,
  itemId,
  progress,
  uid,
}: {
  course: Course;
  itemId: string;
  progress: ProgressRow | null | undefined;
  uid: string;
}) {
  const data = useLearnerData();
  const navigate = useNavigate();
  const toast = useToast();
  const items = itemsOf(course);
  const index = items.findIndex((i) => i.id === itemId);
  const item = items[index];
  const state = progress ?? EMPTY;
  const states = itemStates(course, state);
  const [saving, setSaving] = useState(false);
  const [watched, setWatched] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const atEnd = useReachedEnd(endRef, itemId);
  const known = index >= 0;

  // Opening a lesson starts the course the first time and moves the resume point.
  useEffect(() => {
    if (progress === null) void data.startCourse(uid, course);
    else if (progress && known && progress.lastItemId !== itemId) {
      void data.setLastItem(uid, course.id, itemId);
    }
  }, [data, uid, course, progress, itemId, known]);

  const prev = items[index - 1];
  const next = items[index + 1];
  const goTo = useCallback(
    (id: string | undefined) => {
      void navigate(id ? `/courses/${course.id}/learn/${id}` : `/courses/${course.id}`);
    },
    [navigate, course.id],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === 'j' && next && states[next.id] !== 'locked') goTo(next.id);
      if (e.key === 'k' && prev) goTo(prev.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, states, goTo]);

  useEffect(() => {
    if (!known)
      toast.show('That lesson is not in this course any more. Taking you to where you left off.');
  }, [known, toast]);

  if (!known) {
    const resume = resumeItemId(course, state);
    return (
      <Navigate
        to={resume ? `/courses/${course.id}/learn/${resume}` : `/courses/${course.id}`}
        replace
      />
    );
  }
  const s = states[itemId] as ItemState;
  const percent = percentFor(course, progress ?? null);
  const back = (
    <Link className={topBarBackClass} to={`/courses/${course.id}`}>
      Course outline
    </Link>
  );

  if (!item || item.type === 'pariksha' || s === 'locked') {
    return (
      <>
        <TopBar title={course.title} back={back} />
        <main className="page">
          <Callout tone="note" title={s === 'locked' ? 'Locked for now' : 'Pariksha'}>
            <p>
              {s === 'locked'
                ? 'Finish the earlier items, and pass any Pariksha before this one, to open it.'
                : 'Parikshas open from the outline once they are available.'}
            </p>
          </Callout>
          <Link className={buttonClass('secondary')} to={`/courses/${course.id}`}>
            Back to the outline
          </Link>
        </main>
      </>
    );
  }

  const lesson: Lesson = item;
  const done = s === 'done';
  const gate =
    lesson.completeWhen === 'video90' ? watched : lesson.completeWhen === 'scrolled' ? atEnd : true;
  const complete = async () => {
    setSaving(true);
    try {
      if (!done) await data.completeItem(uid, course.id, lesson.id);
      goTo(next?.id);
    } catch {
      toast.show('Could not save your progress. Try again.', { tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TopBar
        title={course.title}
        back={back}
        status={<ProgressBar value={percent} label="Course progress" />}
      />
      <div className="player">
        <nav className="rail" aria-label="Course outline">
          <ol>
            {items.map((i) => (
              <li key={i.id}>
                {states[i.id] === 'locked' || i.type === 'pariksha' ? (
                  <span aria-disabled="true">{i.title}</span>
                ) : (
                  <Link
                    to={`/courses/${course.id}/learn/${i.id}`}
                    {...(i.id === itemId ? { 'aria-current': 'page' as const } : {})}
                  >
                    {i.title}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <main className={`article article--${lesson.layout}`}>
          <p className="article__kicker">
            Lesson {index + 1} of {items.length}
          </p>
          <h1 className="article__title">{lesson.title}</h1>
          {lesson.blocks.length === 0 ? <p>This lesson is empty.</p> : null}
          {lesson.blocks.map((b) => (
            <BlockView key={b.id} block={b} />
          ))}
          <div ref={endRef} aria-hidden="true" />
          {lesson.completeWhen === 'video90' && !done ? (
            <Toggle
              label="I have watched the video"
              checked={watched}
              onChange={(e) => setWatched(e.target.checked)}
            />
          ) : null}
          <footer className="article__footer">
            {prev ? (
              <Link
                className={buttonClass('secondary')}
                to={`/courses/${course.id}/learn/${prev.id}`}
              >
                Previous
              </Link>
            ) : null}
            <Button disabled={saving || (!done && !gate)} onClick={() => void complete()}>
              {done
                ? next
                  ? 'Next'
                  : 'Back to the course'
                : next
                  ? 'Mark complete'
                  : 'Finish course'}
            </Button>
          </footer>
        </main>
      </div>
    </>
  );
}
