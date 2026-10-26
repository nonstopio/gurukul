import { useId, useMemo, useState } from 'react';
import { AREAS, CHANGES, KINDS, RELEASES, filterChanges, groupChanges } from './index';
import type { Change } from './types';
import './changelog.css';

export interface ChangelogPageProps {
  /** Defaults to the real entries; tests pass their own. */
  changes?: readonly Change[];
  releases?: readonly string[];
}

/** "27 Oct 2026". The date is a calendar day, so it is formatted in UTC to survive every timezone. */
export function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function Entry({ c }: { c: Change }) {
  const kind = KINDS[c.kind];
  return (
    <article className="cl-entry">
      <div className="cl-entry__meta">
        <span className={`cl-chip cl-chip--${kind.tone}`}>{kind.label}</span>
        <span className="cl-chip cl-chip--neutral">{AREAS[c.area]}</span>
        <span className="cl-entry__id">{c.id}</span>
        <time className="cl-entry__date" dateTime={c.date}>
          {formatDay(c.date)}
        </time>
      </div>
      <h3 className="cl-entry__title">{c.title}</h3>
      <p className="cl-entry__why">{c.why}</p>
      {typeof c.detail === 'string' ? <p className="cl-entry__detail">{c.detail}</p> : null}
      {Array.isArray(c.detail) && c.detail.length > 0 ? (
        <ul className="cl-entry__detail">
          {c.detail.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
      {c.notes && c.notes.length > 0 ? (
        <details className="cl-entry__notes">
          <summary>Background</summary>
          {c.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </details>
      ) : null}
      {c.deploy ? (
        <div className="cl-entry__deploy">
          <strong>Deploy note</strong> {c.deploy}
        </div>
      ) : null}
    </article>
  );
}

/** `/changelog` — every meaningful change, newest first, with the reason it was made. */
export function ChangelogPage({ changes = CHANGES, releases = RELEASES }: ChangelogPageProps) {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('');
  const [kind, setKind] = useState('');
  const ids = { search: useId(), area: useId(), kind: useId() };

  // Options come from the entries, not the vocabularies: an option that always returns
  // nothing reads like a bug in the data.
  const areaOptions = useMemo(() => [...new Set(changes.map((c) => c.area))].sort(), [changes]);
  const kindOptions = useMemo(() => [...new Set(changes.map((c) => c.kind))].sort(), [changes]);
  const filtered = useMemo(
    () => filterChanges(changes, { query, area, kind }),
    [changes, query, area, kind],
  );
  const groups = useMemo(() => groupChanges(filtered, releases), [filtered, releases]);

  return (
    <main className="cl">
      <header className="cl__header">
        <p className="cl__kicker">Gurukul · Platform</p>
        <h1 className="cl__title">Changelog</h1>
        <p className="cl__sub">
          Every meaningful change, newest first, with the reason it was made.
        </p>
      </header>

      <div className="cl__filters">
        <label htmlFor={ids.search} className="cl__label">
          Search changes
        </label>
        <input
          id={ids.search}
          className="cl__input"
          type="search"
          value={query}
          placeholder="Search titles and reasons"
          onChange={(e) => setQuery(e.target.value)}
        />
        <label htmlFor={ids.area} className="cl__label">
          Area
        </label>
        <select
          id={ids.area}
          className="cl__input"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        >
          <option value="">All areas</option>
          {areaOptions.map((a) => (
            <option key={a} value={a}>
              {AREAS[a]}
            </option>
          ))}
        </select>
        <label htmlFor={ids.kind} className="cl__label">
          Kind
        </label>
        <select
          id={ids.kind}
          className="cl__input"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">All kinds</option>
          {kindOptions.map((k) => (
            <option key={k} value={k}>
              {KINDS[k].label}
            </option>
          ))}
        </select>
        <span className="cl__count" role="status">
          {filtered.length} of {changes.length}
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="cl__empty">
          No change matches. Clear the search or the filters to see all of them.
        </p>
      ) : null}

      {groups.map((g) => (
        <section key={g.key} className="cl-group" aria-labelledby={`release-${g.key}`}>
          <h2 id={`release-${g.key}`} className="cl-group__title">
            {g.label}
            {g.unreleased ? (
              <span className="cl-group__hint"> — merged, not yet in a release</span>
            ) : null}
            <span className="cl-group__hint">
              {' '}
              · {g.items.length} change{g.items.length === 1 ? '' : 's'}
            </span>
          </h2>
          <div className="cl-group__items">
            {g.items.map((c) => (
              <Entry key={`${c.date}-${c.id}-${c.title}`} c={c} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
