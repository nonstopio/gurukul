// The main process: Electron glue only. Everything it does is in app.ts, tested with fakes.
import { BrowserWindow, Menu, app, dialog, ipcMain, net, session, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import os from 'node:os';
import path from 'node:path';
import { nodeAgentPlatform } from './agent/node';
import { main } from './app';
import { TEST_URL_VARIABLE } from './config';
import { googleClient } from './googleClient';
import { log } from './log';

void main({
  app,
  ipc: ipcMain,
  shell,
  dialog,
  session: () => session.defaultSession,
  createWindow: (options) => new BrowserWindow(options),
  windowCount: () => BrowserWindow.getAllWindows().length,
  preloadPath: path.join(app.getAppPath(), 'dist', 'preload.cjs'),
  platform: process.platform,
  timers: {
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    setInterval: (callback, ms) => setInterval(callback, ms).unref(),
  },
  updater: autoUpdater,
  showMessage: (message) => dialog.showMessageBox(message),
  setMenu: (template) => Menu.setApplicationMenu(Menu.buildFromTemplate(template)),
  fetch: (url, init) => net.fetch(url, init),
  // Replaced by string literals when bundled (scripts/bundle.ts): build-time, never the Educator's.
  googleClient: googleClient(
    process.env.GURUKUL_DESKTOP_GOOGLE_CLIENT_ID,
    process.env.GURUKUL_DESKTOP_GOOGLE_CLIENT_SECRET,
  ),
  agent: nodeAgentPlatform(process.platform, process.env, os.homedir()),
  // The end-to-end tests' own app; app.ts ignores it in a packaged build.
  testUrl: process.env[TEST_URL_VARIABLE],
  log,
});
