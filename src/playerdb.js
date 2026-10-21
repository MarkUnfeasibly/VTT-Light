// /src/playerdb.js
// Lite database for VTT-Light.
//
//   crew records  -> Firebase Realtime Database (`crew/<id>`), shared by every
//                     client, with the local IndexedDB copy kept as an offline
//                     cache (and used to migrate records made before the
//                     shared store existed).
//   settings      -> IndexedDB only. Panel positions, seat and the Discord
//                     Client ID are per-browser things.
//
// Player record shape:
//   {
//     id: string,             // Firebase UID (or uuid for pre-login records)
//     name: string,           // display name (seat name)
//     character: string,      // optional character name
//     color: string,          // token colour hint
//     isAdmin: boolean,       // PREP MODE privilege flag
//     discord: {              // Discord identity (from sign-in or manual entry)
//       id, username, handle, avatar
//     } | null,
//     createdAt, updatedAt
//   }

import { db, dbRef, onValue, get, set } from './firebase.js';
import { remove } from 'firebase/database';

const CREW_PATH = 'crew';
const DB_NAME = 'vtt-light-db';
const DB_VERSION = 1;
const PLAYERS_STORE = 'players';
const SETTINGS_STORE = 'settings';

let dbPromise = null;

function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(PLAYERS_STORE)) {
                db.createObjectStore(PLAYERS_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}

function reqToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function withStore(storeName, mode, fn) {
    const db = await openDB();
    const store = db.transaction(storeName, mode).objectStore(storeName);
    return fn(store);
}

export function newId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// --- local cache -------------------------------------------------------------

function sortPlayers(list) {
    return (list || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

async function localGetAll() {
    const list = await withStore(PLAYERS_STORE, 'readonly', (s) => reqToPromise(s.getAll()));
    return list || [];
}

async function localPut(player) {
    await withStore(PLAYERS_STORE, 'readwrite', (s) => reqToPromise(s.put(player)));
}

async function localDelete(id) {
    await withStore(PLAYERS_STORE, 'readwrite', (s) => reqToPromise(s.delete(id)));
}

/** Mirror the shared roster into IndexedDB so offline visits still work. */
async function mirrorLocal(list) {
    for (const p of list) {
        try { await localPut(p); } catch (e) { console.error('crew cache write failed:', e); }
    }
    try {
        const keep = new Set(list.map((p) => p.id));
        const local = await localGetAll();
        for (const p of local) {
            if (!keep.has(p.id)) await localDelete(p.id);
        }
    } catch (e) { /* cache maintenance is best-effort */ }
}

// --- shared (Firebase) roster ------------------------------------------------

let migrated = false;

async function pullFromCloud() {
    const snap = await get(dbRef(db, CREW_PATH));
    const cloud = (snap && snap.val()) || {};

    // One-time migration: publish crew records created before the shared
    // store existed. Ids are UUIDs/UIDs, so this is idempotent.
    if (!migrated) {
        migrated = true;
        const local = await localGetAll();
        for (const p of local) {
            if (!cloud[p.id]) {
                cloud[p.id] = p;
                await set(dbRef(db, `${CREW_PATH}/${p.id}`), p);
            }
        }
    }

    await mirrorLocal(Object.values(cloud));
    return sortPlayers(Object.values(cloud));
}

export const playerDB = {
    async getAllPlayers() {
        try {
            return await pullFromCloud();
        } catch (e) {
            console.warn('crew DB offline, using local cache:', e && e.message);
            return sortPlayers(await localGetAll());
        }
    },

    async getPlayer(id) {
        const all = await this.getAllPlayers();
        return all.find((p) => p.id === id) || null;
    },

    async savePlayer(player) {
        player.updatedAt = Date.now();
        if (!player.createdAt) player.createdAt = player.updatedAt;
        try {
            await set(dbRef(db, `${CREW_PATH}/${player.id}`), player);
        } catch (e) {
            console.warn('crew save queued locally (DB unreachable):', e && e.message);
        }
        await localPut(player);
        return player;
    },

    async deletePlayer(id) {
        try {
            await remove(dbRef(db, `${CREW_PATH}/${id}`));
        } catch (e) {
            console.warn('crew delete pending (DB unreachable):', e && e.message);
        }
        await localDelete(id);
    },

    async anyAdminExists() {
        const all = await this.getAllPlayers();
        return all.some((p) => p.isAdmin === true);
    },

    /** Live roster updates for every connected client. Returns an unsubscribe. */
    subscribePlayers(cb) {
        return onValue(dbRef(db, CREW_PATH), (snap) => {
            const list = sortPlayers(Object.values((snap && snap.val()) || {}));
            mirrorLocal(list).catch(() => {});
            cb(list);
        });
    },

    async getSetting(key) {
        const row = await withStore(SETTINGS_STORE, 'readonly', (s) => reqToPromise(s.get(key)));
        return row ? row.value : null;
    },

    async setSetting(key, value) {
        await withStore(SETTINGS_STORE, 'readwrite', (s) => reqToPromise(s.put({ key, value })));
        return value;
    }
};
