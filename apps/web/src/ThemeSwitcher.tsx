import { MonitorIcon, MoonIcon, SegmentedControl, SunIcon } from '@gurukul/ui';
import type { ReactNode } from 'react';
import { THEME_CHOICES, useTheme } from './theme';
import type { ThemeChoice } from './theme';

const OPTIONS: Record<ThemeChoice, { title: string; icon: ReactNode }> = {
  light: { title: 'Light', icon: <SunIcon /> },
  system: { title: 'System', icon: <MonitorIcon /> },
  dark: { title: 'Dark', icon: <MoonIcon /> },
};

/** Light, System or Dark, one tap, at the top right of every page. Remembered on this device. */
export function ThemeSwitcher() {
  const [theme, setTheme] = useTheme();
  return (
    <SegmentedControl<ThemeChoice>
      label="Theme"
      value={theme}
      options={THEME_CHOICES.map((c) => ({
        value: c,
        label: (
          <>
            {OPTIONS[c].icon}
            <span className="g-visually-hidden">{OPTIONS[c].title}</span>
          </>
        ),
      }))}
      onChange={setTheme}
    />
  );
}
