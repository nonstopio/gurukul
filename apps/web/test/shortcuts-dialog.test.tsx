import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axeViolations } from './axe';
import { openApp } from './harness';

const press = (init: KeyboardEventInit, target: Element | Window = window) =>
  fireEvent.keyDown(target, init);

describe('keyboard shortcuts dialog', () => {
  it('opens on ?, lists the shortcuts, and closes on ? again or Escape', async () => {
    await openApp('/');
    await screen.findAllByRole('heading', { level: 1 });
    expect(screen.queryByRole('dialog')).toBeNull();
    press({ key: '?' });
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog.textContent).toContain('Next item');
    expect(dialog.textContent).toContain('Previous item');
    expect(dialog.textContent).toContain('Choose that option');
    expect(await axeViolations(dialog)).toEqual([]);
    press({ key: '?' });
    expect(screen.queryByRole('dialog')).toBeNull();
    press({ key: '?' });
    press({ key: 'Escape' }, document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores ? while typing or with a modifier', async () => {
    await openApp('/');
    await screen.findAllByRole('heading', { level: 1 });
    const input = document.createElement('input');
    document.body.append(input);
    press({ key: '?' }, input);
    press({ key: '?', ctrlKey: true });
    press({ key: '/' });
    expect(screen.queryByRole('dialog')).toBeNull();
    input.remove();
  });
});
