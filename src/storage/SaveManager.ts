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

/** The slot the game writes to by itself every so often, apart from the player's own save. */
export const AUTO_SLOT = 'auto';

export async function writeSave(save: SaveData, slot: string = SLOT): Promise<void> {
  await run('readwrite', store => store.put(save, slot));
}

/** Returns the stored value unchecked, or undefined when nothing was saved. */
export function readSave(slot: string = SLOT): Promise<unknown> {
  return run('readonly', store => store.get(slot));
}

/** The player's numbered saves, and what each is shown as in the list without loading it. */
export const SLOTS = ['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5', 'slot-6'] as const;
export interface SaveNote { population: number; funds: number; rank: number; tick: number; at: number }

/** Writes a save with a note beside it for the list. */
export async function writeSlot(save: SaveData, slot: string, note: SaveNote): Promise<void> {
  await run('readwrite', store => store.put({ ...save, note }, slot));
}

export async function deleteSave(slot: string): Promise<void> {
  await run('readwrite', store => store.delete(slot));
}

/** The note of every slot that holds a save. Saves written before there were notes have none. */
export async function listSaves(): Promise<Record<string, SaveNote | null>> {
  const database = await open();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readonly');
      const store = transaction.objectStore(STORE);
      const keys = store.getAllKeys();
      const values = store.getAll();
      transaction.oncomplete = () => resolve(Object.fromEntries(keys.result.map((key, index) =>
        [String(key), (values.result[index] as { note?: SaveNote } | undefined)?.note ?? null])));
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
