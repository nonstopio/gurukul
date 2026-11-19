/**
 * The application menu: the standard Edit, View and Window menus, plus "Check for updates…" where
 * each system expects it (the app menu on macOS, Help elsewhere). Plain data, so `main.ts` only
 * hands it to `Menu.buildFromTemplate`.
 */

/** The menu roles used here; each is one of Electron's own. */
export type MenuRole =
  | 'about'
  | 'services'
  | 'hide'
  | 'hideOthers'
  | 'unhide'
  | 'quit'
  | 'fileMenu'
  | 'editMenu'
  | 'viewMenu'
  | 'windowMenu';

/** One item of Electron's `MenuItemConstructorOptions`, as far as this menu uses it. */
export interface MenuItem {
  label?: string;
  role?: MenuRole;
  type?: 'separator';
  click?: () => void;
  submenu?: MenuItem[];
}

const APP_NAME = 'Gurukul Studio';
const separator: MenuItem = { type: 'separator' };

export function menuTemplate(platform: string, checkForUpdates: () => void): MenuItem[] {
  const check: MenuItem = { label: 'Check for updates…', click: checkForUpdates };
  if (platform === 'darwin') {
    return [
      {
        label: APP_NAME,
        submenu: [
          { role: 'about', label: `About ${APP_NAME}` },
          check,
          separator,
          { role: 'services' },
          separator,
          { role: 'hide', label: `Hide ${APP_NAME}` },
          { role: 'hideOthers' },
          { role: 'unhide' },
          separator,
          { role: 'quit', label: `Quit ${APP_NAME}` },
        ],
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ];
  }
  return [
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { label: 'Help', submenu: [check] },
  ];
}
