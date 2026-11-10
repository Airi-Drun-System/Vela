const store = new Map(), listeners = new Set();
let seq = 0;
const ts = (ms = Date.now()) => ({ __ts: 1, ms, toMillis() { return this.ms; }, toDate() { return new Date(this.ms); }, seconds: Math.floor(ms / 1000) });
const DEL = { __del: 1 }, SRV = { __srv: 1 };
export const Timestamp = { fromMillis: ts };
export const initializeFirestore = () => ({});
export const persistentLocalCache = () => ({});
const join = (base, segs) => [base, ...segs].filter(Boolean).join("/");
export const doc = (b, ...s) => {
  const base = b && b.path ? b.path : "";
  if (b && b.type === "coll" && !s.length) s = ["id" + (++seq) + Math.random().toString(36).slice(2, 6)];
  const path = join(base, s);
  return { type: "doc", path, id: path.split("/").pop() };
};
export const collection = (b, ...s) => { const path = join(b && b.path ? b.path : "", s); return { type: "coll", path, id: path.split("/").pop() }; };
export const where = (f, op, v) => ({ k: "where", f, op, v });
export const orderBy = (f, d = "asc") => ({ k: "order", f, d });
export const limit = (n) => ({ k: "limit", n });
export const query = (c, ...cons) => ({ type: "query", path: c.path, cons });
export const serverTimestamp = () => SRV;
export const deleteField = () => DEL;
export const arrayUnion = (...v) => ({ __au: v });
export const arrayRemove = (...v) => ({ __ar: v });
const get = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
function apply(target, data, dotted) {
  for (const [k, v] of Object.entries(data)) {
    const parts = dotted ? k.split(".") : [k];
    let o = target;
    for (const p of parts.slice(0, -1)) o = o[p] = o[p] && typeof o[p] === "object" ? o[p] : {};
    const last = parts[parts.length - 1];
    if (v === DEL) delete o[last];
    else if (v === SRV) o[last] = ts();
    else if (v && v.__au) o[last] = [...new Set([...(o[last] || []), ...v.__au])];
    else if (v && v.__ar) o[last] = (o[last] || []).filter((x) => !v.__ar.includes(x));
    else if (v && typeof v === "object" && !Array.isArray(v) && !v.__ts && !dotted) { o[last] = {}; apply(o[last], v, false); }
    else o[last] = v;
  }
}
const snap = (path) => { const d = store.get(path); return { id: path.split("/").pop(), ref: doc(null, ...path.split("/")), exists: () => !!d, data: () => (d ? structuredClone2(d) : undefined), metadata: { hasPendingWrites: false, fromCache: false } }; };
const structuredClone2 = (o) => JSON.parse(JSON.stringify(o), (k, v) => (v && v.__ts ? ts(v.ms) : v));
function run(q) {
  const depth = q.path.split("/").length + 1;
  let rows = [...store.keys()].filter((p) => p.startsWith(q.path + "/") && p.split("/").length === depth).map((p) => [p, store.get(p)]);
  let lim = null, ord = null;
  for (const c of q.cons || []) {
    if (c.k === "where") rows = rows.filter(([, d]) => { const v = get(d, c.f); return c.op === "==" ? v === c.v : c.op === "array-contains" ? Array.isArray(v) && v.includes(c.v) : c.op === "in" ? c.v.includes(v) : true; });
    if (c.k === "order") ord = c;
    if (c.k === "limit") lim = c.n;
  }
  if (ord) rows.sort((a, b) => { const x = get(a[1], ord.f), y = get(b[1], ord.f); const vx = x && x.ms != null ? x.ms : x, vy = y && y.ms != null ? y.ms : y; return (vx > vy ? 1 : vx < vy ? -1 : 0) * (ord.d === "desc" ? -1 : 1); });
  if (lim != null) rows = rows.slice(0, lim);
  return rows.map(([p]) => p);
}
function notify() { for (const l of listeners) l.fire(); }
export async function setDoc(ref, data, opt) { const cur = opt && opt.merge ? structuredClone2(store.get(ref.path) || {}) : {}; apply(cur, data, false); store.set(ref.path, cur); queueMicrotask(notify); }
export async function updateDoc(ref, data) { if (!store.has(ref.path)) throw Object.assign(new Error("no doc"), { code: "not-found" }); const cur = structuredClone2(store.get(ref.path)); apply(cur, data, true); store.set(ref.path, cur); queueMicrotask(notify); }
export async function addDoc(c, data) { const r = doc(c); await setDoc(r, data); return r; }
export async function deleteDoc(ref) { store.delete(ref.path); queueMicrotask(notify); }
export async function getDoc(ref) { return snap(ref.path); }
export async function getDocFromCache(ref) { return snap(ref.path); }
export async function getDocs(q) { const docs = run(q.type === "coll" ? { path: q.path, cons: [] } : q).map(snap); return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) }; }
export function writeBatch() { const ops = []; return { set: (r, d, o) => ops.push(() => setDoc(r, d, o)), update: (r, d) => ops.push(() => updateDoc(r, d)), delete: (r) => ops.push(() => deleteDoc(r)), commit: async () => { for (const o of ops) await o(); } }; }
export function onSnapshot(ref, cb) {
  let prev = new Map();
  const l = { fire() {
    if (ref.type === "doc") { cb(snap(ref.path)); return; }
    const paths = run(ref.type === "coll" ? { path: ref.path, cons: [] } : ref), now = new Map(paths.map((p) => [p, JSON.stringify(store.get(p))]));
    const changes = [];
    for (const [p, j] of now) { if (!prev.has(p)) changes.push({ type: "added", doc: snap(p) }); else if (prev.get(p) !== j) changes.push({ type: "modified", doc: snap(p) }); }
    for (const p of prev.keys()) if (!now.has(p)) changes.push({ type: "removed", doc: snap(p) });
    prev = now;
    const docs = paths.map(snap);
    cb({ docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f), docChanges: () => changes, metadata: { hasPendingWrites: false, fromCache: false } });
  } };
  listeners.add(l);
  setTimeout(() => l.fire(), 0);
  return () => listeners.delete(l);
}
window.__fs = { store, ts, notify, seed(path, data) { store.set(path, data); } };
