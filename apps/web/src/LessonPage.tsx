import { itemStates, itemsOf, resumeItemId } from '@gurukul/schema';
import type { Course, ItemState, Lesson, Chapter } from '@gurukul/schema';
import {
  Button,
  Callout,
  CheckIcon,
  ChevronLeftIcon,
  Chip,
  LockIcon,
  Page,
  PageHeader,
  PlayIcon,
  ProgressBar,
  TopBar,
  buttonClass,
  topBarBackClass,
  useToast,
} from '@gurukul/ui';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useUser } from './auth/AuthProvider';
import { useLearnerData } from './data/DataProvider';
import type { ProgressRow } from './data/types';
import { useAsync } from './data/useAsync';
import { isRetired, percentFor } from './learn/model';
import { itemPath } from './quiz/model';
import { LoadedPage, RetiredNote } from './learn/ui';
import { BlockView } from './player/blocks';
import { needsWatching, videosOf } from './player/watch';
import { log } from './log';
import { isTyping } from './keys';
import { useTerms } from './labels/useTerms';

const EMPTY = { completedItemIds: [], quiz: {}, lastItemId: null };

export { isTyping };

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
  const uid = useUser().uid;
  const [progress, setProgress] = useState<ProgressRow | null | undefined>(undefined);
  const result = useAsync(useCallback(() => data.getCourse(courseId), [data, courseId]));
  useEffect(() => data.watchProgress(uid, courseId, setProgress), [data, uid, courseId]);

  return (
    <LoadedPage loadable={result} width="reading">
      {(course) =>
        course === null ? (
          <Navigate to="/courses" replace />
        ) : (
          <Player course={course} itemId={itemId} progress={progress} uid={uid} />
        )
      }
    </LoadedPage>
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
  const t = useTerms();
  const items = itemsOf(course);
  const index = items.findIndex((i) => i.id === itemId);
  const item = items[index];
  const state = progress ?? EMPTY;
  const states = itemStates(course, state);
  // Which of this lesson's videos count as watched, keyed `lessonId/blockId` so that moving to
  // another lesson starts from nothing.
  const [watched, setWatched] = useState<Record<string, boolean>>({});
  const onWatched = useCallback(
    (blockId: string, ok: boolean) => setWatched((w) => ({ ...w, [`${itemId}/${blockId}`]: ok })),
    [itemId],
  );
  // Which check questions have had their answer shown, keyed the same way.
  const [answered, setAnswered] = useState<Record<string, boolean>>({});
  const onAnswered = useCallback(
    (blockId: string) => setAnswered((a) => ({ ...a, [`${itemId}/${blockId}`]: true })),
    [itemId],
  );
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
    (target: string | undefined) => {
      void navigate(target ?? `/courses/${course.id}`);
    },
    [navigate, course.id],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === 'j' && next && states[next.id] !== 'locked') goTo(itemPath(course.id, next));
      if (e.key === 'k' && prev) goTo(itemPath(course.id, prev));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, states, goTo, course.id]);

  useEffect(() => {
    if (!known)
      toast.show('That lesson is not in this course any more. Taking you to where you left off.');
  }, [known, toast]);

  if (!known || !item) {
    const resume = resumeItemId(course, state);
    return (
      <Navigate
        to={resume ? `/courses/${course.id}/learn/${resume}` : `/courses/${course.id}`}
        replace
      />
    );
  }
  const s = states[itemId] as ItemState;
  const finishedCount = items.filter((i) => states[i.id] === 'done').length;
  const percent = percentFor(course, progress ?? null);
  const back = (
    <Link className={topBarBackClass} to={`/courses/${course.id}`}>
      Course outline
    </Link>
  );

  if (s === 'locked') {
    return (
      <>
        <TopBar title={course.title} titleAs="p" back={back} />
        <Page width="reading">
          <PageHeader title={item.title} />
          <Callout tone="note" title="Locked for now">
            <p>{`Finish the earlier items, and pass any ${t.Quiz} before this one, to open it.`}</p>
          </Callout>
          <div className="learn-buttons">
            <Link className={buttonClass('secondary')} to={`/courses/${course.id}`}>
              Back to the outline
            </Link>
          </div>
        </Page>
      </>
    );
  }
  if (item.type === 'quiz') return <Navigate to={itemPath(course.id, item)} replace />;

  const lesson: Lesson = item;
  const chapterIndex = course.chapters.findIndex((p) => p.items.some((i) => i.id === itemId));
  const chapterItems = (course.chapters[chapterIndex] as Chapter).items;
  const lessonCount = chapterItems.filter((i) => i.type === 'lesson').length;
  const lessonsBefore = chapterItems
    .slice(
      0,
      chapterItems.findIndex((i) => i.id === itemId),
    )
    .filter((i) => i.type === 'lesson').length;
  const done = s === 'done';
  const watching = needsWatching(lesson, course.rules.requireVideoWatch);
  const videosDone = videosOf(lesson).every((v) => watched[`${lesson.id}/${v.id}`]);
  const checksLeft = lesson.blocks.filter(
    (b) => b.type === 'check' && !answered[`${lesson.id}/${b.id}`],
  ).length;
  const waitingFor = done
    ? null
    : watching && !videosDone
      ? 'Watch 90% of the video to mark this lesson complete.'
      : checksLeft > 0
        ? `Answer the ${checksLeft === 1 ? 'question' : `${checksLeft} questions`} in this lesson to mark it complete.`
        : lesson.completeWhen === 'scrolled' && !atEnd
          ? 'Read to the end to mark this lesson complete.'
          : null;
  // The write lands in the local cache at once and syncs when it can, so moving on never waits
  // for the server: offline, it would wait until the connection came back.
  const complete = () => {
    if (waitingFor) {
      toast.show(waitingFor);
      return;
    }
    // Never walk into a locked item: say what still stands in the way instead.
    const after = itemStates(course, {
      ...state,
      completedItemIds: [...state.completedItemIds, lesson.id],
    });
    const blocker =
      next && after[next.id] === 'locked'
        ? items.slice(0, index + 1).find((i) => i.id !== lesson.id && after[i.id] !== 'done')
        : undefined;
    if (!done) {
      data.completeItem(uid, course.id, lesson.id).catch((e: unknown) => {
        log.error('Saving progress failed', e, { uid, courseId: course.id, itemId: lesson.id });
        toast.show(`Could not save your progress on "${lesson.title}". Open it and try again.`, {
          tone: 'danger',
        });
      });
    }
    if (blocker) {
      toast.show(
        blocker.type === 'quiz'
          ? `Pass the ${t.Quiz} "${blocker.title}" to open the next lesson.`
          : `Finish "${blocker.title}" to open the next lesson.`,
      );
      return;
    }
    const finished = items.every((i) => i.id === lesson.id || states[i.id] === 'done');
    goTo(
      next ? itemPath(course.id, next) : finished ? `/courses/${course.id}/complete` : undefined,
    );
  };

  return (
    <>
      <TopBar
        title={course.title}
        titleAs="p"
        back={back}
        status={
          <ProgressBar
            value={percent}
            label="Course progress"
            caption={`${percent}% · ${finishedCount} / ${items.length}`}
          />
        }
      />
      <div className="player">
        <OutlineRail course={course} itemId={itemId} states={states} />
        <Page width="reading">
          <div className={`article article--${lesson.layout}`}>
            <PageHeader
              eyebrow={`${t.Chapter} ${chapterIndex + 1} · Lesson ${lessonsBefore + 1} of ${lessonCount}`}
              title={lesson.title}
              meta={
                <>
                  {lesson.kindLabel ? <Chip tone="accent">{lesson.kindLabel}</Chip> : null}
                  <Chip>{lesson.minutes} min</Chip>
                </>
              }
            />
            {isRetired(course) ? <RetiredNote /> : null}
            {lesson.blocks.length === 0 ? <p>This lesson is empty.</p> : null}
            {/* One column for every layout: a video is a step in the flow, where the author put it. */}
            {lesson.blocks.map((b) => (
              <BlockView
                key={b.id}
                block={b}
                onAnswered={onAnswered}
                {...(watching && !done ? { onWatched } : {})}
              />
            ))}
            <div ref={endRef} aria-hidden="true" />
            {waitingFor ? (
              <p id="complete-hint" className="article__hint">
                {waitingFor}
              </p>
            ) : null}
            <footer className="article__footer">
              {prev ? (
                <Link className={buttonClass('secondary')} to={itemPath(course.id, prev)}>
                  <ChevronLeftIcon />
                  Previous<span className="sr-only">:</span> {prev.title}
                </Link>
              ) : null}
              <Button
                onClick={complete}
                {...(waitingFor ? { 'aria-describedby': 'complete-hint' } : {})}
              >
                {done
                  ? next
                    ? 'Next'
                    : 'Back to the course'
                  : next
                    ? 'Mark complete'
                    : 'Finish course'}
                {next ? ` · ${next.title}` : ''}
              </Button>
            </footer>
          </div>
        </Page>
      </div>
    </>
  );
}

const STATE_ICON: Record<ItemState, ReactNode> = {
  done: <CheckIcon />,
  current: <PlayIcon />,
  locked: <LockIcon />,
  todo: null,
};
const STATE_WORD: Record<ItemState, string> = {
  done: 'Done',
  current: 'Up next',
  locked: 'Locked',
  todo: 'Not started',
};

/** The outline rail: one group per chapter, every group closed but the current one unless opened by hand. */
function OutlineRail({
  course,
  itemId,
  states,
}: {
  course: Course;
  itemId: string;
  states: Record<string, ItemState>;
}) {
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const t = useTerms();
  const isOpen = (p: Chapter) => toggled[p.id] ?? p.items.some((i) => i.id === itemId);
  return (
    <nav className="rail" aria-label="Course outline">
      {course.chapters.map((p, n) => {
        const open = isOpen(p);
        const listId = `rail-${p.id}`;
        return (
          <section key={p.id} className="rail__chapter">
            <button
              type="button"
              className="rail__head"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => setToggled((was) => ({ ...was, [p.id]: !open }))}
            >
              <span className="learn-label">
                {t.Chapter} {n + 1}
              </span>
              <span>{p.title}</span>
            </button>
            <ol id={listId} hidden={!open}>
              {p.items.map((i) => {
                const st = states[i.id] as ItemState;
                const inner = (
                  <>
                    <span aria-hidden="true" className={`rail__icon rail__icon--${st}`}>
                      {STATE_ICON[st]}
                    </span>
                    {i.title}
                    <span className="sr-only"> ({STATE_WORD[st]})</span>
                  </>
                );
                return (
                  <li key={i.id}>
                    {st === 'locked' ? (
                      <span aria-disabled="true">{inner}</span>
                    ) : (
                      <Link
                        to={`/courses/${course.id}/learn/${i.id}`}
                        {...(i.id === itemId ? { 'aria-current': 'page' as const } : {})}
                      >
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </nav>
  );
}
