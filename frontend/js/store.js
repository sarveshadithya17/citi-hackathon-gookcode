// Tiny IndexedDB key-value store (works on low-end Android Chrome).
const DB = 'thiran';
const STORES = ['kv', 'outbox'];
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export const kv = {
  get: (k) => tx('kv', 'readonly', (s) => s.get(k)),
  set: (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k)),
  del: (k) => tx('kv', 'readwrite', (s) => s.delete(k)),
};

export const outbox = {
  add: (op) => tx('outbox', 'readwrite', (s) => s.put(op, op.op_id)),
  all: async () => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const out = [];
      const t = db.transaction('outbox', 'readonly');
      const c = t.objectStore('outbox').openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out.push(cur.value); cur.continue(); } };
      t.oncomplete = () => resolve(out.sort((a, b) => a.ts - b.ts));
      t.onerror = () => reject(t.error);
    });
  },
  remove: (id) => tx('outbox', 'readwrite', (s) => s.delete(id)),
};

export function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}
