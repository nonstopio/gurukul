import { Button, Card, ColourSwatch, Input, Select, Textarea, Toggle } from '@gurukul/ui';
import type { Course } from '@gurukul/schema';
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
  acharyas,
  update,
}: {
  course: Course;
  /** The live course: who may edit is its `acharyaIds`, never the draft's copy. */
  acharyas: Pick<Course, 'acharyaIds' | 'acharyaNames'>;
  update: (edit: (w: Working) => Working) => void;
}) {
  return (
    <aside className="sc-details" aria-label="Course details">
      <Card as="section" aria-labelledby="details-title" className="sc-panel">
        <h2 id="details-title" className="sc-h3">
          Course details
        </h2>
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
          hint="Each Pariksha needs at least this score."
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

      <Card as="section" aria-labelledby="rules-title" className="sc-panel">
        <h2 id="rules-title" className="sc-h3">
          Learning rules
        </h2>
        <Toggle
          label="Learners go in order"
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

      <Card as="section" aria-labelledby="acharyas-title" className="sc-panel">
        <h2 id="acharyas-title" className="sc-h3">
          Acharyas with edit access
        </h2>
        <p className="sc-help">
          {acharyas.acharyaIds.length} {acharyas.acharyaIds.length === 1 ? 'person' : 'people'}. A
          Kulapati changes this list in the console.
        </p>
        <ul className="sc-ids">
          {acharyas.acharyaIds.map((id) => (
            <li key={id}>
              {acharyas.acharyaNames[id] ?? (
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
