'use strict';

// Minimal, safe API for the main window's shell page (offline/recovery UI).
// The same preload also rides the external DSH web UI after redirect, so keep
// this surface deliberately tiny.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shell', {
  startBackend: () => ipcRenderer.invoke('backend-start'),
  backendUrl: () => ipcRenderer.invoke('backend-url'),
  openControl: () => ipcRenderer.invoke('open-control'),
  getLanguage: () => ipcRenderer.invoke('get-language'),
});
