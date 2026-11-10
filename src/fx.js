const PX = {
  leaf: { p: { a: "#3f7d28", b: "#5a9e35", c: "#2c5c1b" }, m: ["..aa..", ".abba.", "abbbca", "abbcca", ".acca.", "..c..."] },
  autumn: { p: { a: "#c2410c", b: "#f59e0b", c: "#7c2d12" }, m: ["..aa..", ".abba.", "abbbca", "abbcca", ".acca.", "..c..."] },
  sakura: { p: { a: "#f9a8d4", b: "#fbcfe8", c: "#ec4899" }, m: [".ab.", "abba", ".bac", "..c."] },
  flake: { p: { a: "#ffffff", b: "#cfe8ff" }, m: ["..a..", "a.b.a", ".bab.", "a.b.a", "..a.."] },
  xp: { p: { a: "#d9f99d", b: "#84cc16", c: "#3f6212" }, m: [".bb.", "baab", "baab", ".cc."] },
  redstone: { p: { a: "#ff3b30", b: "#b91c1c" }, m: ["ab", "ba"] },
  portal: { p: { a: "#c084fc", b: "#7e22ce" }, m: [".a.", "aba", ".a."] },
  ender: { p: { a: "#e879f9", b: "#581c87" }, m: ["ab", "bb"] },
  soul: { p: { a: "#a5f3fc", b: "#22d3ee", c: "#0e7490" }, m: [".a.", ".a.", "aba", "bcb", ".b."] },
  ember: { p: { a: "#fde68a", b: "#f97316" }, m: ["a", "b"] },
  heart: { p: { a: "#ff4d6d", b: "#c9184a", c: "#ffccd5" }, m: [".aa.aa.", "acaaaaa", "aaaaaab", ".aaaab.", "..aab..", "...b..."] },
  emerald: { p: { a: "#bbf7d0", b: "#22c55e", c: "#15803d" }, m: ["..a..", ".aba.", "abbbc", ".bcc.", "..c.."] },
  bubble: { p: { a: "#e0f2fe", b: "#7dd3fc" }, m: [".aa.", "a..b", "a..b", ".bb."] },
  note1: { p: { a: "#22c55e" }, m: ["..aa", "..a.", "..a.", "aaa.", "aa.."] },
  note2: { p: { a: "#f472b6" }, m: ["..aa", "..a.", "..a.", "aaa.", "aa.."] },
  note3: { p: { a: "#60a5fa" }, m: ["..aa", "..a.", "..a.", "aaa.", "aa.."] },
  glyph1: { p: { a: "#e9d5ff" }, m: ["a.a", ".a.", "a.."] },
  glyph2: { p: { a: "#e9d5ff" }, m: ["aaa", "..a", ".a."] },
  glyph3: { p: { a: "#e9d5ff" }, m: ["a..", "aaa", "..a"] },
  glyph4: { p: { a: "#e9d5ff" }, m: [".a.", "a.a", "aa."] }
};
export const FX = {
  snow: { t: "Снег", move: "fall", soft: ["#ffffff"], size: [1.5, 3.5], speed: [18, 45], sway: 18, alpha: [0.5, 0.95] },
  mcsnow: { t: "Пиксельный снег", move: "fall", px: ["flake"], speed: [20, 40], sway: 14 },
  leaves: { t: "Листья", move: "fall", px: ["leaf"], speed: [22, 40], sway: 30 },
  autumn: { t: "Осень", move: "fall", px: ["autumn", "leaf"], speed: [22, 42], sway: 34 },
  sakura: { t: "Вишня", move: "fall", px: ["sakura"], speed: [16, 32], sway: 40 },
  rain: { t: "Дождь", move: "rain", speed: [520, 760], alpha: [0.25, 0.5] },
  fireflies: { t: "Светлячки", move: "wander", soft: ["#fde047", "#bef264"], size: [2, 3.5], glow: true, alpha: [0.3, 1] },
  stars: { t: "Звёзды", move: "twinkle", soft: ["#ffffff", "#c7d2fe", "#fde68a"], size: [1, 2.6], alpha: [0.1, 1] },
  xp: { t: "Опыт", move: "rise", px: ["xp"], speed: [14, 30], sway: 10, glow: true },
  redstone: { t: "Редстоун", move: "drift", px: ["redstone"], speed: [6, 16], sway: 8 },
  portal: { t: "Портал", move: "swirl", px: ["portal", "ender"], speed: [16, 34] },
  ender: { t: "Энд", move: "drift", px: ["ender"], speed: [5, 12], sway: 12 },
  soul: { t: "Души", move: "rise", px: ["soul"], speed: [18, 38], sway: 8, glow: true },
  embers: { t: "Угольки", move: "rise", px: ["ember"], speed: [24, 60], sway: 22, glow: true },
  enchant: { t: "Чары", move: "fall", px: ["glyph1", "glyph2", "glyph3", "glyph4"], speed: [10, 22], sway: 20 },
  notes: { t: "Ноты", move: "rise", px: ["note1", "note2", "note3"], speed: [16, 30], sway: 16 },
  hearts: { t: "Сердечки", move: "rise", px: ["heart"], speed: [14, 28], sway: 12 },
  emerald: { t: "Изумруды", move: "twinkle", px: ["emerald"] },
  bubbles: { t: "Пузыри", move: "rise", px: ["bubble"], speed: [20, 46], sway: 10 },
  confetti: { t: "Конфетти", move: "fall", rect: ["#f43f5e", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ffffff"], speed: [40, 80], sway: 26 }
};
const mobile = matchMedia("(pointer: coarse)").matches || innerWidth < 760;
const R = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const roomEl = document.getElementById("room");
let cv = null, ctx = null, raf = 0, parts = [], kind = "", last = 0, W = 0, H = 0, dpr = 1, sprites = {};
function sprite(name, scale) {
  const key = name + scale;
  if (sprites[key]) return sprites[key];
  const d = PX[name], h = d.m.length, w = d.m[0].length, c = document.createElement("canvas");
  c.width = w * scale;
  c.height = h * scale;
  const x = c.getContext("2d");
  d.m.forEach((row, j) => [...row].forEach((ch, i) => { if (d.p[ch]) { x.fillStyle = d.p[ch]; x.fillRect(i * scale, j * scale, scale, scale); } }));
  return (sprites[key] = c);
}
function softDot(color, r, glow) {
  const key = "s" + color + r + glow;
  if (sprites[key]) return sprites[key];
  const s = Math.ceil(r * (glow ? 6 : 2.2)), c = document.createElement("canvas");
  c.width = c.height = s * 2;
  const x = c.getContext("2d"), g = x.createRadialGradient(s, s, 0, s, s, s);
  g.addColorStop(0, color);
  g.addColorStop(glow ? 0.18 : 0.45, color);
  g.addColorStop(1, "transparent");
  x.fillStyle = g;
  x.fillRect(0, 0, s * 2, s * 2);
  return (sprites[key] = c);
}
function make(f, anywhere) {
  const p = { x: R(0, W), y: anywhere ? R(0, H) : 0, ph: R(0, 6.28), a: f.alpha ? R(...f.alpha) : 1 };
  const sc = (mobile ? 2.4 : 3) * dpr;
  if (f.px) p.img = sprite(pick(f.px), Math.round(sc * R(0.85, 1.25)));
  else if (f.soft) p.img = softDot(pick(f.soft), R(...f.size) * dpr, !!f.glow);
  else if (f.rect) { p.col = pick(f.rect); p.w = R(4, 8) * dpr; p.h = R(2, 4) * dpr; }
  p.v = f.speed ? R(...f.speed) * dpr : 0;
  if (f.move === "fall" || f.move === "rain") p.y = anywhere ? R(-H * 0.1, H) : R(-60, -10) * dpr;
  if (f.move === "rise" || f.move === "swirl") p.y = anywhere ? R(0, H * 1.1) : H + R(10, 60) * dpr;
  if (f.move === "rain") p.len = R(10, 22) * dpr;
  if (f.move === "wander" || f.move === "drift") { p.vx = R(-12, 12) * dpr; p.vy = R(-12, 12) * dpr; }
  if (f.move === "twinkle") p.sp = R(0.6, 1.8);
  return p;
}
function size() {
  dpr = mobile ? 1 : Math.min(devicePixelRatio || 1, 1.5);
  W = cv.width = Math.round(innerWidth * dpr);
  H = cv.height = Math.round(innerHeight * dpr);
  ctx.imageSmoothingEnabled = false;
  const f = FX[kind], n = Math.min(mobile ? 42 : 100, Math.round((innerWidth * innerHeight) / (mobile ? 9000 : 14000)) * (f.move === "rain" ? 1.6 : f.move === "twinkle" ? 0.8 : 1));
  sprites = {};
  parts = Array.from({ length: Math.round(n) }, () => make(f, true));
}
function frame(t) {
  raf = requestAnimationFrame(frame);
  if (document.hidden || roomEl && !roomEl.hidden) return;
  const dt = Math.min(0.05, (t - last) / 1000);
  if (mobile && t - last < 31) return;
  last = t;
  const f = FX[kind], time = t / 1000;
  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i];
    switch (f.move) {
      case "fall": p.y += p.v * dt; p.x += Math.sin(time * 1.1 + p.ph) * (f.sway || 0) * dpr * dt; if (p.y > H + 20) p = parts[i] = make(f); break;
      case "rain": p.y += p.v * dt; p.x -= p.v * 0.18 * dt; if (p.y > H + 30) p = parts[i] = make(f); break;
      case "rise": p.y -= p.v * dt; p.x += Math.sin(time * 1.3 + p.ph) * (f.sway || 0) * dpr * dt; if (p.y < -30) p = parts[i] = make(f); break;
      case "swirl": p.y -= p.v * dt; p.x += Math.cos(time * 2 + p.ph) * 30 * dpr * dt; if (p.y < -30) p = parts[i] = make(f); break;
      case "wander": case "drift":
        p.vx += R(-20, 20) * dpr * dt; p.vy += R(-20, 20) * dpr * dt;
        p.vx *= 0.98; p.vy *= 0.98; p.x += p.vx * dt; p.y += (p.vy + (f.move === "drift" ? -p.v * 0.3 : 0)) * dt;
        if (p.x < -20) p.x = W + 10; if (p.x > W + 20) p.x = -10; if (p.y < -20) p.y = H + 10; if (p.y > H + 20) p.y = -10;
        break;
    }
    let a = p.a;
    if (f.move === "twinkle") a = 0.15 + 0.85 * Math.abs(Math.sin(time * p.sp + p.ph));
    if (f.move === "wander") a = 0.35 + 0.65 * Math.abs(Math.sin(time * 1.5 + p.ph));
    ctx.globalAlpha = a;
    if (f.move === "rain") { ctx.strokeStyle = "#a5c8ff"; ctx.lineWidth = dpr; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.len * 0.18, p.y - p.len); ctx.stroke(); }
    else if (p.img) ctx.drawImage(p.img, p.x | 0, p.y | 0);
    else { ctx.fillStyle = p.col; ctx.fillRect(p.x | 0, p.y | 0, p.w, Math.abs(Math.sin(time * 3 + p.ph)) * p.h + 1); }
  }
  ctx.globalAlpha = 1;
}
export function setFx(k) {
  const on = !!FX[k] && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.body.classList.toggle("fx", on);
  if (!on) {
    cancelAnimationFrame(raf);
    if (cv) cv.remove();
    cv = null;
    kind = "";
    return;
  }
  kind = k;
  if (!cv) {
    cv = document.createElement("canvas");
    cv.id = "fx";
    document.body.prepend(cv);
    ctx = cv.getContext("2d", { alpha: true });
    addEventListener("resize", () => cv && size());
  }
  size();
  cancelAnimationFrame(raf);
  last = performance.now();
  raf = requestAnimationFrame(frame);
}
export function fxPreview(k) {
  const f = FX[k], c = document.createElement("canvas");
  c.width = 44;
  c.height = 30;
  const x = c.getContext("2d");
  x.imageSmoothingEnabled = false;
  for (let i = 0; i < 5; i++) {
    const px = 4 + ((i * 9) % 38), py = 3 + ((i * 13) % 22);
    if (f.px) x.drawImage(sprite(pick(f.px), 2), px, py);
    else if (f.soft) x.drawImage(softDot(pick(f.soft), 1.6, !!f.glow), px - 4, py - 4);
    else if (f.rect) { x.fillStyle = pick(f.rect); x.fillRect(px, py, 5, 3); }
    else { x.strokeStyle = "#a5c8ff"; x.beginPath(); x.moveTo(px, py + 8); x.lineTo(px + 2, py); x.stroke(); }
  }
  return c;
}
