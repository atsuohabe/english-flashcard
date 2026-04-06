const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const path = require('path');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } }
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 375,
    minHeight: 600,
    title: '英単語フラッシュカード',
    icon: path.join(__dirname, 'icon-512.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  win.setMenuBarVisibility(false);
  win.loadURL('app://localhost/index.html');
  return win;
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const filePath = path.join(__dirname, url.pathname);
    return net.fetch('file://' + filePath);
  });

  ipcMain.on('app:version', (event) => {
    event.returnValue = app.getVersion();
  });

  const win = createWindow();

  if (app.isPackaged) {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-downloaded', (info) => {
      win.webContents.executeJavaScript(`
        if (window.__showUpdateToast) {
          window.__showUpdateToast('${info.version}');
        }
      `).catch(() => {});
    });

    autoUpdater.on('error', (err) => {
      console.error('[updater] error:', err.message);
    });

    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 30_000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
