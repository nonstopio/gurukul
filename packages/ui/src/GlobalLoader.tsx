import { Mascot } from './Mascot';
import './global-loader.css';

export type GlobalLoaderVariant = 'section' | 'overlay' | 'inline';

export interface GlobalLoaderProps {
  /** What is happening, in words: "Assigning to 12 people". Announced politely; shown under the owl, hidden beside the inline G. */
  label: string;
  /**
   * `section` fills the region that is loading; `overlay` covers the screen under a scrim while an
   * operation blocks it (both: the owl's waddling loop at 96px with the label under it); `inline` is
   * the small G next to a verb in progress, where the owl would be too small to read. Default: `section`.
   */
  variant?: GlobalLoaderVariant;
}

/**
 * The Gurukul G assembling on its green tile: the top stroke drops in, the bottom stroke rises to
 * meet it, they hold, then fade for the next cycle. The same drawing lives inline in
 * `apps/web/index.html` (the boot loader) so it paints before any script loads.
 */
function LoaderMark() {
  return (
    <svg className="g-loader__mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect className="g-loader__tile" width="48" height="48" rx="3" />
      <path
        className="g-loader__stroke g-loader__stroke--top"
        d="M10.3 10H37.7V19.786L33.786 15.871V13.914H14.214V21.743L10.3 17.829V10Z"
      />
      <path
        className="g-loader__stroke g-loader__stroke--bottom"
        d="M10.3 21.743L14.214 25.657V33.486H33.786V25.657H25.957V27.614L22.043 31.529V21.743H37.7V37.4H10.3V21.743Z"
      />
    </svg>
  );
}

/** The one loader for a region or operation whose layout is unknown. Prefer a Skeleton otherwise. */
export function GlobalLoader({ label, variant = 'section' }: GlobalLoaderProps) {
  const inline = variant === 'inline';
  const body = (
    <div className={`g-loader g-loader--${variant}`} role="status">
      {inline ? <LoaderMark /> : <Mascot state="loading" variant="loading" size={96} />}
      <span className={inline ? 'g-loader__sr' : 'g-loader__label'}>{label}</span>
    </div>
  );
  return variant === 'overlay' ? <div className="g-loader-scrim">{body}</div> : body;
}
