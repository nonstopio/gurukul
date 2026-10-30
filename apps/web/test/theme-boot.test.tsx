import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOT_LOADER_ID, BOOT_MIN_MS, hideBootLoader } from '../src/boot';
import { THEME_KEY, applyTheme, nextTheme, readTheme, setTheme, useTheme } from '../src/theme';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '';
});

describe('theme in odd environments', () => {
  it('reads system when the browser throws on touching storage', () => {
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readTheme()).toBe('system');
  });

  it('renders system on the server', () => {
    function Probe() {
      return <p>{useTheme()[0]}</p>;
    }
    expect(renderToString(<Probe />)).toContain('system');
  });
});

describe('theme storage and server render', () => {
  it('falls back to system when storage is blocked', () => {
    const spy = vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readTheme()).toBe('system');
    spy.mockRestore();
  });

  it('renders as system on the server', () => {
    function Probe() {
      return <span>{useTheme()[0]}</span>;
    }
    expect(renderToString(<Probe />)).toContain('system');
  });
});

describe('theme', () => {
  it('reads the saved choice and falls back to system', () => {
    expect(readTheme()).toBe('system');
    localStorage.setItem(THEME_KEY, 'dark');
    expect(readTheme()).toBe('dark');
    localStorage.setItem(THEME_KEY, 'neon');
    expect(readTheme()).toBe('system');
    expect(readTheme(undefined)).toBe('system');
    expect(
      readTheme({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe('system');
  });

  it('treats a blocked localStorage as system', () => {
    const spy = vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readTheme()).toBe('system');
    spy.mockRestore();
  });

  it('applies a choice to the root and clears it for system', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('saves, applies and announces a choice to every hook', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('system');
    act(() => result.current[1]('dark'));
    expect(result.current[0]).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    act(() => result.current[1]('system'));
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('still applies when storage refuses to save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    setTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('cycles system, light, dark', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });
});

describe('boot loader', () => {
  const mount = () => {
    document.body.innerHTML = `<div id="${BOOT_LOADER_ID}"></div>`;
    return document.getElementById(BOOT_LOADER_ID) as HTMLElement;
  };

  it('does nothing when the page has no boot loader', () => {
    expect(() => hideBootLoader(0)).not.toThrow();
  });

  it('waits out the minimum time, fades, then removes itself', () => {
    const loader = mount();
    const calls: [() => void, number][] = [];
    hideBootLoader(100, document, (fn, ms) => calls.push([fn, ms]));
    expect(calls[0]?.[1]).toBe(BOOT_MIN_MS - 100);
    calls[0]?.[0]();
    expect(loader.classList.contains('boot-loader--leaving')).toBe(true);
    calls[1]?.[0]();
    expect(document.getElementById(BOOT_LOADER_ID)).toBeNull();
  });

  it('removes at once when the minimum has passed, and only once', () => {
    mount();
    const calls: [() => void, number][] = [];
    const schedule = (fn: () => void, ms: number) => calls.push([fn, ms]);
    hideBootLoader(5000, document, schedule);
    hideBootLoader(5000, document, schedule);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toBe(0);
  });

  it('uses the real clock and timers by default', () => {
    vi.useFakeTimers();
    mount();
    hideBootLoader();
    vi.runAllTimers();
    expect(document.getElementById(BOOT_LOADER_ID)).toBeNull();
    vi.useRealTimers();
  });
});
