import { ChoiceCard, Select, UsersIcon } from '@gurukul/ui';
import { MAX_VISIBLE_TEAMS, teamId } from '@gurukul/schema';
import type { CourseAccess, Visibility } from '@gurukul/schema';
import { VISIBILITY_LABELS } from '../learn/catalogue';
import { useTerms } from '../labels/useTerms';

/** The id of the Visibility select, so the publish dialog can send people to it. */
export const VISIBILITY_FIELD_ID = 'course-visibility';

/**
 * Who may open the course: everyone, the people on picked teams, or every Educator and Admin.
 * `teams` are the names an Admin made in Teams (`config/org.teams`); each one's id is `teamId(name)`.
 * The caller gives it its heading.
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
  const hint =
    value.visibility === 'public'
      ? `Every signed-in ${t.learner} sees it in the catalogue.`
      : value.visibility === 'staff'
        ? `Only ${t.educators} and Admins see it; ${t.learners} do not.`
        : teams.length === 0
          ? 'Teams are made in Studio, under Teams. Then pick them here.'
          : 'Only people on the teams picked below see it in the catalogue.';
  return (
    <div className="sc-panel">
      <Select
        id={VISIBILITY_FIELD_ID}
        label="Visibility"
        hint={hint}
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
      {value.visibility === 'teams' && teams.length > 0 ? (
        <fieldset className="sc-teams">
          <legend className="sc-help">{`Teams (up to ${MAX_VISIBLE_TEAMS})`}</legend>
          <ul className="console-choice-grid">
            {teams.map((name) => (
              <ChoiceCard
                key={name}
                icon={<UsersIcon />}
                title={name}
                selected={picked.has(teamId(name))}
                disabled={!picked.has(teamId(name)) && picked.size >= MAX_VISIBLE_TEAMS}
                onSelectedChange={(on) => toggle(teamId(name), on)}
              />
            ))}
          </ul>
        </fieldset>
      ) : null}
    </div>
  );
}
