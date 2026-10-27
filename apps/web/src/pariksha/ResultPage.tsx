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
import { cooldownRemaining, formatWait, itemAfter, itemPath } from './model';
import type { AttemptResult } from './service';

/** What the Pariksha screen hands over, so the review needs no second round trip. */
export interface ResultState {
  result: AttemptResult;
  questions: Question[];
  answers: Record<string, string[]>;
}

const text = (q: Question, ids: readonly string[]) =>
  ids.map((id) => q.options.find((o) => o.id === id)?.text ?? id).join(', ') || 'No answer';

/** The score, pass or not, the review with explanations (as the Pariksha allows), and what next. */
export function ResultPage() {
  const { courseId = '', parikshaId = '' } = useParams();
  const state = useLocation().state as ResultState | null;
  const [now] = useState(() => new Date());
  const data = useLearnerData();
  const uid = useUser().uid;
  const [progress, setProgress] = useState<ProgressRow | null | undefined>(undefined);
  const result = useAsync(useCallback(() => data.getCourse(courseId), [data, courseId]));
  useEffect(() => data.watchProgress(uid, courseId, setProgress), [data, uid, courseId]);

  return (
    <Loaded loadable={result}>
      {(course) => {
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
        const saved = progress?.pariksha[pariksha.id];
        const score = state?.result.score ?? saved?.best ?? 0;
        const passed = state?.result.passed ?? saved?.passed ?? false;
        const nextItem = itemAfter(course, pariksha.id);
        const wait = state?.result.nextAttemptAt
          ? Math.max(0, state.result.nextAttemptAt - now.getTime())
          : cooldownRemaining(saved?.lastAttemptAt ?? null, pariksha.cooldownMinutes, now);
        const firstWrong = state?.result.results.find((r) => !r.correct);
        const reviewId = state?.questions.find(
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
                  {state
                    ? `You answered ${state.result.correctCount} of ${state.result.total} correctly (${Math.round(score * 100)}%).`
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
                      {nextItem ? 'Continue' : 'Finish course'}
                    </Link>
                  ) : (
                    <Link
                      className={buttonClass('primary')}
                      to={
                        reviewId
                          ? `/courses/${course.id}/learn/${reviewId}`
                          : `/courses/${course.id}`
                      }
                    >
                      Revisit lessons
                    </Link>
                  )}
                  {wait > 0 ? (
                    <span className="score__wait">Retake in {formatWait(wait)}</span>
                  ) : (
                    <Link
                      className={buttonClass('secondary')}
                      to={`/courses/${course.id}/pariksha/${pariksha.id}`}
                    >
                      Retake
                    </Link>
                  )}
                </div>
              </div>
            </Card>
            {state ? (
              <section aria-labelledby="review-title">
                <h2 id="review-title">Review</h2>
                <ul className="review">
                  {state.questions.map((q) => {
                    const r = state.result.results.find((x) => x.questionId === q.id);
                    const correct = r?.correct === true;
                    return (
                      <ResultRow
                        key={q.id}
                        passed={correct}
                        question={q.prompt}
                        yourAnswer={text(q, state.answers[q.id] ?? [])}
                        {...(r?.correctOptionIds && !correct
                          ? { correctAnswer: text(q, r.correctOptionIds) }
                          : {})}
                        {...(q.reviewItemId && !correct
                          ? {
                              revisit: {
                                label: 'Revisit the lesson',
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
