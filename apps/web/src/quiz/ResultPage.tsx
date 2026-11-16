import { itemsOf } from '@gurukul/schema';
import type { Question } from '@gurukul/schema';
import {
  Card,
  Chip,
  Mascot,
  Page,
  PageHeader,
  ProgressRing,
  ResultRow,
  TopBar,
  buttonClass,
  topBarBackClass,
} from '@gurukul/ui';
import { useCallback } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import { useProgress, withProgress } from '../data/useProgress';
import { LoadedPage } from '../learn/ui';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { itemAfter, itemPath, reviewOfAttempt } from './model';
import type { AttemptReview } from './model';
import { Retake } from './Retake';
import type { AttemptResult } from './service';

/** What the Quiz screen hands over, so the review needs no second round trip. */
export interface ResultState {
  result: AttemptResult;
  questions: Question[];
  answers: Record<string, string[]>;
}

const text = (q: Question, ids: readonly string[]) =>
  ids.map((id) => q.options.find((o) => o.id === id)?.text ?? id).join(', ') || 'No answer';

/**
 * The score, pass or not, the review with explanations (as the Quiz allows), and what next.
 * Straight after Finish the Quiz screen hands the graded result over; opened any other way (a
 * reload, a bookmark, another device) the page reads the learner's latest recorded attempt.
 */
export function ResultPage() {
  const { courseId = '', quizId = '' } = useParams();
  const state = useLocation().state as ResultState | null;
  const data = useLearnerData();
  const uid = useUser().uid;
  const t = useTerms();
  const progress = useProgress(data, uid, courseId);
  const result = useAsync(
    useCallback(
      () =>
        Promise.all([
          data.getCourse(courseId),
          state
            ? null
            : data.latestAttempt(uid, courseId, quizId).catch(() => {
                log.warn('Latest attempt unreadable, showing the summary', {
                  courseId,
                  quizId,
                });
                return null;
              }),
        ]),
      [data, uid, courseId, quizId, state],
    ),
  );

  return (
    <LoadedPage loadable={withProgress(result, progress)} width="reading">
      {([[course, attempt], progress]) => {
        const quiz = course ? itemsOf(course).find((i) => i.id === quizId) : undefined;
        if (!course || quiz?.type !== 'quiz') {
          return (
            <Page width="reading">
              <PageHeader
                title={`This ${t.Quiz} does not exist.`}
                actions={
                  <Link className={buttonClass('secondary')} to="/courses">
                    Browse the catalogue
                  </Link>
                }
              />
            </Page>
          );
        }
        const review: AttemptReview | null = state
          ? { ...state.result, questions: state.questions, answers: state.answers }
          : attempt
            ? reviewOfAttempt(quiz, attempt)
            : null;
        const saved = progress?.quiz[quiz.id];
        const score = review?.score ?? saved?.best ?? 0;
        const passed = review?.passed ?? saved?.passed ?? false;
        const nextItem = itemAfter(course, quiz.id);
        const opensAt =
          state?.result.nextAttemptAt ??
          (saved?.lastAttemptAt?.getTime() ?? 0) + quiz.cooldownMinutes * 60_000;
        const titleOf = (id: string | undefined) =>
          itemsOf(course).find((i) => i.id === id && i.type === 'lesson')?.title;
        const firstWrong = review?.results.find((r) => !r.correct);
        const reviewId = review?.questions.find(
          (q) => q.id === firstWrong?.questionId,
        )?.reviewItemId;
        return (
          <>
            <TopBar
              title={course.title}
              titleAs="p"
              back={
                <Link className={topBarBackClass} to={`/courses/${course.id}`}>
                  Course outline
                </Link>
              }
            />
            <Page width="reading">
              <Card className="verdict">
                <ProgressRing value={score * 100} label={`${quiz.title} score`} size={148} />
                {/* A pass celebrates; a miss gets the tip face, never a sad one (the words say the rest). */}
                <Mascot state={passed ? 'complete' : 'tip'} size={96} />
                <PageHeader
                  meta={
                    <Chip tone={passed ? 'accent' : 'warning'}>
                      {passed ? 'Passed' : 'Not passed yet'}
                    </Chip>
                  }
                  title={passed ? `${quiz.title} cleared.` : 'Not this time.'}
                  lead={
                    review
                      ? `You answered ${review.correctCount} of ${review.total} correctly (${Math.round(score * 100)}%).`
                      : `Your best score is ${Math.round(score * 100)}%.`
                  }
                  actions={
                    <>
                      <Retake opensAt={opensAt} to={`/courses/${course.id}/quiz/${quiz.id}`} />
                      {passed ? (
                        <Link
                          className={buttonClass('primary')}
                          to={
                            nextItem
                              ? itemPath(course.id, nextItem)
                              : `/courses/${course.id}/complete`
                          }
                        >
                          {nextItem ? 'Continue' : 'Finish course'}
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
                    </>
                  }
                />
              </Card>
              {review ? (
                <Card title="Review">
                  <ul className="learn-rows">
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
                                  // Short on screen; the name keeps each row's link distinct when read aloud.
                                  label: (
                                    <>
                                      Revisit lesson<span className="sr-only">: {lesson}</span>
                                    </>
                                  ),
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
                </Card>
              ) : null}
            </Page>
          </>
        );
      }}
    </LoadedPage>
  );
}
