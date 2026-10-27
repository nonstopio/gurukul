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
      vi.advanceTimersByTime(4999);
    });
    expect(screen.queryByText('Saved')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
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
    expect(screen.queryByText('Short')).toBeNull();
    expect(screen.queryByText('Long')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
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
      api.show('Failed', { tone: 'danger' });
    });
    expect(await axeViolations(container)).toEqual([]);
  });
});
