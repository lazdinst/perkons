const { app, BrowserWindow, ipcMain, globalShortcut, session } = require('electron');
const path = require('node:path');
let window;
const hotkeys = new Map();
const devURL = process.env.PERKONS_DEV === '1' ? 'http://127.0.0.1:5173' : null;
function trusted(contents) { return window && contents === window.webContents; }
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(trusted(contents) && permission === 'media' && details.mediaTypes?.every(type => type === 'audio'));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
    Boolean(trusted(contents) && permission === 'media' && details.mediaType === 'audio'));
  window = new BrowserWindow({ width: 1230, height: 820, minWidth: 960, minHeight: 680,
    backgroundColor: '#000000', title: 'Pērkons', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  ipcMain.handle('hotkeys:set', (event, entries) => {
    if (!trusted(event.sender) || event.senderFrame !== window.webContents.mainFrame || !Array.isArray(entries) || entries.length > 200) throw new Error('Invalid request');
    globalShortcut.unregisterAll(); hotkeys.clear();
    const failures = [];
    for (const entry of entries) {
      if (!entry || typeof entry.id !== 'string' || typeof entry.key !== 'string' || !/^(CommandOrControl|Control)\+Alt\+([1-9]|0|F([1-9]|1[0-2]))$/.test(entry.key)) continue;
      try {
        if (hotkeys.has(entry.key) || !globalShortcut.register(entry.key, () => window?.webContents.send('hotkey', entry.id))) failures.push(entry.key);
        else hotkeys.set(entry.key, entry.id);
      } catch { failures.push(entry.key); }
    }
    return failures;
  });
  if (devURL) window.loadURL(devURL); else window.loadFile(path.join(__dirname, '../dist/index.html'));
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => globalShortcut.unregisterAll());
