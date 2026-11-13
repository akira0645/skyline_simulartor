import type { SaveData } from '../simulation/SaveData';

const DATABASE = 'pixel-city-simulator';
const STORE = 'saves';
const SLOT = 'manual';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, use: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = use(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function writeSave(save: SaveData): Promise<void> {
  await run('readwrite', store => store.put(save, SLOT));
}

/** Returns the stored value unchecked, or undefined when nothing was saved. */
export function readSave(): Promise<unknown> {
  return run('readonly', store => store.get(SLOT));
}
