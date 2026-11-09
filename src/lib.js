export const dmId = (a, b) => [a, b].sort().join("_");
const ms = (t) => t && t.toMillis ? t.toMillis() : typeof t === "number" ? t : 0;
export const isOnline = (seen, now = Date.now()) => ms(seen) > 0 && now - ms(seen) < 15e4;
export const fmtTime = (t) => {
  const d = new Date(ms(t) || Date.now());
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
};
const MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export function fmtDay(t, dayOnly, now = new Date()) {
  const v = ms(t);
  if (!v) return dayOnly ? "Сегодня" : "давно";
  const d = new Date(v), a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const diff = Math.round((a - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  const day = diff === 0 ? "Сегодня" : diff === 1 ? "Вчера" : d.getDate() + " " + MON[d.getMonth()];
  return dayOnly ? day : (diff === 0 ? "сегодня" : diff === 1 ? "вчера" : day) + " в " + fmtTime(v);
}
export const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
export const hueOf = (s) => {
  let h = 0;
  for (const c of String(s || "")) h = (h * 31 + c.codePointAt(0)) % 360;
  return h;
};
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const linkify = (t) => esc(String(t)).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
