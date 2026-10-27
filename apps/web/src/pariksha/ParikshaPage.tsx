import { itemStates, itemsOf } from '@gurukul/schema';
import type { Course, Pariksha, Question } from '@gurukul/schema';
import {
  Button,
  Callout,
  QuizOption,
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
import { Loaded } from '../learn/ui';
import { Prose } from '../player/blocks';
import { cooldownRemaining, formatWait, pickQuestions } from './model';
import { useParikshaService } from './ParikshaProvider';
import { CooldownError } from './service';
import type { CheckAnswerResult } from './service';

const LETTERS = ['A', 'B', 'C', 'D'] as const;
type Letter = (typeof LETTERS)[number];
const EMPTY = { completedItemIds: [], pariksha: {}, lastItemId: null };

/** One question per screen. Progress is saved by the server after the final answer. */
export function ParikshaPage() {
  const { courseId = '', parikshaId = '' } = useParams();
  const data = useLearnerData();
  const uid = useUser().uid;
  const [progress, setProgress] = useState<ProgressRow | null | undefined>(undefined);
  const result = useAsync(useCallback(() => data.getCourse(courseId), [data, courseId]));
  useEffect(() => data.watchProgress(uid, courseId, setProgress), [data, uid, courseId]);

  return (
    <Loaded loadable={result}>
      {(course) => {
        const pariksha = course ? itemsOf(course).find((i) => i.id === parikshaId) : undefined;
        if (!course || pariksha?.type !== 'pariksha') return <Navigate to="/courses" replace />;
        return progress === undefined ? null : (
          <Exam course={course} pariksha={pariksha} progress={progress} />
        );
      }}
    </Loaded>
  );
}

function Exam({
  course,
  pariksha,
  progress,
}: {
  course: Course;
  pariksha: Pariksha;
  progress: ProgressRow | null;
}) {
  const [now] = useState(() => new Date());
  const states = itemStates(course, progress ?? EMPTY);
  const back = (
    <Link className={topBarBackClass} to={`/courses/${course.id}`}>
      Exit Pariksha
    </Link>
  );
  const wait = cooldownRemaining(
    progress?.pariksha[pariksha.id]?.lastAttemptAt ?? null,
    pariksha.cooldownMinutes,
    now,
  );
  if (states[pariksha.id] === 'locked' || wait > 0) {
    return (
      <>
        <TopBar title={pariksha.title} back={back} />
        <main className="page">
          <Callout tone="note" title={wait > 0 ? 'Retake not open yet' : 'Locked for now'}>
            <p>
              {wait > 0
                ? `You can retake this in ${formatWait(wait)}.`
                : 'Finish the earlier lessons first.'}
            </p>
          </Callout>
          <Link className={buttonClass('secondary')} to={`/courses/${course.id}`}>
            Back to the outline
          </Link>
        </main>
      </>
    );
  }
  return <Questions course={course} pariksha={pariksha} back={back} />;
}

/** The questions themselves; mounted only once the Pariksha is open, so the draw happens once. */
function Questions({
  course,
  pariksha,
  back,
}: {
  course: Course;
  pariksha: Pariksha;
  back: React.ReactNode;
}) {
  const service = useParikshaService();
  const navigate = useNavigate();
  const toast = useToast();
  const [questions] = useState(() => pickQuestions(pariksha));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [feedback, setFeedback] = useState<Record<string, CheckAnswerResult>>({});
  const [busy, setBusy] = useState(false);

  const question = questions[index] as Question;
  const picked = selected[question.id] ?? [];
  const checked = feedback[question.id];
  const last = index === questions.length - 1;
  const multiple = question.kind === 'multiple';
  const reveals = pariksha.revealAnswers === 'each';
  const base = { courseId: course.id, parikshaId: pariksha.id };

  const pick = (optionId: string, on: boolean) =>
    setSelected({
      ...selected,
      [question.id]: multiple
        ? on
          ? [...picked, optionId]
          : picked.filter((id) => id !== optionId)
        : [optionId],
    });

  const check = async () => {
    setBusy(true);
    try {
      const verdict = await service.checkAnswer({
        ...base,
        questionId: question.id,
        selected: picked,
      });
      setFeedback({ ...feedback, [question.id]: verdict });
    } catch {
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
      void navigate(`/courses/${course.id}/pariksha/${pariksha.id}/result`, {
        state: { result: attempt, questions, answers: selected },
      });
    } catch (e) {
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (checked || busy || e.metaKey || e.ctrlKey || e.altKey) return;
      const at =
        '1234'.indexOf(e.key) >= 0 ? '1234'.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
      const option = question.options[at];
      if (at >= 0 && option) pick(option.id, multiple ? !picked.includes(option.id) : true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const needsCheck = reveals && !checked;
  const primary = needsCheck ? 'Check answer' : last ? 'Finish Pariksha' : 'Next question';
  const onPrimary = () => {
    if (needsCheck) void check();
    else if (last) void finish();
    else setIndex(index + 1);
  };

  return (
    <>
      <TopBar
        title={pariksha.title}
        back={back}
        status={<span>Progress is saved after every answer</span>}
      />
      <main className="page exam">
        <p className="article__kicker">
          Question {index + 1} of {questions.length}
        </p>
        <ol className="segments" aria-label="Question progress">
          {questions.map((q, i) => (
            <li
              key={q.id}
              className={
                i < index || selected[q.id] ? 'segments__done' : i === index ? 'segments__now' : ''
              }
            />
          ))}
        </ol>
        <fieldset className="exam__question">
          <legend className="exam__prompt">
            <Prose md={question.prompt} />
          </legend>
          {question.code ? (
            <pre className="exam__code">
              <code>{question.code}</code>
            </pre>
          ) : null}
          {question.options.map((o, i) => (
            <QuizOption
              key={o.id}
              name={question.id}
              value={o.id}
              letter={LETTERS[i % LETTERS.length] as Letter}
              multiple={multiple}
              checked={picked.includes(o.id)}
              state={optionState(o.id)}
              onChange={(on) => pick(o.id, on)}
            >
              {o.text}
            </QuizOption>
          ))}
        </fieldset>
        {checked ? (
          <p role="status" className="exam__feedback">
            <strong>{checked.correct ? 'Correct.' : 'Not quite.'}</strong> {checked.explanation}
          </p>
        ) : null}
        <footer className="exam__footer">
          <p>
            Pass mark {Math.round((pariksha.passMark ?? course.rules.passMark) * 100)}% ·{' '}
            {pariksha.cooldownMinutes > 0
              ? `Retakes allowed after ${pariksha.cooldownMinutes} minutes`
              : 'Retakes allowed straight away'}
          </p>
          <div className="exam__actions">
            {index > 0 ? (
              <Button variant="secondary" disabled={busy} onClick={() => setIndex(index - 1)}>
                Previous
              </Button>
            ) : null}
            <Button disabled={busy || picked.length === 0} onClick={onPrimary} aria-busy={busy}>
              {primary}
            </Button>
          </div>
        </footer>
      </main>
    </>
  );
}
