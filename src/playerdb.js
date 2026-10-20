// src/playerdb.js
// A tiny IndexedDB-backed "lite database" for player details and app settings.
// No server involved — data lives locally in the browser.
//
// Player record shape:
//   {
//     id: string,             // uuid
//     name: string,           // display name (seat name)
//     character: string,      // optional character name
//     color: string,          // token colour hint
//     isAdmin: boolean,       // PREP MODE privilege flag
//     discord: {              // populated by the Discord link flow
//       id, username, handle, avatar
//     } | null,
//     createdAt, updatedAt
//   }

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

export const playerDB = {
    async getAllPlayers() {
        const list = await withStore(PLAYERS_STORE, 'readonly', (s) => reqToPromise(s.getAll()));
        return (list || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    },

    async getPlayer(id) {
        return withStore(PLAYERS_STORE, 'readonly', (s) => reqToPromise(s.get(id))) || null;
    },

    async savePlayer(player) {
        player.updatedAt = Date.now();
        if (!player.createdAt) player.createdAt = player.updatedAt;
        await withStore(PLAYERS_STORE, 'readwrite', (s) => reqToPromise(s.put(player)));
        return player;
    },

    async deletePlayer(id) {
        await withStore(PLAYERS_STORE, 'readwrite', (s) => reqToPromise(s.delete(id)));
    },

    async anyAdminExists() {
        const all = await this.getAllPlayers();
        return all.some((p) => p.isAdmin === true);
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
