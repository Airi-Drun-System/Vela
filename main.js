"use strict";
const { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain } = require("electron");
const path = require("path");
if (!app.requestSingleInstanceLock()) app.quit();
if (process.platform === "win32") app.setAppUserModelId("com.vegasdev.vela");
let win = null, tray = null, quitting = false;
function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 380,
    minHeight: 500,
    backgroundColor: "#EDE8DF",
    title: "Vela",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, "preload.js"), additionalArguments: ["--vela-v=" + app.getVersion()] }
  });
  win.loadFile(path.join(__dirname, "src", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, p, cb) => cb(["media", "notifications", "clipboard-sanitized-write"].includes(p)));
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}
function makeTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "build", "icon.png")).resize({ width: 16, height: 16 }));
  tray.setToolTip("Vela");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Открыть Vela", click: () => {
      win.show();
      win.focus();
    } },
    { type: "separator" },
    { label: "Выйти из Vela", click: () => {
      quitting = true;
      app.quit();
    } }
  ]));
  tray.on("click", () => {
    win.show();
    win.focus();
  });
}
function updates() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoInstallOnAppQuit = true;
    const tell = (o) => win && win.webContents.send("upd", o);
    autoUpdater.on("update-available", (i) => tell({ s: "load", v: i.version, p: 0 }));
    autoUpdater.on("download-progress", (p) => tell({ s: "load", p: Math.round(p.percent) }));
    autoUpdater.on("update-downloaded", (i) => tell({ s: "ready", v: i.version }));
    autoUpdater.on("update-not-available", () => tell({ s: "none" }));
    autoUpdater.on("error", () => tell({ s: "err" }));
    ipcMain.on("upd-restart", () => { quitting = true; autoUpdater.quitAndInstall(); });
    ipcMain.on("upd-check", () => check());
    const check = () => autoUpdater.checkForUpdates().catch(() => {
    });
    setTimeout(check, 5e3);
    setInterval(check, 2 * 60 * 60 * 1e3);
  } catch {
  }
}
app.on("second-instance", () => {
  if (win) {
    win.show();
    win.focus();
  }
});
app.on("before-quit", () => {
  quitting = true;
});
app.whenReady().then(() => {
  createWindow();
  makeTray();
  updates();
});
