import { buttonClass } from '@gurukul/ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatCountdown } from './model';

/** The current time in ms, ticking each second until `opensAt`; the interval stops once it has passed. */
export function useCooldownClock(opensAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  const open = now >= opensAt;
  useEffect(() => {
    if (open) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);
  return now;
}

/** "Retake", or a countdown to it that ticks each second and turns into the link when it opens. */
export function Retake({ opensAt, to }: { opensAt: number; to: string }) {
  const now = useCooldownClock(opensAt);
  return now >= opensAt ? (
    <Link className={buttonClass('secondary')} to={to}>
      Retake
    </Link>
  ) : (
    <span className="learn-muted" role="timer">
      Retake opens in {formatCountdown(opensAt - now)}
    </span>
  );
}
