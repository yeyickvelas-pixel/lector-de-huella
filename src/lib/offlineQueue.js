import { openDB } from 'idb';
import { supabase } from './supabase';

const DB_NAME = 'asistapp';
const DB_VERSION = 1;
const STORE = 'pending_registros';

function dbPromise() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'client_id' });
      }
    },
  });
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function enqueueRegistro(registro) {
  const db = await dbPromise();
  const row = { client_id: uuid(), ...registro };
  await db.put(STORE, row);
  return row;
}

export async function listPending() {
  const db = await dbPromise();
  return db.getAll(STORE);
}

export async function removePending(client_id) {
  const db = await dbPromise();
  await db.delete(STORE, client_id);
}

export async function updatePendingNota(client_id, nota) {
  const db = await dbPromise();
  const row = await db.get(STORE, client_id);
  if (!row) return false;
  row.nota = nota;
  await db.put(STORE, row);
  return true;
}

let syncing = false;

export async function syncPending() {
  if (syncing) return { synced: 0, skipped: true };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, offline: true };
  }
  syncing = true;
  let synced = 0;
  try {
    const pending = await listPending();
    for (const row of pending) {
      const { error } = await supabase.from('registros').insert({
        empleado_id: row.empleado_id,
        tipo: row.tipo,
        fecha_hora: row.fecha_hora,
        lat: row.lat,
        lng: row.lng,
        nota: row.nota ?? null,
        foto_url: row.foto_url ?? null,
        client_id: row.client_id,
      });
      if (!error || error.code === '23505') {
        await removePending(row.client_id);
        synced += 1;
      } else {
        console.warn('No se pudo sincronizar registro', row.client_id, error);
        break;
      }
    }
  } finally {
    syncing = false;
  }
  return { synced };
}

export function startAutoSync() {
  if (typeof window === 'undefined') return () => {};
  const handler = () => { syncPending(); };
  window.addEventListener('online', handler);
  if (navigator.onLine) syncPending();
  const id = setInterval(() => { if (navigator.onLine) syncPending(); }, 60_000);
  return () => {
    window.removeEventListener('online', handler);
    clearInterval(id);
  };
}
