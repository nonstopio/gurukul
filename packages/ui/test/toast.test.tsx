import { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast, type ToastApi } from '../src';
import { axeViolations } from './axe';

const holder: { current?: ToastApi } = {};
function Grab() {
  const current = useToast();
  useEffect(() => {
    holder.current = current;
  });
  return null;
}
const api = {
  show: (...args: Parameters<ToastApi['show']>) => holder.current?.show(...args) ?? 0,
  dismiss: (id: number) => holder.current?.dismiss(id),
};

function setup(props: { duration?: number; dismissLabel?: string } = {}) {
  return render(
    <ToastProvider {...props}>
      <Grab />
    </ToastProvider>,
  );
}

/** Lets the exit animation's timeout run. */
function settle() {
  act(() => {
    vi.advanceTimersByTime(150);
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Toast', () => {
  it('renders two live regions, polite status and assertive alert, before any toast', () => {
    setup();
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('announces info and success politely, danger assertively', () => {
    setup();
    act(() => {
      api.show('Saved');
      api.show('Published', { tone: 'success' });
      api.show('Could not save', { tone: 'danger' });
    });
    const status = screen.getByRole('status');
    const alert = screen.getByRole('alert');
    expect(status.textContent).toContain('Saved');
    expect(status.textContent).toContain('Published');
    expect(status.textContent).not.toContain('Could not save');
    expect(alert.textContent).toContain('Could not save');
    expect(status.querySelector('.g-toast--info')).toBeTruthy();
    expect(status.querySelector('.g-toast--success')).toBeTruthy();
    expect(alert.querySelector('.g-toast--danger')).toBeTruthy();
  });

  it('dismisses itself after the default duration', () => {
    setup();
    act(() => {
      api.show('Saved');
    });
    act(() => {
      vi.advanceTimersByTime(5999);
    });
    expect(screen.queryByText('Saved')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    settle();
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('uses the provider duration and a per-toast override', () => {
    setup({ duration: 1000 });
    act(() => {
      api.show('Short');
      api.show('Long', { duration: 3000 });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    settle();
    expect(screen.queryByText('Short')).toBeNull();
    expect(screen.queryByText('Long')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    settle();
    expect(screen.queryByText('Long')).toBeNull();
  });

  it('keeps a toast with duration 0 until dismissed', () => {
    setup();
    act(() => {
      api.show('Sticky', { duration: 0 });
    });
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.queryByText('Sticky')).toBeTruthy();
  });

  it('dismisses with the button, which has an accessible name', () => {
    setup({ dismissLabel: 'Close' });
    act(() => {
      api.show('Saved');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    settle();
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('defaults the dismiss label to "Dismiss"', () => {
    setup();
    act(() => {
      api.show('Saved');
    });
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('dismiss(id) closes one toast; an unknown id is ignored', () => {
    setup();
    let first = 0;
    act(() => {
      first = api.show('One');
      api.show('Two');
    });
    act(() => {
      api.dismiss(999);
      api.dismiss(first);
    });
    settle();
    expect(screen.queryByText('One')).toBeNull();
    expect(screen.queryByText('Two')).toBeTruthy();
  });

  it('clears the timer when a toast is dismissed early', () => {
    setup();
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    act(() => {
      api.show('Saved');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(clear).toHaveBeenCalled();
  });

  it('stays until closed for danger, 4s for success, 8s for warning', () => {
    setup();
    act(() => {
      api.show('Fine', { tone: 'success' });
      api.show('Careful', { tone: 'warning' });
      api.show('Broke', { tone: 'danger' });
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    settle();
    expect(screen.queryByText('Fine')).toBeNull();
    expect(screen.queryByText('Careful')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    settle();
    expect(screen.queryByText('Careful')).toBeNull();
    expect(screen.queryByText('Broke')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Broke');
  });

  it('shows a title, detail, mono code and an action that runs then closes', () => {
    setup();
    const onSelect = vi.fn();
    act(() => {
      api.show('Check your connection.', {
        tone: 'danger',
        title: 'Could not reach the server',
        code: 'NET-OFFLINE',
        action: { label: 'Retry', onSelect },
      });
    });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Error: Could not reach the server');
    expect(alert.textContent).toContain('Check your connection.');
    expect(alert.querySelector('code')?.textContent).toBe('NET-OFFLINE');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onSelect).toHaveBeenCalledOnce();
    settle();
    expect(screen.queryByText('Check your connection.')).toBeNull();
  });

  it('shows a timer bar for timed toasts only', () => {
    setup();
    act(() => {
      api.show('Timed');
      api.show('Sticky', { duration: 0 });
    });
    expect(
      screen.getByText('Timed').closest('.g-toast')?.querySelector('.g-toast__timer'),
    ).toBeTruthy();
    expect(
      screen.getByText('Sticky').closest('.g-toast')?.querySelector('.g-toast__timer'),
    ).toBeNull();
  });

  it('pauses the timeout on hover and on focus, and resumes with what was left', () => {
    setup();
    act(() => {
      api.show('Held', { duration: 1000 });
    });
    const toast = screen.getByText('Held').closest('.g-toast') as HTMLElement;
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.mouseEnter(toast);
    expect(toast.hasAttribute('data-paused')).toBe(true);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Held')).toBeTruthy();
    fireEvent.mouseLeave(toast);
    expect(toast.hasAttribute('data-paused')).toBe(false);
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(screen.queryByText('Held')).toBeTruthy();
    fireEvent.focusIn(toast);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Held')).toBeTruthy();
    fireEvent.focusOut(toast);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    settle();
    expect(screen.queryByText('Held')).toBeNull();
  });

  it('marks a leaving toast for the exit animation before removing it', () => {
    setup();
    act(() => {
      api.show('Bye');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.getByText('Bye').closest('.g-toast')?.hasAttribute('data-leaving')).toBe(true);
    settle();
    expect(screen.queryByText('Bye')).toBeNull();
  });

  it('keeps three at a time, dropping the oldest', () => {
    setup();
    act(() => {
      ['One', 'Two', 'Three', 'Four'].forEach((m) => api.show(m));
    });
    expect(screen.queryByText('One')).toBeNull();
    expect(screen.queryByText('Four')).toBeTruthy();
    expect(document.querySelectorAll('.g-toast').length).toBe(3);
  });

  it('throws a clear error outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Grab />)).toThrow('useToast must be used inside a ToastProvider');
    spy.mockRestore();
  });

  it('has no axe violations with toasts showing', async () => {
    vi.useRealTimers();
    const { container } = setup();
    act(() => {
      api.show('Saved', { tone: 'success' });
      api.show('Failed', {
        tone: 'danger',
        title: 'Broke',
        code: 'SRV-INTERNAL',
        action: { label: 'Retry', onSelect: () => {} },
      });
      api.show('Slow', { tone: 'warning' });
    });
    expect(await axeViolations(container)).toEqual([]);
  });
});
