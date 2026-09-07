// db.js — petite couche au-dessus d'IndexedDB pour stocker médias, tags et réglages.
// Tout reste 100% local sur l'appareil : rien n'est jamais envoyé sur un serveur.

const DB_NAME = "broll-sort";
const DB_VERSION = 1;
const STORE_MEDIA = "media";
const STORE_TAGS = "tagIndex";
const STORE_SETTINGS = "settings";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        const store = db.createObjectStore(STORE_MEDIA, { keyPath: "id" });
        store.createIndex("addedAt", "addedAt");
        store.createIndex("type", "type");
        store.createIndex("favorite", "favorite");
        store.createIndex("broll", "broll");
      }
      if (!db.objectStoreNames.contains(STORE_TAGS)) {
        db.createObjectStore(STORE_TAGS, { keyPath: "tag" });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, storeNames, mode) {
  return db.transaction(storeNames, mode);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addMedia(record) {
  const db = await openDB();
  const t = tx(db, [STORE_MEDIA], "readwrite");
  t.objectStore(STORE_MEDIA).add(record);
  await new Promise((res, rej) => {
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
  if (record.tags && record.tags.length) {
    await bumpTags(record.tags);
  }
  return record;
}

export async function updateMedia(record) {
  const db = await openDB();
  const t = tx(db, [STORE_MEDIA], "readwrite");
  t.objectStore(STORE_MEDIA).put(record);
  await new Promise((res, rej) => {
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
  return record;
}

export async function deleteMedia(id) {
  const db = await openDB();
  const t = tx(db, [STORE_MEDIA], "readwrite");
  t.objectStore(STORE_MEDIA).delete(id);
  await new Promise((res, rej) => {
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}

export async function getAllMedia() {
  const db = await openDB();
  const t = tx(db, [STORE_MEDIA], "readonly");
  const result = await reqToPromise(t.objectStore(STORE_MEDIA).getAll());
  return result.sort((a, b) => b.addedAt - a.addedAt);
}

export async function getMedia(id) {
  const db = await openDB();
  const t = tx(db, [STORE_MEDIA], "readonly");
  return reqToPromise(t.objectStore(STORE_MEDIA).get(id));
}

export async function countMedia() {
  const db = await openDB();
  const t = tx(db, [STORE_MEDIA], "readonly");
  return reqToPromise(t.objectStore(STORE_MEDIA).count());
}

export async function bumpTags(tags) {
  const db = await openDB();
  const t = tx(db, [STORE_TAGS], "readwrite");
  const store = t.objectStore(STORE_TAGS);
  for (const rawTag of tags) {
    const tag = rawTag.trim().toLowerCase();
    if (!tag) continue;
    const existing = await reqToPromise(store.get(tag));
    if (existing) {
      existing.count += 1;
      existing.lastUsed = Date.now();
      store.put(existing);
    } else {
      store.put({ tag, count: 1, lastUsed: Date.now() });
    }
  }
  await new Promise((res, rej) => {
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}

export async function getTopTags(limit = 12) {
  const db = await openDB();
  const t = tx(db, [STORE_TAGS], "readonly");
  const all = await reqToPromise(t.objectStore(STORE_TAGS).getAll());
  return all.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed).slice(0, limit);
}

export async function getSetting(key, fallback) {
  const db = await openDB();
  const t = tx(db, [STORE_SETTINGS], "readonly");
  const rec = await reqToPromise(t.objectStore(STORE_SETTINGS).get(key));
  return rec ? rec.value : fallback;
}

export async function setSetting(key, value) {
  const db = await openDB();
  const t = tx(db, [STORE_SETTINGS], "readwrite");
  t.objectStore(STORE_SETTINGS).put({ key, value });
  await new Promise((res, rej) => {
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}

export async function estimateStorage() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      return await navigator.storage.estimate();
    } catch {
      return null;
    }
  }
  return null;
}

export async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}
