const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('perkons', {
  setHotkeys: entries => ipcRenderer.invoke('hotkeys:set', entries),
  onHotkey: callback => {
    const listener = (_event, id) => callback(id);
    ipcRenderer.on('hotkey', listener);
    return () => ipcRenderer.removeListener('hotkey', listener);
  }
});
