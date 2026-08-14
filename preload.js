'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('get-state'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  update: () => ipcRenderer.invoke('update'),
  backendStart: () => ipcRenderer.invoke('backend-start'),
  backendStop: () => ipcRenderer.invoke('backend-stop'),
  backendRestart: () => ipcRenderer.invoke('backend-restart'),
  pluginInstall: (spec) => ipcRenderer.invoke('plugin-install', spec),
  pluginRemove: (packageName) => ipcRenderer.invoke('plugin-remove', packageName),
  agentRun: (payload) => ipcRenderer.invoke('agent-run', payload),
  agentTeam: (payload) => ipcRenderer.invoke('agent-team', payload),
  agentList: () => ipcRenderer.invoke('agent-list'),
  agentSpawn: (payload) => ipcRenderer.invoke('agent-spawn', payload),
  agentAsk: (payload) => ipcRenderer.invoke('agent-ask', payload),
  agentStop: (payload) => ipcRenderer.invoke('agent-stop', payload),
  settingsGet: () => ipcRenderer.invoke('settings-get'),
  settingsSave: (entries) => ipcRenderer.invoke('settings-save', entries),
  setLanguage: (lang) => ipcRenderer.invoke('set-language', lang),
  updateCheck: () => ipcRenderer.invoke('update-check'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  onUpdateEvent: (cb) => ipcRenderer.on('update-event', (_event, payload) => cb(payload)),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openGitHub: () => ipcRenderer.invoke('open-github'),
  onLog: (cb) => ipcRenderer.on('log', (_event, line) => cb(line)),
});
