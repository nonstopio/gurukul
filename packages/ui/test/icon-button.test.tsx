import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IconButton, Menu, PenIcon, TrashIcon, iconButtonClass } from '../src';
import { axeViolations } from './axe';

describe('IconButton', () => {
  it('is a named button with a short tooltip, defaulting to its label', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <>
        <IconButton label="Rename What Git solves" tip="Rename" onClick={onClick}>
          <PenIcon />
        </IconButton>
        <IconButton label="Delete it">
          <TrashIcon />
        </IconButton>
      </>,
    );
    const rename = screen.getByRole('button', { name: 'Rename What Git solves' });
    expect(rename.getAttribute('data-tip')).toBe('Rename');
    expect(rename.getAttribute('type')).toBe('button');
    expect(screen.getByRole('button', { name: 'Delete it' }).getAttribute('data-tip')).toBe(
      'Delete it',
    );
    fireEvent.click(rename);
    expect(onClick).toHaveBeenCalledOnce();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('marks the danger tone and passes a class through', () => {
    render(
      <IconButton label="Delete" tone="danger" className="x" disabled>
        <TrashIcon />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    expect(button.className).toBe('g-iconbtn g-iconbtn--danger x');
    expect(button.disabled).toBe(true);
  });

  it('gives a Menu trigger the same look and a tooltip', () => {
    expect(iconButtonClass()).toBe('g-iconbtn');
    render(
      <Menu
        label="Move it"
        tip="Move"
        triggerClassName={iconButtonClass()}
        items={[{ label: 'Elsewhere', onSelect: () => {} }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Move it' }).getAttribute('data-tip')).toBe('Move');
  });
});
