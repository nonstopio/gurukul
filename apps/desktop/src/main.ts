// The main process: Electron glue only. Everything it does is in app.ts, tested with fakes.
import { BrowserWindow, app, ipcMain, net, session, shell } from 'electron';
import path from 'node:path';
import { main } from './app';
import { googleClient } from './googleClient';
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
  timers: { setTimeout: (callback, ms) => setTimeout(callback, ms) },
  fetch: (url, init) => net.fetch(url, init),
  // Replaced by string literals when bundled (scripts/bundle.ts): build-time, never the Educator's.
  googleClient: googleClient(
    process.env.GURUKUL_DESKTOP_GOOGLE_CLIENT_ID,
    process.env.GURUKUL_DESKTOP_GOOGLE_CLIENT_SECRET,
  ),
  log,
});
