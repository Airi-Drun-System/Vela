"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("velaPC", {
  version: process.argv.find((a) => a.startsWith("--vela-v="))?.slice(9) || "",
  onUpdate: (cb) => ipcRenderer.on("upd", (_e, o) => cb(o)),
  restart: () => ipcRenderer.send("upd-restart"),
  check: () => ipcRenderer.send("upd-check")
});
