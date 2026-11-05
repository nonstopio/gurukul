import { Card, ColourSwatch, CourseTile, Input, Select, Textarea, ToggleCard } from '@gurukul/ui';
import type { Course } from '@gurukul/schema';
import { useUser } from '../auth/AuthProvider';
import { courseImageUrl } from '../learn/model';
import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { BlockScope } from './blocks/BlockScope';
import { ImageUploadPanel } from './blocks/ImageUploadPanel';
import { useImageUpload } from './blocks/useImageUpload';
import type { ImageHolder } from './blocks/useImageUpload';
import { AccessCard } from './AccessCard';
import { patchCourse, setCoverImage, setCoverTheme, setPassMark, setRule } from './courseEdit';
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
  published,
  update,
}: {
  course: Course;
  /** The live course: who may edit is its `educatorIds`, never the draft's copy. */
  educators: Pick<Course, 'educatorIds' | 'educatorNames'>;
  /** Whether a version is live: who can open it then changes the live course at once. */
  published: boolean;
  update: (edit: (w: Working) => Working) => void;
}) {
  const t = useTerms();
  const { uid } = useUser();
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
        <BlockScope courseId={course.id} uid={uid}>
          <CoverImageField course={course} update={update} />
        </BlockScope>
      </Card>

      <Card title="Learning rules" className="sc-panel">
        {/* Each card says what happens now, so its words follow the switch. */}
        <ToggleCard
          title={
            course.rules.sequential ? `${t.Learners} go in order` : `${t.Learners} go in any order`
          }
          description={
            course.rules.sequential
              ? `Each ${t.chapter} opens once the one before is passed: its ${t.Quizzes}, or every lesson if it has none.`
              : `Every ${t.chapter} is open from the start. A ${t.Quiz} set to block the next ${t.chapter} still locks what follows it.`
          }
          checked={course.rules.sequential}
          onChange={(e) => update((w) => setRule(w, 'sequential', e.target.checked))}
        />
        <ToggleCard
          title={course.rules.certificate ? 'Issue a certificate' : 'No certificate'}
          description={
            course.rules.certificate
              ? `${t.Learners} who finish every lesson and pass every ${t.Quiz} get a certificate anyone can verify.`
              : `${t.Learners} who finish get no certificate.`
          }
          checked={course.rules.certificate}
          onChange={(e) => update((w) => setRule(w, 'certificate', e.target.checked))}
        />
        <ToggleCard
          title={course.rules.requireVideoWatch ? 'Require watching videos' : 'Videos are optional'}
          description={
            course.rules.requireVideoWatch
              ? 'A lesson with a video can be marked complete only after 90% of each video is played, not skipped.'
              : 'A lesson can be marked complete without playing its videos, unless the lesson itself is set to complete after 90% of the video.'
          }
          checked={course.rules.requireVideoWatch}
          onChange={(e) => update((w) => setRule(w, 'requireVideoWatch', e.target.checked))}
        />
      </Card>

      <AccessCard courseId={course.id} published={published} />

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

/**
 * The course's one cover image, uploaded under the same rules as a lesson image (`useImageUpload`),
 * with a tile showing how the course will look in lists. Replace and Remove change only the draft.
 */
function CoverImageField({
  course,
  update,
}: {
  course: Course;
  update: (edit: (w: Working) => Working) => void;
}) {
  const holder: ImageHolder = course.cover.image ?? {};
  const source = useImageUpload(
    holder,
    (image) => update((w) => setCoverImage(w, image)),
    'The cover image is on the course. Learners see it once you publish.',
  );
  return (
    <div className="studio-fields">
      <p className="sc-help">
        Cover image: shown on the course tile. Without one, the tile shows the first image in the
        lessons, else the title on the theme colour.
      </p>
      <ImageUploadPanel
        block={holder}
        source={source}
        onRemove={() => update((w) => setCoverImage(w, undefined))}
      />
      <CourseTile
        title={course.title}
        image={source.previewUrl ?? courseImageUrl(course)}
        theme={course.cover.theme}
        summary={course.summary}
        aria-label="Course tile preview"
      />
    </div>
  );
}
