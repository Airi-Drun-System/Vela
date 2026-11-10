const fine = matchMedia("(pointer: fine)").matches && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
export const liveOk = fine && !matchMedia("(prefers-reduced-motion: reduce)").matches;
let opts = { live: true, sfx: true }, ac = null;
const HIT = "button, .ci, .chip, .fr, .fxb, .bp, label.icon, .pMem, .pAct, .verRow, .shItem, .seg2 button, .sw button";
function audio() {
  if (!ac) ac = new AudioContext();
  if (ac.state === "suspended") ac.resume();
  return ac;
}
function tone(f1, f2, dur, gain, type = "sine", delay = 0) {
  const a = audio(), t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(dur, gain, freq) {
  const a = audio(), n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = b;
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 1.2;
  g.gain.value = gain;
  s.connect(f).connect(g).connect(a.destination);
  s.start();
}
export function sfx(name) {
  if (!liveOk || !opts.sfx) return;
  try {
    if (name === "click") { noise(0.03, 0.22, 3200); tone(1500, 900, 0.035, 0.025); }
    else if (name === "toggle") { tone(700, 1100, 0.06, 0.05, "triangle"); }
    else if (name === "send") { tone(420, 1300, 0.13, 0.06); noise(0.09, 0.12, 5200); }
    else if (name === "recv") { tone(880, 880, 0.09, 0.05); tone(1320, 1320, 0.12, 0.045, "sine", 0.07); }
    else if (name === "pop") { tone(300, 900, 0.07, 0.06, "triangle"); }
    else if (name === "open") { tone(500, 760, 0.08, 0.03, "sine"); }
  } catch {}
}
function ripple(t, e) {
  const r = t.getBoundingClientRect();
  if (r.width < 8 || r.width > 900) return;
  const box = document.createElement("span"), c = document.createElement("i"), cs = getComputedStyle(t), s = Math.max(r.width, r.height) * 2.2;
  box.className = "rip";
  box.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${cs.borderRadius}`;
  c.style.cssText = `left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px;width:${s}px;height:${s}px`;
  box.append(c);
  document.body.append(box);
  setTimeout(() => box.remove(), 650);
}
export function burst(x, y, chars, n = 10) {
  if (!liveOk || !opts.live) return;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("span"), a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 50;
    p.className = "spark";
    if (chars) p.textContent = chars[i % chars.length];
    p.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 20}px;--r:${Math.random() * 360 - 180}deg;animation-delay:${Math.random() * 60}ms`;
    if (!chars) p.style.background = `hsl(${Math.random() * 360} 90% 70%)`;
    document.body.append(p);
    setTimeout(() => p.remove(), 900);
  }
}
let mag = [], hov = null, raf = 0, mx = 0, my = 0;
function frame() {
  raf = 0;
  if (hov) {
    const r = hov.getBoundingClientRect();
    hov.style.setProperty("--mx", ((mx - r.left) / r.width) * 100 + "%");
    hov.style.setProperty("--my", ((my - r.top) / r.height) * 100 + "%");
  }
  for (const m of mag) {
    const r = m.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy);
    m.style.translate = d < 90 && m.offsetParent ? `${dx * 0.18}px ${dy * 0.18}px` : "";
  }
  const pc = document.querySelector(".sheet:not([hidden]) .pc");
  if (pc) {
    const r = pc.getBoundingClientRect(), x = (mx - r.left) / r.width - 0.5, y = (my - r.top) / r.height - 0.5, inside = Math.abs(x) < 0.6 && Math.abs(y) < 0.6;
    pc.style.transform = inside ? `perspective(700px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg)` : "";
  }
}
export function setLive(o) {
  opts = { ...opts, ...o };
  document.body.classList.toggle("alive", liveOk && opts.live);
}
export function initLive(o) {
  setLive(o);
  if (!liveOk) return;
  mag = [...document.querySelectorAll(".fab, #send, #circBtn, .rBtns button")];
  addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const t = e.target.closest(HIT);
    if (!t) return;
    if (opts.live) ripple(t, e);
    sfx(t.closest(".seg2, .sw, .tog, .fr, .fxb, .bp") ? "toggle" : "click");
  }, true);
  addEventListener("change", (e) => { if (e.target.type === "checkbox") sfx("toggle"); }, true);
  addEventListener("pointermove", (e) => {
    if (!opts.live) return;
    mx = e.clientX;
    my = e.clientY;
    hov = e.target.closest && e.target.closest(".ci, button, .pMem, .chip, .verRow");
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });
}
