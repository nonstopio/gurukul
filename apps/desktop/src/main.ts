// The main process: Electron glue only. Everything it does is in app.ts, tested with fakes.
import { BrowserWindow, Menu, app, dialog, ipcMain, session, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import { main } from './app';
import { log } from './log';

void main({
  app,
  ipc: ipcMain,
  shell,
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
  log,
});
