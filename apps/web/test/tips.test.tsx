import { POLICY_VERSION, acceptPolicy } from '../src/privacy/policy';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTE_PATHS } from '../src/route-paths';
import { TIPS } from '../src/tips/registry';
import type { Tip } from '../src/tips/registry';
import { readTips, tipsKey, updateTips, useTipsSwitch } from '../src/tips/store';
import { useTips } from '../src/tips/useTips';
import { openApp } from './harness';

// Driver.js draws into the page and measures it; here it is a recorder, so the tests check what we
// ask of it (which dots, which bubble) and what we remember.
const lib = vi.hoisted(() => {
  const state = {
    active: undefined as { id: string } | undefined,
    config: {} as never as Record<string, unknown>,
  };
  const h = {
    setHints: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    open: vi.fn((id: string) => {
      state.active = { id };
      (state.config.onOpen as (e: Element, hint: { id: string }) => void)(document.body, { id });
    }),
    dismiss: vi.fn((id: string) =>
      (state.config.onDismiss as (e: Element, hint: { id: string }) => void)(document.body, { id }),
    ),
    getActive: vi.fn(() => state.active),
  };
  return {
    state,
    h,
    hints: vi.fn((config: Record<string, unknown>) => ((state.config = config), h)),
  };
});
vi.mock('driver.js/hints', () => ({ hints: lib.hints }));

const A: Tip = { id: 'a', where: ['/'], el: '#a', title: 'A', text: 'First & <b>', side: 'right' };
const B: Tip = { id: 'b', where: ['/'], el: '#b', title: 'B', text: 'Second' };
const ELSEWHERE: Tip = { id: 'c', where: ['/profile'], el: '#a', title: 'C', text: 'Other page' };

function Probe({ tips, uid = 'u1' }: { tips: readonly Tip[]; uid?: string | undefined }) {
  useTips(uid, tips);
  return null;
}

const rect = (left: number, width = 20) =>
  ({ left, right: left + width, width, top: 0, bottom: 20, height: 20 }) as DOMRect;

function page(extra = '') {
  document.body.innerHTML = `<button id="a">a</button><button id="b">b</button>${extra}`;
}

const shownTips = () =>
  (lib.h.setHints.mock.calls.at(-1)?.[0] ?? []) as {
    id: string;
    popover: { description: string; side: string };
  }[];

async function settle(ms = 200) {
  await act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  Object.values(lib.h).forEach((f) => 'mockClear' in f && f.mockClear());
  lib.state.active = undefined;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return rect(Number((this as HTMLElement).dataset?.left ?? 10));
  });
  page();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('tip rows', () => {
  it('are well formed and point at real routes', () => {
    const ids = TIPS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TIPS) {
      expect(t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(t.title.length).toBeLessThanOrEqual(32);
      expect(t.text.length).toBeLessThanOrEqual(140);
      expect(t.where.length).toBeGreaterThan(0);
      for (const p of t.where) expect(ROUTE_PATHS).toContain(p);
    }
  });
});

describe('tip storage', () => {
  it('defaults to every tip on, ignores junk and survives bad JSON', () => {
    expect(readTips('u1')).toEqual({ off: false, done: [], opened: [] });
    localStorage.setItem(
      tipsKey('u1'),
      JSON.stringify({ off: true, done: ['x', 3], opened: 'no' }),
    );
    expect(readTips('u1')).toEqual({ off: true, done: ['x'], opened: [] });
    localStorage.setItem(tipsKey('u1'), '{nope');
    expect(readTips('u1')).toEqual({ off: false, done: [], opened: [] });
  });

  it('means no tips when storage is blocked, and a failed save is silent', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readTips('u1')).toBeNull();
    get.mockRestore();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => updateTips('u1', (s) => s)).not.toThrow();
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readTips('u1')).toBeNull();
    expect(() => updateTips('u1', (s) => s)).not.toThrow();
  });

  it('keeps each person apart, and the switch turns off and restarts them', () => {
    function Switch() {
      const { on, available, set } = useTipsSwitch('u1');
      return (
        <>
          <p>{`${on} ${available}`}</p>
          <button onClick={() => set(false)}>off</button>
          <button onClick={() => set(true)}>on</button>
        </>
      );
    }
    updateTips('u1', (s) => ({ ...s, done: ['a'], opened: ['a'] }));
    render(<Switch />);
    expect(screen.getByText('true true')).toBeTruthy();
    fireEvent.click(screen.getByText('off'));
    expect(screen.getByText('false true')).toBeTruthy();
    expect(readTips('u2')?.off).toBe(false);
    fireEvent.click(screen.getByText('on'));
    expect(readTips('u1')).toEqual({ off: false, done: [], opened: [] });
  });

  it('reports itself unavailable when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    function Switch() {
      const { on, available } = useTipsSwitch('u1');
      return <p>{`${on} ${available}`}</p>;
    }
    render(<Switch />);
    expect(screen.getByText('false false')).toBeTruthy();
  });
});

describe('useTips', () => {
  const mount = (tips: readonly Tip[], at = '/', uid?: string) =>
    render(
      <MemoryRouter initialEntries={[at]}>
        <Probe tips={tips} uid={uid} />
      </MemoryRouter>,
    );

  it('puts a dot on each tip of this page and opens the first once, after a pause', async () => {
    mount([A, B, ELSEWHERE]);
    await settle();
    expect(shownTips().map((h) => h.id)).toEqual(['a', 'b']);
    expect(shownTips()[0]?.popover).toMatchObject({ side: 'right' });
    expect(shownTips()[0]?.popover.description).toContain('First &#38; &#60;b&#62;');
    expect(shownTips()[1]?.popover.side).toBe('bottom');
    expect(lib.h.show).toHaveBeenCalledTimes(1);
    expect(lib.h.open).not.toHaveBeenCalled();
    await settle(600);
    expect(lib.h.open).toHaveBeenCalledWith('a');
    expect(readTips('u1')?.opened).toEqual(['a']);
  });

  it('does not open a tip that already opened, and does not take focus', async () => {
    updateTips('u1', (s) => ({ ...s, opened: ['a'] }));
    mount([A, B]);
    await settle(1000);
    expect(lib.h.open).not.toHaveBeenCalled();
    updateTips('u1', (s) => ({ ...s, opened: [] }));
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    const focus = vi.spyOn(field, 'focus');
    mount([A], '/');
    await settle(1000);
    expect(lib.h.open).toHaveBeenCalledWith('a');
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('shows nothing for dismissed, off-page, missing or off-screen features', async () => {
    updateTips('u1', (s) => ({ ...s, done: ['b'] }));
    const hidden = { ...B, id: 'gone', el: '#nope' };
    const away = { ...B, id: 'away', el: '#away' };
    page('<i id="away"></i>');
    (document.querySelector('#away') as HTMLElement).dataset.left = '-100';
    mount([A, B, hidden, away, ELSEWHERE]);
    await settle();
    expect(shownTips().map((h) => h.id)).toEqual(['a']);
  });

  it('waits for a feature that arrives later, and leaves unchanged dots alone', async () => {
    document.body.innerHTML = '<button id="a">a</button>';
    mount([A, B]);
    await settle();
    expect(shownTips().map((h) => h.id)).toEqual(['a']);
    document.body.insertAdjacentHTML('beforeend', '<button id="b">b</button>');
    await settle();
    expect(shownTips().map((h) => h.id)).toEqual(['a', 'b']);
    const calls = lib.h.setHints.mock.calls.length;
    document.body.insertAdjacentHTML('beforeend', '<p>unrelated</p>');
    await settle();
    expect(lib.h.setHints.mock.calls.length).toBe(calls);
  });

  it('brings back the bubble being read when the dots are redrawn', async () => {
    mount([A, B]);
    await settle();
    lib.state.active = { id: 'a' };
    document.body.innerHTML = '<button id="a">a</button><button id="b">b</button>';
    await settle();
    expect(lib.h.open).toHaveBeenCalledWith('a');
    lib.h.open.mockClear();
    lib.state.active = { id: 'zzz' };
    document.body.innerHTML = '<button id="a">a</button><button id="b">b</button>';
    await settle();
    expect(lib.h.open).not.toHaveBeenCalled();
  });

  it('hides everything while a dialog is open, and draws again after', async () => {
    mount([A]);
    await settle();
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog"></div>');
    await settle();
    expect(lib.h.hide).toHaveBeenCalledTimes(1);
    document.body.querySelector('[role="dialog"]')?.remove();
    await settle();
    expect(lib.h.show).toHaveBeenCalledTimes(2);
    // A dialog that was open from the start never draws, and has nothing to hide.
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog"></div>');
    lib.h.hide.mockClear();
    document.body.insertAdjacentHTML('beforeend', '<p></p>');
    await settle();
    expect(lib.h.hide).toHaveBeenCalledTimes(1);
    document.body.insertAdjacentHTML('beforeend', '<p></p>');
    await settle();
    expect(lib.h.hide).toHaveBeenCalledTimes(1);
  });

  it("is not hidden by Driver.js's own bubble, which is a dialog too", async () => {
    mount([A]);
    await settle();
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div role="dialog" class="driver-popover"></div>',
    );
    await settle();
    expect(lib.h.hide).not.toHaveBeenCalled();
  });

  it('stays away while the phone sidebar drawer is open', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="g-app-shell--open"></div>');
    mount([A]);
    await settle(1000);
    expect(lib.h.setHints).not.toHaveBeenCalled();
    expect(lib.h.open).not.toHaveBeenCalled();
    document.querySelector('.g-app-shell--open')?.remove();
    document.body.insertAdjacentHTML('beforeend', '<p></p>');
    await settle();
    expect(shownTips().map((h) => h.id)).toEqual(['a']);
  });

  it('keeps the dot but not the auto-open when the feature is off screen by then', async () => {
    mount([A]);
    await settle();
    (document.querySelector('#a') as HTMLElement).dataset.left = '-100';
    await settle(600);
    expect(lib.h.open).not.toHaveBeenCalled();
  });

  it('does not open over a bubble that is already open', async () => {
    mount([A]);
    await settle();
    lib.state.active = { id: 'b' };
    await settle(600);
    expect(lib.h.open).not.toHaveBeenCalled();
  });

  it('dismisses a tip when its feature is used, and "Got it" is remembered', async () => {
    mount([A, B]);
    await settle();
    fireEvent.click(document.querySelector('#b') as Element);
    expect(lib.h.dismiss).toHaveBeenCalledWith('b');
    expect(readTips('u1')?.done).toEqual(['b']);
    fireEvent.click(document.body);
    expect(lib.h.dismiss).toHaveBeenCalledTimes(1);
  });

  it('does nothing when tips are off or storage is blocked, and cleans up on leaving', async () => {
    updateTips('u1', (s) => ({ ...s, off: true }));
    const off = mount([A]);
    await settle();
    expect(lib.hints).not.toHaveBeenCalled();
    off.unmount();
    updateTips('u1', (s) => ({ ...s, off: false }));
    const on = mount([A]);
    await settle();
    on.unmount();
    expect(lib.h.hide).toHaveBeenCalled();
    updateTips('u1', (s) => ({ ...s, off: true }));
    expect(lib.h.setHints).toHaveBeenLastCalledWith([]);
  });

  it('stops when the switch is turned off in the page without a rerender', async () => {
    mount([A]);
    await settle();
    // Another tab turned them off.
    localStorage.setItem(tipsKey('u1'), JSON.stringify({ off: true, done: [], opened: [] }));
    document.body.insertAdjacentHTML('beforeend', '<p></p>');
    await settle();
    expect(lib.h.hide).toHaveBeenCalled();
  });
});

describe('in the app', () => {
  // Earlier tests leave storage spies behind: acceptance then lasts in memory, which is enough.
  beforeEach(() => acceptPolicy());

  it('turns tips off and on from the Profile page', async () => {
    vi.useRealTimers();
    await openApp('/profile');
    const toggle = (await screen.findByRole('switch', {
      name: 'Feature tips',
    })) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(readTips('u1')?.off).toBe(true);
  });

  it('says so when this browser cannot remember', async () => {
    vi.useRealTimers();
    // Everything fails to read except the privacy policy record, so the app opens.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
      if (key === 'gurukul.privacy.accepted') return POLICY_VERSION;
      throw new Error('blocked');
    });
    await openApp('/profile');
    const toggle = (await screen.findByRole('switch', {
      name: 'Feature tips',
    })) as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
  });
});
