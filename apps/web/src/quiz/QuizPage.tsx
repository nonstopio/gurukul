import { itemStates, itemsOf } from '@gurukul/schema';
import type { Course, Quiz, Question } from '@gurukul/schema';
import {
  Button,
  Callout,
  Dialog,
  Page,
  PageHeader,
  TopBar,
  buttonClass,
  topBarBackClass,
  useToast,
} from '@gurukul/ui';
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import type { ProgressRow } from '../data/types';
import { useAsync } from '../data/useAsync';
import { isRetired } from '../learn/model';
import { LoadedPage, RetiredNote } from '../learn/ui';
import { clearDraft, draftKey, readDraft, writeDraft } from './draftStore';
import {
  answerLetters,
  cooldownRemaining,
  drawOrder,
  formatWait,
  pickQuestions,
  restoreQuestions,
  sameAnswer,
} from './model';
import { QuestionFields } from './QuestionFields';
import { useQuizService } from './QuizProvider';
import { CooldownError } from './service';
import type { CheckAnswerResult } from './service';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';

const EMPTY = { completedItemIds: [], quiz: {}, lastItemId: null };

/**
 * One question per screen. Each answer is kept in this browser as the learner checks it or moves on
 * (`draftStore`), so a reload carries on; the server grades and records the attempt at Finish.
 */
export function QuizPage() {
  const { courseId = '', quizId = '' } = useParams();
  const data = useLearnerData();
  const uid = useUser().uid;
  const [progress, setProgress] = useState<ProgressRow | null | undefined>(undefined);
  const result = useAsync(useCallback(() => data.getCourse(courseId), [data, courseId]));
  useEffect(() => data.watchProgress(uid, courseId, setProgress), [data, uid, courseId]);

  return (
    <LoadedPage loadable={result} width="reading">
      {(course) => {
        const quiz = course ? itemsOf(course).find((i) => i.id === quizId) : undefined;
        if (!course || quiz?.type !== 'quiz') return <Navigate to="/courses" replace />;
        return progress === undefined ? null : (
          <Exam course={course} quiz={quiz} progress={progress} />
        );
      }}
    </LoadedPage>
  );
}

function Exam({
  course,
  quiz,
  progress,
}: {
  course: Course;
  quiz: Quiz;
  progress: ProgressRow | null;
}) {
  const [now] = useState(() => new Date());
  const data = useLearnerData();
  const uid = useUser().uid;
  // Grading needs a started course. A Quiz can be the first thing opened (a pre-test, a deep
  // link), and only the lesson player used to start one, so every submit failed.
  useEffect(() => {
    if (progress === null && !isRetired(course)) {
      data.startCourse(uid, course).catch((e: unknown) => {
        log.error('Starting the course failed', e, { uid, courseId: course.id });
      });
    }
  }, [data, uid, course, progress]);
  const t = useTerms();
  const states = itemStates(course, progress ?? EMPTY);
  const back = (
    <Link className={topBarBackClass} to={`/courses/${course.id}`}>
      {`Exit ${t.Quiz}`}
    </Link>
  );
  const lastAttemptAt = progress?.quiz[quiz.id]?.lastAttemptAt ?? null;
  const wait = cooldownRemaining(lastAttemptAt, quiz.cooldownMinutes, now);
  // Grading refuses a retired course, so do not let the learner answer questions it cannot score.
  if (isRetired(course)) {
    return (
      <>
        <TopBar title={course.title} titleAs="p" back={back} />
        <Page width="reading">
          <PageHeader title={quiz.title} />
          <RetiredNote />
          <div className="learn-buttons">
            <Link className={buttonClass('secondary')} to={`/courses/${course.id}`}>
              Back to the outline
            </Link>
          </div>
        </Page>
      </>
    );
  }
  if (states[quiz.id] === 'locked' || wait > 0) {
    return (
      <>
        <TopBar title={course.title} titleAs="p" back={back} />
        <Page width="reading">
          <PageHeader title={quiz.title} />
          <Callout tone="note" title={wait > 0 ? 'Retake not open yet' : 'Locked for now'}>
            <p>
              {wait > 0
                ? `You can retake this in ${formatWait(wait)}.`
                : 'Finish the earlier lessons first.'}
            </p>
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
  return <Questions course={course} quiz={quiz} lastAttemptAt={lastAttemptAt} />;
}

/** The questions themselves; mounted only once the Quiz is open, so the draw happens once. */
function Questions({
  course,
  quiz,
  lastAttemptAt,
}: {
  course: Course;
  quiz: Quiz;
  lastAttemptAt: Date | null;
}) {
  const service = useQuizService();
  const navigate = useNavigate();
  const toast = useToast();
  const t = useTerms();
  const uid = useUser().uid;
  const [key] = useState(() => draftKey(uid, course.id, quiz.id));
  // A draft from before the last graded attempt belongs to that attempt, not this one.
  const [start] = useState(() => {
    const saved = readDraft(key);
    const fresh = saved && saved.startedAt > (lastAttemptAt?.getTime() ?? 0) ? saved : null;
    const restored = fresh ? restoreQuestions(quiz, fresh.order) : null;
    if (fresh && restored) return { draft: fresh, questions: restored };
    const questions = pickQuestions(quiz);
    const draft = {
      startedAt: Date.now(),
      order: drawOrder(questions),
      index: 0,
      answers: {},
      feedback: {},
    };
    return { draft, questions };
  });
  const questions = start.questions;
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(start.draft.index, questions.length - 1)),
  );
  const [saved, setSaved] = useState<Record<string, string[]>>(start.draft.answers);
  const [selected, setSelected] = useState<Record<string, string[]>>(start.draft.answers);
  const [feedback, setFeedback] = useState<Record<string, CheckAnswerResult>>(start.draft.feedback);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    writeDraft(key, {
      startedAt: start.draft.startedAt,
      order: start.draft.order,
      index,
      answers: saved,
      feedback,
    });
  }, [key, start, index, saved, feedback]);

  const question = questions[index] as Question;
  const picked = selected[question.id] ?? [];
  const checked = feedback[question.id];
  const last = index === questions.length - 1;
  const multiple = question.kind === 'multiple';
  const reveals = quiz.revealAnswers === 'each';
  const base = { courseId: course.id, quizId: quiz.id };
  const outline = `/courses/${course.id}`;
  const unsaved = !sameAnswer(picked, saved[question.id] ?? []);

  const pick = (optionId: string, on: boolean) =>
    setSelected({
      ...selected,
      [question.id]: multiple
        ? on
          ? [...picked, optionId]
          : picked.filter((id) => id !== optionId)
        : [optionId],
    });

  /** Saves this question's answer and shows another one. */
  const move = (to: number) => {
    setSaved({ ...saved, [question.id]: picked });
    setIndex(to);
  };

  const check = async () => {
    setBusy(true);
    try {
      const verdict = await service.checkAnswer({
        ...base,
        questionId: question.id,
        selected: picked,
      });
      setSaved({ ...saved, [question.id]: picked });
      setFeedback({ ...feedback, [question.id]: verdict });
    } catch (e) {
      log.error('Checking an answer failed', e, { ...base, questionId: question.id });
      toast.show('Could not check your answer. Try again.', { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      const attempt = await service.gradeAttempt({
        ...base,
        questionIds: questions.map((q) => q.id),
        answers: selected,
      });
      clearDraft(key);
      void navigate(`/courses/${course.id}/quiz/${quiz.id}/result`, {
        state: { result: attempt, questions, answers: selected },
      });
    } catch (e) {
      log.error('Submitting an attempt failed', e, base);
      toast.show(
        e instanceof CooldownError
          ? 'A retake is not open yet. Check back soon.'
          : 'Could not submit your answers. Try again.',
        { tone: 'danger' },
      );
      setBusy(false);
    }
  };

  const optionState = (id: string) => {
    if (!checked) return 'idle' as const;
    if (checked.correctOptionIds.includes(id)) return 'correct' as const;
    return picked.includes(id) ? ('incorrect' as const) : ('locked' as const);
  };
  const needsCheck = reveals && !checked;
  const primary = needsCheck ? 'Check answer' : last ? `Finish ${t.Quiz}` : 'Next question';
  const ready = !busy && picked.length > 0;
  const onPrimary = () => {
    if (needsCheck) void check();
    else if (last) void finish();
    else move(index + 1);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (leaving || busy || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') {
        // A focused button or link already acts on Enter by itself.
        if ((e.target as Element).closest('button, a') || !ready) return;
        e.preventDefault();
        onPrimary();
        return;
      }
      if (checked) return;
      const at =
        '1234'.indexOf(e.key) >= 0 ? '1234'.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
      const option = question.options[at];
      if (at >= 0 && option) pick(option.id, multiple ? !picked.includes(option.id) : true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const back = (
    <Link
      className={topBarBackClass}
      to={outline}
      onClick={(e) => {
        if (!unsaved) return;
        e.preventDefault();
        setLeaving(true);
      }}
    >
      {`Exit ${t.Quiz}`}
    </Link>
  );

  return (
    <>
      <TopBar
        title={course.title}
        titleAs="p"
        back={back}
        status={<span>Answers are saved on this device as you go</span>}
      />
      <Page width="reading">
        <PageHeader eyebrow={`Question ${index + 1} of ${questions.length}`} title={quiz.title} />
        <ol className="segments" aria-label="Question progress">
          {questions.map((q, i) => (
            <li
              key={q.id}
              className={
                i < index || selected[q.id]?.length
                  ? 'segments__done'
                  : i === index
                    ? 'segments__now'
                    : ''
              }
            />
          ))}
        </ol>
        <QuestionFields
          question={question}
          picked={picked}
          stateOf={optionState}
          onPick={pick}
          busy={busy}
        />
        {checked ? (
          <p role="status" className="exam__feedback">
            <strong>{verdictText(question, checked)}</strong> {checked.explanation}
          </p>
        ) : null}
        <footer className="exam__footer">
          <p>
            Pass mark {Math.round((quiz.passMark ?? course.rules.passMark) * 100)}% ·{' '}
            {quiz.cooldownMinutes > 0
              ? `Retakes allowed after ${quiz.cooldownMinutes} minutes`
              : 'Retakes allowed straight away'}
          </p>
          <div className="learn-buttons">
            {index > 0 ? (
              <Button variant="secondary" disabled={busy} onClick={() => move(index - 1)}>
                Previous
              </Button>
            ) : null}
            <Button disabled={!ready} loading={busy} onClick={onPrimary}>
              {primary}
            </Button>
          </div>
        </footer>
      </Page>
      <Dialog
        open={leaving}
        title={`Leave this ${t.Quiz}?`}
        onClose={() => setLeaving(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLeaving(false)}>
              Stay
            </Button>
            <Button onClick={() => void navigate(outline)}>Leave</Button>
          </>
        }
      >
        <p>
          Your answer to this question is not saved yet. Answers you have checked or moved past are
          kept, so you can finish later.
        </p>
      </Dialog>
    </>
  );
}

/** "Correct." or "Not quite — the answer is B." with the letters as shown on screen. */
function verdictText(question: Question, verdict: CheckAnswerResult): string {
  if (verdict.correct) return 'Correct.';
  const letters = answerLetters(
    question.options.map((o) => o.id),
    verdict.correctOptionIds,
  );
  if (!letters) return 'Not quite.';
  return `Not quite — the ${verdict.correctOptionIds.length > 1 ? 'answers are' : 'answer is'} ${letters}.`;
}
