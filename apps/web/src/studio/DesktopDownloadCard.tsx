import { Card, Chip, DownloadIcon, Skeleton, buttonClass } from '@gurukul/ui';
import { useEffect, useState } from 'react';
import {
  DESKTOP_RELEASES_PAGE,
  SYSTEM_NAMES,
  detectSystem,
  loadLatestRelease,
  offerFor,
} from '../desktop/download';
import type { DesktopDownload, DesktopRelease, DesktopSystem } from '../desktop/download';
type Found =
  | { state: 'loading' }
  | { state: 'none' }
  | { state: 'ready'; release: DesktopRelease; system: DesktopSystem | null };

const MAC_STEPS = [
  'Open the downloaded .dmg file.',
  'Drag Gurukul Studio into the Applications folder.',
  'Open Gurukul Studio from Applications and sign in with your NonStop Google account.',
];

/** The Windows installer is not signed yet (`DSK-22`), so SmartScreen asks first. */
const WINDOWS_STEPS = [
  'Run the downloaded Setup .exe. It installs for you alone, with no administrator needed.',
  'If Windows SmartScreen says it protected your PC, choose More info, then Run anyway.',
  'Gurukul Studio opens when it is installed. Sign in with your NonStop Google account.',
];

const STEPS: Record<DesktopSystem, { title: string; steps: string[] }> = {
  'mac-arm': { title: 'Install on macOS', steps: MAC_STEPS },
  'mac-intel': { title: 'Install on macOS', steps: MAC_STEPS },
  windows: { title: 'Install on Windows', steps: WINDOWS_STEPS },
};

/**
 * "Build a course by chatting": the browser Studio's offer of the desktop app
 * (`.plan/22-desktop-studio.md`, Download). It asks GitHub for the latest desktop release when it is
 * drawn (falling back to the tab's last answer when GitHub cannot answer), offers the installer for the visitor's own system first with that
 * system's install steps, the other installers after it, and every release on GitHub. With no
 * release, a failed request or no installer it knows, it links to the releases page. Inside the
 * desktop app Studio shows the session buttons instead, so the page never draws this there.
 */
export function DesktopDownloadCard() {
  const [found, setFound] = useState<Found>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    void Promise.all([loadLatestRelease(), detectSystem()]).then(([release, system]) => {
      if (live) setFound(release ? { state: 'ready', release, system } : { state: 'none' });
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Card
      className="sc-download"
      title="Build a course by chatting"
      actions={
        found.state === 'ready' ? (
          <Chip tone="neutral">{`Version ${found.release.version}`}</Chip>
        ) : null
      }
    >
      <div className="sc-download__body">
        <div className="sc-download__intro">
          <p className="sc-download__lead">
            Gurukul Studio is a desktop app that runs Claude Code on your computer, signed in with
            your own Claude plan. Describe what you want, watch the course take shape, then review
            every change on one screen before it is saved to the draft.
          </p>
          <Offer found={found} />
        </div>
        {found.state === 'ready' ? <Steps found={found} /> : null}
      </div>
    </Card>
  );
}

function Offer({ found }: { found: Found }) {
  if (found.state === 'loading') {
    return (
      <div className="sc-download__offer" aria-busy="true">
        <span className="sc-help">Looking for the latest version</span>
        <Skeleton shape="block" width="16rem" height="2.75rem" />
      </div>
    );
  }
  if (found.state === 'none') {
    return (
      <div className="sc-download__offer">
        <a className={buttonClass('secondary')} href={DESKTOP_RELEASES_PAGE}>
          <span className="g-btn__icon" aria-hidden="true">
            <DownloadIcon />
          </span>
          Get Gurukul Studio from GitHub
        </a>
        <p className="sc-help">The installers for macOS and Windows are on its releases page.</p>
      </div>
    );
  }
  const { first, others } = offerFor(found.release, found.system);
  return (
    <div className="sc-download__offer">
      {first ? <DownloadLink download={first} featured /> : <Unmatched system={found.system} />}
      <p className="sc-download__more">
        {others.length ? (
          <span className="sc-help">{first ? 'Other installers:' : 'Installers:'}</span>
        ) : null}
        {others.map((d) => (
          <DownloadLink key={d.system} download={d} />
        ))}
        <a className={buttonClass('quiet', undefined, 'sm')} href={DESKTOP_RELEASES_PAGE}>
          All releases
        </a>
      </p>
    </div>
  );
}

/** Why no installer leads: the system is not one the app is built for, or this release lacks it. */
function Unmatched({ system }: { system: DesktopSystem | null }) {
  return (
    <p className="sc-help">
      {system
        ? `This version has no installer for ${SYSTEM_NAMES[system]} yet.`
        : 'Gurukul Studio runs on macOS and Windows. Pick the installer for your computer.'}
    </p>
  );
}

function DownloadLink({ download, featured }: { download: DesktopDownload; featured?: boolean }) {
  const name = SYSTEM_NAMES[download.system];
  if (!featured) {
    return (
      <a
        className={buttonClass('quiet', undefined, 'sm')}
        href={download.url}
        aria-label={`Download for ${name}`}
      >
        {name}
      </a>
    );
  }
  return (
    <a className={buttonClass('secondary')} href={download.url}>
      <span className="g-btn__icon" aria-hidden="true">
        <DownloadIcon />
      </span>
      {`Download for ${name}`}
    </a>
  );
}

/** The install steps for the visitor's system when its installer leads; none are guessed otherwise. */
function Steps({ found }: { found: Extract<Found, { state: 'ready' }> }) {
  const { first } = offerFor(found.release, found.system);
  if (!first) return null;
  const { title, steps } = STEPS[first.system];
  return (
    <section className="sc-download__steps" aria-labelledby="sc-download-steps">
      <h3 className="sc-h3" id="sc-download-steps">
        {title}
      </h3>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}
