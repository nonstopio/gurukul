import { cloneElement, useEffect, useRef } from 'react';
import type { MouseEvent, ReactElement } from 'react';
import type { EventName, TrackArgs } from '../events';
import { useAnalytics } from './context';

type Tracked<E extends EventName> = { event: E } & (TrackArgs<E> extends []
  ? { params?: undefined }
  : { params: TrackArgs<E>[0] });

/** The `track` arguments for an event, from the `params` prop. */
function argsOf<E extends EventName>(params: unknown): TrackArgs<E> {
  return (params === undefined ? [] : [params]) as TrackArgs<E>;
}

/**
 * Sends `event` when the child is clicked, then runs the child's own `onClick` untouched:
 * `<TrackClick event="select_content" params={{...}}><Button>Continue</Button></TrackClick>`.
 */
export function TrackClick<E extends EventName>({
  event,
  params,
  children,
}: Tracked<E> & { children: ReactElement<{ onClick?: (e: MouseEvent) => void }> }) {
  const analytics = useAnalytics();
  return cloneElement(children, {
    onClick: (e: MouseEvent) => {
      analytics.track(event, ...argsOf<E>(params));
      children.props.onClick?.(e);
    },
  });
}

/** Sends `event` once, when a screen or section mounts. */
export function useTrackOnMount<E extends EventName>(event: E, ...params: TrackArgs<E>): void {
  const analytics = useAnalytics();
  // Held in a ref so a changing params object does not send the event again.
  const args = useRef(params);
  // StrictMode mounts twice; the ref keeps the second run from sending.
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    analytics.track(event, ...args.current);
  }, [analytics, event]);
}

/**
 * Sends `event` once, the first time the child is on screen. Wraps it in a plain `div`
 * (display: contents has no box to observe). `threshold` is the visible fraction that counts.
 */
export function TrackImpression<E extends EventName>({
  event,
  params,
  threshold = 0.5,
  children,
}: Tracked<E> & { threshold?: number; children: ReactElement | string }) {
  const analytics = useAnalytics();
  const ref = useRef<HTMLDivElement>(null);
  const sent = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (sent.current || !entries.some((e) => e.isIntersecting)) return;
        sent.current = true;
        analytics.track(event, ...argsOf<E>(params));
        observer.disconnect();
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // `params` is read when the element appears, not a reason to observe again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics, event, threshold]);
  return <div ref={ref}>{children}</div>;
}
