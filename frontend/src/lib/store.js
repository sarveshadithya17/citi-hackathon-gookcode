// Local database on the phone (IndexedDB via Dexie; reliable on low-end Android Chrome).
// kv: saved copies of screens and small settings. outbox: actions taken offline, waiting to sync.
import Dexie from 'dexie';

const db = new Dexie('thiran-db');
db.version(1).stores({ kv: '&key', outbox: '&op_id, ts' });

export const kv = {
  get: async (key) => (await db.kv.get(key))?.value,
  set: (key, value) => db.kv.put({ key, value }),
  del: (key) => db.kv.delete(key),
};

export const outbox = {
  add: (op) => db.outbox.put(op),
  all: () => db.outbox.orderBy('ts').toArray(),
  remove: (id) => db.outbox.delete(id),
};

export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}
