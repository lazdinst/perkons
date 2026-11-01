export type Clip = { id: string; name: string; data: ArrayBuffer; duration: number; volume: number; key: string };
let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('perkons', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('clips', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadClips(): Promise<Clip[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database.transaction('clips').objectStore('clips').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveClip(clip: Clip) { await write(store => store.put(clip)); }
export async function deleteClip(id: string) { await write(store => store.delete(id)); }
async function write(action: (store: IDBObjectStore) => void) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction('clips', 'readwrite');
    action(tx.objectStore('clips'));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'));
  });
}
