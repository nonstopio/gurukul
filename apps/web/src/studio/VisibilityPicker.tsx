import { Select, Toggle } from '@gurukul/ui';
import { MAX_VISIBLE_TEAMS, teamId } from '@gurukul/schema';
import type { CourseAccess, Visibility } from '@gurukul/schema';
import { VISIBILITY_LABELS } from '../learn/catalogue';
import { useTerms } from '../labels/useTerms';

/**
 * Who may open the course: everyone, the people on picked teams, or every Educator and Admin.
 * `teams` are the names an Admin made in Teams (`config/org.teams`); each one's id is `teamId(name)`.
 */
export function VisibilityPicker({
  value,
  teams,
  onChange,
}: {
  value: CourseAccess;
  teams: string[];
  onChange: (next: CourseAccess) => void;
}) {
  const t = useTerms();
  const picked = new Set(value.visibleTeamIds);
  const toggle = (id: string, on: boolean) => {
    const ids = on ? [...picked, id] : [...picked].filter((x) => x !== id);
    onChange({ ...value, visibleTeamIds: ids });
  };
  return (
    <section aria-labelledby="visibility-title" className="sc-changes">
      <h3 id="visibility-title" className="sc-h3">
        Who can open this course
      </h3>
      <Select
        label="Visibility"
        value={value.visibility}
        onChange={(e) =>
          onChange({
            visibility: e.target.value as Visibility,
            visibleTeamIds: e.target.value === 'teams' ? value.visibleTeamIds : [],
          })
        }
      >
        {Object.entries(VISIBILITY_LABELS).map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </Select>
      {value.visibility === 'teams' ? (
        teams.length === 0 ? (
          <p className="sc-help">An Admin adds teams in Admin, under Teams. Then pick them here.</p>
        ) : (
          <fieldset className="sc-teams">
            <legend className="sc-help">
              {`Only people on these teams see it in the catalogue (up to ${MAX_VISIBLE_TEAMS})`}
            </legend>
            {teams.map((name) => (
              <Toggle
                key={name}
                label={name}
                checked={picked.has(teamId(name))}
                disabled={!picked.has(teamId(name)) && picked.size >= MAX_VISIBLE_TEAMS}
                onChange={(e) => toggle(teamId(name), e.target.checked)}
              />
            ))}
          </fieldset>
        )
      ) : (
        <p className="sc-help">
          {value.visibility === 'public'
            ? `Every signed-in ${t.learner} sees it in the catalogue.`
            : `Only ${t.educators} and Admins see it; ${t.learners} do not.`}
        </p>
      )}
    </section>
  );
}
