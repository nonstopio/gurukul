import { buttonClass } from '@gurukul/ui';

/**
 * Placeholder home. The real routes (learner, Kulapati console, Vyasa Studio) arrive with the
 * milestones in .plan/12-milestones.md.
 */
export function HomePage() {
  return (
    <main className="shell">
      <img
        className="shell__logo"
        src="/nonstop-logo.png"
        alt="NonStop io"
        width="110"
        height="32"
      />
      <p className="shell__kicker">NonStop Academy</p>
      <h1 className="shell__title">Gurukul is being built.</h1>
      <p className="shell__body">
        Courses, Parikshas and certificates for every NonStopian. Follow along on GitHub.
      </p>
      <div className="shell__actions">
        <a className={buttonClass('chrome')} href="https://github.com/nonstopio/gurukul">
          View the repository
        </a>
        <a className="shell__link" href="/changelog">
          What has changed
        </a>
      </div>
    </main>
  );
}
