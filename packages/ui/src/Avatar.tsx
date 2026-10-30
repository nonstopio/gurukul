// A person's initials in a circle, coloured by their role. Decorative unless labelled, because the
// name is printed beside it.

import { cx } from './cx';
import './avatar.css';

export type AvatarTone = 'learner' | 'educator' | 'admin';

export interface AvatarProps {
  /** A display name or an email; the initials come from it. */
  name: string;
  /** Colours the ground by role. Default: `learner`. */
  tone?: AvatarTone | undefined;
  /** Diameter in px. Default: 36. */
  size?: 24 | 34 | 36 | 48;
  /** Names the avatar for a screen reader. Without it the avatar is hidden from one. */
  label?: string;
  className?: string;
}

/** "Asha Rao" → "AR", "Asha" → "A", "asha.rao@example.com" → "A", "" → "?". */
export function initials(name: string): string {
  const text = name.trim().split('@')[0] as string;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = (words[0] as string)[0] as string;
  const last = words.length > 1 ? (words[words.length - 1] as string)[0] : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, tone = 'learner', size = 36, label, className }: AvatarProps) {
  return (
    <span
      className={cx('g-avatar', `g-avatar--${tone}`, `g-avatar--${size}`, className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {initials(name)}
    </span>
  );
}
