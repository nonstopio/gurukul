// The preload: Electron glue only. The logic is in preloadApi.ts.
import { contextBridge, ipcRenderer } from 'electron';
import { buildBridge, listenVia, originsFromArgv, shouldExpose } from './preloadApi';

if (shouldExpose(window, originsFromArgv(process.argv))) {
  contextBridge.exposeInMainWorld(
    'gurukulDesktop',
    buildBridge((name, ...args) => ipcRenderer.invoke(name, ...args), listenVia(ipcRenderer)),
  );
}
