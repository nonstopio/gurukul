import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as ui from '@gurukul/ui';
import css from '@gurukul/ui/tokens.css?raw';
import { describe, expect, it, vi } from 'vitest';
import { TokenList } from '../src/design-system/DesignSystem';
import { EXAMPLES, SHOWN_ELSEWHERE } from '../src/design-system/examples';
import { groupTokens, parseTokens } from '../src/design-system/tokens';
import { axeViolations } from './axe';
import { openApp } from './harness';

// Vitest empties every CSS import, `?raw` included; the browser build gets the real file.
vi.mock('@gurukul/ui/tokens.css?raw', async () => {
  const { readFileSync } = await import('node:fs');
  return { default: readFileSync('../../packages/ui/src/tokens.css', 'utf8') };
});

const admin = { roles: ['admin'] as Array<'admin'> };

async function openSection(section?: string) {
  const query = section ? `&section=${section}` : '';
  const view = await openApp(`/admin/design-system${query ? `?${query.slice(1)}` : ''}`, {
    ...admin,
  });
  await screen.findByRole('tablist', { name: 'Design system sections' });
  return view;
}

describe('Design system: coverage of the package', () => {
  it('has an example for every component @gurukul/ui exports', () => {
    const components = Object.entries(ui)
      .filter(([name, value]) => /^[A-Z]/.test(name) && typeof value === 'function')
      .map(([name]) => name)
      .filter((name) => !name.endsWith('Icon') || name === 'Icon');
    const missing = components.filter((name) => !(name in EXAMPLES) && !(name in SHOWN_ELSEWHERE));
    expect(missing).toEqual([]);
    for (const [name, { rule }] of Object.entries(EXAMPLES)) {
      expect(name in ui, `${name} is not exported`).toBe(true);
      expect(rule.length).toBeGreaterThan(10);
    }
  });
});

describe('Design system: tokens', () => {
  it('reads every token of the first :root block, in file order, once', () => {
    const tokens = parseTokens(css);
    const declared = css.slice(0, css.indexOf('@media')).match(/^\s*--[\w-]+:/gm) ?? [];
    expect(tokens).toHaveLength(declared.length);
    expect(tokens[0]?.name).toBe('--g-green-50');
    expect(tokens.find((t) => t.name === '--dur-base')?.value).toBe('240ms');
    expect(tokens.find((t) => t.name === '--text-xs')?.value).toBe('0.75rem');
    expect(groupTokens(tokens).map((g) => g.label)).not.toContain('Other');
  });

  it('puts an unknown token in Other and reads nothing without a :root block', () => {
    expect(groupTokens(parseTokens(':root { --new-thing: 1px; /* note */ }'))).toEqual([
      { label: 'Other', sample: 'none', tokens: [{ name: '--new-thing', value: '1px' }] },
    ]);
    expect(parseTokens('.x { --a: 1; }')).toEqual([]);
  });

  it('lists a token with no sample by name and value', () => {
    render(<TokenList tokens={[{ name: '--new-thing', value: '1px' }]} sample="none" />);
    expect(screen.getByText('--new-thing')).toBeTruthy();
    expect(screen.getByText('1px')).toBeTruthy();
  });

  it('shows every group with live samples, filters them, and says when nothing matches', async () => {
    const user = userEvent.setup();
    const { container } = await openSection();
    expect(screen.getByRole('tab', { name: 'Tokens', selected: true })).toBeTruthy();
    for (const name of ['Surfaces, text and lines', 'Accent', 'Motion', 'Scale steps']) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
    const accent = screen.getByRole('region', { name: 'Accent' });
    expect(within(accent).getByText('--accent')).toBeTruthy();
    expect(within(accent).getByText('#0a6a46')).toBeTruthy();
    expect(screen.getByText('Roles, not scale steps')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);

    const total = parseTokens(css).length;
    const count = () =>
      within(screen.getByRole('group', { name: 'Filter tokens' })).getByRole('status');
    expect(count().textContent).toBe(`${total} of ${total}`);
    const filter = screen.getByLabelText('Filter tokens by name or value');
    await user.type(filter, '--radius');
    expect(count().textContent).toBe(`5 of ${total}`);
    expect(screen.queryByRole('region', { name: 'Accent' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect((filter as HTMLInputElement).value).toBe('');

    await user.type(filter, 'nothing-is-called-this');
    expect(screen.getByRole('heading', { name: 'No token matches' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show every token' }));
    expect(screen.getByRole('region', { name: 'Accent' })).toBeTruthy();
  });
});

describe('Design system: sections', () => {
  it('keeps the section in the URL beside the tab', async () => {
    const user = userEvent.setup();
    const { router } = await openSection('nonsense');
    expect(screen.getByRole('tab', { name: 'Tokens', selected: true })).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Type' }));
    expect(router.state.location.search).toBe('?section=type');
    expect(screen.getByRole('region', { name: 'Families' })).toBeTruthy();
  });

  it('shows the families, sizes, line heights and weights', async () => {
    const { container } = await openSection('type');
    for (const name of ['Families', 'Sizes', 'Line heights', 'Weights']) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
    expect(screen.getByText('--font-display')).toBeTruthy();
    expect(screen.getByText('--text-3xl')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows page anatomy, shell, states and forms', async () => {
    const { container } = await openSection('patterns');
    for (const name of ['Page anatomy', 'Shell', 'States', 'Forms', 'Not allowed']) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
    expect(screen.getByRole('rowheader', { name: 'FocusedShell' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Empty' })).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Design system: components', () => {
  it('shows one card per component with its rule, without an axe violation', async () => {
    const { container } = await openSection('components');
    for (const [name, { rule }] of Object.entries(EXAMPLES)) {
      const card = screen.getByRole('region', { name });
      expect(within(card).getByText(rule)).toBeTruthy();
    }
    expect(screen.getByText('MoreIcon')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('lets the search card example be typed in, filtered and cleared', async () => {
    const user = userEvent.setup();
    await openSection('components');
    const card = screen.getByRole('region', { name: 'SearchCard' });
    const field = within(card).getByRole('searchbox', { name: 'Search courses' });
    await user.type(field, 's');
    expect((field as HTMLInputElement).value).toBe('gits');
    await user.click(
      within(card).getByRole('button', { name: 'Remove filter: Level: Foundation' }),
    );
    expect(within(card).queryByText('Level: Foundation')).toBeNull();
    await user.selectOptions(within(card).getByLabelText('Level'), 'foundation');
    expect(within(card).getByText('Level: Foundation')).toBeTruthy();
    await user.click(within(card).getByRole('button', { name: 'Assigned to me' }));
    await user.click(within(card).getByRole('button', { name: 'Clear all filters' }));
    expect((field as HTMLInputElement).value).toBe('');
  });

  it('shows toasts, a dialog, a drawer and the palette', async () => {
    const user = userEvent.setup();
    await openSection('components');
    await user.click(screen.getByRole('button', { name: 'Toast: danger' }));
    expect(await screen.findByText('Could not reach the server')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await user.click(screen.getByRole('button', { name: 'Toast: success' }));
    expect(await screen.findByText('A success toast')).toBeTruthy();
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
    await openSection('components');
    const save = screen.getByRole('button', { name: 'Save example' });
    await user.click(save);
    expect(save.getAttribute('aria-busy')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Advance bar' }));
    await user.click(screen.getByRole('button', { name: 'Advance ring' }));
    await user.click(screen.getByRole('switch', { name: 'Published' }));
    await user.click(screen.getByRole('switch', { name: /Educator/ }));
    await user.click(screen.getByRole('radio', { name: /Sand/ }));
    await user.click(screen.getByRole('radio', { name: /Answer in the idle state/ }));
    await user.click(screen.getByRole('radio', { name: /Answer in the idle state/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Select all courses' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select all courses' }));
    await user.click(screen.getByRole('checkbox', { name: 'SQL' }));
    await user.click(screen.getByRole('checkbox', { name: 'SQL' }));
    await user.click(screen.getByRole('radio', { name: 'Choice B' }));
    await user.click(screen.getByRole('checkbox', { name: 'Mobile' }));
    await user.click(screen.getByRole('checkbox', { name: 'Platform' }));
    await user.click(screen.getByRole('checkbox', { name: 'Git, the NonStop Way' }));
    await user.click(screen.getByRole('checkbox', { name: 'Git, the NonStop Way' }));
    await user.click(screen.getByRole('checkbox', { name: /A checkbox answer/ }));
    await user.click(screen.getByRole('button', { name: /review-checklist/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Ravi Menon' }));
    const people = screen.getByRole('combobox', { name: 'Add people' });
    await user.type(people, 'mee');
    await user.click(await screen.findByRole('option', { name: /Meera Nair/ }));
    expect(screen.getByRole('button', { name: 'Remove Meera Nair' })).toBeTruthy();
    await user.type(people, 'guest@x.org{Enter}');
    expect(screen.getByRole('button', { name: 'Remove guest@x.org' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Duplicate TEXT block' }));
    expect(screen.getByText('Duplicated')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Delete VIDEO block' }));
    expect(screen.getByText('Deleted')).toBeTruthy();
    const grip = screen.getByRole('button', { name: 'Move Intro' });
    grip.focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(screen.getAllByRole('button', { name: /^Move / })[0]?.getAttribute('aria-label')).toBe(
      'Move Basics',
    );
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('button', { name: 'Preview' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('runs the menus and the filter bar', async () => {
    const user = userEvent.setup();
    await openSection('components');
    await user.click(screen.getByRole('button', { name: 'Course actions' }));
    await user.click(screen.getByRole('menuitem', { name: /Delete/ }));
    expect(screen.getByText('Delete chosen')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Example account: Asha Rao/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Profile' }));

    const bar = screen.getByRole('group', { name: 'Filter example people' });
    await user.type(within(bar).getByLabelText('Search people'), 'r');
    expect(within(bar).getByRole('status').textContent).toBe('3 of 3');
    await user.selectOptions(within(bar).getByLabelText('Person'), 'b');
    expect(within(bar).getByRole('status').textContent).toBe('1 of 3');
    await user.click(within(bar).getByRole('button', { name: 'Clear filters' }));
    expect(within(bar).getByRole('status').textContent).toBe('3 of 3');
  });
});
