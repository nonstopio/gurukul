import { useMemo, useState } from 'react';
import {
  Button,
  Callout,
  Card,
  Chip,
  EmptyState,
  FilterBar,
  Input,
  Page,
  PageHeader,
  Select,
} from '@gurukul/ui';
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
    <Card as="article" title={c.title} titleAs="h3">
      <div className="cl-entry">
        <div className="cl-entry__meta">
          <Chip tone={kind.tone}>{kind.label}</Chip>
          <Chip tone="neutral">{AREAS[c.area]}</Chip>
          <code>{c.id}</code>
          <time className="cl-entry__date" dateTime={c.date}>
            {formatDay(c.date)}
          </time>
        </div>
        <p>{c.why}</p>
        {typeof c.detail === 'string' ? <p>{c.detail}</p> : null}
        {Array.isArray(c.detail) && c.detail.length > 0 ? (
          <ul>
            {c.detail.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : null}
        {c.notes && c.notes.length > 0 ? (
          <details>
            <summary>Background</summary>
            {c.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </details>
        ) : null}
        {c.deploy ? (
          <Callout tone="warning" title="Deploy note">
            {c.deploy}
          </Callout>
        ) : null}
      </div>
    </Card>
  );
}

/** `/changelog` — every meaningful change, newest first, with the reason it was made. */
export function ChangelogPage({ changes = CHANGES, releases = RELEASES }: ChangelogPageProps) {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('');
  const [kind, setKind] = useState('');
  const clear = () => {
    setQuery('');
    setArea('');
    setKind('');
  };

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
    <Page width="reading">
      <PageHeader
        eyebrow="Gurukul · Platform"
        title="Changelog"
        lead="Every meaningful change, newest first, with the reason it was made."
      />

      <FilterBar
        label="Filter changes"
        count={`${filtered.length} of ${changes.length}`}
        canClear={query !== '' || area !== '' || kind !== ''}
        onClear={clear}
      >
        <Input
          label="Search changes"
          hideLabel
          type="search"
          value={query}
          placeholder="Search titles and reasons"
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select label="Area" hideLabel value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Any area</option>
          {areaOptions.map((a) => (
            <option key={a} value={a}>
              {AREAS[a]}
            </option>
          ))}
        </Select>
        <Select label="Kind" hideLabel value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Any kind</option>
          {kindOptions.map((k) => (
            <option key={k} value={k}>
              {KINDS[k].label}
            </option>
          ))}
        </Select>
      </FilterBar>

      {groups.length === 0 ? (
        <EmptyState
          title="No change matches"
          action={
            <Button variant="secondary" onClick={clear}>
              Show every change
            </Button>
          }
        >
          Nothing matches the search and filters together.
        </EmptyState>
      ) : null}

      {groups.map((g) => (
        <section key={g.key} className="cl-group" aria-labelledby={`release-${g.key}`}>
          <h2 id={`release-${g.key}`}>
            {g.label}
            {g.unreleased ? ' — merged, not yet in a release' : null}
            {` · ${g.items.length} change${g.items.length === 1 ? '' : 's'}`}
          </h2>
          {g.items.map((c) => (
            <Entry key={`${c.date}-${c.id}-${c.title}`} c={c} />
          ))}
        </section>
      ))}
    </Page>
  );
}
