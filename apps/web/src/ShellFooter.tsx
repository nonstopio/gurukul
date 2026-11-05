import { Avatar, GitHubIcon, SparkIcon, StarIcon } from '@gurukul/ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { loadContributors } from './contributors';
import type { Contributor } from './contributors';
import { REPO_URL } from './report';

/** The open-source lines that take turns in the middle of the bar, each with where it leads. */
export const CALLOUTS = [
  { text: 'Gurukul is open source: issues and pull requests welcome', href: `${REPO_URL}/issues` },
  { text: 'Found a bug or missing a feature? Tell us', href: `${REPO_URL}/issues/new/choose` },
  { text: 'Built in the open: come build it with us', href: REPO_URL },
];
export const CALLOUT_MS = 9000;
/** Avatars shown at most; narrow screens show fewer (styles.css). */
const SHOWN = 8;

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The foot of the sidebar layout: What's new, the GitHub repository, an open-source line that
 * changes every 9 s (held while pointed at or focused, and still under reduced motion), and the
 * people who built Gurukul, from GitHub's contributor list. A failed list shows no "Built by".
 */
export function ShellFooter() {
  const [people, setPeople] = useState<Contributor[]>([]);
  const [turn, setTurn] = useState(0);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadContributors().then((list) => {
      if (alive) setPeople(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (held || reducedMotion()) return;
    const id = setInterval(() => setTurn((t) => (t + 1) % CALLOUTS.length), CALLOUT_MS);
    return () => clearInterval(id);
  }, [held]);

  const callout = CALLOUTS[turn] as (typeof CALLOUTS)[number];
  return (
    <div className="shell-footer">
      <Link to="/changelog" className="shell-footer__link">
        <SparkIcon size={14} />
        What's new
      </Link>
      <a className="shell-footer__link" href={REPO_URL} target="_blank" rel="noreferrer">
        <GitHubIcon size={14} />
        GitHub
        <StarIcon size={12} />
      </a>
      <div className="shell-footer__callout">
        <a
          key={turn}
          className="shell-footer__link"
          href={callout.href}
          target="_blank"
          rel="noreferrer"
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
        >
          {callout.text}
        </a>
      </div>
      {people.length > 0 ? (
        <div className="shell-footer__built">
          <span id="built-by">Built by</span>
          <ul aria-labelledby="built-by">
            {people.slice(0, SHOWN).map((p) => (
              <li key={p.login}>
                <a
                  className="shell-footer__link"
                  href={p.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={p.login}
                  aria-label={`${p.login} on GitHub`}
                >
                  <Avatar name={p.login} photoUrl={p.avatarUrl} size={24} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
