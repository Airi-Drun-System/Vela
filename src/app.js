import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  doc,
  getDoc,
  setDoc,
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
  }));
  unsub.push(onSnapshot(query(collection(db, "chats"), where("members", "array-contains", me.uid)), (qs) => {
    qs.docChanges().forEach((ch) => {
      if (ch.type === "removed") chats.delete(ch.doc.id);
      else chats.set(ch.doc.id, { id: ch.doc.id, ...ch.doc.data() });
    });
    renderChats();
    if (cur && chats.get(cur.id)) {
      cur = chats.get(cur.id);
      renderHead();
    }
  }));
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
const look = { acc: LS("acc", ACC[0]), theme: LS("theme", "glass"), size: LS("size", 16), bub: LS("bub", 22), stars: LS("stars", true) };
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
function openSettings() {
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
  renderSky();
  const q = $("q").value.trim().toLowerCase().replace(/^@/, "");
  const list = [...chats.values()].sort((a, b) => (b.last && b.last.ts ? b.last.ts.toMillis() : 0) - (a.last && a.last.ts ? a.last.ts.toMillis() : 0))
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
    el.innerHTML = '<div class="ava"></div><div class="ciT"><b></b><small></small></div><i></i>';
    const ava = el.querySelector(".ava");
    if (grp(c)) {
      ava.classList.add("grp");
      ava.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm8 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM2 20c0-4 3-6 7-6s7 2 7 6zm15 0c0-2-.6-3.6-1.8-4.7C19 15.4 22 16.6 22 20z"/></svg>';
    } else avatar(ava, chatTitle(c), other && other.uid, other && isOnline(other.seen));
    el.querySelector("b").textContent = chatTitle(c);
    const l = c.last;
    el.querySelector("small").textContent = l ? (l.uid === me.uid ? "Ты: " : grp(c) ? nameOf(l.uid) + ": " : "") + l.text : "Пока пусто";
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
    if (!first && last && last.id !== before && last.uid !== me.uid && document.hidden) notify(last);
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
$("msgs").addEventListener("scroll", () => {
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
  const ava = $("cAva");
  ava.className = "ava" + (grp(cur) ? " grp" : "");
  if (grp(cur)) {
    ava.innerHTML = $("chats").querySelector(".grp") ? $("chats").querySelector(".grp").innerHTML : "";
  } else avatar(ava, chatTitle(cur), other && other.uid, other && isOnline(other.seen));
  const typing = Object.entries(cur.typing || {}).filter(([u, t]) => u !== me.uid && t && Date.now() - t.toMillis() < 6e3).map(([u]) => nameOf(u));
  $("cSub").classList.toggle("typing", typing.length > 0);
  $("cSub").textContent = typing.length ? grp(cur) ? typing.join(", ") + " печата" + (typing.length > 1 ? "ют…" : "ет…") : "печатает…" : grp(cur) ? cur.members.length + " участник" + (cur.members.length % 10 === 1 && cur.members.length % 100 !== 11 ? "" : cur.members.length % 10 >= 2 && cur.members.length % 10 <= 4 && (cur.members.length % 100 < 10 || cur.members.length % 100 >= 20) ? "а" : "ов") + ", в сети " + cur.members.filter((u) => u === me.uid || users.get(u) && isOnline(users.get(u).seen)).length : other ? (isOnline(other.seen) ? "в сети" : "был(а) " + fmtDay(other.seen)) + (other.status ? " · " + other.status : "") : "";
}
setInterval(renderHead, 3e3);
const REACTS = ["❤️", "😂", "👍", "🔥", "😮", "😢"];
function renderMsgs(jump) {
  const box = $("msgs");
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
    el.dataset.id = m.id;
    let html = "";
    if (!mine && grp(cur) && !cont) html += `<b class="who" style="--h:${hueOf(m.uid)}"></b>`;
    if (m.reply) html += '<div class="q"><b></b><span></span></div>';
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
  } else if (jump || atBottom) box.scrollTop = box.scrollHeight;
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
    $("rbText").textContent = m.text || (m.img ? "Фото" : "Голосовое");
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
const sendBtn = () => {
  const has = !!txt.value.trim();
  $("send").hidden = !has;
  $("mic").hidden = has;
};
let typingAt = 0;
txt.addEventListener("input", () => {
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
  if (replyTo) msg.reply = { id: replyTo.id, uid: replyTo.uid, text: (replyTo.text || (replyTo.img ? "Фото" : "Голосовое")).slice(0, 120) };
  txt.value = "";
  grow();
  sendBtn();
  setReply(null);
  try {
    await addDoc(collection(db, "chats", cur.id, "messages"), msg);
    const preview = data.text ? data.text.slice(0, 80) : data.img ? "Фото" : "Голосовое";
    updateDoc(doc(db, "chats", cur.id), { last: { uid: me.uid, text: preview, ts: serverTimestamp() }, ["reads." + me.uid]: serverTimestamp(), ["typing." + me.uid]: deleteField() }).catch(() => {
    });
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
    window.velaApp.notify({ title: nameOf(m.uid), body: m.text || (m.img ? "Фото" : "Голосовое") });
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") new Notification(nameOf(m.uid), { body: m.text || (m.img ? "Фото" : "Голосовое"), silent: false });
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
