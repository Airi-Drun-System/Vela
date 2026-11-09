import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  doc,
  getDoc,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
  writeBatch
} from "firebase/firestore";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { countryStars } from "./shape.js";
import { dmId, isOnline, fmtTime, fmtDay, initials, hueOf, linkify } from "./lib.js";
if (Capacitor.isNativePlatform()) {
  let nid = 1;
  LocalNotifications.requestPermissions().catch(() => {
  });
  window.velaApp = { notify: ({ title, body }) => LocalNotifications.schedule({ notifications: [{ id: nid++, title, body, smallIcon: "ic_stat_vela" }] }).catch(() => {
  }) };
}
const $ = (id) => document.getElementById(id);
const VelaUpdate = Capacitor.registerPlugin("VelaUpdate");
const upd = { s: "", v: "", p: 0, url: "" };
function showUpd() {
  const b = $("upd");
  b.hidden = !["get", "load", "ready", "fail"].includes(upd.s);
  b.className = "upd " + upd.s;
  $("updBar").style.setProperty("--p", upd.p);
  $("updT").textContent = upd.s === "ready" ? "Обновление готово" : upd.s === "load" ? "Загружаю обновление" : upd.s === "fail" ? "Не скачалось" : "Вышла новая версия";
  $("updS").textContent = upd.s === "ready" ? "Нажми, чтобы перезапустить" : upd.s === "load" ? (upd.v ? upd.v + " · " : "") + upd.p + "%" : upd.s === "fail" ? "Нажми, чтобы попробовать ещё" : upd.v + " · нажми, чтобы обновить";
  if ($("verS")) $("verS").textContent = upd.s === "none" ? "Последняя версия" : upd.s === "chk" ? "Проверяю…" : upd.s ? "Есть обновление " + upd.v : "Проверить обновления";
}
const newer = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
let myVer = "";
async function checkUpd() {
  if (window.velaPC) { upd.s = "chk"; showUpd(); window.velaPC.check(); return; }
  if (!Capacitor.isNativePlatform()) return;
  upd.s = "chk"; showUpd();
  try {
    myVer = myVer || (await App.getInfo()).version;
    const r = await (await fetch("https://api.github.com/repos/Airi-Drun-System/Vela/releases/tags/android")).json();
    const v = (r.body || "").trim(), a = (r.assets || []).find((x) => x.name === "Vela-android.apk");
    if (a && /^\d+\.\d+\.\d+$/.test(v) && newer(v, myVer)) Object.assign(upd, { s: "get", v, url: a.browser_download_url });
    else upd.s = "none";
  } catch {
    upd.s = "";
  }
  showUpd();
}
$("upd").onclick = async () => {
  if (window.velaPC) { if (upd.s === "ready") window.velaPC.restart(); else if (upd.s === "fail") checkUpd(); return; }
  if (upd.s !== "get" && upd.s !== "fail") return;
  Object.assign(upd, { s: "load", p: 0 });
  showUpd();
  try {
    await VelaUpdate.install({ url: upd.url });
    upd.s = "get";
  } catch (e) {
    upd.s = e && e.message === "permission" ? "get" : "fail";
    if (upd.s === "get") toast("Разреши установку из Vela и нажми ещё раз");
  }
  showUpd();
};
if (window.velaPC) {
  myVer = window.velaPC.version;
  window.velaPC.onUpdate((o) => { if (o.s === "err") o.s = upd.s === "chk" ? "" : upd.s === "load" ? "fail" : upd.s; Object.assign(upd, o); showUpd(); });
} else if (Capacitor.isNativePlatform()) {
  VelaUpdate.addListener("progress", (o) => { upd.p = o.p; showUpd(); });
  setTimeout(checkUpd, 4e3);
  setInterval(checkUpd, 3 * 60 * 60 * 1e3);
  App.addListener("resume", () => { if (!upd.s || upd.s === "none") checkUpd(); });
}
const fb = initializeApp(window.VELA_CONFIG);
const auth = getAuth(fb);
setPersistence(auth, browserLocalPersistence).catch(() => {
});
const db = initializeFirestore(fb, { localCache: persistentLocalCache() });
let me = null;
const users = new Map();
const chats = new Map();
let cur = null;
let stopMsgs = null, msgLimit = 60, msgs = [], replyTo = null, editing = null;
const unsub = [];
const toast = (t) => {
  const el = $("toast");
  el.textContent = t;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => {
    el.hidden = true;
  }, 2600);
};
const nameOf = (uid) => (users.get(uid) || {}).name || "…";
const prevOf = (m) => m.text || (m.img ? "Фото" : m.voice ? "Голосовое" : m.file ? "Файл: " + m.file.name : m.call ? (m.call.video ? "Видеозвонок" : "Звонок") : "");
const sizeOf = (n) => n < 1024 ? n + " Б" : n < 1048576 ? (n / 1024).toFixed(0) + " КБ" : (n / 1048576).toFixed(1) + " МБ";
const avatar = (el, name, uid, online) => {
  const u = users.get(uid) || {};
  el.textContent = u.photo ? "" : initials(name);
  el.style.setProperty("--h", u.hue != null ? u.hue : hueOf(uid || name));
  el.style.backgroundImage = u.photo ? `url("${u.photo}")` : "";
  el.classList.toggle("pic", !!u.photo);
  el.classList.toggle("on", !!online);
};
let signUp = false;
function authMode(up) {
  signUp = up;
  $("tabIn").classList.toggle("on", !up);
  $("tabUp").classList.toggle("on", up);
  $("aName").hidden = $("aCode").hidden = !up;
  $("aName").required = $("aCode").required = up;
  $("aGo").textContent = up ? "Создать аккаунт" : "Войти";
  $("aPass").autocomplete = up ? "new-password" : "current-password";
  $("aErr").textContent = "";
}
$("tabIn").onclick = () => authMode(false);
if (Capacitor.isNativePlatform()) App.addListener("backButton", () => {
  if (!window.velaBack()) App.minimizeApp();
});
$("tabUp").onclick = () => authMode(true);
const AUTH_ERR = {
  "auth/invalid-credential": "Неверная почта или пароль",
  "auth/wrong-password": "Неверный пароль",
  "auth/user-not-found": "Такого аккаунта нет",
  "auth/email-already-in-use": "Эта почта уже занята — попробуй «Войти»",
  "auth/weak-password": "Пароль слишком короткий",
  "auth/invalid-email": "Почта написана с ошибкой",
  "auth/network-request-failed": "Нет интернета",
  "auth/too-many-requests": "Слишком много попыток, подожди немного"
};
$("authForm").onsubmit = async (e) => {
  e.preventDefault();
  $("aErr").textContent = "";
  $("aGo").disabled = true;
  const mail = $("aMail").value.trim(), pass = $("aPass").value;
  try {
    if (!signUp) {
      await signInWithEmailAndPassword(auth, mail, pass);
      return;
    }
    const name = $("aName").value.trim(), code = $("aCode").value.trim();
    if (!name) throw { code: "name" };
    const cred = await createUserWithEmailAndPassword(auth, mail, pass);
    try {
      await setDoc(doc(db, "users", cred.user.uid), { name, code, seen: serverTimestamp(), joined: serverTimestamp() });
    } catch {
      await cred.user.delete().catch(() => {
      });
      throw { code: "invite" };
    }
    startApp(cred.user);
  } catch (err) {
    $("aErr").textContent = err.code === "invite" ? "Код приглашения не подошёл" : err.code === "name" ? "Напиши ник" : AUTH_ERR[err.code] || "Не получилось, попробуй ещё раз";
  } finally {
    $("aGo").disabled = false;
  }
};
onAuthStateChanged(auth, (u) => {
  if (!u) {
    stopAll();
    $("app").hidden = true;
    $("auth").hidden = false;
    return;
  }
  startApp(u);
});
let started = null;
async function startApp(u) {
  if (started === u.uid) return;
  const snap = await getDoc(doc(db, "users", u.uid)).catch(() => null);
  if (!snap || !snap.exists()) {
    if (!signUp) {
      $("aErr").textContent = "Аккаунт не допущен в чат";
      signOut(auth);
    }
    return;
  }
  started = u.uid;
  me = { uid: u.uid, ...snap.data() };
  $("auth").hidden = true;
  $("app").hidden = false;
  unsub.push(onSnapshot(collection(db, "users"), (qs) => {
    qs.forEach((d) => users.set(d.id, { uid: d.id, ...d.data() }));
    me = users.get(me.uid) || me;
    renderMe();
    renderChats();
    renderHead();
    syncRoom();
  }));
  unsub.push(onSnapshot(query(collection(db, "chats"), where("members", "array-contains", me.uid)), (qs) => {
    qs.docChanges().forEach((ch) => {
      if (ch.type === "removed") return chats.delete(ch.doc.id);
      const c = { id: ch.doc.id, ...ch.doc.data() }, old = chats.get(c.id), l = c.last;
      chats.set(c.id, c);
      if (ch.type === "modified" && l && l.uid !== me.uid && l.ts && (!old || !old.last || !old.last.ts || l.ts.toMillis() > old.last.ts.toMillis()) && (document.hidden || !cur || cur.id !== c.id) && !mutes.includes(c.id)) notify({ uid: l.uid, text: (grp(c) ? c.name + ": " : "") + l.text });
    });
    renderChats();
    if (cur && chats.get(cur.id)) {
      cur = chats.get(cur.id);
      renderHead();
    }
    syncRoom();
  }));
  listenCalls();
  beat();
  setInterval(beat, 6e4);
  lock();
  whereAmI();
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {
  });
}
function stopAll() {
  unsub.splice(0).forEach((f) => f());
  if (stopMsgs) stopMsgs();
  started = null;
  cur = null;
}
const beat = () => {
  if (me && !document.hidden) updateDoc(doc(db, "users", me.uid), { seen: serverTimestamp() }).catch(() => {
  });
};
document.addEventListener("visibilitychange", () => {
  beat();
  if (!document.hidden) markRead();
});
function renderMe() {
  const el = $("me");
  el.innerHTML = '<div class="ava"></div><div><b></b><small></small></div>';
  avatar(el.querySelector(".ava"), me.name, me.uid, true);
  el.querySelector("b").textContent = me.name;
  el.querySelector("small").textContent = me.status || "Это ты · профиль";
  el.onclick = openSettings;
}
const LS = (k, d) => {
  try {
    const v = localStorage.getItem("vela." + k);
    return v == null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};
const setLS = (k, v) => {
  try {
    localStorage.setItem("vela." + k, JSON.stringify(v));
  } catch {
  }
};
const ACC = ["#FF4F1F", "#2FB7A4", "#3D7BFF", "#E8B321", "#E8436F", "#7FBF3F"];
const look = { acc: LS("acc", ACC[0]), theme: LS("theme", "glass"), size: LS("size", 16), bub: LS("bub", 22), stars: LS("stars", true), anim: LS("anim", "spring"), dots: LS("dots", "wave"), type: LS("type", "glow") };
function applyLook() {
  const r = document.documentElement.style;
  r.setProperty("--sig", look.acc);
  r.setProperty("--rad", look.bub + "px");
  r.fontSize = look.size + "px";
  document.body.style.fontSize = look.size + "px";
  document.body.classList.toggle("night", look.theme === "night");
  document.body.classList.toggle("glass", look.theme === "glass" || look.theme === "mono");
  document.body.classList.toggle("mono", look.theme === "mono");
  document.body.classList.toggle("calm", !look.stars);
  document.body.className = document.body.className.replace(/\b(ma|td|tt)-\w+/g, "").trim() + ` ma-${look.anim} td-${look.dots} tt-${look.type}`;
}
applyLook();
const sec = { pin: LS("pin", ""), lockHide: LS("lockHide", false), hideText: LS("hideText", false), where: LS("where", true) };
const place = { code: "", vpn: false, text: "" };
async function whereAmI() {
  if (!sec.where) {
    Object.assign(place, { code: "", vpn: false, text: "" });
    $("whereTxt").textContent = "Выключено";
    renderChats();
    return;
  }
  try {
    const get = (u) => fetch(u, { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null);
    const [a, b, c] = await Promise.all([get("https://api.ipapi.is/"), get("https://ipwho.is/"), get("https://api.country.is/")]);
    const loc = a && a.location || {};
    const code = String(loc.country_code || b && b.success !== false && b.country_code || c && c.country || "").toUpperCase();
    if (!code) throw 0;
    const name = new Intl.DisplayNames(["ru"], { type: "region" }).of(code);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "", ipTz = loc.timezone || b && b.timezone && b.timezone.id || "";
    const tzOff = ipTz && tz && ipTz.split("/")[0] !== tz.split("/")[0];
    const vpn = !!(a && (a.is_vpn || a.is_proxy || a.is_tor || a.is_datacenter) || b && b.security && (b.security.vpn || b.security.proxy || b.security.tor) || tzOff);
    shape = countryStars(code, 24);
    Object.assign(place, { code, vpn, text: vpn ? `Ты подключён через VPN: выход в стране ${name}` : `Ты сейчас: ${name}` });
  } catch {
    Object.assign(place, { code: "", vpn: false, text: "" });
  }
  $("whereTxt").textContent = place.text || "Не получилось определить";
  $("whereTxt").classList.toggle("vpn", place.vpn);
  renderChats();
}
const hash = async (pin) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("vela:" + (me ? me.uid : "") + ":" + pin)))].map((b) => b.toString(16).padStart(2, "0")).join("");
function lock() {
  if (!sec.pin) return;
  $("lock").hidden = false;
  $("lockIn").value = "";
  $("lockMsg").textContent = "Введи код";
  setTimeout(() => $("lockIn").focus(), 50);
}
let tries = 0;
$("lockIn").addEventListener("input", async () => {
  const v = $("lockIn").value;
  if (v.length < 4) return;
  if (await hash(v) === sec.pin) {
    $("lock").hidden = true;
    tries = 0;
    return;
  }
  if (v.length >= 8 || v.length === sec.len) {
    $("lockIn").classList.remove("bad");
    void $("lockIn").offsetWidth;
    $("lockIn").classList.add("bad");
    $("lockIn").value = "";
    if (++tries >= 5) $("lockMsg").textContent = "Много ошибок. Подожди и попробуй снова";
  }
});
$("lockOut").onclick = () => {
  setLS("pin", "");
  sec.pin = "";
  $("lock").hidden = true;
  signOut(auth);
};
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (sec.pin && sec.lockHide && Date.now() - hiddenAt > 3e4) lock();
});
let pPhoto = null, pHue = null;
function seg(id, val, on) {
  $(id).querySelectorAll("button").forEach((b) => {
    b.classList.toggle("on", String(b.dataset.v) === String(val));
    b.onclick = () => {
      on(b.dataset.v);
      seg(id, b.dataset.v, on);
    };
  });
}
function swatches(id, list, val, on) {
  const box = $(id);
  box.textContent = "";
  list.forEach((c) => {
    const b = document.createElement("button");
    b.style.background = typeof c === "number" ? `hsl(${c} 58% 46%)` : c;
    b.classList.toggle("on", c === val);
    b.setAttribute("aria-label", "Цвет");
    b.onclick = () => {
      on(c);
      swatches(id, list, c, on);
    };
    box.appendChild(b);
  });
}
function profAva() {
  const a = $("pAva").querySelector("span"), h = pHue != null ? pHue : hueOf(me.uid);
  $("pAva").style.setProperty("--h", h);
  $("pAva").style.backgroundImage = pPhoto ? `url("${pPhoto}")` : "";
  a.textContent = pPhoto ? "" : initials($("pName").value || me.name);
}
$("sVer").onclick = () => { if (upd.s === "get" || upd.s === "ready" || upd.s === "fail") { $("setDlg").hidden = true; $("upd").click(); } else checkUpd(); };
function openSettings() {
  if (!myVer && Capacitor.isNativePlatform()) App.getInfo().then((i) => { myVer = i.version; $("verN").textContent = myVer; }).catch(() => {});
  $("verN").textContent = myVer;
  showUpd();
  pPhoto = me.photo || null;
  pHue = me.hue != null ? me.hue : null;
  $("pName").value = me.name;
  $("pUser").value = me.username || "";
  $("pStatus").value = me.status || "";
  swatches("pHue", [12, 30, 48, 140, 172, 200, 225, 330, 0], pHue, (c) => {
    pHue = c;
    profAva();
  });
  profAva();
  swatches("oAcc", ACC, look.acc, (c) => {
    look.acc = c;
    setLS("acc", c);
    applyLook();
  });
  seg("oTheme", look.theme, (v) => {
    look.theme = v;
    setLS("theme", v);
    applyLook();
  });
  seg("oSize", look.size, (v) => {
    look.size = +v;
    setLS("size", +v);
    applyLook();
  });
  seg("oBub", look.bub, (v) => {
    look.bub = +v;
    setLS("bub", +v);
    applyLook();
  });
  for (const k of ["anim", "dots", "type"]) seg("o" + k[0].toUpperCase() + k.slice(1), look[k], (v) => {
    look[k] = v;
    setLS(k, v);
    applyLook();
    if (k === "dots") { $("tyB").hidden = false; $("tyWho").textContent = ""; clearTimeout(applyLook.t); applyLook.t = setTimeout(renderHead, 2500); }
  });
  $("oStars").checked = look.stars;
  $("sPin").checked = !!sec.pin;
  $("sLockHide").checked = sec.lockHide;
  $("sHideText").checked = sec.hideText;
  $("sWhere").checked = sec.where;
  $("setDlg").hidden = false;
}
$("setBtn").onclick = openSettings;
$("setX").onclick = () => {
  $("setDlg").hidden = true;
};
$("setDlg").onclick = (e) => {
  if (e.target === $("setDlg")) $("setDlg").hidden = true;
};
$("pName").oninput = profAva;
$("pPic").onchange = async () => {
  const f = $("pPic").files[0];
  $("pPic").value = "";
  if (!f) return;
  try {
    const bmp = await createImageBitmap(f).catch(() => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(f); }));
    const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, m = Math.min(w, h), c = document.createElement("canvas");
    c.width = c.height = 192;
    c.getContext("2d").drawImage(bmp, (w - m) / 2, (h - m) / 2, m, m, 0, 0, 192, 192);
    for (let q = 0.85; q >= 0.3; q -= 0.15) { pPhoto = c.toDataURL("image/jpeg", q); if (pPhoto.length < 70000) break; }
    profAva();
    await updateDoc(doc(db, "users", me.uid), { photo: pPhoto }).then(() => toast("Фото поставлено"), (e) => toast("Фото не сохранилось: " + (e.code || e.message)));
  } catch {
    toast("Это фото не открылось");
  }
};
$("pNoPic").onclick = () => {
  pPhoto = null;
  profAva();
};
$("pSave").onclick = async () => {
  const name = $("pName").value.trim().slice(0, 24);
  if (!name) {
    toast("Ник не может быть пустым");
    return;
  }
  const data = { name, status: $("pStatus").value.trim().slice(0, 70), photo: pPhoto || deleteField() };
  if (pHue != null) data.hue = pHue;
  const un = $("pUser").value.trim().toLowerCase().replace(/^@/, "");
  if (un && !/^[a-z0-9_]{4,24}$/.test(un)) { toast("Юзернейм: от 4 до 24 латинских букв, цифр и _"); return; }
  try {
    const b = writeBatch(db);
    if (un !== (me.username || "")) {
      if (un) {
        const taken = await getDoc(doc(db, "usernames", un));
        if (taken.exists() && taken.data().uid !== me.uid) { toast("@" + un + " уже занят"); return; }
        b.set(doc(db, "usernames", un), { uid: me.uid });
      }
      if (me.username) b.delete(doc(db, "usernames", me.username));
      data.username = un || deleteField();
    }
    b.update(doc(db, "users", me.uid), data);
    await b.commit();
    toast("Профиль сохранён");
  } catch (e) {
    toast("Не сохранилось: " + (e.code || e.message));
  }
};
$("oStars").onchange = () => {
  look.stars = $("oStars").checked;
  setLS("stars", look.stars);
  applyLook();
};
$("sPin").onchange = async () => {
  if (!$("sPin").checked) {
    sec.pin = "";
    setLS("pin", "");
    toast("Код выключен");
    return;
  }
  const a = prompt("Придумай код: 4–8 цифр");
  if (!a || !/^\d{4,8}$/.test(a)) {
    $("sPin").checked = false;
    toast("Код — от 4 до 8 цифр");
    return;
  }
  if (prompt("Повтори код") !== a) {
    $("sPin").checked = false;
    toast("Коды не совпали");
    return;
  }
  sec.pin = await hash(a);
  sec.len = a.length;
  setLS("pin", sec.pin);
  setLS("pinLen", a.length);
  toast("Код включён");
};
sec.len = LS("pinLen", 0);
$("sLockHide").onchange = () => {
  sec.lockHide = $("sLockHide").checked;
  setLS("lockHide", sec.lockHide);
};
$("sHideText").onchange = () => {
  sec.hideText = $("sHideText").checked;
  setLS("hideText", sec.hideText);
};
$("sWhere").onchange = () => {
  sec.where = $("sWhere").checked;
  setLS("where", sec.where);
  whereAmI();
};
$("sOut").onclick = () => {
  $("setDlg").hidden = true;
  signOut(auth);
};
const SKY = [[40, 96], [78, 58], [120, 38], [165, 52], [206, 28], [250, 46], [286, 78], [256, 110], [200, 120], [140, 104], [96, 122], [60, 130]];
const EDGES = [...SKY.map((_, i) => [i, (i + 1) % SKY.length]), [3, 9], [2, 10]];
let shape = null;
function drawSky(svg, people, pts = SKY, edges = EDGES) {
  const ns = "http://www.w3.org/2000/svg", mk = (t, a) => {
    const e = document.createElementNS(ns, t);
    for (const k in a) e.setAttribute(k, a[k]);
    return e;
  };
  svg.textContent = "";
  for (const [a, b] of edges) svg.appendChild(mk("line", { class: "edge", x1: pts[a][0], y1: pts[a][1], x2: pts[b][0], y2: pts[b][1] }));
  pts.forEach(([x, y], i) => {
    const p = people[i], g = mk("g", { class: "st" + (p && p.on ? " on" : "") + (p && p.me ? " me" : "") });
    if (p && p.on) g.appendChild(mk("circle", { class: "glow", cx: x, cy: y, r: 4 }));
    g.appendChild(mk("circle", { class: "core", cx: x, cy: y, r: p ? 4 : 2 }));
    if (p) {
      const t = mk("text", { x, y: y > 70 ? y + 15 : y - 9 });
      t.textContent = p.name.length > 9 ? p.name.slice(0, 8) + "…" : p.name;
      g.appendChild(t);
      if (p.me && place.code) {
        const f = mk("text", { class: "flag", x, y: y > 70 ? y + 25 : y - 19 });
        f.textContent = place.code + (place.vpn ? " · VPN" : "");
        g.appendChild(f);
      }
      const title = mk("title", {});
      title.textContent = p.me ? "Это ты" : p.name + (p.on ? " — в сети" : "");
      g.appendChild(title);
      if (p.f) {
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
        g.onclick = p.f;
        g.onkeydown = (e) => {
          if (e.key === "Enter") p.f();
        };
      }
    }
    svg.appendChild(g);
  });
}
function renderSky() {
  const people = [...users.values()].sort((a, b) => (a.joined && a.joined.toMillis() || 0) - (b.joined && b.joined.toMillis() || 0)).slice(0, 12).map((u) => ({ name: u.name, me: u.uid === me.uid, on: u.uid === me.uid || isOnline(u.seen), f: u.uid === me.uid ? null : () => openDm(u.uid) }));
  if (shape) {
    const slots = shape.map((_, i) => i).filter((i) => i % 2 === 0).concat(shape.map((_, i) => i).filter((i) => i % 2 === 1));
    const placed = [];
    people.forEach((p, k) => {
      placed[slots[k]] = p;
    });
    drawSky($("sky"), placed, shape, shape.map((_, i) => [i, (i + 1) % shape.length]));
  } else drawSky($("sky"), people);
  const on = people.filter((p) => p.on && !p.me).length;
  if (place.text) {
    $("skyNote").textContent = place.text;
    return;
  }
  $("skyNote").textContent = people.length < 2 ? "Пока тут только ты. Дай друзьям код приглашения." : on ? `В сети: ${on} из ${people.length - 1}. Нажми на звезду, чтобы написать` : "Сейчас никого. Нажми на звезду, чтобы написать";
}
drawSky($("authSky"), [0, 2, 4, 6, 9].reduce((a, i) => (a[i] = { name: "", on: true }, a), []));
const grp = (c) => !!(c && (c.public || c.group));
const chatTitle = (c) => grp(c) ? c.name : nameOf(c.members.find((m) => m !== me.uid) || me.uid);
const unread = (c) => c.last && c.last.uid !== me.uid && (!c.reads || !c.reads[me.uid] || c.reads[me.uid].toMillis() < (c.last.ts ? c.last.ts.toMillis() : 0));
function renderChats() {
  if (!me) return;
  if (!renderChats.done) { renderChats.done = 1; $("chats").classList.add("intro"); setTimeout(() => $("chats").classList.remove("intro"), 900); }
  renderSky();
  const q = $("q").value.trim().toLowerCase().replace(/^@/, "");
  const list = [...chats.values()].sort((a, b) => (pins.includes(b.id) - pins.includes(a.id)) || (b.last && b.last.ts ? b.last.ts.toMillis() : 0) - (a.last && a.last.ts ? a.last.ts.toMillis() : 0))
    .filter((c) => !q || chatTitle(c).toLowerCase().includes(q));
  const box = $("chats");
  box.textContent = "";
  if (q) {
    const people = [...users.values()].filter((u) => u.uid !== me.uid && (u.name.toLowerCase().includes(q) || (u.username || "").includes(q)));
    if (people.length) {
      const h = document.createElement("div"); h.className = "secT"; h.textContent = "Люди"; box.appendChild(h);
      for (const u of people) {
        const el = document.createElement("button");
        el.className = "ci";
        el.innerHTML = '<div class="ava"></div><div class="ciT"><b></b><small></small></div>';
        avatar(el.querySelector(".ava"), u.name, u.uid, isOnline(u.seen));
        el.querySelector("b").textContent = u.name;
        el.querySelector("small").textContent = u.username ? "@" + u.username : isOnline(u.seen) ? "в сети" : "был(а) " + fmtDay(u.seen);
        el.onclick = () => { $("q").value = ""; openDm(u.uid); };
        box.appendChild(el);
      }
    }
    if (list.length) { const h = document.createElement("div"); h.className = "secT"; h.textContent = "Чаты"; box.appendChild(h); }
    if (!list.length && !people.length) { const h = document.createElement("div"); h.className = "secT"; h.textContent = "Ничего не нашлось"; box.appendChild(h); }
  } else if (!list.length) {
    const h = document.createElement("div"); h.className = "secT"; h.textContent = "Чатов пока нет. Нажми на карандаш, чтобы написать кому-нибудь или создать группу"; box.appendChild(h);
  }
  for (const c of list) {
    const other = grp(c) ? null : users.get(c.members.find((m) => m !== me.uid));
    const el = document.createElement("button");
    el.className = "ci" + (cur && cur.id === c.id ? " sel" : "") + (unread(c) ? " new" : "");
    el.innerHTML = '<div class="ava"></div><div class="ciT"><b></b><small></small></div><span class="ciM"></span><i></i>';
    const ava = el.querySelector(".ava");
    if (grp(c)) grpAva(ava, c);
    else avatar(ava, chatTitle(c), other && other.uid, other && isOnline(other.seen));
    el.querySelector(".ciM").innerHTML = (mutes.includes(c.id) ? ICON.mute : "") + (pins.includes(c.id) ? ICON.pin : "");
    const vs = voiceOf(c);
    if (vs.length) {
      const v = document.createElement("div");
      v.className = "ciV" + (room && room.cid === c.id ? " me" : "");
      v.innerHTML = ICON.head;
      for (const x of vs.slice(0, 5)) { const a = document.createElement("div"); a.className = "ava"; avatar(a, nameOf(x.uid), x.uid, false); v.append(a); }
      v.append(vs.length > 5 ? "+" + (vs.length - 5) : "");
      el.querySelector(".ciT").append(v);
    }
    el.oncontextmenu = (e) => { e.preventDefault(); chatMenu(c, el); };
    let hold = 0;
    el.addEventListener("touchstart", () => { hold = setTimeout(() => { hold = -1; chatMenu(c, el); }, 450); }, { passive: true });
    el.addEventListener("touchend", (e) => { if (hold === -1) e.preventDefault(); clearTimeout(hold); });
    el.addEventListener("touchmove", () => clearTimeout(hold), { passive: true });
    el.querySelector("b").textContent = chatTitle(c);
    const l = c.last;
    el.querySelector("small").textContent = l ? (l.uid === me.uid ? "Ты: " : grp(c) ? nameOf(l.uid) + ": " : "") + l.text : grp(c) ? "Группа создана" : "Пока пусто";
    el.onclick = () => openChat(c.id);
    box.appendChild(el);
  }
}
$("q").addEventListener("input", renderChats);
$("q").addEventListener("keydown", (e) => { if (e.key === "Escape") { $("q").value = ""; renderChats(); } });
function newDm() {
  const others = [...users.values()].filter((u) => u.uid !== me.uid);
  sheet("Новый чат", others.length ? others.map((u) => ({ t: u.name, sub: (u.username ? "@" + u.username + " · " : "") + (isOnline(u.seen) ? "в сети" : "был(а) " + fmtDay(u.seen)), uid: u.uid, f: () => openDm(u.uid) })) : [{ t: "Пока ты тут один. Позови друзей и дай им код приглашения." }]);
}
function newGroup() {
  const others = [...users.values()].filter((u) => u.uid !== me.uid);
  if (!others.length) { toast("Сначала позови друзей"); return; }
  $("shTitle").textContent = "Новая группа";
  const body = $("shBody");
  body.innerHTML = '<input class="gname" id="gName" maxlength="40" placeholder="Название группы"><div class="gpick" id="gPick"></div><button class="main" id="gGo">Создать</button>';
  for (const u of others) {
    const l = document.createElement("label");
    l.innerHTML = '<input type="checkbox"><div class="ava"></div><div><b></b></div>';
    l.querySelector("input").value = u.uid;
    avatar(l.querySelector(".ava"), u.name, u.uid, isOnline(u.seen));
    l.querySelector("b").textContent = u.name;
    $("gPick").appendChild(l);
  }
  $("gGo").onclick = async () => {
    const name = $("gName").value.trim(), picked = [...$("gPick").querySelectorAll("input:checked")].map((i) => i.value);
    if (!name) { toast("Назови группу"); return; }
    if (!picked.length) { toast("Выбери хотя бы одного"); return; }
    try {
      const ref = await addDoc(collection(db, "chats"), { group: true, public: false, name, members: [me.uid, ...picked], owner: me.uid, created: serverTimestamp() });
      $("sheet").hidden = true;
      chats.set(ref.id, { id: ref.id, group: true, public: false, name, members: [me.uid, ...picked] });
      openChat(ref.id);
    } catch (e) { toast("Не создалась: " + (e.code || e.message)); }
  };
  $("sheet").hidden = false;
  $("gName").focus();
}
$("newDm").onclick = () => menu([{ t: "Новый чат", f: newDm }, { t: "Новая группа", f: newGroup }], $("newDm"));
async function openDm(uid) {
  const id = dmId(me.uid, uid);
  if (!chats.has(id)) {
    const members = [me.uid, uid].sort();
    await setDoc(doc(db, "chats", id), { public: false, members, created: serverTimestamp() }, { merge: true }).catch(() => {
    });
    chats.set(id, { id, public: false, members });
  }
  openChat(id);
}
function openChat(id) {
  const c = chats.get(id);
  if (!c) return;
  if (stopMsgs) stopMsgs();
  cur = c;
  msgs = [];
  shown = null;
  $("tyB").hidden = true;
  msgLimit = 60;
  setReply(null);
  editing = null;
  document.body.classList.add("inChat");
  $("emptyChat").hidden = true;
  $("chat").hidden = false;
  $("msgs").textContent = "";
  renderHead();
  renderChats();
  listen();
  if (innerWidth > 760) $("txt").focus();
}
function listen() {
  if (stopMsgs) stopMsgs();
  const q = query(collection(db, "chats", cur.id, "messages"), orderBy("ts", "desc"), limit(msgLimit));
  let first = true;
  stopMsgs = onSnapshot(q, (qs) => {
    const before = msgs.length ? msgs[msgs.length - 1].id : null;
    msgs = qs.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) })).reverse();
    renderMsgs(first);
    const last = msgs[msgs.length - 1];
    first = false;
    markRead();
  });
}
$("back").onclick = () => {
  document.body.classList.remove("inChat");
  if (stopMsgs) stopMsgs();
  stopMsgs = null;
  cur = null;
  renderChats();
};
let stick = true;
const toBottom = () => { if (stick) $("msgs").scrollTop = $("msgs").scrollHeight; };
new ResizeObserver(toBottom).observe($("msgs"));
$("msgs").addEventListener("load", toBottom, true);
$("msgs").addEventListener("scroll", () => {
  const b = $("msgs");
  stick = b.scrollHeight - b.scrollTop - b.clientHeight < 60;
  if ($("msgs").scrollTop < 40 && msgs.length >= msgLimit) {
    msgLimit += 60;
    keepScroll = $("msgs").scrollHeight;
    listen();
  }
});
let keepScroll = 0;
function renderHead() {
  if (!cur) return;
  const other = grp(cur) ? null : users.get(cur.members.find((m) => m !== me.uid));
  $("cName").textContent = chatTitle(cur);
  $("callBtn").hidden = $("vidBtn").hidden = grp(cur);
  const ava = $("cAva");
  ava.className = "ava" + (grp(cur) ? " grp" : "");
  if (grp(cur)) grpAva(ava, cur);
  else avatar(ava, chatTitle(cur), other && other.uid, other && isOnline(other.seen));
  const typing = Object.entries(cur.typing || {}).filter(([u, t]) => u !== me.uid && t && Date.now() - t.toMillis() < 6e3).map(([u]) => nameOf(u));
  $("cSub").classList.toggle("typing", typing.length > 0);
  const ty = $("tyB"), was = !ty.hidden;
  ty.hidden = !typing.length;
  $("tyWho").textContent = grp(cur) ? typing.join(", ") : "";
  if (typing.length && !was) { const b = $("msgs"); if (b.scrollHeight - b.scrollTop - b.clientHeight < 120) b.scrollTop = b.scrollHeight; }
  $("cSub").textContent = typing.length ? grp(cur) ? typing.join(", ") + " печата" + (typing.length > 1 ? "ют…" : "ет…") : "печатает…" : grp(cur) ? cur.members.length + " участник" + (cur.members.length % 10 === 1 && cur.members.length % 100 !== 11 ? "" : cur.members.length % 10 >= 2 && cur.members.length % 10 <= 4 && (cur.members.length % 100 < 10 || cur.members.length % 100 >= 20) ? "а" : "ов") + ", в сети " + cur.members.filter((u) => u === me.uid || users.get(u) && isOnline(users.get(u).seen)).length : other ? (isOnline(other.seen) ? "в сети" : "был(а) " + fmtDay(other.seen)) + (other.status ? " · " + other.status : "") : "";
}
setInterval(renderHead, 3e3);
const REACTS = ["❤️", "😂", "👍", "🔥", "😮", "😢"];
let shown = null;
function renderMsgs(jump) {
  const box = $("msgs");
  const first = !shown;
  if (first) shown = new Set();
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.textContent = "";
  let day = "", prev = null;
  const readBy = (m) => cur.reads && Object.entries(cur.reads).some(([u, t]) => u !== me.uid && t && m.ts && t.toMillis() >= m.ts.toMillis());
  for (const m of msgs) {
    const d = fmtDay(m.ts, true);
    if (d !== day) {
      day = d;
      const s = document.createElement("div");
      s.className = "day";
      s.textContent = d;
      box.appendChild(s);
      prev = null;
    }
    const mine = m.uid === me.uid, cont = prev && prev.uid === m.uid && m.ts && prev.ts && m.ts.toMillis() - prev.ts.toMillis() < 5 * 6e4;
    const el = document.createElement("div");
    el.className = "m" + (mine ? " mine" : "") + (cont ? " cont" : "");
    if (!shown.has(m.id)) {
      shown.add(m.id);
      const back = msgs.length - 1 - msgs.indexOf(m);
      if (!first) el.classList.add("in");
      else if (back < 14) { el.classList.add("in", "intro"); el.style.setProperty("--d", (13 - back) * 28 + "ms"); }
    }
    el.dataset.id = m.id;
    let html = "";
    if (!mine && grp(cur) && !cont) html += `<b class="who" style="--h:${hueOf(m.uid)}"></b>`;
    if (m.fwd) html += '<small class="fwd"></small>';
    if (m.reply) html += '<div class="q"><b></b><span></span></div>';
    if (m.file) html += '<button class="file"><i>' + ICON.file + '</i><span><b></b><small></small></span></button>';
    if (m.call) html += '<div class="callM ' + (m.call.miss ? "miss" : "") + '"><i>' + (m.call.video ? ICON.video : ICON.phone) + '</i><span><b></b><small></small></span></div>';
    if (m.img) html += '<img class="pic" alt="Фото" loading="lazy">';
    if (m.voice) html += '<audio class="voice" controls preload="none"></audio>';
    if (m.text) html += '<div class="t"></div>';
    html += '<span class="meta"></span>';
    el.innerHTML = '<div class="bub">' + html + "</div>";
    if (!mine && grp(cur) && !cont) el.querySelector(".who").textContent = nameOf(m.uid);
    if (m.reply) {
      el.querySelector(".q b").textContent = nameOf(m.reply.uid);
      el.querySelector(".q span").textContent = m.reply.text;
      el.querySelector(".q").onclick = () => jumpTo(m.reply.id);
    }
    if (m.img) {
      const i = el.querySelector(".pic");
      i.src = m.img;
      i.onclick = () => {
        $("viewImg").src = m.img;
        $("viewer").hidden = false;
      };
    }
    if (m.voice) el.querySelector(".voice").src = m.voice;
    if (m.fwd) el.querySelector(".fwd").textContent = "Переслано от " + nameOf(m.fwd);
    if (m.file) {
      el.querySelector(".file b").textContent = m.file.name;
      el.querySelector(".file small").textContent = sizeOf(m.file.size);
      el.querySelector(".file").onclick = (e) => openFile(m, e.currentTarget);
    }
    if (m.call) {
      el.querySelector(".callM b").textContent = (m.call.miss ? (mine ? "Отменённый " : "Пропущенный ") : mine ? "Исходящий " : "Входящий ") + (m.call.video ? "видеозвонок" : "звонок");
      el.querySelector(".callM small").textContent = m.call.miss ? "" : Math.floor(m.call.dur / 60) + ":" + String(m.call.dur % 60).padStart(2, "0");
      el.querySelector(".callM").onclick = () => startCall(mine ? cur.members.find((u) => u !== me.uid) : m.uid, m.call.video);
    }
    if (m.text) el.querySelector(".t").innerHTML = linkify(m.text);
    el.querySelector(".meta").textContent = (m.edited ? "изм. " : "") + fmtTime(m.ts) + (mine ? readBy(m) ? " ✓✓" : " ✓" : "");
    const re = Object.entries(m.re || {}).filter(([, u]) => u && u.length);
    if (re.length) {
      const r = document.createElement("div");
      r.className = "reacts";
      for (const [e, u] of re) {
        const b = document.createElement("button");
        b.className = u.includes(me.uid) ? "my" : "";
        b.textContent = e + " " + u.length;
        b.title = u.map(nameOf).join(", ");
        b.onclick = () => react(m, e);
        r.appendChild(b);
      }
      el.querySelector(".bub").appendChild(r);
    }
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      msgMenu(m, el);
    });
    let press = 0;
    el.addEventListener("touchstart", () => {
      press = setTimeout(() => msgMenu(m, el), 450);
    }, { passive: true });
    el.addEventListener("touchend", () => clearTimeout(press));
    el.addEventListener("touchmove", () => clearTimeout(press), { passive: true });
    el.addEventListener("dblclick", () => setReply(m));
    box.appendChild(el);
    prev = m;
  }
  if (!msgs.length) box.innerHTML = '<p class="none">Напиши первым</p>';
  if (keepScroll) {
    box.scrollTop = box.scrollHeight - keepScroll;
    keepScroll = 0;
  } else if (jump || atBottom) {
    box.scrollTop = box.scrollHeight;
    stick = true;
  }
}
function jumpTo(id) {
  const el = $("msgs").querySelector(`[data-id="${id}"]`);
  if (el) {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1200);
  }
}
function msgMenu(m, el) {
  const mine = m.uid === me.uid;
  const items = [{ react: true, f: (e) => react(m, e) }, { t: "Ответить", f: () => setReply(m) }];
  items.push({ t: "Переслать", f: () => forward(m) });
  if (m.text) items.push({ t: "Копировать", f: () => navigator.clipboard.writeText(m.text).then(() => toast("Скопировано")) });
  if (mine && m.text) items.push({ t: "Изменить", f: () => {
    editing = m;
    $("txt").value = m.text;
    grow();
    $("txt").focus();
    sendBtn();
    toast("Меняешь сообщение — Esc, чтобы отменить");
  } });
  if (mine) items.push({ t: "Удалить", bad: true, f: () => deleteDoc(doc(db, "chats", cur.id, "messages", m.id)).catch(() => toast("Не удалилось")) });
  menu(items, el.querySelector(".bub"));
}
function react(m, e) {
  const has = (m.re && m.re[e] || []).includes(me.uid);
  updateDoc(doc(db, "chats", cur.id, "messages", m.id), { ["re." + e]: has ? arrayRemove(me.uid) : arrayUnion(me.uid) }).catch(() => {
  });
}
function setReply(m) {
  replyTo = m;
  $("replyBar").hidden = !m;
  if (m) {
    $("rbWho").textContent = nameOf(m.uid);
    $("rbText").textContent = prevOf(m);
    $("txt").focus();
  }
}
$("rbX").onclick = () => setReply(null);
let readT = 0;
function markRead() {
  if (!cur || document.hidden || !msgs.length) return;
  const last = msgs[msgs.length - 1], r = cur.reads && cur.reads[me.uid];
  if (last.uid === me.uid || r && last.ts && r.toMillis() >= last.ts.toMillis()) return;
  clearTimeout(readT);
  readT = setTimeout(() => updateDoc(doc(db, "chats", cur.id), { ["reads." + me.uid]: serverTimestamp() }).catch(() => {
  }), 400);
}
const txt = $("txt");
const grow = () => {
  txt.style.height = "auto";
  txt.style.height = Math.min(txt.scrollHeight, 160) + "px";
};
const mir = $("tmir"), MS = 600;
let mirText = [], mirAt = [];
function syncMir() {
  const now = performance.now(), next = Array.from(txt.value);
  let a = 0;
  while (a < next.length && a < mirText.length && next[a] === mirText[a]) a++;
  let b = 0;
  while (b < next.length - a && b < mirText.length - a && next[next.length - 1 - b] === mirText[mirText.length - 1 - b]) b++;
  const born = next.length - a - b > 40 ? 0 : now;
  mirAt = [...mirAt.slice(0, a), ...next.slice(a, next.length - b).map(() => born), ...mirAt.slice(mirAt.length - b)];
  mirText = next;
  mir.textContent = "";
  let plain = "";
  next.forEach((ch, i) => {
    const age = now - mirAt[i];
    if (age >= MS || ch === "\n") { plain += ch; return; }
    if (plain) { mir.append(plain); plain = ""; }
    const s = document.createElement("span");
    s.className = "nc";
    s.textContent = ch;
    s.style.animationDelay = -age + "ms";
    s.style.setProperty("--h", (i * 37) % 360);
    mir.append(s);
  });
  mir.append(plain + "\u200b");
  mir.scrollTop = txt.scrollTop;
}
txt.addEventListener("scroll", () => { mir.scrollTop = txt.scrollTop; });
const sendBtn = () => {
  syncMir();
  const has = !!txt.value.trim();
  $("send").hidden = !has;
  $("mic").hidden = has;
};
let typingAt = 0;
txt.addEventListener("input", (e) => {
  grow();
  sendBtn();

  if (cur && Date.now() - typingAt > 3e3) {
    typingAt = Date.now();
    updateDoc(doc(db, "chats", cur.id), { ["typing." + me.uid]: serverTimestamp() }).catch(() => {
    });
  }
});
txt.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && innerWidth > 760) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
  if (e.key === "Escape") {
    if (editing) {
      editing = null;
      txt.value = "";
      grow();
      sendBtn();
    }
    setReply(null);
  }
});
$("composer").onsubmit = (e) => {
  e.preventDefault();
  const t = txt.value.trim();
  if (t) send({ text: t });
};
async function post(cid, msg) {
  msg = { uid: me.uid, text: "", ts: serverTimestamp(), ...msg };
  await addDoc(collection(db, "chats", cid, "messages"), msg);
  updateDoc(doc(db, "chats", cid), { last: { uid: me.uid, text: prevOf(msg).slice(0, 80), ts: serverTimestamp() }, ["reads." + me.uid]: serverTimestamp(), ["typing." + me.uid]: deleteField() }).catch(() => {
  });
}
async function send(data) {
  if (!cur) return;
  if (editing) {
    const m = editing;
    editing = null;
    txt.value = "";
    grow();
    sendBtn();
    if (data.text !== m.text) updateDoc(doc(db, "chats", cur.id, "messages", m.id), { text: data.text, edited: true }).catch(() => toast("Не изменилось"));
    return;
  }
  const msg = { uid: me.uid, text: "", ts: serverTimestamp(), ...data };
  if (replyTo) msg.reply = { id: replyTo.id, uid: replyTo.uid, text: prevOf(replyTo).slice(0, 120) };
  txt.value = "";
  grow();
  sendBtn();
  setReply(null);
  try {
    await post(cur.id, msg);
  } catch {
    toast("Не отправилось — проверь интернет");
    if (data.text) {
      txt.value = data.text;
      grow();
      sendBtn();
    }
  }
}
$("send").onclick = () => $("composer").requestSubmit();
$("pic").onchange = async () => {
  const f = $("pic").files[0];
  $("pic").value = "";
  if (!f) return;
  try {
    const bmp = await createImageBitmap(f);
    let s = Math.min(1, 1280 / Math.max(bmp.width, bmp.height)), url = "";
    for (let q = 0.82; ; q -= 0.12, s *= 0.85) {
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * s);
      c.height = Math.round(bmp.height * s);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      url = c.toDataURL("image/jpeg", Math.max(0.4, q));
      if (url.length < 7e5 || q < 0.3) break;
    }
    send({ img: url, text: txt.value.trim() });
  } catch {
    toast("Это фото не открылось");
  }
};
let rec = null;
$("mic").addEventListener("pointerdown", async (e) => {
  e.preventDefault();
  if (rec) return;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    toast("Нет доступа к микрофону");
    return;
  }
  const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "", audioBitsPerSecond: 32e3 });
  const parts = [], t0 = Date.now();
  rec = { mr, cancel: false, x: e.clientX };
  mr.ondataavailable = (d) => parts.push(d.data);
  mr.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    clearInterval(rec.iv);
    $("rec").hidden = true;
    const r = rec;
    rec = null;
    if (r.cancel || Date.now() - t0 < 600) return;
    const fr = new FileReader();
    fr.onload = () => send({ voice: fr.result });
    fr.readAsDataURL(new Blob(parts, { type: mr.mimeType || "audio/webm" }));
  };
  mr.start();
  $("rec").hidden = false;
  $("recT").textContent = "0:00";
  rec.iv = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1e3);
    $("recT").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    if (s >= 90) mr.stop();
  }, 250);
});
const recEnd = (cancel) => {
  if (rec && rec.mr.state === "recording") {
    rec.cancel = cancel;
    rec.mr.stop();
  }
};
addEventListener("pointerup", () => recEnd(false));
addEventListener("pointercancel", () => recEnd(true));
addEventListener("pointermove", (e) => {
  if (rec && Math.abs(e.clientX - rec.x) > 90) recEnd(true);
});
function notify(m) {
  if (sec.hideText) m = { uid: m.uid, text: "Новое сообщение" };
  if (window.velaApp && window.velaApp.notify) {
    window.velaApp.notify({ title: nameOf(m.uid), body: m.text });
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") new Notification(nameOf(m.uid), { body: m.text, silent: false });
}
function menu(items, anchor) {
  const box = $("menu");
  box.textContent = "";
  for (const it of items) {
    if (it.react) {
      const row = document.createElement("div");
      row.className = "rrow";
      for (const e of REACTS) {
        const b2 = document.createElement("button");
        b2.textContent = e;
        b2.onclick = () => {
          box.hidden = true;
          it.f(e);
        };
        row.appendChild(b2);
      }
      box.appendChild(row);
      continue;
    }
    const b = document.createElement("button");
    b.textContent = it.t;
    if (it.bad) b.className = "bad";
    b.onclick = () => {
      box.hidden = true;
      it.f();
    };
    box.appendChild(b);
  }
  box.hidden = false;
  const r = anchor.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
  box.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + "px";
  box.style.top = (r.bottom + h + 8 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + "px";
}
addEventListener("pointerdown", (e) => {
  if (!$("menu").hidden && !$("menu").contains(e.target)) $("menu").hidden = true;
});
function sheet(title, items) {
  $("shTitle").textContent = title;
  const body = $("shBody");
  body.textContent = "";
  for (const it of items) {
    const b = document.createElement("button");
    b.className = "shItem";
    b.innerHTML = it.uid ? '<div class="ava"></div><div><b></b><small></small></div>' : "<div><b></b></div>";
    if (it.uid) avatar(b.querySelector(".ava"), it.t, it.uid, it.sub === "в сети");
    b.querySelector("b").textContent = it.t;
    if (it.sub) b.querySelector("small").textContent = it.sub;
    if (it.f) b.onclick = () => {
      $("sheet").hidden = true;
      it.f();
    };
    body.appendChild(b);
  }
  $("sheet").hidden = false;
}
$("shX").onclick = () => {
  $("sheet").hidden = true;
};
$("sheet").onclick = (e) => {
  if (e.target === $("sheet")) $("sheet").hidden = true;
};
$("viewer").onclick = () => {
  $("viewer").hidden = true;
};
addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("menu").hidden = true;
    $("sheet").hidden = true;
    $("viewer").hidden = true;
    $("setDlg").hidden = true;
  }
});
window.velaBack = () => {
  if (!$("lock").hidden) return false;
  if (!$("viewer").hidden || !$("sheet").hidden || !$("menu").hidden || !$("setDlg").hidden) {
    $("viewer").hidden = $("sheet").hidden = $("menu").hidden = $("setDlg").hidden = true;
    return true;
  }
  if (document.body.classList.contains("inChat") && innerWidth <= 760) {
    $("back").click();
    return true;
  }
  return false;
};
authMode(false);
if (Capacitor.isNativePlatform()) App.addListener("backButton", () => {
  if (!window.velaBack()) App.minimizeApp();
});
const ICON = {
  pin: '<svg viewBox="0 0 24 24"><path d="M14 3l7 7-2 1-3-1-4 4 1 4-2 2-3.5-3.5L3 21l-.5-.5 4-4.5L3 12.5l2-2 4 1 4-4-1-3z"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M3 9h4l5-5v16l-5-5H3zm13.6 0L15 10.6l1.4 1.4-1.4 1.4 1.6 1.6 1.4-1.4 1.4 1.4 1.6-1.6-1.4-1.4 1.4-1.4L19.4 9 18 10.4z"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M6 2h8l6 6v14H6zm7 1.5V9h5.5zM8 13h8v2H8zm0 4h8v2H8z"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
  video: '<svg viewBox="0 0 24 24"><path d="M3 6h12a1 1 0 0 1 1 1v3.5l5-3.5v10l-5-3.5V17a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/></svg>',
  head: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h3v-8H5v-1a7 7 0 0 1 14 0v1h-3v8h3a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 4h16v12H7l-3 3z"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.9V4h-2v1.1A6 6 0 0 0 6 11v5l-2 2v1h16v-1z"/></svg>',
  add: '<svg viewBox="0 0 24 24"><path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2zm9 4c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M10 17l1.4 1.4L17.8 12l-6.4-6.4L10 7l3.6 3.6H3v2.8h10.6zM20 3h-8v2h8v14h-8v2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zm-7 9h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h-2v-2.1A7 7 0 0 1 5 12z"/></svg>',
  end: '<svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1a1 1 0 0 1-.56.9 11.5 11.5 0 0 0-2.66 1.85 1 1 0 0 1-1.41 0L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.49a1 1 0 0 1-1.41 0 11.3 11.3 0 0 0-2.67-1.85 1 1 0 0 1-.56-.9v-3.1A15 15 0 0 0 12 9z"/></svg>'
};
let pins = LS("pins", []), mutes = LS("mutes", []);
const toggleIn = (arr, k, id) => { const a = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]; setLS(k, a); return a; };
function grpAva(el, c) {
  el.className = "ava grp" + (c.photo ? " pic" : "");
  el.style.backgroundImage = c.photo ? `url("${c.photo}")` : "";
  el.innerHTML = c.photo ? "" : '<svg viewBox="0 0 24 24"><path d="M9 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm8 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM2 20c0-4 3-6 7-6s7 2 7 6zm15 0c0-2-.6-3.6-1.8-4.7C19 15.4 22 16.6 22 20z"/></svg>';
}
function chatMenu(c, el) {
  menu([
    { t: pins.includes(c.id) ? "Открепить" : "Закрепить", f: () => { pins = toggleIn(pins, "pins", c.id); renderChats(); } },
    { t: mutes.includes(c.id) ? "Включить звук" : "Без звука", f: () => { mutes = toggleIn(mutes, "mutes", c.id); renderChats(); } },
    { t: grp(c) ? "О группе" : "Профиль", f: () => openProfile(c) }
  ], el);
}
function forward(m) {
  const list = [...chats.values()];
  sheet("Переслать в…", list.map((c) => ({ t: chatTitle(c), f: async () => {
    const data = { fwd: m.fwd || m.uid };
    for (const k of ["text", "img", "voice", "file"]) if (m[k]) data[k] = m[k];
    try {
      await post(c.id, data);
      toast("Переслано: " + chatTitle(c));
    } catch {
      toast("Не переслалось");
    }
  } })));
}
async function cropPhoto(f) {
  const bmp = await createImageBitmap(f).catch(() => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(f); }));
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, m = Math.min(w, h), c = document.createElement("canvas");
  c.width = c.height = 192;
  c.getContext("2d").drawImage(bmp, (w - m) / 2, (h - m) / 2, m, m, 0, 0, 192, 192);
  let url = "";
  for (let q = 0.85; q >= 0.3; q -= 0.15) { url = c.toDataURL("image/jpeg", q); if (url.length < 70000) break; }
  return url;
}
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const actBtn = (icon, label, f, bad) => { const b = el("button", "pAct" + (bad ? " bad" : "")); b.innerHTML = icon; b.append(el("span", "", label)); b.onclick = f; return b; };
let profOf = null;
function openProfile(target) {
  profOf = target;
  const body = $("prBody");
  body.textContent = "";
  const top = el("div", "pTop"), ava = el("div", "ava big");
  top.append(ava);
  if (typeof target === "string") {
    const u = users.get(target) || { uid: target, name: "…" }, c = chats.get(dmId(me.uid, u.uid));
    avatar(ava, u.name, u.uid, isOnline(u.seen));
    top.append(el("h2", "", u.name), el("small", "pSub", u.uid === me.uid ? "это ты" : isOnline(u.seen) ? "в сети" : "был(а) " + fmtDay(u.seen)));
    body.append(top);
    if (u.uid !== me.uid) {
      const acts = el("div", "pActs");
      acts.append(actBtn(ICON.chat, "Написать", () => { $("prof").hidden = true; openDm(u.uid); }), actBtn(ICON.phone, "Звонок", () => { $("prof").hidden = true; startCall(u.uid, false); }), actBtn(ICON.video, "Видео", () => { $("prof").hidden = true; startCall(u.uid, true); }));
      if (c) acts.append(actBtn(mutes.includes(c.id) ? ICON.mute : ICON.bell, mutes.includes(c.id) ? "Без звука" : "Звук", () => { mutes = toggleIn(mutes, "mutes", c.id); renderChats(); openProfile(target); }));
      body.append(acts);
    }
    const info = el("div", "pInfo");
    if (u.username) { const r = el("button", "pRow"); r.append(el("b", "", "@" + u.username), el("small", "", "юзернейм · нажми, чтобы скопировать")); r.onclick = () => navigator.clipboard.writeText("@" + u.username).then(() => toast("Скопировано")); info.append(r); }
    if (u.status) { const r = el("div", "pRow"); r.append(el("b", "", u.status), el("small", "", "о себе")); info.append(r); }
    if (info.childNodes.length) body.append(info);
  } else {
    const c = chats.get(target.id) || target, owner = c.owner === me.uid;
    grpAva(ava, c);
    ava.classList.add("big", "edit");
    ava.title = "Сменить фото группы";
    ava.onclick = () => $("grpPic").click();
    top.append(el("h2", "", c.name), el("small", "pSub", c.members.length + " участн. · в сети " + c.members.filter((u) => u === me.uid || users.get(u) && isOnline(users.get(u).seen)).length));
    if (c.about) top.append(el("p", "pAbout", c.about));
    body.append(top);
    const acts = el("div", "pActs");
    acts.append(actBtn(mutes.includes(c.id) ? ICON.mute : ICON.bell, mutes.includes(c.id) ? "Без звука" : "Звук", () => { mutes = toggleIn(mutes, "mutes", c.id); renderChats(); openProfile(c); }));
    if (owner) acts.append(actBtn(ICON.add, "Добавить", () => addMembers(c)));
    acts.append(actBtn(ICON.out, "Выйти", () => leaveGroup(c), true));
    body.append(acts);
    const form = el("div", "pEdit");
    const nm = el("input", "gname"); nm.maxLength = 40; nm.value = c.name; nm.placeholder = "Название";
    const ab = el("textarea", "gname"); ab.maxLength = 200; ab.rows = 2; ab.value = c.about || ""; ab.placeholder = "Описание группы";
    const sv = el("button", "main", "Сохранить");
    sv.onclick = () => {
      const name = nm.value.trim();
      if (!name) return toast("Название пустое");
      updateDoc(doc(db, "chats", c.id), { name, about: ab.value.trim() }).then(() => toast("Сохранено"), (e) => toast("Не сохранилось: " + (e.code || e.message)));
    };
    form.append(nm, ab, sv);
    body.append(form);
    body.append(el("p", "secT", "Участники"));
    for (const uid of [...c.members].sort((a, b) => (b === c.owner) - (a === c.owner) || isOnline((users.get(b) || {}).seen) - isOnline((users.get(a) || {}).seen))) {
      const u = users.get(uid) || { uid, name: "…" }, r = el("div", "pMem"), a = el("div", "ava");
      avatar(a, u.name, uid, isOnline(u.seen));
      const t = el("div", "pMemT");
      t.append(el("b", "", u.name + (uid === me.uid ? " (ты)" : "")), el("small", "", isOnline(u.seen) ? "в сети" : "был(а) " + fmtDay(u.seen)));
      r.append(a, t);
      if (uid === c.owner) r.append(el("em", "", "владелец"));
      else if (owner) { const x = el("button", "icon pKick", "×"); x.title = "Удалить из группы"; x.onclick = (e) => { e.stopPropagation(); updateDoc(doc(db, "chats", c.id), { members: c.members.filter((m) => m !== uid) }).then(() => toast(u.name + " удалён(а)"), () => toast("Не получилось")); }; r.append(x); }
      if (uid !== me.uid) r.onclick = () => openProfile(uid);
      body.append(r);
    }
  }
  $("prof").hidden = false;
}
$("prX").onclick = () => { $("prof").hidden = true; profOf = null; };
$("prof").onclick = (e) => { if (e.target === $("prof")) $("prX").click(); };
$("cAva").onclick = $("cName").onclick = () => cur && openProfile(grp(cur) ? cur : cur.members.find((u) => u !== me.uid) || me.uid);
$("grpPic").onchange = async () => {
  const f = $("grpPic").files[0];
  $("grpPic").value = "";
  if (!f || !profOf || typeof profOf === "string") return;
  try {
    await updateDoc(doc(db, "chats", profOf.id), { photo: await cropPhoto(f) });
    toast("Фото группы обновлено");
  } catch (e) {
    toast("Не сохранилось: " + (e.code || e.message));
  }
};
function addMembers(c) {
  const others = [...users.values()].filter((u) => !c.members.includes(u.uid));
  if (!others.length) return toast("Все уже в группе");
  sheet("Добавить в группу", others.map((u) => ({ t: u.name, uid: u.uid, sub: u.username ? "@" + u.username : "", f: () => updateDoc(doc(db, "chats", c.id), { members: [...c.members, u.uid] }).then(() => toast(u.name + " в группе"), () => toast("Не получилось")) })));
}
function leaveGroup(c) {
  menu([{ t: "Точно выйти из «" + c.name + "»?", f: () => {} }, { t: "Выйти", bad: true, f: async () => {
    const rest = c.members.filter((m) => m !== me.uid), data = { members: rest };
    if (c.owner === me.uid && rest.length) data.owner = rest[0];
    try {
      await updateDoc(doc(db, "chats", c.id), data);
      $("prof").hidden = true;
      chats.delete(c.id);
      if (cur && cur.id === c.id) $("back").click();
      renderChats();
    } catch {
      toast("Не получилось выйти");
    }
  } }], document.querySelector(".pAct.bad"));
}
setInterval(() => { if (!$("prof").hidden && profOf) openProfile(typeof profOf === "string" ? profOf : chats.get(profOf.id) || profOf); }, 3e4);

const PART = 7e5;
$("file").onchange = async () => {
  const fs = [...$("file").files];
  $("file").value = "";
  for (const f of fs) await sendFile(f);
};
async function sendFile(f) {
  if (!cur) return;
  if (f.size > 20 * 1048576) return toast("«" + f.name + "» больше 20 МБ, не влезет");
  const cid = cur.id, bar = $("upBar");
  try {
    const b64 = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = no; r.readAsDataURL(f); });
    const n = Math.max(1, Math.ceil(b64.length / PART)), ref = doc(collection(db, "chats", cid, "files"));
    const meta = { name: f.name.slice(0, 120), size: f.size, type: (f.type || "").slice(0, 100) };
    bar.hidden = false;
    $("upName").textContent = meta.name;
    await setDoc(ref, { uid: me.uid, ...meta, n, ts: serverTimestamp() });
    for (let i = 0; i < n; i++) {
      $("upFill").style.width = Math.round(i / n * 100) + "%";
      await setDoc(doc(ref, "parts", String(i).padStart(3, "0")), { d: b64.slice(i * PART, (i + 1) * PART) });
    }
    $("upFill").style.width = "100%";
    await post(cid, { file: { id: ref.id, ...meta } });
  } catch (e) {
    toast("Файл не отправился: " + (e.code || e.message));
  } finally {
    bar.hidden = true;
  }
}
async function openFile(m, btn) {
  if (btn.classList.contains("busy")) return;
  btn.classList.add("busy");
  try {
    const qs = await getDocs(collection(db, "chats", cur.id, "files", m.file.id, "parts"));
    const b64 = qs.docs.sort((a, b) => a.id.localeCompare(b.id)).map((d) => d.data().d).join("");
    if (Capacitor.isNativePlatform()) {
      await VelaUpdate.openFile({ name: m.file.name, type: m.file.type || "application/octet-stream", data: b64 });
    } else {
      const bin = atob(b64), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const a = el("a");
      a.href = URL.createObjectURL(new Blob([u8], { type: m.file.type || "application/octet-stream" }));
      a.download = m.file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 6e4);
    }
  } catch (e) {
    toast("Не открылся: " + (e.code || e.message));
  } finally {
    btn.classList.remove("busy");
  }
}
$("composer").addEventListener("dragover", (e) => e.preventDefault());
$("chat").addEventListener("drop", (e) => { e.preventDefault(); [...e.dataTransfer.files].reduce((p, f) => p.then(() => sendFile(f)), Promise.resolve()); });
$("chat").addEventListener("dragover", (e) => e.preventDefault());

const ring = { ctx: null, t: 0 };
function ringStart(out) {
  ringStop();
  try {
    ring.ctx = new AudioContext();
    const beep = () => {
      const t = ring.ctx.currentTime;
      for (const [f, d] of out ? [[425, 0]] : [[660, 0], [880, .18], [660, .36], [880, .54]]) {
        const o = ring.ctx.createOscillator(), g = ring.ctx.createGain();
        o.frequency.value = f;
        o.type = "sine";
        g.gain.setValueAtTime(0, t + d);
        g.gain.linearRampToValueAtTime(out ? .08 : .14, t + d + .02);
        g.gain.setValueAtTime(out ? .08 : .14, t + d + (out ? 1 : .15));
        g.gain.linearRampToValueAtTime(0, t + d + (out ? 1.05 : .17));
        o.connect(g).connect(ring.ctx.destination);
        o.start(t + d);
        o.stop(t + d + 1.1);
      }
    };
    beep();
    ring.t = setInterval(beep, out ? 4e3 : 2e3);
  } catch {}
  if (!out && navigator.vibrate) navigator.vibrate([400, 300, 400, 300, 400]);
}
function ringStop() {
  clearInterval(ring.t);
  if (ring.ctx) ring.ctx.close().catch(() => {});
  ring.ctx = null;
  if (navigator.vibrate) navigator.vibrate(0);
}
const ICE = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }] };
const canScreen = !Capacitor.isNativePlatform() && !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
let room = null, call = null;
const voiceOf = (c) => Object.entries((c && c.voice) || {}).filter(([u, v]) => v && users.get(u) && (u === me.uid || isOnline(users.get(u).seen))).map(([u, v]) => ({ uid: u, ...v }));
const setVoice = (cid, v) => updateDoc(doc(db, "chats", cid), { ["voice." + me.uid]: v }).catch(() => {});
const myVoice = () => ({ t: serverTimestamp(), mic: room.mic, cam: !!room.local.getVideoTracks().length, scr: room.screen ? room.screen.id : "" });
async function joinRoom(cid, video) {
  if (room && room.cid === cid) { room.min = false; return renderRoom(); }
  if (room) leaveRoom();
  let local;
  try {
    local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false });
  } catch {
    toast(video ? "Нет доступа к камере или микрофону" : "Нет доступа к микрофону");
    return false;
  }
  room = { cid, local, screen: null, mic: true, min: false, peers: new Map(), since: Date.now(), media: new Map(), unsub: [] };
  room.unsub.push(onSnapshot(query(collection(db, "chats", cid, "sig"), where("to", "==", me.uid)), (qs) => qs.docChanges().forEach((ch) => { if (ch.type === "added") onSig(ch.doc); }), () => {}));
  await setVoice(cid, myVoice());
  if (chats.get(cid)) chats.get(cid).voice = { ...(chats.get(cid).voice || {}), [me.uid]: myVoice() };
  syncRoom();
  return true;
}
function leaveRoom() {
  if (!room) return;
  const r = room;
  room = null;
  r.unsub.forEach((f) => f());
  r.peers.forEach((p) => p.pc.close());
  r.local.getTracks().forEach((t) => t.stop());
  if (r.screen) r.screen.getTracks().forEach((t) => t.stop());
  updateDoc(doc(db, "chats", r.cid), { ["voice." + me.uid]: deleteField() }).catch(() => {});
  if (call && call.cid === r.cid) endCall();
  renderRoom();
  renderChats();
}
function syncRoom() {
  if (!room) return;
  const c = chats.get(room.cid);
  const here = new Set(voiceOf(c).map((v) => v.uid));
  here.forEach((u) => { if (u !== me.uid && !room.peers.has(u)) makePeer(u); });
  room.peers.forEach((p, u) => { if (!here.has(u)) { p.pc.close(); room.peers.delete(u); } });
  if (call && call.cid === room.cid) {
    if (here.has(call.peer) && !call.t0) { call.t0 = Date.now(); call.state = "live"; room.min = false; ringStop(); callUI(); }
    else if (call.t0 && !here.has(call.peer)) return leaveRoom();
  }
  renderRoom();
}
function makePeer(u) {
  const pc = new RTCPeerConnection(ICE), p = { pc, polite: me.uid > u, making: false, ignore: false, streams: new Map() };
  room.peers.set(u, p);
  room.local.getTracks().forEach((t) => pc.addTrack(t, room.local));
  if (room.screen) room.screen.getTracks().forEach((t) => pc.addTrack(t, room.screen));
  const cid = room.cid;
  const sig = (d) => addDoc(collection(db, "chats", cid, "sig"), { from: me.uid, to: u, d: JSON.stringify(d), ts: serverTimestamp() }).catch(() => {});
  p.sig = sig;
  pc.onnegotiationneeded = async () => {
    try {
      p.making = true;
      await pc.setLocalDescription();
      sig({ desc: pc.localDescription });
    } catch {} finally { p.making = false; }
  };
  pc.onicecandidate = (e) => { if (e.candidate) sig({ cand: e.candidate }); };
  pc.ontrack = (e) => {
    const s = e.streams[0] || new MediaStream([e.track]);
    p.streams.set(s.id, s);
    s.onremovetrack = () => { if (!s.getTracks().length) p.streams.delete(s.id); renderRoom(); };
    e.track.onended = () => renderRoom();
    renderRoom();
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") pc.restartIce();
    renderRoom();
  };
  return p;
}
async function onSig(s) {
  const d = s.data();
  deleteDoc(s.ref).catch(() => {});
  if (!room || !d.ts || d.ts.toMillis() < room.since - 15e3) return;
  let msg;
  try { msg = JSON.parse(d.d); } catch { return; }
  const p = room.peers.get(d.from) || makePeer(d.from);
  const pc = p.pc;
  try {
    if (msg.desc) {
      const collide = msg.desc.type === "offer" && (p.making || pc.signalingState !== "stable");
      p.ignore = !p.polite && collide;
      if (p.ignore) return;
      await pc.setRemoteDescription(msg.desc);
      if (msg.desc.type === "offer") {
        await pc.setLocalDescription();
        p.sig({ desc: pc.localDescription });
      }
    } else if (msg.cand) {
      try { await pc.addIceCandidate(msg.cand); } catch (e) { if (!p.ignore) throw e; }
    }
  } catch {}
}
function eachPc(f) { if (room) room.peers.forEach((p) => f(p.pc)); }
function dropTrack(t) { eachPc((pc) => pc.getSenders().forEach((s) => { if (s.track === t) pc.removeTrack(s); })); t.stop(); }
function toggleMic() {
  if (!room) return;
  room.mic = !room.mic;
  room.local.getAudioTracks().forEach((t) => (t.enabled = room.mic));
  setVoice(room.cid, myVoice());
  renderRoom();
}
async function toggleCam() {
  if (!room) return;
  const v = room.local.getVideoTracks()[0];
  if (v) {
    room.local.removeTrack(v);
    dropTrack(v);
  } else {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } });
      const t = s.getVideoTracks()[0];
      room.local.addTrack(t);
      eachPc((pc) => pc.addTrack(t, room.local));
    } catch {
      return toast("Нет доступа к камере");
    }
  }
  setVoice(room.cid, myVoice());
  renderRoom();
}
async function toggleScreen() {
  if (!room) return;
  if (room.screen) {
    const s = room.screen;
    room.screen = null;
    s.getTracks().forEach(dropTrack);
  } else {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 }, width: { ideal: 1920 } }, audio: true });
      room.screen = s;
      s.getTracks().forEach((t) => { eachPc((pc) => pc.addTrack(t, s)); t.onended = () => { if (room && room.screen === s) toggleScreen(); }; });
    } catch {
      return;
    }
  }
  setVoice(room.cid, myVoice());
  renderRoom();
}
const ac = { ctx: null, an: new Map() };
function level(key, stream) {
  if (!stream.getAudioTracks().length) return 0;
  try {
    ac.ctx = ac.ctx || new AudioContext();
    let a = ac.an.get(key);
    if (!a || a.stream !== stream) {
      const n = ac.ctx.createAnalyser();
      n.fftSize = 512;
      ac.ctx.createMediaStreamSource(stream).connect(n);
      a = { n, stream, buf: new Uint8Array(n.fftSize) };
      ac.an.set(key, a);
    }
    a.n.getByteTimeDomainData(a.buf);
    let sum = 0;
    for (const v of a.buf) sum += (v - 128) * (v - 128);
    return Math.sqrt(sum / a.buf.length);
  } catch {
    return 0;
  }
}
setInterval(() => {
  if (!room || room.min) return;
  document.querySelectorAll("#rGrid .tile[data-uid]").forEach((t) => {
    const u = t.dataset.uid, p = room.peers.get(u);
    const st = u === me.uid ? (room.mic ? room.local : null) : p && [...p.streams.values()].find((s) => s.getAudioTracks().length && !(room.scrOf || {})[s.id]);
    t.classList.toggle("talk", !!st && level(u, st) > 6);
  });
}, 120);
function mediaEl(key, stream, kind) {
  let e = room.media.get(key);
  if (!e || e.srcObject !== stream) {
    e = document.createElement(kind);
    e.autoplay = true;
    e.playsInline = true;
    if (kind === "video") e.muted = true;
    e.srcObject = stream;
    room.media.set(key, e);
  }
  return e;
}
function renderRoom() {
  const box = $("room"), bar = $("vbar");
  if (!room) { box.hidden = true; bar.hidden = true; $("rAudio").textContent = ""; return; }
  const c = chats.get(room.cid) || { id: room.cid, members: [], name: "" }, vs = voiceOf(c);
  box.hidden = room.min;
  bar.hidden = !room.min;
  $("vbName").textContent = chatTitle(c);
  $("vbCount").textContent = vs.length + " в комнате";
  $("vbMic").classList.toggle("off", !room.mic);
  $("rTitle").textContent = chatTitle(c);
  $("rSub").textContent = vs.length === 1 ? "Ты тут один — позови остальных" : vs.length + " в голосовом";
  $("rMic").classList.toggle("off", !room.mic);
  $("rCam").classList.toggle("on", !!room.local.getVideoTracks().length);
  $("rScr").classList.toggle("on", !!room.screen);
  $("rScr").hidden = !canScreen;
  room.scrOf = {};
  vs.forEach((v) => { if (v.scr) room.scrOf[v.scr] = v.uid; });
  const keep = new Set(), audio = $("rAudio"), grid = $("rGrid");
  grid.textContent = "";
  const screens = [];
  if (room.screen) screens.push({ uid: me.uid, key: "scr-me", s: room.screen });
  room.peers.forEach((p, u) => p.streams.forEach((s) => {
    if (s.getAudioTracks().length) { const a = mediaEl("a-" + s.id, s, "audio"); keep.add("a-" + s.id); if (a.parentNode !== audio) audio.append(a); }
    if (room.scrOf[s.id] === u && s.getVideoTracks().length) screens.push({ uid: u, key: "v-" + s.id, s });
  }));
  for (const sc of screens) {
    const t = el("div", "tile screen"), v = mediaEl(sc.key, sc.s, "video");
    keep.add(sc.key);
    t.append(v, el("span", "tName", (sc.uid === me.uid ? "Твой экран" : "Экран: " + nameOf(sc.uid))));
    t.onclick = () => t.classList.toggle("focus");
    grid.append(t);
    v.play().catch(() => {});
  }
  for (const v of vs) {
    const t = el("div", "tile"), a = el("div", "ava big");
    t.dataset.uid = v.uid;
    avatar(a, nameOf(v.uid), v.uid, false);
    let cam = null;
    if (v.uid === me.uid) cam = room.local.getVideoTracks().length ? room.local : null;
    else { const p = room.peers.get(v.uid); if (p) cam = [...p.streams.values()].find((s) => s.getVideoTracks().some((x) => x.readyState === "live") && room.scrOf[s.id] !== v.uid) || null; }
    t.append(a);
    if (cam) { const key = v.uid === me.uid ? "cam-me" : "v-" + cam.id, e = mediaEl(key, cam, "video"); keep.add(key); t.append(e); t.classList.add("cam"); if (v.uid === me.uid) e.classList.add("mirror"); e.play().catch(() => {}); }
    const p = room.peers.get(v.uid), st = p ? p.pc.connectionState : "";
    t.append(el("span", "tName", nameOf(v.uid) + (v.uid === me.uid ? " (ты)" : "") + (st && st !== "connected" ? " · " + (st === "failed" ? "нет связи" : "подключаю…") : "")));
    if (v.mic === false) { const m = el("i", "tMute"); m.innerHTML = ICON.mic; t.append(m); }
    grid.append(t);
  }
  grid.dataset.n = grid.children.length;
  room.media.forEach((e, k) => { if (!keep.has(k) && k !== "cam-me" && k !== "scr-me") { e.remove(); room.media.delete(k); } });
}
$("rMic").onclick = $("vbMic").onclick = toggleMic;
$("rCam").onclick = toggleCam;
$("rScr").onclick = toggleScreen;
$("rLeave").onclick = $("vbLeave").onclick = leaveRoom;
$("rMin").onclick = () => { if (room) { room.min = true; renderRoom(); } };
$("vbOpen").onclick = () => { if (room) { room.min = false; renderRoom(); } };
$("roomBtn").onclick = () => cur && joinRoom(cur.id, false);
async function ensureDm(uid) {
  const cid = dmId(me.uid, uid);
  if (!chats.has(cid)) {
    await setDoc(doc(db, "chats", cid), { public: false, members: [me.uid, uid].sort(), created: serverTimestamp() }, { merge: true });
    chats.set(cid, { id: cid, public: false, members: [me.uid, uid].sort() });
  }
  return cid;
}
function callUI() {
  const box = $("call");
  if (!call || call.state === "live") { box.hidden = true; return; }
  const u = users.get(call.peer) || { name: "…" };
  box.hidden = false;
  box.className = "call" + (call.out ? "" : " inc");
  avatar($("callAva"), u.name, call.peer, false);
  $("callName").textContent = u.name;
  $("callSt").textContent = call.out ? (call.video ? "Видеозвонок…" : "Звоню…") : call.video ? "Входящий видеозвонок" : "Входящий звонок";
  $("cOk").hidden = call.out;
}
async function startCall(uid, video) {
  if (call) return toast("Ты уже в звонке");
  if (!uid || uid === me.uid) return;
  try {
    const cid = await ensureDm(uid), ref = doc(collection(db, "calls"));
    call = { ref, cid, peer: uid, video, out: true, state: "ring", unsub: [] };
    callUI();
    ringStart(true);
    await setDoc(ref, { from: me.uid, to: uid, video, state: "ring", ts: serverTimestamp() });
    if (!await joinRoom(cid, video)) return endCall("cancel");
    room.min = true;
    renderRoom();
    call.unsub.push(onSnapshot(ref, (s) => {
      const d = s.data();
      if (!d || !call) return;
      if (d.state === "decline") { toast("Звонок отклонён"); leaveRoom(); }
      if (d.state === "busy") { toast("Занято"); leaveRoom(); }
    }));
    call.timer = setTimeout(() => { if (call && !call.t0) { updateDoc(ref, { state: "miss" }).catch(() => {}); leaveRoom(); } }, 45e3);
  } catch (e) {
    toast("Не получилось позвонить: " + (e.code || e.message));
    endCall("cancel");
  }
}
function incoming(s) {
  const d = s.data();
  if (call || room) { updateDoc(s.ref, { state: "busy" }).catch(() => {}); return; }
  if (!d.ts || Date.now() - d.ts.toMillis() > 45e3) return;
  call = { ref: s.ref, cid: dmId(me.uid, d.from), peer: d.from, video: !!d.video, out: false, state: "ring", unsub: [] };
  call.unsub.push(onSnapshot(s.ref, (x) => { const v = x.data(); if (call && call.state === "ring" && v && v.state !== "ring") endCall(); }));
  callUI();
  ringStart(false);
  if (document.hidden) notify({ uid: d.from, text: d.video ? "Входящий видеозвонок" : "Входящий звонок" });
}
async function accept() {
  if (!call || call.out) return;
  ringStop();
  call.unsub.splice(0).forEach((f) => f());
  call.state = "live";
  callUI();
  updateDoc(call.ref, { state: "live" }).catch(() => {});
  if (!await joinRoom(call.cid, call.video)) endCall();
}
function decline() {
  if (!call) return;
  updateDoc(call.ref, { state: "decline" }).catch(() => {});
  endCall();
}
function endCall() {
  if (!call) return;
  const c = call;
  call = null;
  clearTimeout(c.timer);
  ringStop();
  c.unsub.forEach((f) => f());
  updateDoc(c.ref, { state: c.t0 ? "end" : "cancel" }).catch(() => {});
  callUI();
  if (c.out) post(c.cid, { call: { video: c.video, dur: c.t0 ? Math.round((Date.now() - c.t0) / 1e3) : 0, miss: !c.t0 } }).catch(() => {});
  if (room && room.cid === c.cid) leaveRoom();
}
$("cOk").onclick = accept;
$("cEnd").onclick = () => { if (!call) return; if (!call.out) decline(); else leaveRoom(), endCall(); };
$("callBtn").onclick = () => cur && !grp(cur) && startCall(cur.members.find((u) => u !== me.uid), false);
$("vidBtn").onclick = () => cur && !grp(cur) && startCall(cur.members.find((u) => u !== me.uid), true);
function listenCalls() {
  unsub.push(onSnapshot(query(collection(db, "calls"), where("to", "==", me.uid), where("state", "==", "ring")), (qs) => qs.docChanges().forEach((ch) => { if (ch.type === "added") incoming(ch.doc); }), () => {}));
}
window.addEventListener("beforeunload", () => { if (room) leaveRoom(); });
