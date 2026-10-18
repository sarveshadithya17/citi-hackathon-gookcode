// API client with offline support.
// GET responses are cached in IndexedDB (and by the service worker), so screens
// the student has opened before still work without a network. Actions taken
// offline go into an outbox and are sent to /api/v1/sync when the phone reconnects.
import { kv, outbox, uid } from './store.js';

const BASE = '/api/v1';
const listeners = new Set();
export const net = { online: navigator.onLine, pending: 0 };

export function onNet(fn) { listeners.add(fn); }
function emit() { for (const fn of listeners) fn(net); }

export function token() { try { return localStorage.getItem('thiran.token'); } catch { return null; } }
export function setToken(t) { try { t ? localStorage.setItem('thiran.token', t) : localStorage.removeItem('thiran.token'); } catch {} }

export class ApiError extends Error {
  constructor(status, detail) { super(detail || `Error ${status}`); this.status = status; }
}

async function raw(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail); } catch {}
    throw new ApiError(res.status, detail);
  }
  return res.status === 204 ? null : res.json();
}

function setOnline(v) { if (net.online !== v) { net.online = v; emit(); } }

export async function get(path, { cache = true } = {}) {
  try {
    const data = await raw('GET', path);
    setOnline(true);
    if (cache) kv.set('GET ' + path, { data, at: Date.now() }).catch(() => {});
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    setOnline(false);
    const hit = cache ? await kv.get('GET ' + path).catch(() => null) : null;
    if (hit) {
      if (Array.isArray(hit.data)) { const a = [...hit.data]; a._offline = true; return a; }
      return { ...hit.data, _offline: true, _at: hit.at };
    }
    throw new ApiError(0, 'offline');
  }
}

export async function post(path, body, method = 'POST') {
  try {
    const data = await raw(method, path, body);
    setOnline(true);
    return data;
  } catch (e) {
    if (!(e instanceof ApiError)) setOnline(false);
    throw e;
  }
}
export const patch = (path, body) => post(path, body, 'PATCH');

// Queue an action to sync later. kind: progress | apply | answers | endorse
export async function queue(kind, studentId, payload) {
  const op = { op_id: uid(), kind, student_id: studentId || null, ts: Date.now() / 1000, payload };
  await outbox.add(op);
  net.pending = (await outbox.all()).length;
  emit();
  sync();
  return op;
}

// Try the request now; if the phone is offline, queue it for sync instead.
export async function doOrQueue(kind, studentId, path, body) {
  try {
    return { ok: true, data: await post(path, body) };
  } catch (e) {
    if (e instanceof ApiError && e.status !== 0) throw e;
    await queue(kind, studentId, kind === 'apply' ? { target: body.target } : body);
    return { ok: true, queued: true };
  }
}

let syncing = false;
export async function sync() {
  if (syncing || !token()) return;
  const ops = await outbox.all();
  net.pending = ops.length;
  if (!ops.length) { emit(); return; }
  syncing = true;
  try {
    const res = await raw('POST', '/sync', { ops });
    for (const r of res.results) if (r.status !== 'error' || /not allowed|unknown/.test(r.error || '')) await outbox.remove(r.op_id);
    setOnline(true);
  } catch { setOnline(false); }
  syncing = false;
  net.pending = (await outbox.all()).length;
  emit();
}

window.addEventListener('online', () => { setOnline(true); sync(); });
window.addEventListener('offline', () => setOnline(false));
setInterval(() => { if (navigator.onLine) sync(); }, 20000);
