import './global-loader.css';

export type GlobalLoaderVariant = 'section' | 'overlay' | 'inline';

export interface GlobalLoaderProps {
  /** What is happening, in words: "Assigning to 12 people". Announced politely. */
  label: string;
  /**
   * `section` fills the region that is loading; `overlay` covers the screen under a scrim while an
   * operation blocks it; `inline` is the small mark next to a verb in progress. Default: `section`.
   */
  variant?: GlobalLoaderVariant;
  /** A second line, e.g. "Taking longer than usual…". */
  hint?: string | undefined;
}

/**
 * The Gurukul mark in motion: a green ring turns around a saffron flame. The same markup lives
 * inline in `apps/web/index.html` (the boot loader) so it paints before any script loads.
 */
function LoaderMark() {
  return (
    <svg className="g-loader__mark" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
      <circle className="g-loader__track" cx="36" cy="36" r="30" />
      <circle className="g-loader__arc" cx="36" cy="36" r="30" />
      <path
        className="g-loader__flame"
        d="M36 20c2.4 8 10 10 10 20a10 10 0 0 1-20 0c0-4 2-6 4-8 .2 4 2 6 4 6-.4-8-2-12 2-18z"
      />
    </svg>
  );
}

/** The one loader for a region or operation whose layout is unknown. Prefer a Skeleton otherwise. */
export function GlobalLoader({ label, variant = 'section', hint }: GlobalLoaderProps) {
  const body = (
    <div className={`g-loader g-loader--${variant}`} role="status">
      <LoaderMark />
      {variant === 'inline' ? null : <span className="g-loader__label">{label}</span>}
      {variant === 'inline' ? <span className="g-loader__sr">{label}</span> : null}
      {hint ? <span className="g-loader__hint">{hint}</span> : null}
    </div>
  );
  return variant === 'overlay' ? <div className="g-loader-scrim">{body}</div> : body;
}
