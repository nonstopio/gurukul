import { validateForPublish } from '@gurukul/schema';
import {
  Button,
  buttonClass,
  Card,
  Chip,
  DragList,
  EmptyState,
  PlusIcon,
  UploadIcon,
  useToast,
} from '@gurukul/ui';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toastError } from '../errors';
import { useUser } from '../auth/AuthProvider';
import { useConsole } from '../console/ConsoleProvider';
import { useAsync } from '../data/useAsync';
import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { ConfirmDialog } from './ConfirmDialog';
import { useEditorLinks } from './editorPlace';
import type { EditorPlace } from './editorPlace';
import { DraftGate } from './DraftGate';
import { EditorBar, PreviewLink } from './EditorBar';
import { lessonsOf } from './lessonEdit';
import { ImportDialog } from './questions/ImportDialog';
import { QuizSettings } from './questions/QuizSettings';
import { QuestionEditor } from './questions/QuestionEditor';
import {
  addQuestion,
  bankEntry,
  findQuiz,
  firstTryPercent,
  importFromBank,
  isLowFirstTry,
  moveQuestion,
  newQuestion,
  removeQuestion,
  updateQuiz,
  updateQuestion,
} from './questionEdit';
import type { Keyed } from './questionEdit';
import { useStudio } from './StudioProvider';
import { nameOf } from './studioModel';
import type { BankQuestion, Working } from './types';
import { useDraft } from './useDraft';
import type { DraftApi } from './useDraft';

/** `/studio/courses/:courseId/quiz/:quizId`: question list, question editor and Quiz settings. */
export function QuizBuilderPage() {
  const { courseId = '', quizId = '' } = useParams();
  const draft = useDraft(courseId);
  const t = useTerms();
  return (
    <DraftGate draft={draft} title={`${t.Quiz} builder`}>
      {(work) => (
        <QuizBuilder
          draft={draft}
          work={work}
          place={{ kind: 'draft', courseId }}
          quizId={quizId}
        />
      )}
    </DraftGate>
  );
}

/**
 * The Quiz builder over a working copy: Studio's draft, or a desktop session's (`place`), whose
 * `draft` is then `useSessionDraft`. A session reads no learner stats and offers no Save to question
 * bank: it writes Firestore only at Save to draft.
 */
export function QuizBuilder({
  draft,
  work,
  place,
  quizId,
}: {
  draft: DraftApi;
  work: Working;
  place: EditorPlace;
  quizId: string;
}) {
  const { data, checks } = useStudio();
  const { uid } = useUser();
  const toast = useToast();
  const t = useTerms();
  const consoleApi = useConsole();
  const quiz = findQuiz(work.course, quizId);
  const links = useEditorLinks(place, work, {
    id: quizId,
    key: `quiz:${quizId}`,
    title: quiz?.title || t.Quiz,
  });
  const statsOf = links.firestore ? links.uploadCourseId : null;
  const stats = useAsync(
    useCallback(
      async () => (statsOf === null ? null : consoleApi.data.courseStats(statsOf)),
      [consoleApi, statsOf],
    ),
  );
  const asked = useSearchParams()[0].get('question');
  const [selectedId, setSelectedId] = useState<string | null>(asked);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  // Questions on their way to the bank: the ref turns away a second click at once, the state shows it.
  const banking = useRef(new Set<string>());
  const [bankingIds, setBankingIds] = useState<ReadonlySet<string>>(new Set());
  const issues = useMemo(
    () => validateForPublish(work.course, work.answers, checks),
    [work, checks],
  );

  const { back, crumbs } = links;
  const source = place.kind;
  if (!quiz) {
    return (
      <EditorBar
        title={`${t.Quiz} not found`}
        back={back}
        crumbs={crumbs}
        draft={draft}
        source={source}
      >
        <EmptyState
          headingAs="h2"
          title={`This ${t.Quiz} does not exist`}
          mascot="notFound"
          action={
            <Link className={buttonClass('secondary')} to={back.to}>
              {links.backWords}
            </Link>
          }
        >
          It may have been deleted or moved.
        </EmptyState>
      </EditorBar>
    );
  }

  const firstTry = stats.state === 'ready' ? stats.value : null;
  const current = quiz.questions.find((q) => q.id === selectedId) ?? quiz.questions[0];
  const keyed: Keyed | null = current
    ? { question: current, key: work.answers[quizId]?.[current.id] ?? [] }
    : null;
  const count = quiz.questions.length;

  const add = (made: Keyed) => {
    draft.update((w) => addQuestion(w, quizId, made));
    setSelectedId(made.question.id);
  };
  const importOne = (bank: BankQuestion) => {
    add(importFromBank(bank));
    setImporting(false);
    toast.show('Added from the question bank', { tone: 'success' });
  };
  const saveToBank = async (entry: Keyed, tags: string[]) => {
    const ids = { courseId: links.uploadCourseId, quizId, questionId: entry.question.id };
    // A second click before the button shows it is busy must not store the question twice.
    if (banking.current.has(entry.question.id)) return;
    banking.current.add(entry.question.id);
    setBankingIds(new Set(banking.current));
    try {
      await data.addToBank(bankEntry(entry, tags), uid);
      log.info('Question saved to the bank', ids);
      toast.show('Saved to the question bank', { tone: 'success' });
    } catch (e) {
      log.error('Saving a question to the bank failed', e, ids);
      toastError(
        toast,
        e,
        "Couldn't save the question to the bank. Try again.",
        () => void saveToBank(entry, tags),
      );
    } finally {
      banking.current.delete(entry.question.id);
      setBankingIds(new Set(banking.current));
    }
  };

  const insightFor = (questionId: string): string | null => {
    const tries = firstTry?.questionFirstTry[questionId];
    return tries && isLowFirstTry(firstTry, questionId)
      ? `${Math.round((tries.correct / tries.total) * 100)}% of ${t.learners} got this right first time (${tries.total} tries). Check the wording and the explanation.`
      : null;
  };

  return (
    <>
      <EditorBar
        title={nameOf(quiz.title, `Untitled ${t.Quiz}`)}
        back={back}
        crumbs={crumbs}
        draft={draft}
        source={source}
        actions={
          links.previewPath === null ? undefined : (
            <PreviewLink draft={draft} to={links.previewPath}>
              {`Try it as ${article(t.learner)}`}
            </PreviewLink>
          )
        }
      >
        <div className="studio-cols">
          <Card
            className="studio-qlist"
            title={`${count} ${count === 1 ? 'question' : 'questions'}`}
            actions={
              <Button
                variant="ghost"
                size="sm"
                icon={<PlusIcon />}
                onClick={() => add(newQuestion())}
              >
                Add
              </Button>
            }
          >
            <DragList
              label="Questions"
              items={quiz.questions}
              itemKey={(q) => q.id}
              itemLabel={(q) => `question: ${nameOf(q.prompt, 'New question').slice(0, 40)}`}
              onMove={(from, to) => draft.update((w) => moveQuestion(w, quizId, from, to))}
              renderItem={(q, { index, handle }) => (
                <div className="studio-qrow" data-current={q.id === current?.id || undefined}>
                  {handle}
                  <button
                    type="button"
                    className="studio-qrow__main"
                    aria-current={q.id === current?.id ? 'true' : undefined}
                    onClick={() => setSelectedId(q.id)}
                  >
                    <span className="studio-qrow__num">{index + 1}</span>{' '}
                    <span className="studio-qrow__text">{nameOf(q.prompt, 'New question')}</span>
                  </button>
                  {firstTryPercent(firstTry, q.id) !== null ? (
                    <span
                      className="studio-qrow__pct"
                      title={`${t.Learners} who got this right first time`}
                    >
                      {firstTryPercent(firstTry, q.id)}% first try
                    </span>
                  ) : null}
                  {isLowFirstTry(firstTry, q.id) ? (
                    <Chip tone="danger">Low first-try score</Chip>
                  ) : null}
                </div>
              )}
            />
            <Button variant="secondary" icon={<UploadIcon />} onClick={() => setImporting(true)}>
              Import from question bank
            </Button>
          </Card>

          <Card as="section" className="studio-qeditor" aria-label="Question editor">
            {keyed ? (
              <QuestionEditor
                key={keyed.question.id}
                keyed={keyed}
                lessons={lessonsOf(work.course)}
                issues={issues.filter(
                  (i) => i.itemId === quizId && i.questionId === keyed.question.id,
                )}
                insight={insightFor(keyed.question.id)}
                onEdit={(edit) =>
                  draft.update((w) => updateQuestion(w, quizId, keyed.question.id, edit))
                }
                onDelete={() => setDeleting(keyed.question.id)}
                onSaveToBank={links.firestore ? (tags) => void saveToBank(keyed, tags) : undefined}
                savingToBank={bankingIds.has(keyed.question.id)}
              />
            ) : (
              <EmptyState
                headingAs="h2"
                title="No questions yet"
                action={
                  <Button icon={<PlusIcon />} onClick={() => add(newQuestion())}>
                    Add the first question
                  </Button>
                }
              >
                {`A ${t.Quiz} needs at least one question before it can be published.`}
              </EmptyState>
            )}
          </Card>

          <Card as="section" className="studio-qsettings" aria-label={`${t.Quiz} settings`}>
            <QuizSettings
              quiz={quiz}
              coursePassPercent={Math.round(work.course.rules.passMark * 100)}
              onChange={(edit) => draft.update((w) => updateQuiz(w, quizId, edit))}
            />
          </Card>
        </div>
      </EditorBar>
      {importing ? <ImportDialog onClose={() => setImporting(false)} onImport={importOne} /> : null}
      {deleting !== null ? (
        <ConfirmDialog
          title="Delete this question?"
          confirmLabel="Delete question"
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            draft.update((w) => removeQuestion(w, quizId, deleting));
            setDeleting(null);
          }}
        >
          {source === 'session'
            ? 'The question and its answer key are removed from this session’s copy of the course. Undo in the chat brings them back.'
            : 'The question and its answer key are removed from the draft.'}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
