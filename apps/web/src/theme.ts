import { useSyncExternalStore } from 'react';

/** What the person chose. `system` follows the device until they pick Light or Dark. */
export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_KEY = 'gurukul-theme';
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

const listeners = new Set<() => void>();

/** The saved choice. Storage can be missing or blocked (private windows), so failure means `system`. */
export function readTheme(
  storage: Pick<Storage, 'getItem'> | undefined = safeStorage(),
): ThemeChoice {
  try {
    const saved = storage?.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Puts the choice on `<html data-theme>`. `system` removes the attribute, so the stylesheet's
 * `prefers-color-scheme` rule decides. The inline script in `index.html` does the same before first
 * paint, so there is no flash of the wrong theme.
 */
export function applyTheme(
  choice: ThemeChoice,
  root: HTMLElement = document.documentElement,
): void {
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/** Saves and applies a choice, and tells every `useTheme` caller. */
export function setTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'system') globalThis.localStorage?.removeItem(THEME_KEY);
    else globalThis.localStorage?.setItem(THEME_KEY, choice);
  } catch {
    // Not saved this session; still applied.
  }
  applyTheme(choice);
  listeners.forEach((l) => l());
}

/** The next choice when someone taps one button: System → Light → Dark → System. */
export function nextTheme(choice: ThemeChoice): ThemeChoice {
  return THEME_CHOICES[(THEME_CHOICES.indexOf(choice) + 1) % THEME_CHOICES.length] as ThemeChoice;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** `[choice, setTheme]`, shared by the account menu and the Profile page. */
export function useTheme(): readonly [ThemeChoice, (choice: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribe, () => readTheme());
  return [choice, setTheme] as const;
}
