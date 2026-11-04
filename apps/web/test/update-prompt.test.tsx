import { act, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider } from '@gurukul/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdatePrompt } from '../src/UpdatePrompt';
import { setUpdate } from '../src/update';
import { axeViolations } from './axe';

function setup() {
  const reload = vi.fn();
  render(
    <ToastProvider>
      <button>Something on the page</button>
      <UpdatePrompt reload={reload} />
    </ToastProvider>,
  );
  return reload;
}
const offer = (kind: 'soft' | 'hard', id: string) => act(() => setUpdate({ kind, id }));
const toastTitle = () => screen.queryByText('A new version of Gurukul is ready');
// The toast leaves after its exit animation.
const settle = () => act(() => new Promise((r) => setTimeout(r, 200)));

afterEach(() => act(() => setUpdate(null)));

describe('UpdatePrompt', () => {
  it('shows nothing while this tab runs the live build', () => {
    setup();
    expect(toastTitle()).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers a soft update in a toast that stays; Update reloads', () => {
    const reload = setup();
    offer('soft', 'b');
    expect(toastTitle()).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('Later hides it until a still newer build goes live', async () => {
    const reload = setup();
    offer('soft', 'b');
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    await settle();
    expect(toastTitle()).toBeNull();
    // The next check finds the same build: still hidden.
    offer('soft', 'b');
    expect(toastTitle()).toBeNull();
    offer('soft', 'c');
    expect(toastTitle()).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });

  it('a newer build replaces the toast instead of stacking a second', async () => {
    setup();
    offer('soft', 'b');
    offer('soft', 'c');
    await settle();
    expect(screen.getAllByText('A new version of Gurukul is ready')).toHaveLength(1);
  });

  it('a hard update blocks the page even after Later: no close, Escape does nothing, Update reloads', async () => {
    const reload = setup();
    offer('soft', 'b');
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    offer('hard', 'c');
    await settle();
    const dialog = screen.getByRole('dialog', { name: 'Gurukul has been updated' });
    expect(dialog.textContent).toContain('Update now to keep going.');
    expect(toastTitle()).toBeNull();
    expect(screen.queryByRole('button', { name: /close|later/i })).toBeNull();
    const update = screen.getByRole('button', { name: 'Update' });
    expect(document.activeElement).toBe(update);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(update, { key: 'Tab' });
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(document.activeElement).toBe(update);
    fireEvent.click(update);
    expect(reload).toHaveBeenCalledOnce();
    expect(await axeViolations(dialog)).toEqual([]);
  });

  it('reloads the page by default', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(
      <ToastProvider>
        <UpdatePrompt />
      </ToastProvider>,
    );
    offer('hard', 'b');
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(reload).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
