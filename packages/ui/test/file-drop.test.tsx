import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileDrop } from '../src';
import { axeViolations } from './axe';

const png = () => new File(['x'], 'shot.png', { type: 'image/png' });
const list = (...files: File[]) => files;
const POLICY = 'WebP, PNG or JPEG · up to 500 KB · 1600 px wide is ideal';

function picker(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe('FileDrop idle', () => {
  it('states the policy before anyone picks and has a real button for a zone', async () => {
    const { container } = render(
      <FileDrop label="Choose an image" policy={POLICY} accept="image/png" onFile={() => {}} />,
    );
    const zone = screen.getByRole('button', { name: /Choose an image/ });
    expect(screen.getByText(POLICY)).toBeTruthy();
    expect(zone.getAttribute('aria-describedby')).toBe(screen.getByText(POLICY).id);
    expect(picker(container).accept).toBe('image/png');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('opens the native picker on click and hands over the chosen file', () => {
    const onFile = vi.fn();
    const { container } = render(<FileDrop label="Choose" policy={POLICY} onFile={onFile} />);
    const click = vi.spyOn(picker(container), 'click');
    fireEvent.click(screen.getByRole('button', { name: /Choose/ }));
    expect(click).toHaveBeenCalledOnce();
    const file = png();
    fireEvent.change(picker(container), { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
    // Cancelling the picker hands over nothing.
    fireEvent.change(picker(container), { target: { files: [] } });
    expect(onFile).toHaveBeenCalledOnce();
  });

  it('takes a dropped file, and shows the dragging state until it leaves or drops', () => {
    const onFile = vi.fn();
    render(<FileDrop label="Choose" policy={POLICY} onFile={onFile} />);
    const zone = screen.getByRole('button', { name: /Choose/ });
    fireEvent.dragEnter(zone);
    expect(zone.className).toContain('g-filedrop__zone--dragging');
    expect(screen.getByText('Drop to check it')).toBeTruthy();
    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain('--dragging');
    fireEvent.dragOver(zone);
    expect(zone.className).toContain('--dragging');
    const file = png();
    fireEvent.drop(zone, { dataTransfer: { files: list(file) } });
    expect(onFile).toHaveBeenCalledWith(file);
    expect(zone.className).not.toContain('--dragging');
  });

  it('ignores a drop with no file in it', () => {
    const onFile = vi.fn();
    render(<FileDrop label="Choose" policy={POLICY} onFile={onFile} />);
    fireEvent.drop(screen.getByRole('button', { name: /Choose/ }), {
      dataTransfer: { files: list() },
    });
    expect(onFile).not.toHaveBeenCalled();
  });

  it('takes a file pasted while the zone is focused, and lets pasted text through', () => {
    const onFile = vi.fn();
    render(<FileDrop label="Choose" policy={POLICY} onFile={onFile} />);
    const zone = screen.getByRole('button', { name: /Choose/ });
    const file = png();
    const paste = createEvent.paste(zone, { clipboardData: { files: list(file) } });
    act(() => void zone.dispatchEvent(paste));
    expect(onFile).toHaveBeenCalledWith(file);
    expect(paste.defaultPrevented).toBe(true);
    const text = createEvent.paste(zone, { clipboardData: { files: list() } });
    act(() => void zone.dispatchEvent(text));
    expect(onFile).toHaveBeenCalledOnce();
    expect(text.defaultPrevented).toBe(false);
  });

  it('does nothing when disabled', () => {
    const onFile = vi.fn();
    render(<FileDrop label="Choose" policy={POLICY} onFile={onFile} disabled className="mine" />);
    const zone = screen.getByRole('button', { name: /Choose/ }) as HTMLButtonElement;
    expect(zone.disabled).toBe(true);
    fireEvent.drop(zone, { dataTransfer: { files: list(png()) } });
    expect(onFile).not.toHaveBeenCalled();
    expect(zone.closest('.g-filedrop')?.className).toBe('g-filedrop mine');
  });
});

describe('FileDrop states', () => {
  it('says what it is checking, with no zone to click', async () => {
    const { container } = render(
      <FileDrop
        label="Choose"
        policy={POLICY}
        state="checking"
        fileName="shot.png"
        onFile={() => {}}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('Checking shot.png…');
    expect(screen.queryByRole('button')).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('names the file generically when it has no name', () => {
    render(<FileDrop label="Choose" policy={POLICY} state="checking" onFile={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('Checking the file…');
  });

  it('shows progress, announces it in tens and cancels', async () => {
    const onCancel = vi.fn();
    const { container, rerender } = render(
      <FileDrop
        label="Choose"
        policy={POLICY}
        state="uploading"
        fileName="shot.png"
        progress={47}
        onCancel={onCancel}
        onFile={() => {}}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('Uploading shot.png: 40%');
    expect(
      screen.getByRole('progressbar', { name: 'Upload progress' }).getAttribute('aria-valuenow'),
    ).toBe('47');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(await axeViolations(container)).toEqual([]);
    rerender(
      <FileDrop
        label="Choose"
        policy={POLICY}
        state="uploading"
        progress={250}
        onFile={() => {}}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('Uploading the file: 100%');
    expect(screen.queryByRole('button', { name: 'Cancel upload' })).toBeNull();
  });

  it('ties an error to the zone and keeps the zone usable', async () => {
    const { container } = render(
      <FileDrop
        label="Choose"
        policy={POLICY}
        state="error"
        error={<p>This image is 1.8 MB.</p>}
        onFile={() => {}}
      />,
    );
    const zone = screen.getByRole('button', { name: /Choose/ });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('This image is 1.8 MB.');
    expect(zone.getAttribute('aria-describedby')).toContain(alert.id);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows no error box for an error state with nothing to say, or an error in another state', () => {
    const { rerender } = render(
      <FileDrop label="Choose" policy={POLICY} state="error" onFile={() => {}} />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<FileDrop label="Choose" policy={POLICY} error="stale" onFile={() => {}} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
