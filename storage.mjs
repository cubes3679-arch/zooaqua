import { legacyRows, sources, key, normalizeName } from './model.mjs';

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('zooaqua-field-guide', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('entries', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function readEntries(db) {
  return new Promise((resolve, reject) => {
    const request = db.transaction('entries').objectStore('entries').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function putEntries(db, entries) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('entries', 'readwrite');
    const store = transaction.objectStore('entries');
    for (const entry of entries) store.put(entry);
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function migrateLocal(db) {
  const entries = [];
  let incomplete = false;
  for (const storageKey of Object.values(sources)) {
    try {
      const rows = JSON.parse(localStorage.getItem(storageKey));
      entries.push(...legacyRows({ local: { [storageKey]: rows } }));
    } catch {
      incomplete = true;
    }
  }
  await putEntries(db, entries);
  return incomplete;
}

export function operation(kind, fields) {
  let id;
  if (kind === 'species') id = key(new Date().toISOString(), crypto.randomUUID());
  else if (kind === 'photo') id = key(kind, normalizeName(fields.animalName));
  else id = key(kind, normalizeName(fields.facilityName), fields.facilityType, fields.visitDate, fields.animalName, fields.notes);
  return { ...fields, id, kind };
}

export async function readLegacyCloud() {
  const base = 'https://zooaqua-1ba85-default-rtdb.asia-southeast1.firebasedatabase.app';
  const cloud = Object.fromEntries(await Promise.all(Object.keys(sources).map(async collection => {
    const response = await fetch(`${base}/${collection}.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Firebaseから旧記録を読み込めませんでした。');
    return [collection, await response.json()];
  })));
  return legacyRows({ cloud });
}
