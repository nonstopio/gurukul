import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '../src';
import { axeViolations } from './axe';

function Harness({ size, children }: { size?: 'md' | 'drawer'; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Grant a role"
        size={size}
        footer={<button>Save</button>}
      >
        {children ?? (
          <>
            <input aria-label="Person" />
            <button>Inner</button>
          </>
        )}
      </Dialog>
    </>
  );
}
const opener = () => screen.getByRole('button', { name: 'Open' });
const open = () => {
  opener().focus();
  fireEvent.click(opener());
};

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(
      <Dialog open={false} onClose={vi.fn()} title="x">
        y
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a labelled modal dialog with a heading, body and footer; focus goes to the first field', () => {
    render(<Harness />);
    open();
    const dialog = screen.getByRole('dialog', { name: 'Grant a role' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.className).toContain('g-dialog--md');
    expect(screen.getByRole('heading', { name: 'Grant a role' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Person'));
  });

  it('focuses the close button when the body has nothing focusable', () => {
    render(<Harness>just text</Harness>);
    open();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('drawer size has its own class and layer', () => {
    render(<Harness size="drawer" />);
    open();
    expect(screen.getByRole('dialog').className).toContain('g-dialog--drawer');
    expect(document.querySelector('.g-dialog-layer--drawer')).toBeTruthy();
  });

  it('Tab wraps from the last control to the first and Shift+Tab back', () => {
    render(<Harness />);
    open();
    const close = screen.getByRole('button', { name: 'Close' });
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(save);
    // In the middle the browser moves focus; the trap leaves it alone.
    const inner = screen.getByRole('button', { name: 'Inner' });
    inner.focus();
    fireEvent.keyDown(inner, { key: 'Tab' });
    fireEvent.keyDown(inner, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(inner);
  });

  it('pulls focus back in when it is outside the dialog', () => {
    render(<Harness />);
    open();
    opener().focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('ignores other keys', () => {
    render(<Harness />);
    open();
    fireEvent.keyDown(document, { key: 'a' });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('Escape closes and focus returns to the opener', () => {
    render(<Harness />);
    open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener());
  });

  it('the backdrop and the close button close it', () => {
    render(<Harness />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Close grant a role' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener());
  });

  it('locks page scroll while open and restores it after', () => {
    document.body.style.overflow = 'scroll';
    render(<Harness />);
    open();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.body.style.overflow).toBe('scroll');
    document.body.style.overflow = '';
  });

  it('uses the latest onClose and a custom close label', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <Dialog open onClose={first} title="T" closeLabel="Dismiss">
        x
      </Dialog>,
    );
    rerender(
      <Dialog open onClose={second} title="T" closeLabel="Dismiss">
        x
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('has no axe violations', async () => {
    render(<Harness />);
    open();
    expect(await axeViolations(screen.getByRole('dialog'))).toEqual([]);
  });
});
