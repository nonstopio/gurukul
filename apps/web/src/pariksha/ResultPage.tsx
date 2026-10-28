import { itemsOf } from '@gurukul/schema';
import type { Question } from '@gurukul/schema';
import { Card, Chip, ProgressRing, ResultRow, buttonClass } from '@gurukul/ui';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import type { ProgressRow } from '../data/types';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { log } from '../log';
import { formatCountdown, itemAfter, itemPath, parvaNumber, reviewOfAttempt } from './model';
import type { AttemptReview } from './model';
import type { AttemptResult } from './service';

/** What the Pariksha screen hands over, so the review needs no second round trip. */
export interface ResultState {
  result: AttemptResult;
  questions: Question[];
  answers: Record<string, string[]>;
}

const text = (q: Question, ids: readonly string[]) =>
  ids.map((id) => q.options.find((o) => o.id === id)?.text ?? id).join(', ') || 'No answer';

/**
 * The score, pass or not, the review with explanations (as the Pariksha allows), and what next.
 * Straight after Finish the Pariksha screen hands the graded result over; opened any other way (a
 * reload, a bookmark, another device) the page reads the learner's latest recorded attempt.
 */
export function ResultPage() {
  const { courseId = '', parikshaId = '' } = useParams();
  const state = useLocation().state as ResultState | null;
  const data = useLearnerData();
  const uid = useUser().uid;
  const [progress, setProgress] = useState<ProgressRow | null | undefined>(undefined);
  const result = useAsync(
    useCallback(
      () =>
        Promise.all([
          data.getCourse(courseId),
          state
            ? null
            : data.latestAttempt(uid, courseId, parikshaId).catch(() => {
                log.warn('Latest attempt unreadable, showing the summary', {
                  courseId,
                  parikshaId,
                });
                return null;
              }),
        ]),
      [data, uid, courseId, parikshaId, state],
    ),
  );
  useEffect(() => data.watchProgress(uid, courseId, setProgress), [data, uid, courseId]);

  return (
    <Loaded loadable={result}>
      {([course, attempt]) => {
        const pariksha = course ? itemsOf(course).find((i) => i.id === parikshaId) : undefined;
        if (!course || pariksha?.type !== 'pariksha') {
          return (
            <main className="page">
              <h1 className="page__title">This Pariksha does not exist.</h1>
              <Link className={buttonClass('secondary')} to="/courses">
                Browse the catalogue
              </Link>
            </main>
          );
        }
        const review: AttemptReview | null = state
          ? { ...state.result, questions: state.questions, answers: state.answers }
          : attempt
            ? reviewOfAttempt(pariksha, attempt)
            : null;
        const saved = progress?.pariksha[pariksha.id];
        const score = review?.score ?? saved?.best ?? 0;
        const passed = review?.passed ?? saved?.passed ?? false;
        const nextItem = itemAfter(course, pariksha.id);
        const nextParva = nextItem ? parvaNumber(course, nextItem.id) : 0;
        const opensAt =
          state?.result.nextAttemptAt ??
          (saved?.lastAttemptAt?.getTime() ?? 0) + pariksha.cooldownMinutes * 60_000;
        const titleOf = (id: string | undefined) =>
          itemsOf(course).find((i) => i.id === id && i.type === 'lesson')?.title;
        const firstWrong = review?.results.find((r) => !r.correct);
        const reviewId = review?.questions.find(
          (q) => q.id === firstWrong?.questionId,
        )?.reviewItemId;
        return (
          <main className="page">
            <Card className="score">
              <ProgressRing value={score * 100} label={`${pariksha.title} score`} size={148} />
              <div>
                <Chip tone={passed ? 'accent' : 'warning'}>
                  {passed ? 'Passed' : 'Not passed yet'}
                </Chip>
                <h1 className="page__title">
                  {passed ? `${pariksha.title} cleared.` : 'Not this time.'}
                </h1>
                <p>
                  {review
                    ? `You answered ${review.correctCount} of ${review.total} correctly (${Math.round(score * 100)}%).`
                    : `Your best score is ${Math.round(score * 100)}%.`}
                </p>
                <div className="continue__actions">
                  {passed ? (
                    <Link
                      className={buttonClass('primary')}
                      to={
                        nextItem ? itemPath(course.id, nextItem) : `/courses/${course.id}/complete`
                      }
                    >
                      {!nextItem
                        ? 'Finish course'
                        : nextParva === parvaNumber(course, pariksha.id)
                          ? 'Continue'
                          : `Continue to Parva ${nextParva}`}
                    </Link>
                  ) : (
                    <Link
                      className={buttonClass('primary')}
                      to={
                        titleOf(reviewId)
                          ? `/courses/${course.id}/learn/${reviewId}`
                          : `/courses/${course.id}`
                      }
                    >
                      Revisit lessons
                    </Link>
                  )}
                  <Retake opensAt={opensAt} to={`/courses/${course.id}/pariksha/${pariksha.id}`} />
                </div>
              </div>
            </Card>
            {review ? (
              <section aria-labelledby="review-title">
                <h2 id="review-title">Review</h2>
                <ul className="review">
                  {review.questions.map((q) => {
                    const r = review.results.find((x) => x.questionId === q.id);
                    const correct = r?.correct === true;
                    const lesson = titleOf(q.reviewItemId);
                    return (
                      <ResultRow
                        key={q.id}
                        passed={correct}
                        question={q.prompt}
                        yourAnswer={text(q, review.answers[q.id] ?? [])}
                        {...(r?.correctOptionIds && !correct
                          ? { correctAnswer: text(q, r.correctOptionIds) }
                          : {})}
                        {...(lesson && !correct
                          ? {
                              revisit: {
                                label: `Revisit lesson: ${lesson}`,
                                render: (p) => (
                                  <Link
                                    to={`/courses/${course.id}/learn/${q.reviewItemId}`}
                                    {...(p as object)}
                                  />
                                ),
                              },
                            }
                          : {})}
                      >
                        {r?.explanation}
                      </ResultRow>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </main>
        );
      }}
    </Loaded>
  );
}

/** "Retake", or a countdown to it that ticks each second and turns into the link when it opens. */
function Retake({ opensAt, to }: { opensAt: number; to: string }) {
  const [now, setNow] = useState(() => Date.now());
  const open = now >= opensAt;
  useEffect(() => {
    if (open) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);
  return open ? (
    <Link className={buttonClass('secondary')} to={to}>
      Retake
    </Link>
  ) : (
    <span className="score__wait" role="timer">
      Retake opens in {formatCountdown(opensAt - now)}
    </span>
  );
}
