import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import codes from "i18n-iso-countries/codes.json";
const num = new Map(codes.map(([a2, , n]) => [a2, n]));
const areaOf = (pts) => Math.abs(pts.reduce((s, [x, y], i) => {
  const [x2, y2] = pts[(i + 1) % pts.length];
  return s + x * y2 - x2 * y;
}, 0) / 2);
export function countryStars(alpha2, n = 14, W = 320, H = 140, pad = 18) {
  const id = num.get(String(alpha2 || "").toUpperCase());
  if (!id) return null;
  const geo = world.objects.countries.geometries.find((g) => g.id === id);
  if (!geo) return null;
  const f = feature(world, geo).geometry;
  const rings = (f.type === "Polygon" ? [f.coordinates] : f.coordinates).map((p) => p[0]);
  const all = rings.flat(), wrap = all.some(([x]) => x > 150) && all.some(([x]) => x < -150);
  const latC = all.reduce((s2, [, y]) => s2 + y, 0) / all.length, k = Math.cos(latC * Math.PI / 180);
  const proj = (r) => r.map(([x, y]) => [(wrap && x < 0 ? x + 360 : x) * k, -y]);
  const ring = rings.map(proj).sort((a, b) => areaOf(b) - areaOf(a))[0];
  const seg = ring.map((p, i) => Math.hypot(ring[(i + 1) % ring.length][0] - p[0], ring[(i + 1) % ring.length][1] - p[1]));
  const per = seg.reduce((a, b) => a + b, 0), out = [];
  for (let j = 0, i = 0, acc = 0; j < n; j++) {
    const want = j * per / n;
    while (acc + seg[i] < want) acc += seg[i++];
    const t = seg[i] ? (want - acc) / seg[i] : 0, a = ring[i], b = ring[(i + 1) % ring.length];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  const xs = out.map((p) => p[0]), ys = out.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 || 1, h = Math.max(...ys) - y0 || 1;
  const s = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h), ox = (W - w * s) / 2, oy = (H - h * s) / 2;
  return out.map(([x, y]) => [Math.round((x - x0) * s + ox), Math.round((y - y0) * s + oy)]);
}
