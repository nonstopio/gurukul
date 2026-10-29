import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ToastProvider } from '@gurukul/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '../src/routes';
import { axeViolations } from './axe';

async function openGallery() {
  const router = createMemoryRouter(appRoutes(), { initialEntries: ['/__ui'] });
  const view = render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  );
  await screen.findByRole('heading', { level: 1, name: 'Component gallery' });
  return { router, view };
}

describe('/__ui component gallery', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('renders every section without an axe violation', async () => {
    const { view } = await openGallery();
    for (const name of [
      'Button',
      'Chip',
      'Sidebar and top bar',
      'Video and certificate',
      'Pariksha',
      'Tables, lists and charts',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy();
    }
    expect(await axeViolations(view.container)).toEqual([]);
  });

  it('is not in a production build', () => {
    vi.stubEnv('DEV', false);
    const router = createMemoryRouter(appRoutes(), { initialEntries: ['/__ui'] });
    expect(router.state.matches.at(-1)?.route.path).toBe('*');
  });

  it('shows toasts, a dialog, a drawer and the palette', async () => {
    const user = userEvent.setup();
    await openGallery();
    await user.click(screen.getByRole('button', { name: 'Toast: danger' }));
    expect(await screen.findByText('A danger toast')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    const dialog = await screen.findByRole('dialog', { name: 'Example dialog' });
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: 'Open drawer' }));
    await user.click(await screen.findByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    await screen.findByRole('dialog', { name: 'Example dialog' });
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Open command palette' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Open command palette' }));
    await user.click(await screen.findByRole('option', { name: /Changelog/ }));
    expect(screen.getByText('Picked Changelog')).toBeTruthy();
  });

  it('lets the interactive examples change', async () => {
    const user = userEvent.setup();
    await openGallery();
    await user.click(screen.getByRole('button', { name: 'Advance' }));
    await user.click(screen.getByRole('switch', { name: 'Published' }));
    await user.click(screen.getByRole('radio', { name: /Sand/ }));
    await user.click(screen.getByRole('button', { name: /Split/ }));
    await user.click(screen.getByRole('radio', { name: /Answer in the idle state/ }));
    await user.click(screen.getByRole('radio', { name: /Answer in the idle state/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Ravi Menon' }));
    await user.click(screen.getByRole('checkbox', { name: /A checkbox answer/ }));
    await user.click(screen.getByRole('button', { name: 'Duplicate INTRO block' }));
    expect(screen.getByText('Duplicated')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Delete VIDEO block' }));
    expect(screen.getByText('Deleted')).toBeTruthy();
    const grip = screen.getByRole('button', { name: 'Move Intro' });
    grip.focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(screen.getAllByRole('button', { name: /^Move / })[0]?.getAttribute('aria-label')).toBe(
      'Move Basics',
    );
  });
});
