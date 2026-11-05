import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InsertDivider, Menu, PlusIcon, iconButtonClass } from '../src';
import { axeViolations } from './axe';

describe('InsertDivider', () => {
  it('holds the add control, which carries the name, and passes a class and props through', async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <InsertDivider className="extra" data-testid="divider">
        <Menu
          label="Add a block before block 2"
          tip="Add block"
          trigger={<PlusIcon />}
          triggerClassName={iconButtonClass()}
          items={[{ label: 'Text', onSelect }]}
        />
      </InsertDivider>,
    );
    const divider = screen.getByTestId('divider');
    expect(divider.className).toBe('g-insert-divider extra');
    fireEvent.click(screen.getByRole('button', { name: 'Add a block before block 2' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Text' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(await axeViolations(container)).toEqual([]);
  });
});
