/**
 * Minimal Board Tab - IndexedDB Storage Engine (blobs & snapshots)
 * Pure ES module. Handles binary wallpapers, thumbnails, and rolling backup snapshots.
 */

const DB_NAME = 'minimal_board_idb';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment.'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('snapshots')) {
        db.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

/**
 * Saves a complete snapshot to IndexedDB, capping at the last 10 snapshots.
 * @param {object} snapshotData - Full shards state
 * @param {string} [reason='auto-snapshot']
 * @returns {Promise<number>} snapshotId
 */
export async function saveSnapshot(snapshotData, reason = 'auto-snapshot') {
  const db = await getDB();
  const tx = db.transaction('snapshots', 'readwrite');
  const store = tx.objectStore('snapshots');

  const snapshotRecord = {
    createdAt: Date.now(),
    reason,
    data: snapshotData,
  };

  const addReq = store.add(snapshotRecord);

  return new Promise((resolve, reject) => {
    addReq.onsuccess = () => {
      // Prune snapshots older than the last 10
      const getAllReq = store.getAllKeys();
      getAllReq.onsuccess = () => {
        const keys = getAllReq.result;
        if (keys.length > 10) {
          const toDelete = keys.slice(0, keys.length - 10);
          for (const k of toDelete) {
            store.delete(k);
          }
        }
        resolve(addReq.result);
      };
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieves list of snapshots (metadata only).
 */
export async function listSnapshots() {
  const db = await getDB();
  const tx = db.transaction('snapshots', 'readonly');
  const store = tx.objectStore('snapshots');
  const req = store.getAll();

  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const records = req.result.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        reason: r.reason,
      }));
      records.sort((a, b) => b.createdAt - a.createdAt);
      resolve(records);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieves a single snapshot by ID.
 */
export async function getSnapshot(id) {
  const db = await getDB();
  const tx = db.transaction('snapshots', 'readonly');
  const store = tx.objectStore('snapshots');
  const req = store.get(id);

  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result ? req.result.data : null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Saves a binary blob (e.g. wallpaper or thumbnail image).
 */
export async function saveBlob(id, blob) {
  const db = await getDB();
  const tx = db.transaction('blobs', 'readwrite');
  const store = tx.objectStore('blobs');
  store.put({ id, blob, updatedAt: Date.now() });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieves a binary blob by ID.
 */
export async function getBlob(id) {
  const db = await getDB();
  const tx = db.transaction('blobs', 'readonly');
  const store = tx.objectStore('blobs');
  const req = store.get(id);

  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error);
  });
}
