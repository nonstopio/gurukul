import { Button, Card, Input, PlusIcon, Textarea } from '@gurukul/ui';
import { LANDING_ISSUES, MIN_OUTCOMES, validateForPublish } from '@gurukul/schema';
import type { Course } from '@gurukul/schema';
import { useMemo } from 'react';
import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { addOutcome, patchCourse, removeOutcome, setCertificate, setOutcome } from './courseEdit';
import { useStudio } from './StudioProvider';
import type { Working } from './types';

type Update = (edit: (w: Working) => Working) => void;

const MAX_OUTCOMES = 12;

/** The page learners see before they start: a description and what they will be able to do. */
export function LandingTab({ course, update }: { course: Course; update: Update }) {
  const t = useTerms();
  const { checks } = useStudio();
  // Only the Landing page's own publish checks show here; answer keys do not affect them.
  const issues = useMemo(
    () => validateForPublish(course, {}, checks).filter((i) => LANDING_ISSUES.has(i.code)),
    [course, checks],
  );
  const issue = (code: string) => issues.find((i) => i.code === code)?.message;
  const outcomesIssue = issue('course.outcomes');
  return (
    <section className="sc-tab" aria-labelledby="landing-title">
      <h2 id="landing-title" className="sc-h2">
        Landing page
      </h2>
      <Card className="sc-panel">
        <Textarea
          label="Description"
          hint="Required to publish. Markdown works here. Say who the course is for and what it covers."
          error={issue('course.description')}
          rows={10}
          maxLength={10000}
          value={course.description}
          onChange={(e) => update((w) => patchCourse(w, { description: e.target.value }))}
        />
      </Card>
      <Card title={`What ${t.learners} will be able to do`} titleAs="h3" className="sc-panel">
        <p className="sc-help">
          {`At least ${MIN_OUTCOMES} outcomes to publish.`}
          {course.outcomes.length === 0 ? ' No outcomes yet.' : null}
        </p>
        <ul className="sc-outcomes">
          {course.outcomes.map((outcome, i) => (
            <li key={i} className="sc-outcome">
              <Input
                label={`Outcome ${i + 1}`}
                error={
                  issues.some((x) => x.code === 'course.outcome.blank' && x.outcome === i)
                    ? 'Fill it in or remove it.'
                    : undefined
                }
                value={outcome}
                maxLength={200}
                onChange={(e) => update((w) => setOutcome(w, i, e.target.value))}
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove outcome ${i + 1}`}
                onClick={() => update((w) => removeOutcome(w, i))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        {outcomesIssue ? <p className="studio-error">{outcomesIssue}</p> : null}
        <Button
          variant="secondary"
          icon={<PlusIcon />}
          disabled={course.outcomes.length >= MAX_OUTCOMES}
          onClick={() => update(addOutcome)}
        >
          Add outcome
        </Button>
      </Card>
    </section>
  );
}

/** What the certificate says. Who signs it is an org setting. */
export function CertificateTab({ course, update }: { course: Course; update: Update }) {
  const c = course.certificate;
  const t = useTerms();
  return (
    <section className="sc-tab" aria-labelledby="cert-title">
      <h2 id="cert-title" className="sc-h2">
        Certificate
      </h2>
      <Card className="sc-panel">
        {course.rules.certificate ? null : (
          <p className="sc-help">
            Certificates are switched off for this course (see Learning rules).
          </p>
        )}
        <Input
          label="Certificate title"
          value={c.title}
          maxLength={160}
          onChange={(e) => update((w) => setCertificate(w, { title: e.target.value }))}
        />
        <p className="sc-help">
          {`The signatory printed on certificates is set by ${article(t.Admin)} in Org settings.`}
        </p>
      </Card>
    </section>
  );
}
