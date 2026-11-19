import { describe, expect, it, vi } from 'vitest';
import { menuTemplate, type MenuItem } from '../src/menu';

const find = (items: MenuItem[], label: string): MenuItem | undefined =>
  items.flatMap((i) => [i, ...(i.submenu ?? [])]).find((i) => i.label === label);

describe('menuTemplate', () => {
  it('puts Check for updates… in the app menu on macOS, after About', () => {
    const check = vi.fn();
    const template = menuTemplate('darwin', check);
    const app = template[0] as MenuItem;
    expect(app.label).toBe('Gurukul Studio');
    expect(app.submenu?.slice(0, 2).map((i) => i.label)).toEqual([
      'About Gurukul Studio',
      'Check for updates…',
    ]);
    expect(app.submenu?.at(-1)).toEqual({ role: 'quit', label: 'Quit Gurukul Studio' });
    expect(template.slice(1).map((i) => i.role)).toEqual(['editMenu', 'viewMenu', 'windowMenu']);
    find(template, 'Check for updates…')?.click?.();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('puts it under Help on Windows and Linux', () => {
    const check = vi.fn();
    for (const platform of ['win32', 'linux']) {
      const template = menuTemplate(platform, check);
      expect(template.map((i) => i.role ?? i.label)).toEqual([
        'fileMenu',
        'editMenu',
        'viewMenu',
        'windowMenu',
        'Help',
      ]);
      find(template, 'Check for updates…')?.click?.();
    }
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('never names Claude Code', () => {
    expect(JSON.stringify(menuTemplate('darwin', () => undefined))).not.toMatch(/claude/i);
  });
});
