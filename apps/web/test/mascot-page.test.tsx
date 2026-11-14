import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axeViolations } from './axe';
import { openApp } from './harness';

const admin = { roles: ['admin'] as Array<'admin'> };
const pressed = (button: HTMLElement) => button.getAttribute('aria-pressed');

describe('Admin → Mascot', () => {
  it('shows the hero, every face, loaders, sizes, states, both grounds and the code', async () => {
    const { container } = await openApp('/admin/mascot', admin);
    expect(await screen.findByRole('heading', { level: 1, name: 'Mascot' })).toBeTruthy();

    const hero = screen.getByRole('region', { name: 'A watchful eye. A curious mind.' });
    expect(within(hero).getByRole('img', { name: 'The owl, calm and attentive' })).toBeTruthy();
    expect(within(hero).getByText('Calm and attentive')).toBeTruthy();

    const tiles = within(screen.getByRole('group', { name: 'Expressions' })).getAllByRole('button');
    expect(tiles).toHaveLength(24);
    expect(tiles.filter((b) => pressed(b) === 'true')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Seeking clarity/ })).toBeTruthy();

    const chips = within(screen.getByRole('group', { name: 'States' })).getAllByRole('button');
    expect(chips.map((b) => b.textContent)).toEqual([
      'idle',
      'info',
      'success',
      'complete',
      'milestone',
      'empty',
      'notFound',
      'loading',
      'review',
      'tip',
      'new',
      'validation',
      'warning',
      'error',
    ]);

    expect(screen.getByText('128px')).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'While you wait' })).getAllByRole('status'),
    ).toHaveLength(2);
    expect(container.querySelectorAll('.g-mascot--ground-dark')).toHaveLength(1);
    expect(screen.getByText('Never a sad face for a wrong answer')).toBeTruthy();
    expect(screen.getByText(/A learner who gets a quiz question wrong/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('previews the face picked from the grid, whole, face only or loading', async () => {
    await openApp('/admin/mascot', admin);
    const hero = await screen.findByRole('region', { name: 'A watchful eye. A curious mind.' });
    const idea = screen.getByRole('button', { name: /Having an idea/ });
    fireEvent.click(idea);
    expect(pressed(idea)).toBe('true');
    expect(pressed(screen.getByRole('button', { name: /Calm and attentive/ }))).toBe('false');
    const owl = () => within(hero).getByRole('img', { name: 'The owl, having an idea' });
    expect(owl().dataset.variant).toBe('body');
    expect(within(hero).getByText('Having an idea')).toBeTruthy();
    // Both grounds follow the chosen face.
    expect(document.querySelector('.g-mascot--ground-light')?.getAttribute('data-expression')).toBe(
      'idea',
    );

    const faceOnly = within(hero).getByRole('button', { name: 'Show face only' });
    const loop = within(hero).getByRole('button', { name: 'Play loading loop' });
    fireEvent.click(faceOnly);
    expect(pressed(faceOnly)).toBe('true');
    expect(owl().dataset.variant).toBe('face');
    fireEvent.click(loop);
    expect(pressed(loop)).toBe('true');
    expect(owl().dataset.variant).toBe('loading');
    // Face only again stops the loop; pressed a second time it shows the whole owl.
    fireEvent.click(faceOnly);
    expect(pressed(faceOnly)).toBe('false');
    expect(pressed(loop)).toBe('false');
    expect(owl().dataset.variant).toBe('body');
    fireEvent.click(faceOnly);
    fireEvent.click(faceOnly);
    expect(owl().dataset.variant).toBe('body');
  });

  it('shows the face, a line of copy and its use for the chosen state, the loader for loading', async () => {
    await openApp('/admin/mascot', admin);
    const region = await screen.findByRole('region', { name: 'React to the state' });
    const chip = (name: string) => within(region).getByRole('button', { name });
    expect(pressed(chip('empty'))).toBe('true');
    expect(within(region).getByText('empty → curious')).toBeTruthy();

    fireEvent.click(chip('tip'));
    expect(pressed(chip('tip'))).toBe('true');
    expect(pressed(chip('empty'))).toBe('false');
    expect(within(region).getByText('tip → wink')).toBeTruthy();
    expect(
      within(region).getByText('Not quite. Read the explanation, then try again.'),
    ).toBeTruthy();
    expect(
      within(region).getByText("Use it for: a hint, and a learner's wrong answer"),
    ).toBeTruthy();
    expect(region.querySelector('[data-variant="body"]')).toBeTruthy();

    fireEvent.click(chip('loading'));
    expect(region.querySelector('[data-variant="loading"]')).toBeTruthy();
  });

  it('pauses and resumes every loader', async () => {
    const { container } = await openApp('/admin/mascot', admin);
    const pause = await screen.findByRole('button', { name: 'Pause animations' });
    fireEvent.click(pause);
    expect(pressed(pause)).toBe('true');
    expect(container.querySelectorAll('.g-mascot--paused')).toHaveLength(4);
    fireEvent.click(pause);
    expect(pressed(pause)).toBe('false');
    expect(container.querySelectorAll('.g-mascot--paused')).toHaveLength(0);
  });

  it('is for Admins only', async () => {
    await openApp('/admin/mascot', { roles: ['educator'] });
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1, name: 'Mascot' })).toBeNull();
  });
});
