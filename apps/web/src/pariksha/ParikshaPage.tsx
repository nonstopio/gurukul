import { itemStates, itemsOf } from '@gurukul/schema';
import type { Course, Pariksha, Question } from '@gurukul/schema';
import {
  Button,
  Callout,
  Dialog,
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
import { useParikshaService } from './ParikshaProvider';
import { CooldownError } from './service';
import type { CheckAnswerResult } from './service';
import { log } from '../log';

const LETTERS = ['A', 'B', 'C', 'D'] as const;
type Letter = (typeof LETTERS)[number];
const EMPTY = { completedItemIds: [], pariksha: {}, lastItemId: null };

/**
 * One question per screen. Each answer is kept in this browser as the learner checks it or moves on
 * (`draftStore`), so a reload carries on; the server grades and records the attempt at Finish.
 */
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
  const lastAttemptAt = progress?.pariksha[pariksha.id]?.lastAttemptAt ?? null;
  const wait = cooldownRemaining(lastAttemptAt, pariksha.cooldownMinutes, now);
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
  return <Questions course={course} pariksha={pariksha} lastAttemptAt={lastAttemptAt} />;
}

/** The questions themselves; mounted only once the Pariksha is open, so the draw happens once. */
function Questions({
  course,
  pariksha,
  lastAttemptAt,
}: {
  course: Course;
  pariksha: Pariksha;
  lastAttemptAt: Date | null;
}) {
  const service = useParikshaService();
  const navigate = useNavigate();
  const toast = useToast();
  const uid = useUser().uid;
  const [key] = useState(() => draftKey(uid, course.id, pariksha.id));
  // A draft from before the last graded attempt belongs to that attempt, not this one.
  const [start] = useState(() => {
    const saved = readDraft(key);
    const fresh = saved && saved.startedAt > (lastAttemptAt?.getTime() ?? 0) ? saved : null;
    const restored = fresh ? restoreQuestions(pariksha, fresh.order) : null;
    if (fresh && restored) return { draft: fresh, questions: restored };
    const questions = pickQuestions(pariksha);
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
  const reveals = pariksha.revealAnswers === 'each';
  const base = { courseId: course.id, parikshaId: pariksha.id };
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
      void navigate(`/courses/${course.id}/pariksha/${pariksha.id}/result`, {
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
  const primary = needsCheck ? 'Check answer' : last ? 'Finish Pariksha' : 'Next question';
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
      Exit Pariksha
    </Link>
  );

  return (
    <>
      <TopBar
        title={pariksha.title}
        back={back}
        status={<span>Answers are saved on this device as you go</span>}
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
                i < index || selected[q.id]?.length
                  ? 'segments__done'
                  : i === index
                    ? 'segments__now'
                    : ''
              }
            />
          ))}
        </ol>
        <fieldset className="exam__question" disabled={busy} aria-busy={busy}>
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
            <strong>{verdictText(question, checked)}</strong> {checked.explanation}
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
              <Button variant="secondary" disabled={busy} onClick={() => move(index - 1)}>
                Previous
              </Button>
            ) : null}
            <Button disabled={!ready} onClick={onPrimary} aria-busy={busy}>
              {primary}
            </Button>
          </div>
        </footer>
      </main>
      <Dialog
        open={leaving}
        title="Leave this Pariksha?"
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
