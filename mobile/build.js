"use strict";
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), www = path.join(root, "www");
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www);
for (const f of ["index.html", "style.css", "config.js", "bundle.js"]) fs.copyFileSync(path.join(root, "src", f), path.join(www, f));
fs.cpSync(path.join(root, "src", "fonts"), path.join(www, "fonts"), { recursive: true });
console.log("www готов");
