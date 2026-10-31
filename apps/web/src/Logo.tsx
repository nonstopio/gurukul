/**
 * The NonStop io logo. Two files because the wordmark must flip with the theme: dark ink on a light
 * page, white on a dark one. CSS (`.logo--ink`, `.logo--paper` in styles.css) shows the right one,
 * including before any script has applied the saved theme. The wrapper carries the one name.
 */
export function Logo({ className }: { className?: string }) {
  const cx = (kind: string) => `logo ${kind}${className ? ` ${className}` : ''}`;
  return (
    <span role="img" aria-label="NonStop io" className="logo-wrap">
      <img
        src="/nonstop-logo-dark.svg"
        alt=""
        width="165"
        height="48"
        className={cx('logo--ink')}
      />
      <img
        src="/nonstop-logo-light.svg"
        alt=""
        width="165"
        height="48"
        className={cx('logo--paper')}
      />
    </span>
  );
}
