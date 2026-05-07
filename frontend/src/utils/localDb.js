// IndexedDB para persistir handles de pastas e metadados de ficheiros locais
const DB_NAME = "playlistr-local";
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("handles")) db.createObjectStore("handles");
            if (!db.objectStoreNames.contains("tracks"))  db.createObjectStore("tracks", { keyPath: "id" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror  = () => reject(req.error);
    });
}

export async function saveDirHandle(key, handle) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("handles", "readwrite");
        tx.objectStore("handles").put(handle, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

export async function loadDirHandle(key) {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction("handles", "readonly");
        const req = tx.objectStore("handles").get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror  = () => resolve(null);
    });
}

export async function saveLocalTracks(tracks) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("tracks", "readwrite");
        const store = tx.objectStore("tracks");
        store.clear();
        tracks.forEach((t) => store.put(t));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

export async function loadLocalTracks() {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction("tracks", "readonly");
        const req = tx.objectStore("tracks").getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror  = () => resolve([]);
    });
}
