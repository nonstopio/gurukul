import { Button, Card, ColourSwatch, Input, Select, Textarea, Toggle } from '@gurukul/ui';
import type { Course } from '@gurukul/schema';
import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { patchCourse, setCoverTheme, setPassMark, setRule } from './courseEdit';
import type { Working } from './types';

const LEVELS: Array<[Course['level'], string]> = [
  ['foundation', 'Foundation'],
  ['intermediate', 'Intermediate'],
  ['advanced', 'Advanced'],
];

/** The right-hand panel of the Structure tab: course details, learning rules and who may edit. */
export function DetailsPanel({
  course,
  educators,
  update,
}: {
  course: Course;
  /** The live course: who may edit is its `educatorIds`, never the draft's copy. */
  educators: Pick<Course, 'educatorIds' | 'educatorNames'>;
  update: (edit: (w: Working) => Working) => void;
}) {
  const t = useTerms();
  return (
    <aside className="sc-details" aria-label="Course details">
      <Card title="Course details" className="sc-panel">
        <Input
          label="Title"
          value={course.title}
          maxLength={160}
          onChange={(e) => update((w) => patchCourse(w, { title: e.target.value }))}
        />
        <Input
          label="Address"
          hint="The address is the course id, so it never changes."
          className="sc-mono"
          value={course.id}
          readOnly
        />
        <Textarea
          label="Summary"
          hint="One sentence, shown on the course card."
          rows={3}
          maxLength={240}
          value={course.summary}
          onChange={(e) => update((w) => patchCourse(w, { summary: e.target.value }))}
        />
        <Select
          label="Level"
          value={course.level}
          onChange={(e) =>
            update((w) => patchCourse(w, { level: e.target.value as Course['level'] }))
          }
        >
          {LEVELS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Input
          label="Pass mark (%)"
          hint={`Each ${t.Quiz} needs at least this score.`}
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={5}
          value={Math.round(course.rules.passMark * 100)}
          onChange={(e) => update((w) => setPassMark(w, e.target.valueAsNumber))}
        />
        <ColourSwatch
          label="Cover theme"
          value={course.cover.theme}
          onChange={(theme) => update((w) => setCoverTheme(w, theme))}
        />
        <Button variant="secondary" disabled title="Uploads are not enabled">
          Upload cover image
        </Button>
      </Card>

      <Card title="Learning rules" className="sc-panel">
        <Toggle
          label={`${t.Learners} go in order`}
          checked={course.rules.sequential}
          onChange={(e) => update((w) => setRule(w, 'sequential', e.target.checked))}
        />
        <Toggle
          label="Issue a certificate"
          checked={course.rules.certificate}
          onChange={(e) => update((w) => setRule(w, 'certificate', e.target.checked))}
        />
        <Toggle
          label="Require watching videos"
          checked={course.rules.requireVideoWatch}
          onChange={(e) => update((w) => setRule(w, 'requireVideoWatch', e.target.checked))}
        />
      </Card>

      <Card title={`${t.Educators} with edit access`} className="sc-panel">
        <p className="sc-help">
          {educators.educatorIds.length} {educators.educatorIds.length === 1 ? 'person' : 'people'}.{' '}
          {`${article(t.Admin).replace(/^a/, 'A')} changes this list in the console.`}
        </p>
        <ul className="sc-ids">
          {educators.educatorIds.map((id) => (
            <li key={id}>
              {educators.educatorNames[id] ?? (
                <>
                  <code>{id}</code> <span className="sc-help">(name not recorded yet)</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </aside>
  );
}
